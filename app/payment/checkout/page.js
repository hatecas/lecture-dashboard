'use client'

import { useState, useEffect, useRef } from 'react'

export default function CheckoutPage() {
  const [ready, setReady] = useState(false)
  const [widgets, setWidgets] = useState(null)
  const [loading, setLoading] = useState(false)
  const widgetsRef = useRef(null)

  // 고객 정보
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderName, setOrderName] = useState('')
  const [amount, setAmount] = useState(50000)

  useEffect(() => {
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

        await paymentWidgets.setAmount({ currency: 'KRW', value: amount })

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

        widgetsRef.current = paymentWidgets
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
    if (widgetsRef.current) {
      widgetsRef.current.setAmount({ currency: 'KRW', value: amount })
    }
  }, [amount])

  const handlePayment = async () => {
    if (!widgets) return
    if (!customerName.trim()) return alert('주문자명을 입력해주세요')
    if (!customerPhone.trim()) return alert('전화번호를 입력해주세요')
    if (!orderName.trim()) return alert('상품명을 입력해주세요')

    setLoading(true)

    try {
      const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      await widgets.requestPayment({
        orderId,
        orderName: orderName.trim(),
        customerName: customerName.trim(),
        customerMobilePhone: customerPhone.replace(/-/g, '').trim(),
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      })
    } catch (err) {
      if (err.code !== 'USER_CANCEL') {
        console.error('결제 요청 실패:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  // 전화번호 자동 포맷
  const formatPhone = (value) => {
    const numbers = value.replace(/[^0-9]/g, '').slice(0, 11)
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
  }

  const labelStyle = {
    fontSize: '13px',
    color: '#94a3b8',
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
          결제하기
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px' }}>
          고객 정보를 입력하고 결제를 진행합니다
        </p>

        {/* 고객 정보 입력 */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.06)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div>
            <label style={labelStyle}>주문자명 *</label>
            <input
              type="text"
              placeholder="홍길동"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>전화번호 *</label>
            <input
              type="tel"
              placeholder="010-1234-5678"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>상품명 *</label>
            <input
              type="text"
              placeholder="예: 웹개발 기초반 3기"
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>결제 금액</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[50000, 100000, 200000, 300000].map((v) => (
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
                  }}
                >
                  {v.toLocaleString()}원
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder="직접 입력"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              style={{ ...inputStyle, marginTop: '8px' }}
            />
          </div>
        </div>

        {/* 토스 결제 위젯 */}
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
          }}
        >
          {loading ? '처리 중...' : `${amount.toLocaleString()}원 결제하기`}
        </button>

        <p style={{
          fontSize: '12px',
          color: '#64748b',
          textAlign: 'center',
          marginTop: '16px',
          lineHeight: '1.6',
        }}>
          테스트 모드에서는 실제 결제가 이루어지지 않습니다
        </p>
      </div>
    </div>
  )
}
