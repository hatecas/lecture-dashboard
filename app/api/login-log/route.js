import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

// service_role 키로 RLS 우회 — login_logs INSERT가 anon 키 RLS 정책에
// silently 막히던 이슈 영구 해결.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const isUsingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY

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
      user_agent: userAgent,
    })

    if (error) {
      // 실패 시 클라이언트엔 success 안 돌려주고 에러 노출 (이전엔 success로 가렸음)
      console.error('[login-log] insert error:', error, `usingServiceRole=${isUsingServiceRole}`)
      return NextResponse.json({
        error: 'login log insert failed: ' + error.message,
        code: error.code,
        usingServiceRole: isUsingServiceRole,
      }, { status: 500 })
    }

    console.log(`[login-log] recorded name="${name}" ip=${ip} usingServiceRole=${isUsingServiceRole}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[login-log] unexpected error:', error)
    return NextResponse.json({ error: 'Log failed: ' + (error?.message || error) }, { status: 500 })
  }
}
