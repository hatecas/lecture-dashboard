import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 기본 설정값 (DB에 설정이 없을 때 사용)
const DEFAULT_CONFIG = {
  sheet_id: '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw',
  data_range: 'A:AR',
  header_keyword: '강사명',
  column_mappings: [
    { fieldKey: 'name', displayName: '강사명', columnIndex: 0, type: '이름' },
    { fieldKey: 'freeClassDate', displayName: '무료강의날짜', columnIndex: 1, type: '날짜' },
    { fieldKey: 'revenue', displayName: '최종매출액', columnIndex: 8, type: '숫자' },
    { fieldKey: 'operatingProfit', displayName: '영업이익', columnIndex: 10, type: '숫자' },
    { fieldKey: 'profitMargin', displayName: '영업이익률', columnIndex: 11, type: '퍼센트' },
    { fieldKey: 'adSpend', displayName: '광고비', columnIndex: 17, type: '숫자' },
    { fieldKey: 'gdnConvCost', displayName: 'GDN전환단가', columnIndex: 18, type: '숫자' },
    { fieldKey: 'metaConvCost', displayName: '메타전환단가', columnIndex: 19, type: '숫자' },
    { fieldKey: 'kakaoRoomDb', displayName: '카톡방', columnIndex: 28, type: '숫자' },
    { fieldKey: 'liveViewers', displayName: '동시접속', columnIndex: 29, type: '숫자' },
    { fieldKey: 'totalPurchases', displayName: '결제건수', columnIndex: 34, type: '숫자' },
    { fieldKey: 'conversionRate', displayName: '전환률', columnIndex: 43, type: '퍼센트' }
  ]
}

async function getSheetConfig() {
  try {
    const { data, error } = await supabase
      .from('sheet_config')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .single()

    if (error || !data) return DEFAULT_CONFIG
    return data
  } catch {
    return DEFAULT_CONFIG
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
    const config = await getSheetConfig()
    const sheetId = config.sheet_id
    const range = config.data_range
    const headerKeyword = config.header_keyword
    const columnMappings = config.column_mappings || DEFAULT_CONFIG.column_mappings

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`

    const response = await fetch(url)
    const text = await response.text()

    // gviz 응답에서 JSON 부분만 추출 (더 안정적인 파싱)
    const startIdx = text.indexOf('(')
    const endIdx = text.lastIndexOf(')')
    if (startIdx === -1 || endIdx === -1) {
      console.error('시트 응답 형식 오류 (gviz가 아님):', text.substring(0, 200))
      return NextResponse.json({ error: '시트 데이터 형식 오류' }, { status: 500 })
    }
    const json = JSON.parse(text.substring(startIdx + 1, endIdx))
    const rows = json.table.rows

    // 헤더 행 찾기
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c[0]?.v === headerKeyword) {
        startIndex = i + 1
        break
      }
    }

    // 매핑 인덱스 맵 생성
    const mappingMap = {}
    for (const m of columnMappings) {
      mappingMap[m.fieldKey] = m
    }

    // 전체 데이터 파싱
    const allData = []
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i].c
      const nameMapping = mappingMap['name']
      const nameIdx = nameMapping ? nameMapping.columnIndex : 0
      const rowName = row[nameIdx]?.v
      if (!rowName) continue

      const entry = { name: rowName.replace(/\s+/g, ' ').trim() }

      for (const m of columnMappings) {
        if (m.fieldKey === 'name') continue

        if (m.type === '날짜') {
          entry[m.fieldKey] = row[m.columnIndex]?.f || null
        } else if (m.type === '퍼센트') {
          const val = row[m.columnIndex]?.v || 0
          entry[m.fieldKey] = Math.round(val * 10000) / 100
        } else {
          entry[m.fieldKey] = row[m.columnIndex]?.v || 0
        }
      }

      // 기존 호환: conversionCost 계산
      if (mappingMap['gdnConvCost'] && mappingMap['metaConvCost']) {
        entry.conversionCost = Math.round(((entry.gdnConvCost || 0) + (entry.metaConvCost || 0)) / 2)
      }

      // 기존 호환: purchaseConversionRate = conversionRate
      if (entry.conversionRate !== undefined) {
        entry.purchaseConversionRate = entry.conversionRate
      }

      // 기존 호환: kakaoRoomDb = kakaoRoomDb
      // (이미 올바른 키로 매핑됨)

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
