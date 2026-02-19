import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const ORDERS_FILE = path.join(process.cwd(), 'data', 'orders.json')

async function readLocalOrders() {
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
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
    const enriched = await Promise.all(
      (data || []).map(async (tx) => {
        // 로컬 주문 데이터가 있으면 우선 사용
        const localOrder = localOrders[tx.orderId]
        if (localOrder) {
          return {
            ...tx,
            orderName: localOrder.orderName || tx.orderName || '',
            customerName: localOrder.customerName || '',
            customerPhone: localOrder.customerPhone || '',
          }
        }

        // 로컬 데이터 없으면 토스 상세 API에서 조회 시도
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
            return {
              ...tx,
              orderName: detail.orderName || tx.orderName || '',
              customerName: detail.customer?.name || detail.customerName || '',
              customerPhone: detail.customer?.mobilePhone || detail.customerMobilePhone || '',
              customerEmail: detail.customer?.email || detail.customerEmail || '',
            }
          }
        } catch (err) {
          console.error(`[상세 조회 실패] paymentKey=${tx.paymentKey}`, err)
        }

        return tx
      })
    )

    return NextResponse.json({ transactions: enriched, localOrders })
  } catch (error) {
    console.error('[거래 내역 조회 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
