import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { name } = await request.json()

    // IP 주소 가져오기
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'

    // User-Agent
    const userAgent = request.headers.get('user-agent') || 'unknown'

    await supabase.from('login_logs').insert({
      name,
      ip_address: ip,
      user_agent: userAgent
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Login log error:', error)
    return NextResponse.json({ error: 'Log failed' }, { status: 500 })
  }
}
