import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

// 슝(Shoong) 알림톡 발송 API 프록시.
// 템플릿별 변수가 다르므로 templatecode에 따라 검증/필터링.
// reservedTime이 오면 예약발송으로 그대로 forward.
const SHOONG_ENDPOINT = 'https://api.shoong.kr/send'

// 모든 템플릿이 버튼 라벨로 #{링크명} 사용 — 누락 시 슝이 "미치환 변수" 에러
const TEMPLATE_VARS = {
  'start(1)': ['고객명', '유튜브링크', '강좌명', '강사명', '링크명'],
  'start(2)': ['고객명', '유튜브링크', '강좌명', '강사님', '링크명'],
  'start(3)': ['고객명', '시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
}

const COMMON_REQUIRED = ['sendType', 'phone', 'channelConfig.senderkey', 'channelConfig.templatecode']

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()

    // 모든 문자열 값 trim — 끝에 개행/공백 섞이면 슝이 senderkey 불일치로 거절
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }

    // 발신프로필키는 비어있으면 서버 env 값으로 fallback (env 값도 trim)
    if (!body['channelConfig.senderkey']) {
      const envSenderKey = (process.env.SHOONG_SENDER_KEY || '').trim()
      if (envSenderKey) body['channelConfig.senderkey'] = envSenderKey
    }

    const tplCode = body['channelConfig.templatecode']
    const tplVars = TEMPLATE_VARS[tplCode]
    if (!tplVars) {
      return NextResponse.json({
        error: `지원하지 않는 templatecode: ${tplCode}. (지원: ${Object.keys(TEMPLATE_VARS).join(', ')})`
      }, { status: 400 })
    }

    // 공통 필드 + 템플릿별 변수 모두 채워졌는지 검증
    const requiredVarKeys = tplVars.map(v => `variables.${v}`)
    const requiredAll = [...COMMON_REQUIRED, ...requiredVarKeys]
    const missing = requiredAll.filter(f => {
      const v = body[f]
      return v === undefined || v === null || (typeof v === 'string' && v.length === 0)
    })
    if (missing.length > 0) {
      return NextResponse.json({
        error: `필수 파라미터 누락: ${missing.join(', ')}`,
        missing
      }, { status: 400 })
    }

    const apiKey = (process.env.SHOONG_API_KEY || '').trim()
    if (!apiKey) {
      return NextResponse.json({
        error: 'SHOONG_API_KEY 환경변수가 설정되지 않았습니다. .env.local에 추가해주세요.'
      }, { status: 500 })
    }

    // 슝으로 보낼 페이로드 구성: 공통 필드 + 템플릿 변수 + (옵션) reservedTime
    const payload = {}
    for (const k of requiredAll) payload[k] = body[k]
    if (body.reservedTime) {
      // 슝 sendType enum에 'as' 없음 → 'at' 유지하고 예약 시점만 ISO로 전달.
      // (이전 추측 실패 기록: 'as'로 보내면 BAD_REQUEST enum 에러)
      payload.reservedTime = body.reservedTime
    }

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
      response: parsed,
      sentPayload: payload
    }, { status: 200 })

  } catch (error) {
    console.error('Shoong send error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 30
