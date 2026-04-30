import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

// 슝(Shoong) 알림톡 발송 API 프록시.
// 클라이언트가 보낸 9개 필수 파라미터를 받아 슝 API로 그대로 전달한다.
// 슝은 IP 화이트리스트로만 호출을 받기 때문에 Vercel에서 호출하면 403 가능성이 높음.
// 그 경우엔 브라우저 직접 호출 모드를 써야 함.
const SHOONG_ENDPOINT = 'https://api.shoong.kr/send'

const REQUIRED_FIELDS = [
  'sendType', 'phone',
  'channelConfig.senderkey', 'channelConfig.templatecode',
  'variables.고객명', 'variables.유튜브링크',
  'variables.강좌명', 'variables.강사님', 'variables.링크명'
]

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()

    // 9개 필수 필드 검증
    const missing = REQUIRED_FIELDS.filter(f => {
      const v = body[f]
      return v === undefined || v === null || (typeof v === 'string' && v.length === 0)
    })
    if (missing.length > 0) {
      return NextResponse.json({
        error: `필수 파라미터 누락: ${missing.join(', ')}`,
        missing
      }, { status: 400 })
    }

    const apiKey = process.env.SHOONG_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'SHOONG_API_KEY 환경변수가 설정되지 않았습니다. .env.local에 추가해주세요.'
      }, { status: 500 })
    }

    // 슝 요청: 도트 표기 키를 그대로 보내야 함 ('channelConfig.senderkey' 등)
    const payload = {}
    for (const k of REQUIRED_FIELDS) payload[k] = body[k]

    const res = await fetch(SHOONG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    const status = res.status
    const text = await res.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }

    return NextResponse.json({
      via: 'vercel-server',
      httpStatus: status,
      ok: res.ok,
      response: parsed
    }, { status: 200 })

  } catch (error) {
    console.error('Shoong send error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 30
