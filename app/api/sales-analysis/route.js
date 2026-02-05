import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// 매출표 시트 ID (강사별 탭이 있는 시트)
const SALES_SHEET_ID = '1NciqOt6PaUggmroaov60UycBbkdIY6eVXSXfwLyvCRo'

function parseKoreanDate(dateStr) {
  // "2025. 11. 30. 오후 9:10:50" 형식 파싱
  const cleaned = dateStr.replace(/\./g, '').trim()
  const parts = cleaned.split(/\s+/)
  const year = parseInt(parts[0])
  const month = parseInt(parts[1])
  const day = parseInt(parts[2])
  const ampm = parts[3] // 오전/오후
  const timeParts = parts[4].split(':')
  let hour = parseInt(timeParts[0])
  const minute = parseInt(timeParts[1])
  const second = parseInt(timeParts[2])

  if (ampm === '오후' && hour !== 12) hour += 12
  if (ampm === '오전' && hour === 12) hour = 0

  return new Date(year, month - 1, day, hour, minute, second)
}

export async function POST(request) {
  try {
    const { tabName, freeClassDate, sessionId } = await request.json()

    if (!tabName || !freeClassDate || !sessionId) {
      return Response.json({ error: 'tabName, freeClassDate, sessionId 필수' }, { status: 400 })
    }

    // Google Sheets에서 CSV 가져오기
    const encodedTab = encodeURIComponent(tabName)
    const url = `https://docs.google.com/spreadsheets/d/${SALES_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedTab}`
    const response = await fetch(url)

    if (!response.ok) {
      return Response.json({ error: '시트 데이터를 가져올 수 없습니다. 탭 이름을 확인해주세요.' }, { status: 400 })
    }

    const csvText = await response.text()
    const rows = csvText.split('\n').slice(1) // 헤더 제외

    // CSV 파싱 및 결제완료 건만 필터
    const purchases = []
    for (const row of rows) {
      // CSV 파싱 (따옴표 처리)
      const cols = []
      let current = ''
      let inQuote = false
      for (let i = 0; i < row.length; i++) {
        const char = row[i]
        if (char === '"') {
          inQuote = !inQuote
        } else if (char === ',' && !inQuote) {
          cols.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      cols.push(current.trim())

      if (cols.length < 10) continue
      const status = cols[7]
      const dateStr = cols[9]
      const amount = parseInt(cols[6]) || 0

      if (status === '결제완료' && dateStr) {
        try {
          const dt = parseKoreanDate(dateStr)
          purchases.push({ datetime: dt, amount })
        } catch (e) {
          // 파싱 실패 무시
        }
      }
    }

    // 시간순 정렬
    purchases.sort((a, b) => a.datetime - b.datetime)

    // 무료강의 날짜 기준 설정
    const freeDate = new Date(freeClassDate)
    const cutoffStart = new Date(freeDate.getFullYear(), freeDate.getMonth(), freeDate.getDate(), 19, 30, 0)
    const nextDay = new Date(freeDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const cutoffEnd = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 12, 30, 0)

    // 범위 내 결제 필터
    const valid = purchases.filter(p => p.datetime >= cutoffStart && p.datetime <= cutoffEnd)

    if (valid.length === 0) {
      return Response.json({ error: '해당 기간에 결제 데이터가 없습니다.', totalPurchases: purchases.length })
    }

    const firstPurchase = valid[0].datetime

    // 30분 단위 구간 분석
    const intervals = [
      { label: '0~30분', startMin: 0, endMin: 30 },
      { label: '30~60분', startMin: 30, endMin: 60 },
      { label: '60~90분', startMin: 60, endMin: 90 },
      { label: '90~120분', startMin: 90, endMin: 120 },
      { label: '120~180분', startMin: 120, endMin: 180 },
      { label: '180분~', startMin: 180, endMin: 999999 },
    ]

    const results = intervals.map(interval => {
      const count = valid.filter(p => {
        const diffMin = (p.datetime - firstPurchase) / (1000 * 60)
        return diffMin >= interval.startMin && diffMin < interval.endMin
      }).length
      return {
        hour: interval.startMin, // minute 값 저장
        purchases: count,
        label: interval.label,
        percentage: ((count / valid.length) * 100).toFixed(1)
      }
    })

    // Supabase purchase_timeline 테이블에 저장
    // 기존 데이터 삭제 후 새로 삽입
    await supabase.from('purchase_timeline').delete().eq('session_id', sessionId)

    const insertData = results.map(r => ({
      session_id: sessionId,
      hour: r.hour,
      purchases: r.purchases
    }))
    await supabase.from('purchase_timeline').insert(insertData)

    return Response.json({
      success: true,
      firstPurchase: firstPurchase.toISOString(),
      cutoffEnd: cutoffEnd.toISOString(),
      totalInRange: valid.length,
      totalAll: purchases.length,
      afterRange: purchases.filter(p => p.datetime > cutoffEnd).length,
      intervals: results
    })
  } catch (error) {
    console.error('매출 분석 오류:', error)
    return Response.json({ error: '매출 분석 중 오류 발생: ' + error.message }, { status: 500 })
  }
}
