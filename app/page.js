'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { validateSession, deleteSession } from '@/lib/auth'
import Login from '@/components/Login'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

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
        } else {
          // 세션 만료 또는 무효 - 로그아웃 처리
          localStorage.removeItem('isLoggedIn')
          localStorage.removeItem('userName')
          localStorage.removeItem('authToken')
          setIsLoggedIn(false)
        }
      }
      setLoading(false)
    }

    checkSession()

    // 30초마다 세션 유효성 체크
    const interval = setInterval(checkSession, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = (name) => {
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('userName', name || '')
    setUserName(name || '')
    setIsLoggedIn(true)
  }

  const handleLogout = async () => {
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

  return <Dashboard onLogout={handleLogout} userName={userName} />
}