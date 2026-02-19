import { NextResponse } from 'next/server'

// 토스페이먼츠 거래 내역 조회 API (상세 정보 포함)
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

    // 2. 각 거래의 상세 정보 조회 (주문자명, 전화번호 등)
    const enriched = await Promise.all(
      (data || []).map(async (tx) => {
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
          console.log(`[상세 조회 실패] paymentKey=${tx.paymentKey} status=${detailRes.status}`)
        } catch (err) {
          console.error(`[상세 조회 실패] paymentKey=${tx.paymentKey}`, err)
        }

        return tx
      })
    )

    return NextResponse.json({ transactions: enriched })
  } catch (error) {
    console.error('[거래 내역 조회 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
