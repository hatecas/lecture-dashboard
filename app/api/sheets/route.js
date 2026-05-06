import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// 기본 설정값 (DB에 설정이 없을 때 사용)
const DEFAULT_CONFIG = {
  sheet_id: '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw',
  data_range: 'A:AT',
  header_keyword: '강사명',
  column_mappings: [
    { fieldKey: 'name', displayName: '강사명', columnIndex: 0, type: '이름' },
    { fieldKey: 'freeClassDate', displayName: '무료강의날짜', columnIndex: 1, type: '날짜' },
    { fieldKey: 'revenue', displayName: '최종매출액', columnIndex: 10, type: '숫자' },
    { fieldKey: 'operatingProfit', displayName: '영업이익', columnIndex: 12, type: '숫자' },
    { fieldKey: 'profitMargin', displayName: '영업이익률', columnIndex: 13, type: '퍼센트' },
    { fieldKey: 'adSpend', displayName: '광고비', columnIndex: 19, type: '숫자' },
    { fieldKey: 'gdnConvCost', displayName: 'GDN전환단가', columnIndex: 20, type: '숫자' },
    { fieldKey: 'metaConvCost', displayName: '메타전환단가', columnIndex: 21, type: '숫자' },
    { fieldKey: 'kakaoRoomDb', displayName: '카톡방', columnIndex: 30, type: '숫자' },
    { fieldKey: 'liveViewers', displayName: '동시접속', columnIndex: 31, type: '숫자' },
    { fieldKey: 'totalPurchases', displayName: '결제건수', columnIndex: 36, type: '숫자' },
    { fieldKey: 'conversionRate', displayName: '전환률', columnIndex: 45, type: '퍼센트' },
    { fieldKey: 'freeClassViewRate', displayName: '무료강의 시청률', columnIndex: 32, type: '퍼센트' }
  ]
}

async function getSheetConfig() {
  try {
    const { data, error } = await supabase
      .from('sheet_column_config')
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

// Google Sheets API로 데이터 가져오기 (서비스 계정 인증)
// - fresh 캐시(60초): 동일 (sheetId,range)는 즉시 반환
// - in-flight 요청 공유: 동시 호출이 외부 API를 두 번 때리지 않음
// - 5xx/429 재시도: 1초 → 2초 백오프 (총 3회 시도). 일시적 장애에 강건.
// - stale 폴백(10분): 모든 재시도가 실패해도 최근 성공 데이터가 10분 이내면 그걸 반환.
//   빈 차트/500 에러 대신 약간 오래된 데이터를 보여주는 게 사용자 경험에 낫다.
const SHEET_CACHE_TTL_MS = 60 * 1000
const SHEET_STALE_TTL_MS = 10 * 60 * 1000
const sheetCache = new Map() // key: `${sheetId}::${range}` → { ts, rows }
const sheetInflight = new Map() // key → Promise<rows>

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchSheetDataOnce(sheetId, range) {
  const accessToken = await getGoogleAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!response.ok) {
    const err = await response.text()
    const e = new Error(`Google Sheets API 오류: ${response.status} - ${err}`)
    e.status = response.status
    e.retryable = RETRYABLE_STATUS.has(response.status)
    throw e
  }
  const data = await response.json()
  return data.values || []
}

async function fetchSheetData(sheetId, range) {
  const key = `${sheetId}::${range}`
  const cached = sheetCache.get(key)
  if (cached && Date.now() - cached.ts < SHEET_CACHE_TTL_MS) {
    return cached.rows
  }
  const inflight = sheetInflight.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    const delays = [1000, 2000] // 총 3회 시도
    let lastErr = null
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const rows = await fetchSheetDataOnce(sheetId, range)
        sheetCache.set(key, { ts: Date.now(), rows })
        return rows
      } catch (err) {
        lastErr = err
        if (!err.retryable || attempt === delays.length) break
        console.warn(`[/api/sheets] ${err.status} 재시도 ${attempt + 1}/${delays.length} (${delays[attempt]}ms 대기)`)
        await sleep(delays[attempt])
      }
    }
    // 모든 재시도 실패. stale 캐시(10분 이내) 있으면 그걸 폴백으로.
    const stale = sheetCache.get(key)
    if (stale && Date.now() - stale.ts < SHEET_STALE_TTL_MS) {
      console.warn(`[/api/sheets] 외부 API 실패 → stale 캐시 폴백 (${Math.round((Date.now() - stale.ts) / 1000)}s old): ${lastErr?.message}`)
      return stale.rows
    }
    throw lastErr
  })()
  sheetInflight.set(key, promise)
  try {
    return await promise
  } finally {
    sheetInflight.delete(key)
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
    const headerKeyword = config.header_key || config.header_keyword
    const columnMappings = config.columns || config.column_mappings || DEFAULT_CONFIG.column_mappings

    const rows = await fetchSheetData(sheetId, range)

    // 헤더 행 찾기
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === headerKeyword) {
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
      const row = rows[i]
      const nameMapping = mappingMap['name']
      const nameIdx = nameMapping ? nameMapping.columnIndex : 0
      const rowName = row[nameIdx]
      if (!rowName) continue

      const entry = { name: rowName.replace(/\s+/g, ' ').trim() }

      for (const m of columnMappings) {
        if (m.fieldKey === 'name') continue

        const rawVal = row[m.columnIndex]

        if (m.type === '날짜') {
          entry[m.fieldKey] = rawVal || null
        } else if (m.type === '퍼센트') {
          const val = typeof rawVal === 'number' ? rawVal : (parseFloat(rawVal) || 0)
          // 소수(0.4578) → 45.78로 변환, 이미 퍼센트(19.91)면 그대로
          if (val !== 0 && Math.abs(val) < 1) {
            entry[m.fieldKey] = Math.round(val * 10000) / 100
          } else {
            entry[m.fieldKey] = val
          }
        } else {
          const val = typeof rawVal === 'number' ? rawVal : (parseFloat(rawVal) || 0)
          entry[m.fieldKey] = val
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

      allData.push(entry)
    }

    // 특정 이름 조회
    if (name) {
      const normalizedName = name.replace(/\s+/g, ' ').trim()
      const found = allData.find(d => d.name === normalizedName)
      if (found) return NextResponse.json(found)
      // 시트에 없는 강사·기수도 정상 케이스(신규 '준비중' 단계). 404 → 200 + null 반환해서
      // 브라우저 콘솔에 빨간 에러로 찍히지 않게.
      return NextResponse.json({ data: null, notFound: true })
    }

    // 전체 반환
    return NextResponse.json({ data: allData })

  } catch (error) {
    console.error('시트 API 오류:', error?.message || error)
    // 외부 Google API 일시 장애(5xx/429)는 503으로 노출해 클라이언트가 일시적 에러로 다룰 수 있게.
    const upstreamStatus = error?.status
    if (upstreamStatus && RETRYABLE_STATUS.has(upstreamStatus)) {
      return NextResponse.json(
        { error: 'Google Sheets 일시 장애. 잠시 후 다시 시도해주세요.', upstreamStatus },
        { status: 503, headers: { 'Retry-After': '30' } }
      )
    }
    return NextResponse.json({ error: '시트 데이터 로드 실패' }, { status: 500 })
  }
}
