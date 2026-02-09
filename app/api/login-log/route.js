import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { name } = await request.json()

    // IP 주소 가져오기 (여러 헤더 확인)
    const getHeader = (name) => {
      const val = request.headers.get(name)
      return val && val.trim() ? val.trim() : null
    }

    const forwarded = getHeader('x-forwarded-for')
    const realIp = getHeader('x-real-ip')
    const cfIp = getHeader('cf-connecting-ip') // Cloudflare
    const ip = (forwarded?.split(',')[0]?.trim()) || realIp || cfIp || '127.0.0.1'

    // User-Agent
    const userAgent = getHeader('user-agent') || 'unknown'

    const { error } = await supabase.from('login_logs').insert({
      name,
      ip_address: ip,
      user_agent: userAgent.substring(0, 500) // 너무 길면 자르기
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
