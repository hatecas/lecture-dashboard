import { supabase } from './supabase'

// 세션 토큰 생성
export function generateToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 로그인 시도 확인 (5회 제한)
export async function checkLoginAttempts(username) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('login_attempts')
    .select('*')
    .eq('username', username)
    .eq('success', false)
    .gte('attempted_at', fiveMinutesAgo)

  if (error) return { allowed: true }

  const failedAttempts = data?.length || 0
  return {
    allowed: failedAttempts < 5,
    remainingAttempts: Math.max(0, 5 - failedAttempts),
    failedAttempts
  }
}

// 로그인 시도 기록
export async function recordLoginAttempt(username, success) {
  if (success) {
    // 성공 시 해당 사용자의 실패 기록 모두 삭제 (초기화)
    const { error: deleteError } = await supabase
      .from('login_attempts')
      .delete()
      .eq('username', username)
      .eq('success', false)

    if (deleteError) {
      console.error('실패 기록 삭제 오류:', deleteError)
    }
  }

  const { error: insertError } = await supabase.from('login_attempts').insert({
    username,
    success
  })

  if (insertError) {
    console.error('로그인 시도 기록 오류:', insertError)
  }
}

// 세션 생성 (30분 만료)
export async function createSession(userId) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30분 후

  const { error } = await supabase.from('auth_sessions').insert({
    user_id: userId,
    token,
    expires_at: expiresAt
  })

  if (error) {
    console.error('세션 생성 오류:', error)
    return null
  }

  return token
}

// 세션 검증
export async function validateSession(token) {
  if (!token) return { valid: false }

  const { data, error } = await supabase
    .from('auth_sessions')
    .select('*, admins(*)')
    .eq('token', token)
    .single()

  if (error || !data) return { valid: false }

  // 만료 확인
  if (new Date(data.expires_at) < new Date()) {
    // 만료된 세션 삭제
    await supabase.from('auth_sessions').delete().eq('token', token)
    return { valid: false, expired: true }
  }

  return { valid: true, user: data.admins }
}

// 세션 삭제 (로그아웃)
export async function deleteSession(token) {
  if (!token) return
  await supabase.from('auth_sessions').delete().eq('token', token)
}

// 만료된 세션 정리
export async function cleanupExpiredSessions() {
  const now = new Date().toISOString()
  await supabase.from('auth_sessions').delete().lt('expires_at', now)
}
