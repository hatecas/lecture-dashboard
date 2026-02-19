import { NextResponse } from 'next/server'

// 토스페이먼츠 결제 승인 API
export async function POST(request) {
  try {
    const { paymentKey, orderId, amount } = await request.json()

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json(
        { error: '필수 파라미터가 누락되었습니다' },
        { status: 400 }
      )
    }

    // 시크릿 키를 Base64로 인코딩 (토스 요구사항)
    const secretKey = process.env.TOSS_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        { error: '결제 설정이 완료되지 않았습니다' },
        { status: 500 }
      )
    }

    const encryptedSecretKey = Buffer.from(secretKey + ':').toString('base64')

    // 토스페이먼츠 결제 승인 요청
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[결제 승인 실패]', data)
      return NextResponse.json(
        { error: data.message || '결제 승인에 실패했습니다', code: data.code },
        { status: response.status }
      )
    }

    // 결제 성공 - 여기서 DB 저장 등 후처리
    // 예: await supabase.from('payments').insert({ ... })
    console.log('[결제 승인 성공]', {
      orderId: data.orderId,
      amount: data.totalAmount,
      method: data.method,
      status: data.status,
    })

    return NextResponse.json({
      success: true,
      orderId: data.orderId,
      amount: data.totalAmount,
      method: data.method,
      approvedAt: data.approvedAt,
      // 가상계좌인 경우 추가 정보
      virtualAccount: data.virtualAccount || null,
    })
  } catch (error) {
    console.error('[결제 승인 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
