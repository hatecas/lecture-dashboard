'use client'

import { useState, useEffect } from 'react'

export default function PaymentPage() {
  const [ready, setReady] = useState(false)
  const [widgets, setWidgets] = useState(null)
  const [amount, setAmount] = useState(50000)
  const [loading, setLoading] = useState(false)

  // 예시 주문 정보
  const orderInfo = {
    orderId: `order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    orderName: '강의 수강료 결제 (예시)',
    customerName: '홍길동',
    customerEmail: 'test@example.com',
  }

  useEffect(() => {
    // 토스 SDK 스크립트 로드
    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v2/standard'
    script.onload = async () => {
      try {
        const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
        if (!clientKey) {
          alert('NEXT_PUBLIC_TOSS_CLIENT_KEY가 .env에 설정되지 않았습니다')
          return
        }
        const tossPayments = window.TossPayments(clientKey)
        const paymentWidgets = tossPayments.widgets({ customerKey: 'ANONYMOUS' })

        await paymentWidgets.setAmount({
          currency: 'KRW',
          value: amount,
        })

        // 결제 UI 렌더링
        await Promise.all([
          paymentWidgets.renderPaymentMethods({
            selector: '#payment-method',
            variantKey: 'DEFAULT',
          }),
          paymentWidgets.renderAgreement({
            selector: '#payment-agreement',
            variantKey: 'AGREEMENT',
          }),
        ])

        setWidgets(paymentWidgets)
        setReady(true)
      } catch (err) {
        console.error('토스 SDK 초기화 실패:', err)
      }
    }
    document.head.appendChild(script)

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
  }, [])

  // 금액 변경 시 위젯 업데이트
  useEffect(() => {
    if (widgets) {
      widgets.setAmount({ currency: 'KRW', value: amount })
    }
  }, [amount, widgets])

  const handlePayment = async () => {
    if (!widgets) return
    setLoading(true)

    try {
      await widgets.requestPayment({
        orderId: orderInfo.orderId,
        orderName: orderInfo.orderName,
        customerName: orderInfo.customerName,
        customerEmail: orderInfo.customerEmail,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      })
    } catch (err) {
      // 사용자가 결제창을 닫은 경우
      if (err.code === 'USER_CANCEL') {
        console.log('사용자가 결제를 취소했습니다')
      } else {
        console.error('결제 요청 실패:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '540px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        padding: '36px',
      }}>
        {/* 헤더 */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#fff',
          marginBottom: '8px',
        }}>
          결제하기
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#94a3b8',
          marginBottom: '28px',
        }}>
          토스페이먼츠 결제 연동 예시
        </p>

        {/* 주문 정보 */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
            주문명
          </div>
          <div style={{ fontSize: '16px', color: '#e2e8f0', fontWeight: '600', marginBottom: '16px' }}>
            {orderInfo.orderName}
          </div>

          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
            결제 금액
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[50000, 100000, 200000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: amount === v
                    ? '1px solid #6366f1'
                    : '1px solid rgba(255,255,255,0.1)',
                  background: amount === v
                    ? 'rgba(99, 102, 241, 0.2)'
                    : 'rgba(255,255,255,0.03)',
                  color: amount === v ? '#a5b4fc' : '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {v.toLocaleString()}원
              </button>
            ))}
          </div>
        </div>

        {/* 토스 결제 위젯 영역 */}
        <div id="payment-method" style={{ marginBottom: '16px' }} />
        <div id="payment-agreement" style={{ marginBottom: '24px' }} />

        {/* 결제 버튼 */}
        <button
          onClick={handlePayment}
          disabled={!ready || loading}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            background: ready
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              : 'rgba(255,255,255,0.1)',
            color: ready ? '#fff' : '#64748b',
            fontSize: '16px',
            fontWeight: '700',
            cursor: ready ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {loading ? '처리 중...' : `${amount.toLocaleString()}원 결제하기`}
        </button>

        {/* 안내 문구 */}
        <p style={{
          fontSize: '12px',
          color: '#64748b',
          textAlign: 'center',
          marginTop: '16px',
          lineHeight: '1.6',
        }}>
          테스트 모드입니다. 실제 결제가 이루어지지 않습니다.<br />
          카드 / 계좌이체 / 가상계좌 등 다양한 결제수단을 테스트할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
