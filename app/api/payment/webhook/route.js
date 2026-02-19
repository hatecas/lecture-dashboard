import { NextResponse } from 'next/server'

// 토스페이먼츠 웹훅 수신 (가상계좌 입금 확인 등)
export async function POST(request) {
  try {
    const body = await request.json()
    const { eventType, data } = body

    console.log('[토스 웹훅 수신]', eventType, JSON.stringify(data, null, 2))

    switch (eventType) {
      // 가상계좌 입금 완료
      case 'DEPOSIT_CALLBACK': {
        const { orderId, status, secret } = data

        // secret 값 검증 (결제 요청 시 저장한 값과 비교)
        // 예: const order = await supabase.from('orders').select('webhook_secret').eq('order_id', orderId).single()
        // if (order.data.webhook_secret !== secret) return error

        if (status === 'DONE') {
          console.log(`[입금 확인] 주문 ${orderId} 입금 완료`)
          // DB 업데이트: 결제 상태를 '입금완료'로 변경
          // 예: await supabase.from('orders').update({ payment_status: 'paid' }).eq('order_id', orderId)
        } else if (status === 'CANCELED') {
          console.log(`[입금 취소] 주문 ${orderId} 입금 취소됨`)
        }
        break
      }

      // 결제 상태 변경
      case 'PAYMENT_STATUS_CHANGED': {
        const { paymentKey, orderId, status } = data
        console.log(`[상태 변경] 주문 ${orderId}: ${status}`)
        // DB 업데이트
        break
      }

      default:
        console.log(`[미처리 이벤트] ${eventType}`)
    }

    // 토스에 200 OK 응답 필수 (안 하면 재시도함)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[웹훅 처리 오류]', error)
    // 오류가 나도 200 반환 (토스가 계속 재시도하는 것 방지)
    return NextResponse.json({ success: false })
  }
}
