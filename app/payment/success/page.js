'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const confirmPayment = async () => {
      const paymentKey = searchParams.get('paymentKey')
      const orderId = searchParams.get('orderId')
      const amount = searchParams.get('amount')

      if (!paymentKey || !orderId || !amount) {
        setError('결제 정보가 올바르지 않습니다')
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: Number(amount),
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || '결제 승인에 실패했습니다')
        } else {
          setResult(data)
        }
      } catch (err) {
        setError('서버 연결에 실패했습니다')
      } finally {
        setLoading(false)
      }
    }

    confirmPayment()
  }, [searchParams])

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
        maxWidth: '480px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        padding: '40px',
        textAlign: 'center',
      }}>
        {loading ? (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              margin: '0 auto 20px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#94a3b8', fontSize: '16px' }}>결제 승인 중...</p>
          </>
        ) : error ? (
          <>
            <div style={{
              width: '72px',
              height: '72px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '32px',
            }}>
              ✕
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
              결제 실패
            </h1>
            <p style={{ fontSize: '15px', color: '#f87171', marginBottom: '28px' }}>
              {error}
            </p>
            <a href="/payment" style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              color: '#94a3b8',
              fontSize: '15px',
              fontWeight: '600',
              textDecoration: 'none',
            }}>
              다시 시도
            </a>
          </>
        ) : result && (
          <>
            <div style={{
              width: '72px',
              height: '72px',
              background: 'rgba(34, 197, 94, 0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '32px',
              color: '#22c55e',
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
              결제 완료
            </h1>
            <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '28px' }}>
              결제가 정상적으로 처리되었습니다
            </p>

            {/* 결제 상세 정보 */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '28px',
            }}>
              {[
                { label: '주문번호', value: result.orderId },
                { label: '결제수단', value: result.method },
                { label: '결제금액', value: `${result.amount?.toLocaleString()}원` },
                { label: '승인시각', value: result.approvedAt ? new Date(result.approvedAt).toLocaleString('ko-KR') : '-' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '500' }}>{item.value}</span>
                </div>
              ))}

              {/* 가상계좌 정보 (가상계좌 결제 시) */}
              {result.virtualAccount && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: '8px',
                }}>
                  <div style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '600', marginBottom: '8px' }}>
                    가상계좌 입금 정보
                  </div>
                  <div style={{ fontSize: '14px', color: '#e2e8f0' }}>
                    {result.virtualAccount.bankCode} {result.virtualAccount.accountNumber}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    입금기한: {result.virtualAccount.dueDate ? new Date(result.virtualAccount.dueDate).toLocaleString('ko-KR') : '-'}
                  </div>
                </div>
              )}
            </div>

            <a href="/" style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              textDecoration: 'none',
            }}>
              대시보드로 돌아가기
            </a>
          </>
        )}
      </div>
    </div>
  )
}
