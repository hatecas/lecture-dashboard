import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// 기본 컬럼 매핑 (설정 로드 실패 시 폴백)
const DEFAULT_COLUMNS = [
  { key: 'name', label: '강사명', index: 0, type: 'name' },
  { key: 'freeClassDate', label: '무료강의날짜', index: 1, type: 'date' },
  { key: 'revenue', label: '최종매출액', index: 8, type: 'number' },
  { key: 'operatingProfit', label: '영업이익', index: 10, type: 'number' },
  { key: 'profitMargin', label: '영업이익률', index: 11, type: 'percent' },
  { key: 'adSpend', label: '광고비', index: 17, type: 'number' },
  { key: 'gdnConvCost', label: 'GDN전환단가', index: 18, type: 'number' },
  { key: 'metaConvCost', label: '메타전환단가', index: 19, type: 'number' },
  { key: 'kakaoRoomDb', label: '카톡방', index: 28, type: 'number' },
  { key: 'liveViewers', label: '동시접속', index: 29, type: 'number' },
  { key: 'totalPurchases', label: '결제건수', index: 34, type: 'number' },
  { key: 'conversionRate', label: '전환율', index: 43, type: 'percent' }
]

const DEFAULT_SHEET_ID = '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw'
const DEFAULT_RANGE = 'A:AR'
const DEFAULT_HEADER_KEY = '강사명'

// DB에서 컬럼 설정 로드
async function loadColumnConfig() {
  try {
    const { data, error } = await supabase
      .from('sheet_column_config')
      .select('*')
      .eq('config_name', 'default')
      .single()

    if (error || !data) {
      return {
        sheetId: DEFAULT_SHEET_ID,
        range: DEFAULT_RANGE,
        headerKey: DEFAULT_HEADER_KEY,
        columns: DEFAULT_COLUMNS
      }
    }

    return {
      sheetId: data.sheet_id || DEFAULT_SHEET_ID,
      range: data.data_range || DEFAULT_RANGE,
      headerKey: data.header_key || DEFAULT_HEADER_KEY,
      columns: data.columns || DEFAULT_COLUMNS
    }
  } catch {
    return {
      sheetId: DEFAULT_SHEET_ID,
      range: DEFAULT_RANGE,
      headerKey: DEFAULT_HEADER_KEY,
      columns: DEFAULT_COLUMNS
    }
  }
}

export async function GET(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  try {
    // DB에서 설정 로드
    const config = await loadColumnConfig()
    const { sheetId, range, headerKey, columns } = config

    // Google Sheets API v4 (서비스 계정 인증)
    const accessToken = await getGoogleAccessToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const googleMsg = errorData.error?.message || ''
      console.error('Google Sheets API error:', response.status, googleMsg)

      if (response.status === 403) {
        const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''
        return NextResponse.json({
          error: `스프레드시트 접근 권한이 없습니다. 서비스 계정(${serviceEmail})에 뷰어 권한을 부여해주세요.`
        }, { status: 403 })
      }
      return NextResponse.json({ error: googleMsg || '구글 시트 데이터 로드 실패' }, { status: response.status })
    }

    const data = await response.json()
    const rows = data.values || []

    // 헤더 행 찾기
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === headerKey) {
        startIndex = i + 1
        break
      }
    }

    // 전체 데이터 파싱 (컬럼 설정 기반)
    const allData = []
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i]
      const rowName = row[0]
      if (!rowName) continue

      const entry = {}
      for (const col of columns) {
        const cellValue = row[col.index] || ''

        if (col.type === 'name') {
          entry[col.key] = String(rowName).replace(/\s+/g, ' ').trim()
        } else if (col.type === 'date') {
          entry[col.key] = cellValue || null
        } else if (col.type === 'percent') {
          const val = parseFloat(String(cellValue).replace(/[^0-9.\-]/g, '')) || 0
          if (col.key === 'profitMargin') {
            // 소수점(0.35) → 퍼센트(35.00) 변환, 이미 퍼센트면 그대로
            entry[col.key] = val < 1 && val > -1 ? Math.round(val * 10000) / 100 : val
          } else {
            entry[col.key] = val
          }
        } else {
          // number 타입: 쉼표 제거 후 숫자 변환
          const val = parseFloat(String(cellValue).replace(/[,₩원%]/g, '')) || 0
          entry[col.key] = val
        }
      }

      // conversionCost 계산 (gdnConvCost + metaConvCost 평균)
      if (entry.gdnConvCost !== undefined && entry.metaConvCost !== undefined) {
        entry.conversionCost = Math.round((entry.gdnConvCost + entry.metaConvCost) / 2)
      }

      allData.push(entry)
    }

    // 특정 이름 조회
    if (name) {
      const normalizedName = name.replace(/\s+/g, ' ').trim()
      const found = allData.find(d => d.name === normalizedName)
      if (found) return NextResponse.json(found)
      return NextResponse.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 })
    }

    // 전체 반환
    return NextResponse.json({ data: allData })

  } catch (error) {
    console.error('시트 API 오류:', error)
    const msg = error.message?.includes('환경변수')
      ? error.message
      : '시트 데이터 로드 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
