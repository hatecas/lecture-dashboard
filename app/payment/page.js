'use client'

import { useState, useCallback } from 'react'

export default function PaymentTransactionsPage() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // 기본값: 오늘 기준 최근 7일
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [startDate, setStartDate] = useState(weekAgo.toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const start = `${startDate}T00:00:00`
      const end = `${endDate}T23:59:59`

      const res = await fetch(
        `/api/payment/transactions?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
      )
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '조회에 실패했습니다')
        setTransactions([])
      } else {
        setTransactions(data.transactions || [])
      }
    } catch (err) {
      setError('서버 연결에 실패했습니다')
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const getMethodLabel = (method) => {
    const map = {
      '카드': { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
      '계좌이체': { bg: 'rgba(34,197,94,0.15)', color: '#86efac' },
      '가상계좌': { bg: 'rgba(251,191,36,0.15)', color: '#fcd34d' },
      '휴대폰': { bg: 'rgba(236,72,153,0.15)', color: '#f9a8d4' },
    }
    return map[method] || { bg: 'rgba(255,255,255,0.08)', color: '#94a3b8' }
  }

  const getStatusLabel = (status) => {
    const map = {
      DONE: { text: '완료', color: '#22c55e' },
      CANCELED: { text: '취소', color: '#ef4444' },
      WAITING_FOR_DEPOSIT: { text: '입금대기', color: '#fbbf24' },
      PARTIAL_CANCELED: { text: '부분취소', color: '#f97316' },
      ABORTED: { text: '중단', color: '#64748b' },
      EXPIRED: { text: '만료', color: '#64748b' },
    }
    return map[status] || { text: status, color: '#94a3b8' }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      padding: '32px 20px',
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
            결제 내역 조회
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            토스페이먼츠 거래 내역을 조회합니다
          </p>
        </div>

        {/* 검색 필터 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'end',
          flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              시작일
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e2e8f0',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              종료일
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e2e8f0',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <button
            onClick={fetchTransactions}
            disabled={loading}
            style={{
              padding: '10px 28px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            color: '#f87171',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {/* 결과 테이블 */}
        {hasSearched && !loading && !error && (
          <>
            <div style={{
              fontSize: '14px',
              color: '#64748b',
              marginBottom: '12px',
            }}>
              총 <span style={{ color: '#e2e8f0', fontWeight: '600' }}>{transactions.length}</span>건
            </div>

            {transactions.length === 0 ? (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '60px 20px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                  —
                </div>
                <p style={{ color: '#64748b', fontSize: '15px' }}>
                  해당 기간에 거래 내역이 없습니다
                </p>
                <p style={{ color: '#475569', fontSize: '13px', marginTop: '8px' }}>
                  테스트 결제를 먼저 진행하거나 기간을 변경해보세요
                </p>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                overflow: 'hidden',
              }}>
                {/* 테이블 헤더 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.8fr',
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '13px',
                  color: '#64748b',
                  fontWeight: '600',
                }}>
                  <div>주문명</div>
                  <div>결제수단</div>
                  <div style={{ textAlign: 'right' }}>금액</div>
                  <div style={{ textAlign: 'center' }}>일시</div>
                  <div style={{ textAlign: 'center' }}>상태</div>
                </div>

                {/* 거래 목록 */}
                {transactions.map((tx, i) => {
                  const method = getMethodLabel(tx.method)
                  const status = getStatusLabel(tx.status)
                  return (
                    <div
                      key={tx.transactionKey || i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.8fr',
                        padding: '14px 20px',
                        borderBottom: i < transactions.length - 1
                          ? '1px solid rgba(255,255,255,0.04)'
                          : 'none',
                        alignItems: 'center',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '500' }}>
                          {tx.orderName || '-'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                          {tx.orderId || ''}
                        </div>
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: method.bg,
                          color: method.color,
                          fontSize: '12px',
                          fontWeight: '500',
                        }}>
                          {tx.method || '-'}
                        </span>
                      </div>
                      <div style={{
                        textAlign: 'right',
                        fontSize: '14px',
                        color: '#e2e8f0',
                        fontWeight: '600',
                      }}>
                        {(tx.totalAmount || tx.amount || 0).toLocaleString()}원
                      </div>
                      <div style={{
                        textAlign: 'center',
                        fontSize: '13px',
                        color: '#94a3b8',
                      }}>
                        {tx.approvedAt
                          ? new Date(tx.approvedAt).toLocaleString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: status.color,
                        }}>
                          {status.text}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* 초기 안내 */}
        {!hasSearched && !loading && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '60px 20px',
            textAlign: 'center',
          }}>
            <p style={{ color: '#64748b', fontSize: '15px' }}>
              기간을 선택하고 조회 버튼을 눌러주세요
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
