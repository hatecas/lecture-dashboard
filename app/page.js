'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { validateSession, deleteSession, extendSession } from '@/lib/auth'
import Login from '@/components/Login'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showExpiryModal, setShowExpiryModal] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const expiryTimerRef = useRef(null)
  const countdownRef = useRef(null)
  const sessionStartRef = useRef(null)
  const notificationRef = useRef(null)
  const titleIntervalRef = useRef(null)
  const originalTitle = useRef('강의 통합 관리')

  // 탭 제목 깜빡이기 (권한 필요 없음)
  const startTitleBlink = useCallback(() => {
    if (titleIntervalRef.current) return
    let isAlert = false
    titleIntervalRef.current = setInterval(() => {
      document.title = isAlert ? '⚠️ 세션 만료 경고!' : '🔴 1분 후 로그아웃!'
      isAlert = !isAlert
    }, 500)
  }, [])

  const stopTitleBlink = useCallback(() => {
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current)
      titleIntervalRef.current = null
    }
    document.title = originalTitle.current
  }, [])

  // 브라우저 알림 권한 요청
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }, [])

  // 브라우저 알림 보내기
  const sendBrowserNotification = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      // 기존 알림 닫기
      if (notificationRef.current) {
        notificationRef.current.close()
      }

      notificationRef.current = new Notification('세션 만료 알림', {
        body: '1분 후 자동 로그아웃됩니다. 클릭하여 연장하세요.',
        icon: '/favicon.ico',
        tag: 'session-expiry',
        requireInteraction: true
      })

      // 알림 클릭 시 페이지로 포커스 + 연장
      notificationRef.current.onclick = () => {
        window.focus()
        handleExtendSession()
        notificationRef.current.close()
      }
    }
  }, [])

  // 세션 연장 처리
  const handleExtendSession = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (token) {
      const result = await extendSession(token)
      if (result.success) {
        // 알림 닫기
        if (notificationRef.current) notificationRef.current.close()
        stopTitleBlink()
        setShowExpiryModal(false)
        setCountdown(60)
        // 새로운 29분 타이머 시작
        sessionStartRef.current = Date.now()
        startExpiryTimer()
      }
    }
  }, [stopTitleBlink])

  // 29분 후 모달 표시 타이머 시작
  const startExpiryTimer = useCallback(() => {
    // 기존 타이머 클리어
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    // 29분 후 모달 표시
    expiryTimerRef.current = setTimeout(() => {
      // 탭 제목 깜빡이기 시작 (다른 탭에서도 보임)
      startTitleBlink()
      // 브라우저 알림 전송 (다른 탭에 있어도 알림)
      sendBrowserNotification()
      setShowExpiryModal(true)
      setCountdown(60)

      // 1분 카운트다운 시작
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current)
            // 알림 닫기
            if (notificationRef.current) notificationRef.current.close()
            stopTitleBlink()
            // 자동 로그아웃
            handleLogout()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }, 29 * 60 * 1000) // 29분
  }, [sendBrowserNotification, startTitleBlink, stopTitleBlink])

  useEffect(() => {
    // 세션 토큰 검증
    const checkSession = async () => {
      const token = localStorage.getItem('authToken')
      const loggedIn = localStorage.getItem('isLoggedIn')
      const storedName = localStorage.getItem('userName')

      if (token && loggedIn === 'true') {
        // 토큰 유효성 검증
        const { valid, expired, user } = await validateSession(token)
        if (valid) {
          setIsLoggedIn(true)
          setUserName(storedName || user?.name || '')
          // 알림 권한 요청 (새로고침 시에도)
          requestNotificationPermission()
          // 세션이 유효하면 타이머 시작 (첫 로드 시에만)
          if (!sessionStartRef.current) {
            sessionStartRef.current = Date.now()
            startExpiryTimer()
          }
        } else {
          // 세션 만료 또는 무효 - 로그아웃 처리
          localStorage.removeItem('isLoggedIn')
          localStorage.removeItem('userName')
          localStorage.removeItem('authToken')
          setIsLoggedIn(false)
          setShowExpiryModal(false)
        }
      }
      setLoading(false)
    }

    checkSession()

    // 30초마다 세션 유효성 체크
    const interval = setInterval(checkSession, 30000)
    return () => {
      clearInterval(interval)
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [startExpiryTimer])

  const handleLogin = (name) => {
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('userName', name || '')
    setUserName(name || '')
    setIsLoggedIn(true)
    // 로그인 시 타이머 시작
    sessionStartRef.current = Date.now()
    startExpiryTimer()
    // 브라우저 알림 권한 요청
    requestNotificationPermission()
  }

  const handleLogout = async () => {
    // 타이머 클리어
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    stopTitleBlink()
    setShowExpiryModal(false)
    sessionStartRef.current = null

    // 세션 토큰 삭제
    const token = localStorage.getItem('authToken')
    if (token) {
      await deleteSession(token)
    }
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('userName')
    localStorage.removeItem('authToken')
    setUserName('')
    setIsLoggedIn(false)
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <>
      <Dashboard onLogout={handleLogout} userName={userName} />

      {/* 세션 만료 알림 모달 */}
      {showExpiryModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
            borderRadius: '24px',
            padding: '40px',
            width: '420px',
            border: '1px solid rgba(255,255,255,0.15)',
            textAlign: 'center',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              background: 'rgba(251, 191, 36, 0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '36px'
            }}>
              ⏰
            </div>

            <h2 style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#fff',
              marginBottom: '12px'
            }}>
              세션이 곧 만료됩니다
            </h2>

            <p style={{
              fontSize: '15px',
              color: '#94a3b8',
              marginBottom: '24px',
              lineHeight: 1.6
            }}>
              보안을 위해 로그인 세션이 만료됩니다.<br />
              계속 사용하시려면 연장 버튼을 눌러주세요.
            </p>

            {/* 카운트다운 타이머 */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '28px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <div style={{
                fontSize: '48px',
                fontWeight: '700',
                color: countdown <= 10 ? '#ef4444' : '#fbbf24',
                fontFamily: 'monospace'
              }}>
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </div>
              <div style={{
                fontSize: '13px',
                color: '#f87171',
                marginTop: '8px'
              }}>
                자동 로그아웃까지 남은 시간
              </div>
            </div>

            {/* 버튼들 */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: '#94a3b8',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                로그아웃
              </button>
              <button
                onClick={handleExtendSession}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                30분 연장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}