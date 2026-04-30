import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

// 슝 알림톡 테스트 도구 기본값 조회 (서버 .env에서)
// 인증된 어드민이 폼/curl 자동 채움용으로 호출함
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  return NextResponse.json({
    apiKey: process.env.SHOONG_API_KEY || '',
    senderKey: process.env.SHOONG_SENDER_KEY || ''
  })
}

export const runtime = 'nodejs'
