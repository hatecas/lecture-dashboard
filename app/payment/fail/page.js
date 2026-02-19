'use client'

import { useSearchParams } from 'next/navigation'

export default function PaymentFailPage() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const message = searchParams.get('message')

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
        <div style={{
          width: '72px', height: '72px',
          background: 'rgba(239, 68, 68, 0.15)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: '32px', color: '#ef4444',
        }}>✕</div>

        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
          결제 실패
        </h1>
        <p style={{ fontSize: '15px', color: '#f87171', marginBottom: '24px' }}>
          {message || '결제 처리 중 문제가 발생했습니다'}
        </p>

        {code && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            borderRadius: '12px',
            padding: '12px 16px', marginBottom: '28px',
            fontSize: '13px', color: '#f87171', fontFamily: 'monospace',
          }}>
            {code}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <a href="/" style={{
            padding: '14px 28px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '12px', color: '#94a3b8', fontSize: '15px', fontWeight: '600', textDecoration: 'none',
          }}>돌아가기</a>
          <a href="/payment/checkout" style={{
            padding: '14px 28px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none',
            borderRadius: '12px', color: '#fff', fontSize: '15px', fontWeight: '600', textDecoration: 'none',
          }}>다시 시도</a>
        </div>
      </div>
    </div>
  )
}
