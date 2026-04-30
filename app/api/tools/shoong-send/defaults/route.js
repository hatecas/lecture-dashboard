import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

// 슝 알림톡 테스트 도구 기본값 조회 (서버 .env에서)
// 인증된 어드민이 폼/curl 자동 채움용으로 호출함
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  // env 값은 끝 공백/개행 제거 (Vercel 콘솔에서 우연히 줄바꿈 입력되거나 .env 파일이 \n으로 끝나는 경우 방어)
  return NextResponse.json({
    apiKey: (process.env.SHOONG_API_KEY || '').trim(),
    senderKey: (process.env.SHOONG_SENDER_KEY || '').trim()
  })
}

export const runtime = 'nodejs'
