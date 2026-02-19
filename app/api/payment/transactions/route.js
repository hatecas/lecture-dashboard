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

    // 3. 각 거래에 로컬 데이터 + 토스 상세 정보 머지
    let ordersUpdated = false

    const enriched = await Promise.all(
      (data || []).map(async (tx) => {
        const localOrder = localOrders[tx.orderId]
        const hasLocalCustomerInfo = localOrder?.customerName && localOrder?.customerPhone

        // 로컬에 고객정보가 완전히 있으면 바로 사용
        if (hasLocalCustomerInfo) {
          return {
            ...tx,
            orderName: localOrder.orderName || tx.orderName || '',
            customerName: localOrder.customerName,
            customerPhone: localOrder.customerPhone,
          }
        }

        // 로컬에 고객정보가 없거나 불완전하면 토스 상세 API에서 조회
        if (!tx.paymentKey) return tx

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

          if (detailRes.ok) {
            const detail = await detailRes.json()
            const customerName = detail.customer?.name || detail.customerName || localOrder?.customerName || ''
            const customerPhone = detail.customer?.mobilePhone || detail.customerMobilePhone || localOrder?.customerPhone || ''
            const customerEmail = detail.customer?.email || detail.customerEmail || ''

            // 가져온 고객정보를 로컬에 자동 저장 (캐싱)
            if (customerName || customerPhone) {
              localOrders[tx.orderId] = {
                ...(localOrder || {}),
                orderId: tx.orderId,
                orderName: detail.orderName || tx.orderName || localOrder?.orderName || '',
                customerName: customerName,
                customerPhone: customerPhone.replace(/-/g, ''),
                customerEmail: customerEmail,
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
          }
        } catch (err) {
          console.error(`[상세 조회 실패] paymentKey=${tx.paymentKey}`, err)
        }

        // 토스 API도 실패하면 로컬에 있는 것이라도 사용
        if (localOrder) {
          return {
            ...tx,
            orderName: localOrder.orderName || tx.orderName || '',
            customerName: localOrder.customerName || '',
            customerPhone: localOrder.customerPhone || '',
          }
        }

        return tx
      })
    )

    // 토스에서 가져온 고객정보를 로컬에 일괄 저장
    if (ordersUpdated) {
      try {
        await writeLocalOrders(localOrders)
      } catch (err) {
        console.error('[로컬 주문 저장 실패]', err)
      }
    }

    return NextResponse.json({ transactions: enriched, localOrders })
  } catch (error) {
    console.error('[거래 내역 조회 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
