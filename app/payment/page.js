'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'

export default function PaymentTransactionsPage() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // 기본값: 오늘 기준 최근 1개월
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)

  const [startDate, setStartDate] = useState(monthAgo.toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))

  // 필터
  const [filterMethod, setFilterMethod] = useState('전체')
  const [filterStatus, setFilterStatus] = useState('전체')
  const [filterAmountMin, setFilterAmountMin] = useState('')
  const [filterAmountMax, setFilterAmountMax] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // 수동 편집 모달
  const [editingTx, setEditingTx] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editSaving, setEditSaving] = useState(false)

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

  // 접속 즉시 자동 조회
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      fetchTransactions()
    }
  }, [fetchTransactions])

  // 필터 + 검색 적용
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 결제수단 필터
      if (filterMethod !== '전체' && tx.method !== filterMethod) return false

      // 결제상태 필터
      if (filterStatus !== '전체') {
        const statusMap = {
          '완료': 'DONE',
          '취소': 'CANCELED',
          '부분취소': 'PARTIAL_CANCELED',
          '입금대기': 'WAITING_FOR_DEPOSIT',
          '만료': 'EXPIRED',
        }
        if (tx.status !== statusMap[filterStatus]) return false
      }

      // 금액 필터
      const amount = tx.totalAmount || tx.amount || 0
      if (filterAmountMin && amount < Number(filterAmountMin)) return false
      if (filterAmountMax && amount > Number(filterAmountMax)) return false

      // 검색
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const searchFields = [
          tx.customerName,
          tx.orderName,
          tx.customerPhone,
          tx.orderId,
          tx.customerEmail,
        ]
        const match = searchFields.some((field) =>
          field && String(field).toLowerCase().includes(q)
        )
        if (!match) return false
      }

      return true
    })
  }, [transactions, filterMethod, filterStatus, filterAmountMin, filterAmountMax, searchQuery])

  const getStatusLabel = (status) => {
    const map = {
      DONE: { text: '완료', bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
      CANCELED: { text: '취소', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
      WAITING_FOR_DEPOSIT: { text: '입금대기', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
      PARTIAL_CANCELED: { text: '부분취소', bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
      ABORTED: { text: '중단', bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
      EXPIRED: { text: '만료', bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
    }
    return map[status] || { text: status, bg: 'rgba(255,255,255,0.08)', color: '#94a3b8' }
  }

  // 합계 계산
  const totalAmount = useMemo(() => {
    return filteredTransactions
      .filter((tx) => tx.status === 'DONE')
      .reduce((sum, tx) => sum + (tx.totalAmount || tx.amount || 0), 0)
  }, [filteredTransactions])

  const openEditModal = (tx) => {
    setEditingTx(tx)
    setEditName(tx.customerName || '')
    setEditPhone(tx.customerPhone || '')
  }

  const saveCustomerInfo = async () => {
    if (!editingTx) return
    setEditSaving(true)
    try {
      await fetch('/api/payment/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: editingTx.orderId,
          customerName: editName.trim(),
          customerPhone: editPhone.replace(/-/g, '').trim(),
          orderName: editingTx.orderName || '',
          paymentKey: editingTx.paymentKey,
        }),
      })

      // 로컬 상태 즉시 업데이트
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.orderId === editingTx.orderId
            ? { ...tx, customerName: editName.trim(), customerPhone: editPhone.replace(/-/g, '').trim() }
            : tx
        )
      )
      setEditingTx(null)
    } catch (err) {
      alert('저장에 실패했습니다')
    } finally {
      setEditSaving(false)
    }
  }

  const formatPhoneDisplay = (value) => {
    const numbers = (value || '').replace(/[^0-9]/g, '').slice(0, 11)
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
  }

  const inputStyle = {
    padding: '9px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: '30px',
  }

  const labelStyle = {
    fontSize: '12px',
    color: '#64748b',
    display: 'block',
    marginBottom: '5px',
    fontWeight: '500',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      padding: '32px 20px',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
              결제 내역
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              토스페이먼츠 거래 내역을 조회합니다
            </p>
          </div>
          {hasSearched && !loading && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>완료 건 합계</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#a5b4fc' }}>
                {totalAmount.toLocaleString()}원
              </div>
            </div>
          )}
        </div>

        {/* 기간 + 조회 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'end',
          flexWrap: 'wrap',
        }}>
          <div>
            <label style={labelStyle}>시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            onClick={fetchTransactions}
            disabled={loading}
            style={{
              padding: '9px 28px',
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

        {/* 필터 + 검색 */}
        {hasSearched && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            gap: '12px',
            alignItems: 'end',
            flexWrap: 'wrap',
          }}>
            {/* 검색 */}
            <div style={{ flex: '1 1 220px' }}>
              <label style={labelStyle}>검색</label>
              <input
                type="text"
                placeholder="주문자명, 상품명, 전화번호, 주문번호..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            {/* 결제수단 */}
            <div>
              <label style={labelStyle}>결제수단</label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                style={selectStyle}
              >
                {['전체', '카드', '계좌이체', '가상계좌', '휴대폰'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* 결제상태 */}
            <div>
              <label style={labelStyle}>결제상태</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={selectStyle}
              >
                {['전체', '완료', '취소', '부분취소', '입금대기', '만료'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* 금액 범위 */}
            <div>
              <label style={labelStyle}>최소금액</label>
              <input
                type="number"
                placeholder="0"
                value={filterAmountMin}
                onChange={(e) => setFilterAmountMin(e.target.value)}
                style={{ ...inputStyle, width: '110px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>최대금액</label>
              <input
                type="number"
                placeholder="무제한"
                value={filterAmountMax}
                onChange={(e) => setFilterAmountMax(e.target.value)}
                style={{ ...inputStyle, width: '110px' }}
              />
            </div>

            {/* 필터 초기화 */}
            {(filterMethod !== '전체' || filterStatus !== '전체' || filterAmountMin || filterAmountMax || searchQuery) && (
              <button
                onClick={() => {
                  setFilterMethod('전체')
                  setFilterStatus('전체')
                  setFilterAmountMin('')
                  setFilterAmountMax('')
                  setSearchQuery('')
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                초기화
              </button>
            )}
          </div>
        )}

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
              {filteredTransactions.length !== transactions.length && (
                <span> (필터 적용: <span style={{ color: '#a5b4fc' }}>{filteredTransactions.length}</span>건)</span>
              )}
            </div>

            {filteredTransactions.length === 0 ? (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '60px 20px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>—</div>
                <p style={{ color: '#64748b', fontSize: '15px' }}>
                  {transactions.length === 0
                    ? '해당 기간에 거래 내역이 없습니다'
                    : '필터 조건에 맞는 결과가 없습니다'}
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
                  gridTemplateColumns: '1fr 1.4fr 1.1fr 1fr 0.7fr',
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '13px',
                  color: '#64748b',
                  fontWeight: '600',
                }}>
                  <div>주문자명</div>
                  <div>상품명</div>
                  <div>전화번호</div>
                  <div style={{ textAlign: 'right' }}>결제금액</div>
                  <div style={{ textAlign: 'center' }}>결제상태</div>
                </div>

                {/* 거래 목록 */}
                {filteredTransactions.map((tx, i) => {
                  const status = getStatusLabel(tx.status)
                  const amount = tx.totalAmount || tx.amount || 0
                  return (
                    <div
                      key={tx.transactionKey || i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1.4fr 1.1fr 1fr 0.7fr',
                        padding: '13px 20px',
                        borderBottom: i < filteredTransactions.length - 1
                          ? '1px solid rgba(255,255,255,0.04)'
                          : 'none',
                        alignItems: 'center',
                        transition: 'background 0.15s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => openEditModal(tx)}
                    >
                      {/* 주문자명 */}
                      <div style={{ fontSize: '14px', color: tx.customerName ? '#e2e8f0' : '#475569', fontWeight: '500', cursor: 'pointer' }}>
                        {tx.customerName || '미확인'}
                      </div>

                      {/* 상품명 */}
                      <div>
                        <div style={{ fontSize: '14px', color: '#e2e8f0' }}>
                          {tx.orderName || '-'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                          {tx.orderId || ''}
                        </div>
                      </div>

                      {/* 전화번호 */}
                      <div style={{ fontSize: '13px', color: tx.customerPhone ? '#94a3b8' : '#475569' }}>
                        {tx.customerPhone ? formatPhoneDisplay(tx.customerPhone) : '-'}
                      </div>

                      {/* 결제금액 */}
                      <div style={{
                        textAlign: 'right',
                        fontSize: '14px',
                        color: tx.status === 'CANCELED' ? '#ef4444' : '#e2e8f0',
                        fontWeight: '600',
                      }}>
                        {tx.status === 'CANCELED' && '-'}{amount.toLocaleString()}원
                      </div>

                      {/* 결제상태 */}
                      <div style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: status.bg,
                          color: status.color,
                          fontSize: '12px',
                          fontWeight: '600',
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

        {/* 수동 편집 모달 */}
        {editingTx && (
          <div
            onClick={() => setEditingTx(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: '20px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: '400px',
                background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '16px', padding: '28px',
              }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
                고객 정보 수정
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                {editingTx.orderName || editingTx.orderId}
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>주문자명</label>
                <input
                  type="text"
                  placeholder="홍길동"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>전화번호</label>
                <input
                  type="tel"
                  placeholder="010-1234-5678"
                  value={formatPhoneDisplay(editPhone)}
                  onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditingTx(null)}
                  style={{
                    padding: '10px 20px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent', color: '#94a3b8',
                    fontSize: '14px', cursor: 'pointer',
                  }}
                >취소</button>
                <button
                  onClick={saveCustomerInfo}
                  disabled={editSaving || !editName.trim()}
                  style={{
                    padding: '10px 24px', borderRadius: '8px', border: 'none',
                    background: editName.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                    color: editName.trim() ? '#fff' : '#64748b',
                    fontSize: '14px', fontWeight: '600',
                    cursor: editName.trim() ? 'pointer' : 'not-allowed',
                  }}
                >{editSaving ? '저장 중...' : '저장'}</button>
              </div>
            </div>
          </div>
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
