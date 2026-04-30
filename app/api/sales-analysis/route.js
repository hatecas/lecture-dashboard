import { verifyApiAuth } from '@/lib/apiAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'

// 무료특강 후 시간별 구매 추이 분석
//
// 과거: 매출표 Google Sheet 강사 탭(CSV) → 파싱 → purchase_timeline 자체 DB 저장 → 대시보드 읽기
// 현재: nlab Supabase의 TossCustomer를 직접 조회. Sheet/캐시 테이블 모두 우회.
//
// 입력 (JSON):
//   instructor    : (필수) 강사명. 예: "김탄생"
//   freeClassDate : (필수) 무료강의 날짜. "YYYY-MM-DD"
//   tabName       : (선택) 레거시 호환. instructor 없으면 첫 공백 앞 토큰을 사용
// 출력:
//   { success, intervals: [{ hour, purchases, label, percentage }], firstPurchase, totalInRange, totalAll }

// productTitle 첫 [...] 안에서 강사명 추출 (order-sync route와 동일 로직)
function extractInstructorName(title) {
  if (!title) return null
  const m = String(title).match(/^\s*\[([^\]]+)\]/)
  if (!m) return null
  let name = m[1]
  // 1) N잡연구소 + 연결자(x/X/×) 제거 (앞/뒤 양쪽)
  name = name.replace(/N\s*잡\s*연구소\s*[xX×]?/gi, '')
  name = name.replace(/[xX×]\s*N\s*잡\s*연구소/gi, '')
  // 2) 첫 x(대소문자/×) 이후 전부 제거 (콜라보 마커)
  name = name.replace(/\s*[xX×].*$/, '')
  // 3) 끝의 "N기" 제거
  name = name.replace(/\s*\d+\s*기\s*$/, '')
  // 4) 양옆 공백/특수문자 정리
  name = name.replace(/^[\s\-:·,]+|[\s\-:·,]+$/g, '').trim()
  return name || null
}

function isRefunded(row) {
  if (row.cancelAmount && row.cancelAmount > 0) return true
  if (row.canceledAt) return true
  const status = row.paymentStatus || ''
  if (/CANCEL|REFUND|FAIL|ABORT/i.test(status)) return true
  return false
}

// PostgREST 1000행 한계 우회: 페이지네이션
async function fetchAllInRange(nlab, instructor, startISO, endISO) {
  const all = []
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await nlab
      .from('TossCustomer')
      .select('createdAt, finalPrice, productTitle, orderName, paymentStatus, cancelAmount, canceledAt')
      .eq('productType', 'COURSE')
      .gte('createdAt', startISO)
      .lte('createdAt', endISO)
      .ilike('productTitle', `%${instructor}%`)
      .order('createdAt', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`nlab DB 조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const instructor = (body.instructor || (body.tabName ? String(body.tabName).split(/\s+/)[0] : '')).trim()
    const freeClassDate = body.freeClassDate

    if (!instructor || !freeClassDate) {
      return Response.json({ error: 'instructor, freeClassDate 필수' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(freeClassDate)) {
      return Response.json({ error: 'freeClassDate 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 })
    }

    // KST 19:30 ~ 다음날 00:30 (5시간) — 명시적으로 KST 오프셋 사용
    const cutoffStart = new Date(`${freeClassDate}T19:30:00+09:00`)
    const cutoffEnd = new Date(cutoffStart.getTime() + 5 * 60 * 60 * 1000)

    const nlab = getNlabSupabase()
    const rawRows = await fetchAllInRange(nlab, instructor, cutoffStart.toISOString(), cutoffEnd.toISOString())

    // 정확 매칭 + 환불/취소 제외
    const valid = rawRows.filter(row => {
      const fromTitle = extractInstructorName(row.productTitle)
      const fromOrder = extractInstructorName(row.orderName)
      if (fromTitle !== instructor && fromOrder !== instructor) return false
      if (isRefunded(row)) return false
      return true
    })

    if (valid.length === 0) {
      return Response.json({
        success: true,
        intervals: [],
        firstPurchase: null,
        cutoffStart: cutoffStart.toISOString(),
        cutoffEnd: cutoffEnd.toISOString(),
        totalInRange: 0,
        totalAll: rawRows.length,
        message: '해당 기간에 결제 데이터가 없습니다.'
      })
    }

    valid.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const firstPurchase = new Date(valid[0].createdAt)

    // 5분 × 36구간 (0~180분)
    const intervals = []
    for (let i = 0; i < 36; i++) {
      const startMin = i * 5
      const endMin = startMin + 5
      const count = valid.filter(p => {
        const diffMin = (new Date(p.createdAt) - firstPurchase) / 60000
        return diffMin >= startMin && diffMin < endMin
      }).length
      intervals.push({
        hour: startMin,
        purchases: count,
        label: `${startMin}~${endMin}분`,
        percentage: ((count / valid.length) * 100).toFixed(1)
      })
    }

    return Response.json({
      success: true,
      intervals,
      firstPurchase: firstPurchase.toISOString(),
      cutoffStart: cutoffStart.toISOString(),
      cutoffEnd: cutoffEnd.toISOString(),
      totalInRange: valid.length,
      totalAll: rawRows.length
    })
  } catch (error) {
    console.error('매출 분석 오류:', error)
    return Response.json({ error: '매출 분석 중 오류 발생: ' + error.message }, { status: 500 })
  }
}
