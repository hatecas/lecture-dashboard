import { NextResponse } from 'next/server'

// 토스페이먼츠 거래 내역 조회 API
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

    const params = new URLSearchParams({
      startDate,
      endDate,
      limit,
    })
    if (startingAfter) {
      params.set('startingAfter', startingAfter)
    }

    const response = await fetch(
      `https://api.tosspayments.com/v1/transactions?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${encryptedSecretKey}`,
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

    return NextResponse.json({ transactions: data })
  } catch (error) {
    console.error('[거래 내역 조회 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
