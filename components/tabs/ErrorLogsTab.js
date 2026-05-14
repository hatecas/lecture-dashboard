'use client'

// 에러 로그 탭 — jinwoo 또는 localhost 환경에서만 접근 가능.
// 2026-05-14 Dashboard.js에서 분리. Dashboard.js 1만 줄+ 모놀리식 분리의 첫 시범 사례.
//   - state는 모두 이 탭만 쓰므로 안으로 이동 (errorLogs/errorLogDetail/errorLogsFilter/errorLogsStats/errorLogsLoading)
//   - 로드 useEffect도 함께 이동
//   - 공유 의존성(isMobile/isDevEnv/loginId)은 props
//   - 공통 헬퍼는 lib/authClient, lib/utils/dateUtils import

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { getAuthHeaders } from '@/lib/authClient'
import { formatKST } from '@/lib/utils/dateUtils'

const CODE_COLOR = {
  VALIDATION:   { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  AUTH:         { bg: 'rgba(239,68,68,0.15)',  color: '#fca5a5' },
  NOT_FOUND:    { bg: 'rgba(148,163,184,0.15)', color: '#cbd5e1' },
  RATE_LIMIT:   { bg: 'rgba(249,115,22,0.15)', color: '#fdba74' },
  EXTERNAL_API: { bg: 'rgba(168,85,247,0.15)', color: '#c4b5fd' },
  DB:           { bg: 'rgba(14,165,233,0.15)', color: '#7dd3fc' },
  TIMEOUT:      { bg: 'rgba(244,114,182,0.15)', color: '#f9a8d4' },
  TOKEN_LIMIT:  { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
  INTERNAL:     { bg: 'rgba(239,68,68,0.20)',  color: '#f87171' },
}

export default function ErrorLogsTab({ isMobile, isDevEnv, loginId }) {
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogsLoading, setErrorLogsLoading] = useState(false)
  const [errorLogsFilter, setErrorLogsFilter] = useState({ route: '', code: '', username: '' })
  const [errorLogsStats, setErrorLogsStats] = useState({})
  const [errorLogDetail, setErrorLogDetail] = useState(null)

  // 진입 시 + 필터 변경 시 자동 로드
  useEffect(() => {
    if (!isDevEnv && loginId !== 'jinwoo') return
    let cancelled = false
    setErrorLogsLoading(true)
    const params = new URLSearchParams()
    if (errorLogsFilter.route) params.set('route', errorLogsFilter.route)
    if (errorLogsFilter.code) params.set('code', errorLogsFilter.code)
    if (errorLogsFilter.username) params.set('username', errorLogsFilter.username)
    params.set('limit', '200')
    fetch(`/api/dev/error-logs?${params.toString()}`, { headers: { ...getAuthHeaders() } })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (Array.isArray(data?.logs)) setErrorLogs(data.logs)
        if (data?.codeStats24h) setErrorLogsStats(data.codeStats24h)
      })
      .catch(e => console.warn('[error-logs] 로드 실패:', e?.message))
      .finally(() => { if (!cancelled) setErrorLogsLoading(false) })
    return () => { cancelled = true }
  }, [errorLogsFilter.route, errorLogsFilter.code, errorLogsFilter.username, isDevEnv, loginId])

  const deleteOne = async (id) => {
    if (!confirm('이 로그를 삭제할까요?')) return
    try {
      const res = await fetch(`/api/dev/error-logs?id=${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      })
      if (res.ok) {
        setErrorLogs(prev => prev.filter(l => l.id !== id))
        if (errorLogDetail?.id === id) setErrorLogDetail(null)
      }
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    }
  }

  const clearOld = async () => {
    if (!confirm('7일 이상 지난 로그를 일괄 삭제할까요?')) return
    const before = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    try {
      const res = await fetch(`/api/dev/error-logs?before=${encodeURIComponent(before)}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      })
      const data = await res.json()
      if (res.ok) {
        alert(`${data.deletedCount}건 삭제됨`)
        setErrorLogsFilter(prev => ({ ...prev })) // 새로고침 트리거
      } else {
        alert(data?.error || '삭제 실패')
      }
    } catch (e) {
      alert('네트워크 오류: ' + e.message)
    }
  }

  const totalStats = Object.values(errorLogsStats).reduce((a, b) => a + b, 0)

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #f87171, #ef4444)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
            <AlertCircle size={18} color="#fff" strokeWidth={2.2} />
          </span>
          에러 로그 {isDevEnv && <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderRadius: '999px', fontWeight: 700 }}>DEV</span>}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.55 }}>
          엔드유저에겐 친절한 메시지가, 여기엔 원문/스택/컨텍스트가. <b style={{ color: '#cbd5e1' }}>localhost</b> 또는 <b style={{ color: '#cbd5e1' }}>jinwoo</b>만 접근 가능.
        </p>
      </div>

      {/* 최근 24시간 코드별 카운트 */}
      {totalStats > 0 && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>📊 최근 24시간 (총 {totalStats}건)</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(errorLogsStats).sort((a, b) => b[1] - a[1]).map(([code, n]) => {
              const c = CODE_COLOR[code] || CODE_COLOR.INTERNAL
              return (
                <button key={code} onClick={() => setErrorLogsFilter(prev => ({ ...prev, code: prev.code === code ? '' : code }))}
                  style={{ padding: '4px 10px', borderRadius: '999px', background: c.bg, color: c.color, fontSize: '11.5px', fontWeight: 600, border: '1px solid ' + (errorLogsFilter.code === code ? c.color : 'transparent'), cursor: 'pointer' }}>
                  {code} {n}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" value={errorLogsFilter.route} onChange={(e) => setErrorLogsFilter(prev => ({ ...prev, route: e.target.value }))}
          placeholder="라우트 필터 (예: /api/tools)"
          style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '12px', minWidth: '220px' }} />
        <select value={errorLogsFilter.code} onChange={(e) => setErrorLogsFilter(prev => ({ ...prev, code: e.target.value }))}
          style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '12px' }}>
          <option value="">전체 코드</option>
          {Object.keys(CODE_COLOR).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={errorLogsFilter.username} onChange={(e) => setErrorLogsFilter(prev => ({ ...prev, username: e.target.value }))}
          placeholder="사용자 ID"
          style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '12px', width: '140px' }} />
        {errorLogsLoading && <span style={{ fontSize: '11px', color: '#94a3b8' }}>불러오는 중…</span>}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>{errorLogs.length}건</span>
        <button onClick={clearOld}
          style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '7px', color: '#f87171', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
          🗑️ 7일↑ 일괄 정리
        </button>
      </div>

      {/* 좌측 목록 + 우측 상세 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '420px 1fr', gap: '14px' }}>
        {/* 좌측: 목록 */}
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px', border: '1px solid var(--border)', maxHeight: '70vh', overflowY: 'auto' }}>
          {errorLogs.length === 0 && !errorLogsLoading && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
              에러 로그가 없습니다. 👍
            </div>
          )}
          {errorLogs.map(l => {
            const c = CODE_COLOR[l.error_code] || CODE_COLOR.INTERNAL
            const isOpen = errorLogDetail?.id === l.id
            return (
              <div key={l.id} onClick={() => setErrorLogDetail(l)}
                style={{
                  padding: '10px 12px', marginBottom: '5px',
                  background: isOpen ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid ' + (isOpen ? 'rgba(129,140,248,0.40)' : 'var(--border)'),
                  borderRadius: '9px', cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '999px', background: c.bg, color: c.color, fontWeight: 700 }}>
                    {l.error_code || '?'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{l.method} {l.route}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: '#64748b' }}>
                    {formatKST(l.created_at, 'full')}
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#fca5a5', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {l.error_message}
                </div>
                {l.username && (
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>by {l.username}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* 우측: 상세 */}
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', minHeight: '300px' }}>
          {!errorLogDetail && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              왼쪽에서 로그를 선택하세요.
            </div>
          )}
          {errorLogDetail && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: (CODE_COLOR[errorLogDetail.error_code] || CODE_COLOR.INTERNAL).bg, color: (CODE_COLOR[errorLogDetail.error_code] || CODE_COLOR.INTERNAL).color, fontWeight: 700 }}>
                  {errorLogDetail.error_code || 'INTERNAL'}
                </span>
                <code style={{ fontSize: '12px', color: '#cbd5e1' }}>{errorLogDetail.method} {errorLogDetail.route}</code>
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                  {formatKST(errorLogDetail.created_at, 'full')}
                </span>
                <button onClick={() => deleteOne(errorLogDetail.id)}
                  style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}>
                  🗑️
                </button>
              </div>
              {errorLogDetail.username && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>사용자: <b style={{ color: '#cbd5e1' }}>{errorLogDetail.username}</b></div>
              )}
              {errorLogDetail.user_message && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#86efac', fontWeight: 600, marginBottom: '2px' }}>↳ 사용자에게 표시된 메시지</div>
                  <div style={{ fontSize: '12.5px', color: '#cbd5e1', padding: '8px 10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)', borderRadius: '7px' }}>
                    {errorLogDetail.user_message}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10.5px', color: '#fca5a5', fontWeight: 600, marginBottom: '2px' }}>↳ 원문 에러 메시지 (DB)</div>
                <pre style={{ fontSize: '12px', color: '#fca5a5', padding: '8px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: '7px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {errorLogDetail.error_message}
                </pre>
              </div>
              {errorLogDetail.context && (
                <details style={{ marginBottom: '8px' }}>
                  <summary style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>📦 컨텍스트</summary>
                  <pre style={{ fontSize: '11.5px', color: '#cbd5e1', padding: '8px 10px', background: 'rgba(0,0,0,0.30)', borderRadius: '7px', margin: '4px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' }}>
                    {JSON.stringify(errorLogDetail.context, null, 2)}
                  </pre>
                </details>
              )}
              {errorLogDetail.stack && (
                <details>
                  <summary style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>📋 스택 트레이스</summary>
                  <pre style={{ fontSize: '11px', color: '#94a3b8', padding: '8px 10px', background: 'rgba(0,0,0,0.30)', borderRadius: '7px', margin: '4px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflow: 'auto' }}>
                    {errorLogDetail.stack}
                  </pre>
                </details>
              )}
              {(errorLogDetail.user_agent || errorLogDetail.ip) && (
                <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  {errorLogDetail.ip && <span>IP: {errorLogDetail.ip}</span>}
                  {errorLogDetail.user_agent && <span style={{ marginLeft: '12px' }}>UA: {errorLogDetail.user_agent.slice(0, 100)}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
