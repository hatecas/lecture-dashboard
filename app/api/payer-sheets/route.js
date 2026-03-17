import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// PM 결제자 관리 시트 ID
const PAYER_SHEETS = {
  '25': '1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg',
  '26': '1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA'
}

// 파생 시트 제외 키워드
const EXCLUDE_KEYWORDS = ['사본', '정산', '복사', '백업', '임시', 'copy', 'backup', '테스트', 'test']

// 시트 탭 이름 파싱: "260106_에어5기" → { date: '260106', instructor: '에어', cohort: '5기', raw: '260106_에어5기' }
function parseTabName(name) {
  const trimmed = name.trim()

  // 파생 시트 체크
  const lowerName = trimmed.toLowerCase()
  const isDerivative = EXCLUDE_KEYWORDS.some(kw => lowerName.includes(kw.toLowerCase()))
  if (isDerivative) return null

  // 패턴: 날짜코드(6자리) + 구분자 + 강사명 + 기수
  // "260106_에어5기", "260106 에어 5기", "260106_에어 5기", "250930_크루3기" 등
  const match = trimmed.match(/^(\d{6})[_\s]*(.+?)[\s]*(\d+기)$/u)
  if (match) {
    return {
      date: match[1],
      instructor: match[2].replace(/[_\s]+$/, '').trim(),
      cohort: match[3],
      raw: trimmed,
      displayDate: formatDateCode(match[1])
    }
  }

  // 날짜코드 + 강사명기수 붙어있는 경우: "260106_에어5기"
  const match2 = trimmed.match(/^(\d{6})[_\s]*([가-힣a-zA-Z]+?)(\d+기)$/u)
  if (match2) {
    return {
      date: match2[1],
      instructor: match2[2].trim(),
      cohort: match2[3],
      raw: trimmed,
      displayDate: formatDateCode(match2[1])
    }
  }

  // 날짜코드만 있고 나머지가 자유 형식인 경우
  const match3 = trimmed.match(/^(\d{6})[_\s]+(.+)$/u)
  if (match3) {
    const rest = match3[2].trim()
    // 기수 추출 시도
    const cohortMatch = rest.match(/(\d+기)/)
    const cohort = cohortMatch ? cohortMatch[1] : ''
    const instructor = cohort ? rest.replace(/\d+기/, '').replace(/[_\s]+/g, '').trim() : rest

    return {
      date: match3[1],
      instructor: instructor || rest,
      cohort: cohort,
      raw: trimmed,
      displayDate: formatDateCode(match3[1])
    }
  }

  // 파싱 불가 - 날짜코드 없는 시트 (목록, 요약 등)
  return null
}

// 날짜코드 포맷: "260106" → "26.01.06"
function formatDateCode(code) {
  if (code.length !== 6) return code
  return `${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}`
}

async function googleSheetsApiFetch(url) {
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const googleMsg = errorData.error?.message || ''

    if (response.status === 403) {
      return {
        error: '스프레드시트 접근 권한이 없습니다.',
        serviceEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        status: 403
      }
    }
    return { error: googleMsg || '알 수 없는 오류', status: response.status }
  }

  return { data: await response.json() }
}

// GET: 탭 목록 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || '26'
    const spreadsheetId = PAYER_SHEETS[year]

    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties(title),sheets(properties(sheetId,title,index))`
    const result = await googleSheetsApiFetch(url)

    if (result.error) {
      const body = { error: result.error }
      if (result.serviceEmail) body.serviceEmail = result.serviceEmail
      return NextResponse.json(body, { status: result.status || 500 })
    }

    const allTabs = result.data.sheets.map(sheet => sheet.properties.title)
    const parsedTabs = []

    for (const tabName of allTabs) {
      const parsed = parseTabName(tabName)
      if (parsed) {
        parsedTabs.push(parsed)
      }
    }

    // 날짜순 정렬 (최신순)
    parsedTabs.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({
      success: true,
      year,
      spreadsheetId,
      spreadsheetTitle: result.data.properties?.title || '',
      tabs: parsedTabs,
      totalTabs: allTabs.length,
      filteredCount: allTabs.length - parsedTabs.length
    })

  } catch (error) {
    console.error('Payer sheets tab list error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST: 특정 탭의 결제자 데이터 조회
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { year, tabName } = await request.json()

    if (!year || !tabName) {
      return NextResponse.json({ error: 'year, tabName 필수' }, { status: 400 })
    }

    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    // Google Sheets API로 데이터 가져오기
    const range = encodeURIComponent(`'${tabName}'!A:ZZ`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
    const result = await googleSheetsApiFetch(url)

    if (result.error) {
      const body = { error: result.error }
      if (result.serviceEmail) body.serviceEmail = result.serviceEmail
      return NextResponse.json(body, { status: result.status || 500 })
    }

    const rows = result.data.values || []
    if (rows.length === 0) {
      return NextResponse.json({ success: true, headers: [], data: [], total: 0 })
    }

    // 첫 행을 헤더로 사용
    const headers = rows[0] || []
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()))

    // 전화번호 컬럼 자동 감지
    let phoneColIndex = -1
    let nameColIndex = -1
    let amountColIndex = -1
    let dateColIndex = -1
    let statusColIndex = -1

    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || '').toString().toLowerCase()
      if (phoneColIndex === -1 && (h.includes('전화') || h.includes('연락처') || h.includes('핸드폰') || h.includes('휴대폰') || h.includes('phone'))) {
        phoneColIndex = i
      }
      if (nameColIndex === -1 && (h.includes('이름') || h.includes('성명') || h.includes('구매자') || h.includes('name') || h.includes('수강생'))) {
        nameColIndex = i
      }
      if (amountColIndex === -1 && (h.includes('결제') && h.includes('금액') || h.includes('금액') || h.includes('amount') || h.includes('price'))) {
        amountColIndex = i
      }
      if (dateColIndex === -1 && (h.includes('결제') && h.includes('일') || h.includes('결제일') || h.includes('date'))) {
        dateColIndex = i
      }
      if (statusColIndex === -1 && (h.includes('상태') || h.includes('status'))) {
        statusColIndex = i
      }
    }

    // 결제자 데이터 구성
    const payers = []
    for (const row of dataRows) {
      const name = nameColIndex >= 0 && row[nameColIndex] ? row[nameColIndex].toString().trim() : ''
      const phone = phoneColIndex >= 0 && row[phoneColIndex] ? normalizePhone(row[phoneColIndex].toString().trim()) : ''
      const amount = amountColIndex >= 0 && row[amountColIndex] ? row[amountColIndex].toString().trim() : ''
      const date = dateColIndex >= 0 && row[dateColIndex] ? row[dateColIndex].toString().trim() : ''
      const status = statusColIndex >= 0 && row[statusColIndex] ? row[statusColIndex].toString().trim() : ''

      // 이름이나 전화번호 중 하나는 있어야 유효한 데이터
      if (name || phone) {
        payers.push({ name, phone, amount, date, status })
      }
    }

    return NextResponse.json({
      success: true,
      headers,
      data: payers,
      total: payers.length,
      columns: {
        nameColIndex,
        phoneColIndex,
        amountColIndex,
        dateColIndex,
        statusColIndex
      },
      rawRowCount: dataRows.length
    })

  } catch (error) {
    console.error('Payer sheet data error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// 전화번호 정규화
function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('010')) {
    return cleaned
  }
  if (cleaned.length === 10 && cleaned.startsWith('10')) {
    return '0' + cleaned
  }
  return cleaned
}
