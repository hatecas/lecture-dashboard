import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// PM 결제자 관리 시트 ID (payer-sheets/route.js 와 동일)
const PAYER_SHEETS = {
  '25': '1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg',
  '26': '1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA'
}

// 입장여부 컬럼이 헤더에 없을 때 폴백 (K열 = 인덱스 10)
const FALLBACK_ENTRY_COL_INDEX = 10

function normalizeName(name) {
  if (!name) return ''
  return String(name)
    .replace(/\s+/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim()
}

function parseKakaoLog(text) {
  const entries = []
  const lines = text.split('\n')
  for (const line of lines) {
    const enterMatch = line.match(/\[?[오전후]*\s*\d{1,2}:\d{2}\]?\s*(.+?)님이\s*들어왔습니다/i)
    if (enterMatch) {
      entries.push({ name: enterMatch[1].trim() })
      continue
    }
    const enterMatch2 = line.match(/(.+?)\s*님이\s*들어왔습니다/i)
    if (enterMatch2) {
      entries.push({ name: enterMatch2[1].trim() })
    }
  }
  return entries
}

function findNameColumn(headers) {
  const patterns = ['이름', '성명', '고객명', '회원명', '입금자명', '입금자', '주문자', '구매자', '수강생', 'name']
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase()
    for (const p of patterns) {
      if (h.includes(p.toLowerCase())) return i
    }
  }
  return -1
}

function findEntryColumn(headers) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').replace(/\s+/g, '')
    if (h.includes('입장여부') || h === '입장' || h.includes('입장체크')) {
      return i
    }
  }
  return FALLBACK_ENTRY_COL_INDEX
}

function colIndexToLetter(index) {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

async function googleSheetsApiFetch(url, options = {}) {
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const googleMsg = errorData.error?.message || ''
    if (response.status === 403) {
      return {
        error: '스프레드시트 접근/쓰기 권한이 없습니다. 서비스 계정에 편집자 권한을 부여해주세요.',
        serviceEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        status: 403
      }
    }
    return { error: googleMsg || `HTTP ${response.status}`, status: response.status }
  }

  return { data: await response.json() }
}

