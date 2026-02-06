import { supabase } from './supabase'

// API 요청 인증 검증
export async function verifyApiAuth(request) {
  // Authorization 헤더에서 토큰 추출
  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: '인증 토큰이 필요합니다' }
  }

  const token = authHeader.slice(7) // 'Bearer ' 제거

  // 세션 검증
  const { data, error } = await supabase
    .from('auth_sessions')
    .select('*, admins(*)')
    .eq('token', token)
    .single()

  if (error || !data) {
    return { authenticated: false, error: '유효하지 않은 토큰입니다' }
  }

  // 만료 확인
  if (new Date(data.expires_at) < new Date()) {
    // 만료된 세션 삭제
    await supabase.from('auth_sessions').delete().eq('token', token)
    return { authenticated: false, error: '세션이 만료되었습니다. 다시 로그인해주세요' }
  }

  return { authenticated: true, user: data.admins }
}
