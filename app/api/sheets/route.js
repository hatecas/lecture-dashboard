import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

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

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`

    const response = await fetch(url)
    const text = await response.text()
    const json = JSON.parse(text.substring(47, text.length - 2))
    const rows = json.table.rows

    // 헤더 행 찾기
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c[0]?.v === headerKey) {
        startIndex = i + 1
        break
      }
    }

    // 전체 데이터 파싱 (컬럼 설정 기반)
    const allData = []
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i].c
      const rowName = row[0]?.v
      if (!rowName) continue

      const entry = {}
      for (const col of columns) {
        if (col.type === 'name') {
          entry[col.key] = rowName.replace(/\s+/g, ' ').trim()
        } else if (col.type === 'date') {
          entry[col.key] = row[col.index]?.f || null
        } else if (col.type === 'percent') {
          const val = row[col.index]?.v || 0
          // profitMargin은 소수점 → 퍼센트 변환 필요
          if (col.key === 'profitMargin') {
            entry[col.key] = Math.round(val * 10000) / 100
          } else {
            entry[col.key] = val
          }
        } else {
          entry[col.key] = row[col.index]?.v || 0
        }
      }

      // conversionCost 계산 (gdnConvCost + metaConvCost 평균) - 기존 로직 유지
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
    return NextResponse.json({ error: '시트 데이터 로드 실패' }, { status: 500 })
  }
}
