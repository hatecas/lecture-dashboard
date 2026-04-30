import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

export async function POST(request) {
  try {
    // 인증 — 로그인 직후 토큰 발급된 직후에만 호출되도록 강제.
    // 클라이언트가 보내는 name 필드는 신뢰하지 않고, 토큰의 user 정보를 사용.
    const auth = await verifyApiAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
    }
    const name = auth.user?.name || auth.user?.username || 'unknown'

    // IP 주소 (서버에서만 추출 — 클라이언트 입력 무시)
    const getHeader = (name) => {
      const val = request.headers.get(name)
      return val && val.trim() ? val.trim() : null
    }
    const forwarded = getHeader('x-forwarded-for')
    const realIp = getHeader('x-real-ip')
    const cfIp = getHeader('cf-connecting-ip')
    const ip = (forwarded?.split(',')[0]?.trim()) || realIp || cfIp || '127.0.0.1'

    const userAgent = (getHeader('user-agent') || 'unknown').substring(0, 500)

    const { error } = await supabase.from('login_logs').insert({
      name,
      ip_address: ip,
      user_agent: userAgent
    })

    if (error) {
      console.error('Login log insert error:', error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Login log error:', error)
    return NextResponse.json({ error: 'Log failed' }, { status: 500 })
  }
}
