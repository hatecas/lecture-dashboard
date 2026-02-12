'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { checkLoginAttempts, recordLoginAttempt, createSession } from '@/lib/auth'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 로그인 시도 횟수 확인 (5회 제한)
      const attemptCheck = await checkLoginAttempts(username)
      if (!attemptCheck.allowed) {
        setError('로그인 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.')
        setLoading(false)
        return
      }

      // DB에서 관리자 확인
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .eq('password_hash', password)
        .single()

      if (error || !data) {
        // 실패 기록
        await recordLoginAttempt(username, false)
        const remaining = attemptCheck.remainingAttempts - 1
        if (remaining > 0) {
          setError(`아이디 또는 비밀번호가 틀렸습니다. (남은 시도: ${remaining}회)`)
        } else {
          setError('로그인 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.')
        }
      } else {
        // 성공 기록
        await recordLoginAttempt(username, true)

        // 세션 토큰 생성
        const token = await createSession(data.id)
        if (token) {
          localStorage.setItem('authToken', token)
        }

        // 브라우저 알림 권한 요청 (로그인 버튼 클릭 직후라 허용됨)
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission()
        }

        // 로그인 로그 기록 (IP 포함)
        await fetch('/api/login-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name || data.username })
        })
        onLogin(data.name || data.username, {
          canUseInflow: data.can_use_inflow || false
        })
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '32px',
        width: '90%',
        maxWidth: '400px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '800',
            background: 'linear-gradient(90deg, #6366f1, #a855f7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            강의 통합 관리 시스템
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            관리자 로그인이 필요합니다
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              color: '#94a3b8', 
              fontSize: '13px', 
              marginBottom: '8px' 
            }}>
              아이디
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              color: '#94a3b8', 
              fontSize: '13px', 
              marginBottom: '8px' 
            }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ 
              color: '#f87171', 
              fontSize: '13px', 
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              background: loading 
                ? '#4c4c6d' 
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p style={{ 
          textAlign: 'center', 
          color: '#64748b', 
          fontSize: '12px', 
          marginTop: '20px' 
        }}>
          테스트: admin / 1234
        </p>
      </div>
    </div>
  )
}