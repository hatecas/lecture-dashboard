'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Login from '@/components/Login'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 로컬스토리지에서 로그인 상태 확인
    const loggedIn = localStorage.getItem('isLoggedIn')
    const storedName = localStorage.getItem('userName')
    if (loggedIn === 'true') {
      setIsLoggedIn(true)
      setUserName(storedName || '')
    }
    setLoading(false)
  }, [])

  const handleLogin = (name) => {
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('userName', name || '')
    setUserName(name || '')
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('userName')
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