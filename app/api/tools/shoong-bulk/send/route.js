import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'

const SHOONG_ENDPOINT = 'https://api.shoong.kr/send'

const TEMPLATE_VARS = {
  'start(1)': ['고객명', '유튜브링크', '강좌명', '강사명', '링크명'],
  'start(2)': ['고객명', '유튜브링크', '강좌명', '강사님', '링크명'],
  'start(3)': ['고객명', '시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
}

// 전화번호 정규화 (숫자만, 010 시작 11자리만 인정)
function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('010')) return digits
  if (digits.length === 10 && digits.startsWith('10')) return '0' + digits
  return null
}

// PostgREST 1000행 한계 회피
async function fetchAllPaginated(queryFactory, pageSize = 1000, hardLimit = 100000) {
  const all = []
  let offset = 0
  while (offset < hardLimit) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

// 동시 실행 제한 (rate limit 방어)
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return results
}

// POST /api/tools/shoong-bulk/send
// body: {
//   courseIds: number[],
//   templatecode: 'start(1)'|'start(2)'|'start(3)',
//   senderkey?: string (옵션, 비우면 env),
//   variables: { 유튜브링크, 강좌명, 강사명?|강사님?, 링크명, 시청자수? },
//   reservedTime?: ISO8601,
//   dryRun?: boolean (true면 수신자 목록만 반환, 발송 안 함)
// }
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      courseIds = [],
      templatecode,
      senderkey,
      variables = {},
      reservedTime,
      dryRun = false,
      // 테스트 모드: 모든 발송이 testPhone으로만 감 (실제 신청자 번호 무시).
      // testLimit으로 발송 횟수도 제한 (기본 1). 수신자 이름은 원래 신청자 이름 그대로 사용.
      testPhone,
      testLimit
    } = body

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds 배열이 비어있습니다.' }, { status: 400 })
    }

    const tplVars = TEMPLATE_VARS[templatecode]
    if (!tplVars) {
      return NextResponse.json({
        error: `지원하지 않는 templatecode: ${templatecode}`,
        supported: Object.keys(TEMPLATE_VARS)
      }, { status: 400 })
    }

    // 고객명/phone은 DB에서 채우므로 그 외 변수만 검증
    const requiredManualVars = tplVars.filter(v => v !== '고객명')
    const trimmedVars = {}
    for (const v of tplVars) {
      const val = variables[v]
      trimmedVars[v] = typeof val === 'string' ? val.trim() : ''
    }
    const missingVars = requiredManualVars.filter(v => !trimmedVars[v])
    if (missingVars.length > 0) {
      return NextResponse.json({
        error: `필수 변수 누락: ${missingVars.join(', ')}`,
        missingVars
      }, { status: 400 })
    }

    const apiKey = (process.env.SHOONG_API_KEY || '').trim()
    if (!apiKey && !dryRun) {
      return NextResponse.json({
        error: 'SHOONG_API_KEY 환경변수가 설정되지 않았습니다.'
      }, { status: 500 })
    }

    const finalSenderKey = (senderkey || process.env.SHOONG_SENDER_KEY || '').trim()
    if (!finalSenderKey && !dryRun) {
      return NextResponse.json({
        error: '발신프로필 키가 없습니다. (senderkey 또는 SHOONG_SENDER_KEY env)'
      }, { status: 400 })
    }

    const supabase = getNlabSupabase()

    // ApplyCourse → User 조인으로 신청자 가져오기 (페이지네이션)
    const applies = await fetchAllPaginated(() =>
      supabase
        .from('ApplyCourse')
        .select('id, freeCourseId, userId, User:userId(username, nickname, phone)')
        .in('freeCourseId', courseIds)
    )

    // 전화번호 정규화 + 유효성 + 중복 제거 (같은 번호면 한 번만)
    const seenPhones = new Set()
    const recipients = []
    const skipped = { noUser: 0, invalidPhone: 0, duplicate: 0 }

    for (const a of applies) {
      const u = a.User
      if (!u) { skipped.noUser++; continue }
      const phone = normalizePhone(u.phone)
      if (!phone) { skipped.invalidPhone++; continue }
      if (seenPhones.has(phone)) { skipped.duplicate++; continue }
      seenPhones.add(phone)
      recipients.push({
        phone,
        name: u.username || u.nickname || '고객',
        applyId: a.id
      })
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalApplies: applies.length,
        recipientCount: recipients.length,
        skipped,
        sample: recipients.slice(0, 10)
      })
    }

    if (recipients.length === 0) {
      return NextResponse.json({
        error: '발송 대상 수신자가 없습니다.',
        totalApplies: applies.length,
        skipped
      }, { status: 400 })
    }

    // 테스트 모드 적용: 명단의 phone을 모두 testPhone으로 덮어쓰고 첫 N명만 남김
    let testModeApplied = null
    if (testPhone) {
      const tp = normalizePhone(testPhone)
      if (!tp) {
        return NextResponse.json({
          error: `테스트 번호 형식이 올바르지 않습니다: ${testPhone} (010 시작 11자리)`
        }, { status: 400 })
      }
      const limit = Math.max(1, Math.min(parseInt(testLimit, 10) || 1, 5)) // 1~5회만
      const realCount = recipients.length
      recipients.length = Math.min(recipients.length, limit)
      for (const r of recipients) r.phone = tp
      testModeApplied = { testPhone: tp, limit, realRecipientCount: realCount }
    }

    // 발송 (동시 5개 제한)
    let sent = 0, failed = 0
    const errors = []

    // 슝 sendType enum에 'as' 없음 → 'at' 유지 + reservedTime ISO만 전달
    const sendOne = async (r) => {
      const payload = {
        sendType: 'at',
        phone: r.phone,
        'channelConfig.senderkey': finalSenderKey,
        'channelConfig.templatecode': templatecode
      }
      // 고객명은 DB에서 + 나머지는 입력값
      for (const v of tplVars) {
        payload[`variables.${v}`] = v === '고객명' ? r.name : trimmedVars[v]
      }
      if (reservedTime) {
        // 'reservedTime'은 슝이 무시했으므로 후보 키 4개 동시 전송. Zod가 모르는 키는 스트립.
        payload.reservedTime = reservedTime
        payload.reservedAt = reservedTime
        payload.reserveTime = reservedTime
        payload.scheduledAt = reservedTime
      }

      try {
        const res = await fetch(SHOONG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        })
        const text = await res.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }

        if (res.ok) {
          sent++
          return { ok: true, phone: r.phone, name: r.name, response: parsed }
        } else {
          failed++
          if (errors.length < 20) {
            errors.push({ phone: r.phone, name: r.name, status: res.status, response: parsed })
          }
          return { ok: false, phone: r.phone, name: r.name, status: res.status, response: parsed }
        }
      } catch (err) {
        failed++
        if (errors.length < 20) {
          errors.push({ phone: r.phone, name: r.name, error: err.message })
        }
        return { ok: false, phone: r.phone, name: r.name, error: err.message }
      }
    }

    const results = await runWithConcurrency(recipients, 5, sendOne)

    return NextResponse.json({
      via: 'vercel-server-bulk',
      totalApplies: applies.length,
      recipientCount: recipients.length,
      sent,
      failed,
      skipped,
      errors,
      reservedTime: reservedTime || null,
      testMode: testModeApplied
    })
  } catch (error) {
    console.error('shoong-bulk/send error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 60
