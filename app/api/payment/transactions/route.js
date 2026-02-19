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

    // 2. 로컬 주문 데이터 로드 (엑셀 임포트 또는 수동 입력 데이터)
    const localOrders = await readLocalOrders()
    let ordersUpdated = false

    // 3. 로컬 캐시에 상품명(orderName)이 있는 건과 없는 건 분리
    const txList = data || []
    const enriched = []
    const needOrderName = []

    for (const tx of txList) {
      const localOrder = localOrders[tx.orderId]
      if (localOrder?.orderName) {
        // 로컬에 상품명이 있으면 바로 사용
        enriched.push({
          ...tx,
          orderName: localOrder.orderName,
          customerName: localOrder.customerName || '',
          customerPhone: localOrder.customerPhone || '',
          customerEmail: localOrder.customerEmail || '',
        })
      } else {
        needOrderName.push({ tx, localOrder })
      }
    }

    // 4. 상품명이 없는 건만 토스 상세 API로 조회 (5건씩 배치)
    const BATCH_SIZE = 5
    for (let i = 0; i < needOrderName.length; i += BATCH_SIZE) {
      const batch = needOrderName.slice(i, i + BATCH_SIZE)

      const results = await Promise.all(
        batch.map(async ({ tx, localOrder }) => {
          if (!tx.paymentKey) {
            return { ...tx, customerName: localOrder?.customerName || '', customerPhone: localOrder?.customerPhone || '' }
          }

          try {
            const detailRes = await fetch(
              `https://api.tosspayments.com/v1/payments/${tx.paymentKey}`,
              {
                method: 'GET',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
              }
            )

            if (detailRes.ok) {
              const detail = await detailRes.json()

              // [디버깅] 첫 번째 건의 전체 API 응답 로깅
              if (i === 0 && batch.indexOf(batch.find(b => b.tx === tx)) === 0) {
                console.log('\n===== [토스 상세 API 전체 응답] =====')
                console.log(JSON.stringify(detail, null, 2))
                console.log('===== [응답 끝] =====\n')
              }

              const orderName = detail.orderName || tx.orderName || ''

              // 토스 API에서 고객 정보 추출 시도 (customerName, customerEmail, customerMobilePhone 필드)
              const apiCustomerName = detail.customerName || detail.customer?.name || ''
              const apiCustomerPhone = detail.customerMobilePhone || detail.customer?.mobilePhone || ''
              const apiCustomerEmail = detail.customerEmail || detail.customer?.email || ''

              // 상품명 + 고객정보 로컬에 캐싱
              const shouldUpdate = orderName || apiCustomerName || apiCustomerPhone
              if (shouldUpdate) {
                localOrders[tx.orderId] = {
                  ...(localOrder || {}),
                  orderId: tx.orderId,
                  ...(orderName && { orderName }),
                  paymentKey: tx.paymentKey,
                  amount: detail.totalAmount || tx.totalAmount || tx.amount || 0,
                  status: detail.status || tx.status || 'DONE',
                  // API에서 고객 정보를 가져왔으면 캐싱 (로컬에 이미 있으면 로컬 우선)
                  ...(apiCustomerName && !localOrder?.customerName && { customerName: apiCustomerName }),
                  ...(apiCustomerPhone && !localOrder?.customerPhone && { customerPhone: apiCustomerPhone }),
                  ...(apiCustomerEmail && !localOrder?.customerEmail && { customerEmail: apiCustomerEmail }),
                  ...(!localOrders[tx.orderId]?.createdAt && { createdAt: new Date().toISOString() }),
                  updatedAt: new Date().toISOString(),
                }
                ordersUpdated = true
              }

              // 고객 정보: 로컬 캐시 > API 응답 > 빈 값
              return {
                ...tx,
                orderName,
                customerName: localOrder?.customerName || apiCustomerName || '',
                customerPhone: localOrder?.customerPhone || apiCustomerPhone || '',
                customerEmail: localOrder?.customerEmail || apiCustomerEmail || '',
              }
            }
          } catch (err) {
            console.error(`[상세 조회 에러] paymentKey=${tx.paymentKey}`, err.message)
          }

          return {
            ...tx,
            customerName: localOrder?.customerName || '',
            customerPhone: localOrder?.customerPhone || '',
          }
        })
      )

      enriched.push(...results)

      if (i + BATCH_SIZE < needOrderName.length) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    // 원래 순서 복원
    const orderMap = new Map(enriched.map((tx) => [tx.transactionKey || tx.orderId, tx]))
    const sorted = txList.map((tx) => orderMap.get(tx.transactionKey || tx.orderId) || tx)

    // 캐시 저장
    if (ordersUpdated) {
      try {
        await writeLocalOrders(localOrders)
      } catch (err) {
        console.error('[로컬 캐시 저장 실패]', err)
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
