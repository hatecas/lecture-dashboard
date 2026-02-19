import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json')

async function readLocalOrders() {
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeLocalOrders(orders) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8')
}

// 토스페이먼츠 거래 내역 조회 API (로컬 주문 데이터 머지)
export async function GET(request) {
  try {
    const secretKey = process.env.TOSS_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        { error: 'TOSS_SECRET_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = searchParams.get('limit') || '100'
    const startingAfter = searchParams.get('startingAfter') || ''

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate, endDate 파라미터가 필요합니다 (ISO 8601 형식)' },
        { status: 400 }
      )
    }

    const encryptedSecretKey = Buffer.from(secretKey + ':').toString('base64')
    const authHeader = `Basic ${encryptedSecretKey}`

    const params = new URLSearchParams({ startDate, endDate, limit })
    if (startingAfter) {
      params.set('startingAfter', startingAfter)
    }

    // 1. 거래 목록 조회
    const response = await fetch(
      `https://api.tosspayments.com/v1/transactions?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[거래 내역 조회 실패]', data)
      return NextResponse.json(
        { error: data.message || '거래 내역 조회에 실패했습니다', code: data.code },
        { status: response.status }
      )
    }

    // 2. 로컬 주문 데이터 로드
    const localOrders = await readLocalOrders()

    // 3. 로컬 캐시에 있는 건과 토스 API 조회가 필요한 건 분리
    let ordersUpdated = false
    const txList = data || []
    const enriched = []

    // 로컬 캐시로 바로 처리할 수 있는 건 먼저 처리, 나머지는 토스 API 조회 대상
    const needDetailFetch = []
    for (const tx of txList) {
      const localOrder = localOrders[tx.orderId]
      if (localOrder?.customerName && localOrder?.customerPhone) {
        enriched.push({
          ...tx,
          orderName: localOrder.orderName || tx.orderName || '',
          customerName: localOrder.customerName,
          customerPhone: localOrder.customerPhone,
        })
      } else {
        needDetailFetch.push({ tx, localOrder })
      }
    }

    console.log(`[거래 조회] 총 ${txList.length}건, 캐시 ${enriched.length}건, API 조회 필요 ${needDetailFetch.length}건`)

    // 토스 상세 API를 5건씩 배치로 호출 (rate limit 방지)
    const BATCH_SIZE = 5
    for (let i = 0; i < needDetailFetch.length; i += BATCH_SIZE) {
      const batch = needDetailFetch.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.all(
        batch.map(async ({ tx, localOrder }) => {
          if (!tx.paymentKey) {
            console.log(`[스킵] orderId=${tx.orderId} - paymentKey 없음`)
            return localOrder
              ? { ...tx, orderName: localOrder.orderName || tx.orderName || '', customerName: localOrder.customerName || '', customerPhone: localOrder.customerPhone || '' }
              : tx
          }

          try {
            const detailRes = await fetch(
              `https://api.tosspayments.com/v1/payments/${tx.paymentKey}`,
              {
                method: 'GET',
                headers: {
                  Authorization: authHeader,
                  'Content-Type': 'application/json',
                },
              }
            )

            if (!detailRes.ok) {
              console.error(`[상세 조회 실패] paymentKey=${tx.paymentKey} status=${detailRes.status}`)
              return localOrder
                ? { ...tx, orderName: localOrder.orderName || tx.orderName || '', customerName: localOrder.customerName || '', customerPhone: localOrder.customerPhone || '' }
                : tx
            }

            const detail = await detailRes.json()

            // 모든 가능한 필드에서 고객정보 추출
            const customerName = detail.customer?.name
              || detail.customerName
              || detail.metadata?.customerName
              || localOrder?.customerName
              || ''
            const customerPhone = (
              detail.customer?.mobilePhone
              || detail.customerMobilePhone
              || detail.metadata?.customerPhone
              || localOrder?.customerPhone
              || ''
            ).replace(/-/g, '')
            const customerEmail = detail.customer?.email
              || detail.customerEmail
              || ''

            console.log(`[상세 조회 성공] orderId=${tx.orderId} name=${customerName || '(없음)'} phone=${customerPhone || '(없음)'}`)

            // 가져온 고객정보를 로컬에 자동 캐싱
            if (customerName || customerPhone) {
              localOrders[tx.orderId] = {
                ...(localOrder || {}),
                orderId: tx.orderId,
                orderName: detail.orderName || tx.orderName || localOrder?.orderName || '',
                customerName,
                customerPhone,
                customerEmail,
                paymentKey: tx.paymentKey,
                amount: detail.totalAmount || tx.totalAmount || tx.amount || 0,
                status: detail.status || tx.status || 'DONE',
                createdAt: localOrder?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              ordersUpdated = true
            }

            return {
              ...tx,
              orderName: detail.orderName || tx.orderName || '',
              customerName,
              customerPhone,
              customerEmail,
            }
          } catch (err) {
            console.error(`[상세 조회 에러] paymentKey=${tx.paymentKey}`, err.message)
            return localOrder
              ? { ...tx, orderName: localOrder.orderName || tx.orderName || '', customerName: localOrder.customerName || '', customerPhone: localOrder.customerPhone || '' }
              : tx
          }
        })
      )

      enriched.push(...batchResults)

      // 배치 간 200ms 대기 (rate limit 방지)
      if (i + BATCH_SIZE < needDetailFetch.length) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    // 원래 순서 복원 (txList 기준)
    const orderMap = new Map(enriched.map((tx) => [tx.transactionKey || tx.orderId, tx]))
    const sorted = txList.map((tx) => orderMap.get(tx.transactionKey || tx.orderId) || tx)

    // 토스에서 가져온 고객정보를 로컬에 일괄 저장
    if (ordersUpdated) {
      try {
        await writeLocalOrders(localOrders)
        console.log('[로컬 캐시 저장 완료]')
      } catch (err) {
        console.error('[로컬 주문 저장 실패]', err)
      }
    }

    return NextResponse.json({ transactions: sorted, localOrders })
  } catch (error) {
    console.error('[거래 내역 조회 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