// POST: 매칭 미리보기
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const year = formData.get('year') || '26'
    const tabName = formData.get('tabName')
    const kakaoLogFiles = formData.getAll('kakaoLogs')

    if (!tabName) {
      return NextResponse.json({ error: '탭 이름이 필요합니다.' }, { status: 400 })
    }
    if (!kakaoLogFiles || kakaoLogFiles.length === 0) {
      return NextResponse.json({ error: '카톡 로그 파일이 필요합니다.' }, { status: 400 })
    }

    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    const logs = [`연도 ${year} / 탭 "${tabName}"`]

    // 카톡 로그 파싱 (TXT만 지원)
    const allKakaoEntries = []
    for (const file of kakaoLogFiles) {
      const fileName = (file.name || '').toLowerCase()
      if (fileName.endsWith('.txt') || file.type === 'text/plain') {
        const text = await file.text()
        const entries = parseKakaoLog(text)
        allKakaoEntries.push(...entries)
        logs.push(`카톡 로그 "${file.name}": ${entries.length}건 입장 메시지`)
      } else {
        logs.push(`카톡 로그 "${file.name}": TXT가 아니라 건너뜀`)
      }
    }

    if (allKakaoEntries.length === 0) {
      return NextResponse.json({ error: '카톡 로그에서 입장 메시지를 찾지 못했습니다. (TXT 파일만 지원)' }, { status: 400 })
    }

    // 시트 데이터 가져오기
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
      return NextResponse.json({ error: '시트가 비어있습니다.' }, { status: 400 })
    }

    const headers = rows[0] || []
    const nameColIndex = findNameColumn(headers)
    const entryColIndex = findEntryColumn(headers)

    if (nameColIndex < 0) {
      return NextResponse.json({ error: '시트에서 이름 컬럼을 찾지 못했습니다.' }, { status: 400 })
    }

    logs.push(`이름 컬럼: "${headers[nameColIndex]}" (${colIndexToLetter(nameColIndex)})`)
    logs.push(`입장여부 컬럼: "${headers[entryColIndex] || '(헤더 없음, K열 사용)'}" (${colIndexToLetter(entryColIndex)})`)

    // 시트 결제자 인덱스: 정규화된 이름 -> [{ sheetRow, name, currentEntry }]
    const payerIndex = new Map()
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const rawName = row[nameColIndex]
      if (!rawName || !String(rawName).trim()) continue
      const norm = normalizeName(rawName)
      if (!norm) continue
      const sheetRow = i + 1
      const currentEntry = (row[entryColIndex] || '').toString().trim()
      if (!payerIndex.has(norm)) payerIndex.set(norm, [])
      payerIndex.get(norm).push({ sheetRow, name: String(rawName).trim(), currentEntry })
    }

    // 카톡 입장자 정규화 + 중복 제거
    const seen = new Set()
    const uniqueKakao = []
    for (const e of allKakaoEntries) {
      const n = normalizeName(e.name)
      if (!n || seen.has(n)) continue
      seen.add(n)
      uniqueKakao.push({ name: e.name, normalized: n })
    }

    const matched = []
    const skipped = []
    const ambiguous = []
    const unmatched = []

    for (const entry of uniqueKakao) {
      const candidates = payerIndex.get(entry.normalized)
      if (!candidates || candidates.length === 0) {
        unmatched.push({ kakaoName: entry.name })
      } else if (candidates.length > 1) {
        ambiguous.push({
          kakaoName: entry.name,
          candidates: candidates.map(c => ({
            sheetRow: c.sheetRow,
            name: c.name,
            currentEntry: c.currentEntry
          }))
        })
      } else {
        const c = candidates[0]
        if (c.currentEntry === '') {
          matched.push({
            kakaoName: entry.name,
            sheetRow: c.sheetRow,
            sheetName: c.name
          })
        } else {
          skipped.push({
            kakaoName: entry.name,
            sheetRow: c.sheetRow,
            sheetName: c.name,
            currentEntry: c.currentEntry
          })
        }
      }
    }

    logs.push(`기입대상 ${matched.length} / 건너뜀(이미 값 있음) ${skipped.length} / 동명이인 ${ambiguous.length} / 미매칭 ${unmatched.length}`)

    return NextResponse.json({
      success: true,
      year,
      tabName,
      entryColIndex,
      entryColLetter: colIndexToLetter(entryColIndex),
      entryColHeader: headers[entryColIndex] || '',
      nameColLetter: colIndexToLetter(nameColIndex),
      nameColHeader: headers[nameColIndex] || '',
      totalKakao: uniqueKakao.length,
      matched,
      skipped,
      ambiguous,
      unmatched,
      logs
    })

  } catch (error) {
    console.error('Kakao match preview error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: 미리보기에서 확인된 행에 "O" 기입
export async function PUT(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { year, tabName, entryColIndex, rows: writeRows } = body

    if (!year || !tabName) {
      return NextResponse.json({ error: 'year, tabName 필수' }, { status: 400 })
    }
    if (!Array.isArray(writeRows) || writeRows.length === 0) {
      return NextResponse.json({ error: '기입할 행이 없습니다.' }, { status: 400 })
    }

    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    const colLetter = colIndexToLetter(
      typeof entryColIndex === 'number' ? entryColIndex : FALLBACK_ENTRY_COL_INDEX
    )

    const data = writeRows.map(r => ({
      range: `'${tabName}'!${colLetter}${r}`,
      values: [['O']]
    }))

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`
    const result = await googleSheetsApiFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data
      })
    })

    if (result.error) {
      const respBody = { error: result.error }
      if (result.serviceEmail) respBody.serviceEmail = result.serviceEmail
      return NextResponse.json(respBody, { status: result.status || 500 })
    }

    return NextResponse.json({
      success: true,
      updatedCells: result.data.totalUpdatedCells ?? writeRows.length,
      updatedRanges: result.data.totalUpdatedRanges ?? writeRows.length,
      colLetter
    })

  } catch (error) {
    console.error('Kakao match commit error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
