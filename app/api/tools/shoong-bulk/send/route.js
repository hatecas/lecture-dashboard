import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'
import { logError } from '@/lib/errorLog'
import * as XLSX from 'xlsx'

const SHOONG_ENDPOINT = 'https://api.shoong.kr/send'
const SHOONG_BULK_BASE = 'https://api.shoong.kr'

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
// 두 가지 모드:
//   A) DB 모드: { courseIds: number[], ... } — nlab ApplyCourse → User 조인
//   B) 수동 업로드 모드: { recipients: [{ name, phone }, ...], ... } — CSV 등에서 추출한 명단 직접 전달
// 공통:
//   templatecode: 'start(1)'|'start(2)'|'start(3)'
//   senderkey?: string (옵션, 비우면 env)
//   variables: { 유튜브링크, 강좌명, 강사명?|강사님?, 링크명, 시청자수? }
//   reservedTime?: ISO8601
//   dryRun?: boolean (true면 수신자 목록만 반환, 발송 안 함)
//   testPhone?, testLimit?: 테스트 모드
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      courseIds,
      recipients: manualRecipients,
      templatecode,
      senderkey,
      variables = {},
      reservedTime,
      dryRun = false,
      // 테스트 모드: 모든 발송이 testPhone으로만 감 (실제 신청자 번호 무시).
      // testLimit으로 발송 횟수도 제한 (기본 1). 수신자 이름은 원래 신청자 이름 그대로 사용.
      testPhone,
      testLimit,
      // 청크 분할 — 대용량 발송 시 Vercel 300초 timeout 회피.
      //   클라이언트가 chunkOffset/chunkSize로 일부 수신자만 처리 요청.
      //   서버는 전체 명단을 조회한 뒤 (offset, offset+size) 범위만 실제 발송.
      //   응답에 totalRecipients(전체 수)도 같이 반환 → 클라이언트가 청크 횟수 계산.
      //   미지정 시 기존 동작과 동일 (전체 한 번에).
      chunkOffset,
      chunkSize,
      // 대량 API 모드 — true면 슝의 공식 POST /send/bulk endpoint 사용 (xlsx 업로드 방식).
      //   한 번의 호출로 전체 명단을 슝에 전달 → 슝 백엔드가 자동 발송 처리.
      //   청크 분할 / 동시성 / Vercel timeout 모두 불필요.
      //   ⚠️ 슝 IP 화이트리스트 등록 필요 (안 되어 있으면 403).
      useBulkApi = false,
    } = body

    const hasCourseIds = Array.isArray(courseIds) && courseIds.length > 0
    const hasManualRecipients = Array.isArray(manualRecipients) && manualRecipients.length > 0
    if (!hasCourseIds && !hasManualRecipients) {
      return NextResponse.json({ error: 'courseIds 또는 recipients 중 하나는 필수입니다.' }, { status: 400 })
    }
    if (hasCourseIds && hasManualRecipients) {
      return NextResponse.json({ error: 'courseIds와 recipients는 동시에 사용할 수 없습니다.' }, { status: 400 })
    }

    const tplVars = TEMPLATE_VARS[templatecode]
    if (!tplVars) {
      return NextResponse.json({
        error: `지원하지 않는 templatecode: ${templatecode}`,
        supported: Object.keys(TEMPLATE_VARS)
      }, { status: 400 })
    }

    // 고객명/phone은 DB(또는 명단)에서 채우므로 그 외 변수만 검증
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

    // 수신자 명단 구성 — DB 조회 또는 명단 파싱
    const seenPhones = new Set()
    const recipients = []
    const skipped = { noUser: 0, invalidPhone: 0, duplicate: 0 }
    let totalSourceRows = 0

    if (hasCourseIds) {
      const supabase = getNlabSupabase()
      const applies = await fetchAllPaginated(() =>
        supabase
          .from('ApplyCourse')
          .select('id, freeCourseId, userId, User:userId(username, nickname, phone)')
          .in('freeCourseId', courseIds)
      )
      totalSourceRows = applies.length
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
    } else {
      // 수동 업로드 모드: { name, phone }만 받음. 이름 없으면 '고객'.
      totalSourceRows = manualRecipients.length
      for (const item of manualRecipients) {
        if (!item || typeof item !== 'object') { skipped.noUser++; continue }
        const phone = normalizePhone(item.phone)
        if (!phone) { skipped.invalidPhone++; continue }
        if (seenPhones.has(phone)) { skipped.duplicate++; continue }
        seenPhones.add(phone)
        recipients.push({
          phone,
          name: (typeof item.name === 'string' && item.name.trim()) || '고객'
        })
      }
    }

    // 전체 명단의 총 수 (청크 분할 응답에 포함 — 클라이언트가 총 청크 수 계산)
    const totalRecipients = recipients.length

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalApplies: totalSourceRows,
        recipientCount: recipients.length,
        totalRecipients,
        skipped,
        sample: recipients.slice(0, 10),
        mode: hasCourseIds ? 'db' : 'manual'
      })
    }

    if (recipients.length === 0) {
      return NextResponse.json({
        error: '발송 대상 수신자가 없습니다.',
        totalApplies: totalSourceRows,
        skipped
      }, { status: 400 })
    }

    // === 대량 API 모드 (POST /send/bulk) ===
    //   1. POST /send/template/download — 양식 xlsx 다운로드 URL
    //   2. 양식 다운 → 헤더 파싱 → 수신자 데이터 채워 새 xlsx 생성
    //   3. POST /send/bulk — groupId + uploadUrl 받음
    //   4. PUT uploadUrl — xlsx 업로드 → 슝 백엔드가 자동 발송
    //   응답: groupId, fileKey, recipientCount 등.
    //   주의: 비동기라 발송 결과(sent/failed)는 별도 polling 필요.
    if (useBulkApi) {
      // 테스트 모드: testPhone 한 명에게만 보내도록 명단을 덮어씀
      let testModeApplied = null
      if (testPhone) {
        const tp = normalizePhone(testPhone)
        if (!tp) {
          return NextResponse.json({
            error: `테스트 번호 형식이 올바르지 않습니다: ${testPhone} (010 시작 11자리)`
          }, { status: 400 })
        }
        const limit = Math.max(1, Math.min(parseInt(testLimit, 10) || 1, 5))
        const realCount = recipients.length
        recipients.length = Math.min(recipients.length, limit)
        for (const r of recipients) r.phone = tp
        testModeApplied = { testPhone: tp, limit, realRecipientCount: realCount }
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }

      // 1) 템플릿 양식 다운로드 URL 발급
      const dlReq = await fetch(`${SHOONG_BULK_BASE}/send/template/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          senderKey: finalSenderKey,
          senderKeyType: 'S',
          templateCode: templatecode,
          sendType: 'at',
        }),
      })
      const dlJson = await dlReq.json().catch(() => ({}))
      if (!dlReq.ok || !dlJson?.data?.downloadUrl) {
        return NextResponse.json({
          error: '슝 템플릿 양식 다운로드 실패',
          status: dlReq.status,
          response: dlJson,
          stage: 'template-download',
        }, { status: 502 })
      }

      // 2) 양식 xlsx 다운로드 + 파싱 → 헤더 확인
      const sampleRes = await fetch(dlJson.data.downloadUrl)
      if (!sampleRes.ok) {
        return NextResponse.json({
          error: '슝 양식 xlsx 다운로드 실패',
          status: sampleRes.status,
          stage: 'template-fetch',
        }, { status: 502 })
      }
      const sampleBuf = await sampleRes.arrayBuffer()
      const sampleWb = XLSX.read(sampleBuf, { type: 'array' })
      const sampleWs = sampleWb.Sheets[sampleWb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(sampleWs, { header: 1, defval: '', raw: false })
      if (!matrix.length) {
        return NextResponse.json({ error: '슝 양식 xlsx가 비어있음', stage: 'template-parse' }, { status: 502 })
      }
      const sheetHeaders = matrix[0].map(h => String(h || '').trim())

      // 3) 헤더 → 우리 데이터 매핑
      //   - "연락처" / "전화번호" → recipient.phone
      //   - "#{고객명}" → recipient.name
      //   - "#{변수명}" (그 외) → trimmedVars[변수명]
      //   - "대체발송1:#{변수명}" 같은 fallback 컬럼은 빈값 그대로
      const dataRows = recipients.map(r => {
        const row = []
        for (const h of sheetHeaders) {
          if (h === '연락처' || h === '전화번호' || h === 'phone' || h === '수신번호') {
            row.push(r.phone)
          } else if (h.startsWith('#{') && h.endsWith('}')) {
            const varName = h.slice(2, -1)
            if (varName === '고객명') row.push(r.name)
            else row.push(trimmedVars[varName] ?? '')
          } else if (h.startsWith('대체발송')) {
            row.push('') // 대체발송 변수는 빈값 (alimtalk 단독)
          } else {
            row.push('')
          }
        }
        return row
      })

      // 4) 새 xlsx 생성 (헤더 + 데이터)
      const outWb = XLSX.utils.book_new()
      const outWs = XLSX.utils.aoa_to_sheet([sheetHeaders, ...dataRows])
      XLSX.utils.book_append_sheet(outWb, outWs, sampleWb.SheetNames[0] || '발송')
      const xlsxBuf = XLSX.write(outWb, { type: 'array', bookType: 'xlsx' })

      // 5) POST /send/bulk — 발송 + uploadUrl 발급
      const bulkBody = {
        sendType: 'at',
        channelConfig: { senderkey: finalSenderKey, templatecode },
        excelRowCount: recipients.length,
      }
      if (reservedTime) bulkBody.scheduledAt = reservedTime

      const bulkReq = await fetch(`${SHOONG_BULK_BASE}/send/bulk`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bulkBody),
      })
      const bulkJson = await bulkReq.json().catch(() => ({}))
      if (!bulkReq.ok || !bulkJson?.data?.uploadUrl) {
        return NextResponse.json({
          error: '슝 대량 발송 요청 실패',
          status: bulkReq.status,
          response: bulkJson,
          stage: 'bulk-create',
        }, { status: 502 })
      }

      // 6) PUT uploadUrl — xlsx 업로드
      const putRes = await fetch(bulkJson.data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: xlsxBuf,
      })
      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => '')
        return NextResponse.json({
          error: '슝 S3 엑셀 업로드 실패',
          status: putRes.status,
          response: txt.slice(0, 500),
          groupId: bulkJson.data.groupId,
          stage: 's3-upload',
        }, { status: 502 })
      }

      // 7) 성공 — 발송은 슝 백엔드에서 비동기로 처리됨
      return NextResponse.json({
        via: 'shoong-bulk-api',
        mode: hasCourseIds ? 'db' : 'manual',
        totalApplies: totalSourceRows,
        recipientCount: recipients.length,
        totalRecipients: recipients.length,
        groupId: bulkJson.data.groupId,
        fileKey: bulkJson.data.fileKey,
        skipped,
        reservedTime: reservedTime || null,
        testMode: testModeApplied,
        pending: recipients.length, // 비동기 발송 — 실제 sent/failed는 슝 어드민에서 조회
        message: '슝 대량 발송 요청 완료. 발송 진행은 슝 어드민의 발송이력 → 대량 탭에서 확인하세요.',
      })
    }

    // 청크 분할 적용 — chunkOffset/chunkSize 지정되면 그 범위만 처리
    let chunkInfo = null
    if (typeof chunkOffset === 'number' && typeof chunkSize === 'number' && chunkSize > 0) {
      const start = Math.max(0, chunkOffset)
      const end = Math.min(recipients.length, start + chunkSize)
      const chunked = recipients.slice(start, end)
      chunkInfo = {
        offset: start,
        size: chunkSize,
        actual: chunked.length,
        total: recipients.length,
        chunkIndex: Math.floor(start / chunkSize),
        totalChunks: Math.ceil(recipients.length / chunkSize),
      }
      recipients.length = 0
      recipients.push(...chunked)
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

    // 동시 호출 수 — 슝 단건 API의 대량 발송 보완책.
    //   슝은 외부 REST 대량 API를 제공하지 않음(어드민 UI Next.js Server Action만 존재).
    //   단건 호출의 처리량을 늘리려면 동시성 증가가 가장 단순한 방법.
    //   5 → 20: 슝 API rate limit 한도 내에서 약 4배 빠른 처리.
    //   2만 건 발송 기준 약 30분 → 8~10분 단축 기대.
    const results = await runWithConcurrency(recipients, 20, sendOne)

    return NextResponse.json({
      via: 'vercel-server-bulk',
      mode: hasCourseIds ? 'db' : 'manual',
      totalApplies: totalSourceRows,
      recipientCount: recipients.length,
      totalRecipients,                // 전체 명단 수 (청크 합)
      chunk: chunkInfo,               // 청크 정보 (null이면 전체 한번에)
      sent,
      failed,
      skipped,
      errors,
      reservedTime: reservedTime || null,
      testMode: testModeApplied
    })
  } catch (error) {
    // 에러 로그 DB에 기록 + 사용자 친화 메시지로 응답.
    // 2만명 같은 큰 발송이 timeout으로 끊기면 여기 catch에 안 들어오고 Vercel이
    // HTML 에러 페이지 반환 → 클라이언트 JSON 파싱 실패. 그건 별도 처리 필요.
    const logged = await logError({
      request: req,
      error,
      route: '/api/tools/shoong-bulk/send',
      method: 'POST',
      errorCode: 'EXTERNAL_API',
      context: {
        // 가능하면 발송 컨텍스트 일부 기록 (대용량은 자르기)
        // request body는 이미 소진됐을 수 있어서 별도 정보만
      },
      userMessage: '슝 발송 중 오류가 발생했습니다. 큰 명단(수천명 이상)은 한 번에 못 보낼 수 있어요 — 검색 결과를 더 좁혀서 다시 시도하거나, 명단을 나눠서 보내주세요.',
    })
    return NextResponse.json({ error: logged.userMessage, errorId: logged.id }, { status: 500 })
  }
}

export const runtime = 'nodejs'
// 대용량 발송 시 더 길게 필요. Hobby plan 한도 300초.
export const maxDuration = 300
