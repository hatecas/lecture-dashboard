'use client'

import { useState } from 'react'
import { LayoutDashboard, User, Lock, Loader2, AlertCircle } from 'lucide-react'
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
      const attemptCheck = await checkLoginAttempts(username)
      if (!attemptCheck.allowed) {
        setError('로그인 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .eq('password_hash', password)
        .single()

      if (error || !data) {
        await recordLoginAttempt(username, false)
        const remaining = attemptCheck.remainingAttempts - 1
        if (remaining > 0) {
          setError(`아이디 또는 비밀번호가 틀렸습니다. (남은 시도: ${remaining}회)`)
        } else {
          setError('로그인 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.')
        }
      } else {
        await recordLoginAttempt(username, true)

        const token = await createSession(data.id)
        if (token) {
          localStorage.setItem('authToken', token)
        }

        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission()
        }

        // 토큰이 발급된 직후이므로 인증 헤더로 호출 (서버는 토큰의 user를 신뢰, 클라이언트 name 무시)
        const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {}
        await fetch('/api/login-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({})
        })

        let userFeatures = ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer']
        try {
          const permRes = await fetch(`/api/user-permissions?action=my-permissions`, {
            headers: authHeader
          })
          const permData = await permRes.json()
          if (permData.success) {
            userFeatures = permData.features
          }
        } catch (e) {}

        onLogin(data.name || data.username, {
          canUseInflow: data.can_use_inflow || false,
          loginId: data.username,
          features: userFeatures
        })
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      overflow: 'hidden',
    }}>
      {/* Aurora background blobs */}
      <div style={{
        position: 'absolute',
        top: '-20%',
        left: '-10%',
        width: '520px',
        height: '520px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 60%)',
        filter: 'blur(40px)',
        animation: 'auroraDrift 18s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-20%',
        right: '-10%',
        width: '560px',
        height: '560px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.28) 0%, transparent 60%)',
        filter: 'blur(50px)',
        animation: 'auroraDrift 22s ease-in-out infinite reverse',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        zIndex: 1,
      }}>
        {/* Card */}
        <div style={{
          background: 'rgba(17, 19, 26, 0.72)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 'var(--r-2xl)',
          padding: '40px 32px',
          boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }}>
          {/* Logo + title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--accent-grad)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              boxShadow: '0 12px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
            }}>
              <LayoutDashboard size={28} color="#fff" strokeWidth={2.2} />
            </div>
            <h1 style={{
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--text)',
              marginBottom: '6px',
              letterSpacing: '-0.02em',
            }}>
              강의 통합 관리
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              관리자 로그인
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <label style={{
              display: 'block',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: '500',
              marginBottom: '6px',
              letterSpacing: '0.02em',
            }}>
              아이디
            </label>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <User size={16} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-faint)',
                pointerEvents: 'none',
              }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                style={{
                  width: '100%',
                  padding: '13px 14px 13px 40px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--border-focus)'
                  e.target.style.background = 'rgba(0, 0, 0, 0.35)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)'
                  e.target.style.background = 'rgba(0, 0, 0, 0.25)'
                }}
              />
            </div>

            {/* Password */}
            <label style={{
              display: 'block',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: '500',
              marginBottom: '6px',
              letterSpacing: '0.02em',
            }}>
              비밀번호
            </label>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Lock size={16} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-faint)',
                pointerEvents: 'none',
              }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '13px 14px 13px 40px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--border-focus)'
                  e.target.style.background = 'rgba(0, 0, 0, 0.35)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)'
                  e.target.style.background = 'rgba(0, 0, 0, 0.25)'
                }}
              />
            </div>

            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                background: 'var(--danger-soft)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--r-sm)',
                marginBottom: '16px',
              }}>
                <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{
                  color: '#fca5a5',
                  fontSize: '12.5px',
                  lineHeight: 1.5,
                }}>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                background: loading ? 'rgba(255, 255, 255, 0.06)' : 'var(--accent-grad)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                color: '#fff',
                fontSize: '14.5px',
                fontWeight: '600',
                cursor: loading ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 8px 20px rgba(99, 102, 241, 0.30)',
                transition: 'transform 0.1s ease, box-shadow 0.15s ease',
              }}
              onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'translateY(1px)')}
              onMouseUp={(e) => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                  로그인 중
                </>
              ) : (
                '로그인'
              )}
            </button>
          </form>

          <p style={{
            textAlign: 'center',
            color: 'var(--text-faint)',
            fontSize: '11.5px',
            marginTop: '20px',
          }}>
            테스트 계정 · admin / 1234
          </p>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: 'var(--text-faint)',
          fontSize: '11px',
          marginTop: '20px',
          letterSpacing: '0.02em',
        }}>
          © N잡연구소 · 강의 통합 관리 시스템
        </p>
      </div>
    </div>
  )
}
