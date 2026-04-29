import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import * as XLSX from 'xlsx'

// PM 결제자 관리 시트 ID (payer-sheets/route.js 와 동일)
const PAYER_SHEETS = {
  '25': '1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg',
  '26': '1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA'
}

// 환불로 간주할 결제 상태 키워드
const REFUND_KEYWORDS = ['환불', '취소', '실패', 'refund', 'cancel', 'failed']

function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('010')) return cleaned
  if (cleaned.length === 10 && cleaned.startsWith('10')) return '0' + cleaned
  return cleaned
}

function isRefundStatus(status) {
  if (!status) return false
  const s = String(status).toLowerCase()
  // '결제완료'에는 '완료'가 들어있어 환불로 잘못 잡힐 수 있어 명시적 키워드만 사용
  return REFUND_KEYWORDS.some(kw => s.includes(kw.toLowerCase()))
}

// 헤더 배열에서 키워드 그룹과 매칭되는 컬럼 인덱스를 찾는다.
// keywordGroups: 각 그룹은 OR(어느 하나라도 포함하면 매칭). exclude: 포함 시 제외.
function findCol(headers, keywordGroups, exclude = []) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').replace(/\s+/g, '').toLowerCase()
    if (!h) continue
    if (exclude.some(ex => h.includes(ex.toLowerCase()))) continue
    for (const group of keywordGroups) {
      if (group.every(kw => h.includes(kw.toLowerCase()))) return i
    }
  }
  return -1
}

// nlab CSV/시트 공통 컬럼 자동 감지
function detectColumns(headers) {
  return {
    name: findCol(headers, [['구매자'], ['이름'], ['성명'], ['수강생'], ['name']]),
    phone: findCol(headers, [['전화'], ['연락처'], ['핸드폰'], ['휴대폰'], ['phone']]),
    email: findCol(headers, [['이메일'], ['email'], ['메일']]),
    product: findCol(headers, [['상품명'], ['상품', '명'], ['product']]),
    productType: findCol(headers, [['상품', '유형'], ['상품', '구분'], ['유형']], ['세금', '결제']),
    method: findCol(headers, [['결제수단'], ['결제방법'], ['결제종류'], ['payment']]),
    amount: findCol(headers, [['결제금액'], ['금액'], ['amount'], ['price']], ['최종']),
    finalAmount: findCol(headers, [['최종', '금액']]),
    status: findCol(headers, [['결제상태'], ['결제구분'], ['결제부분'], ['상태']]),
    date: findCol(headers, [['결제일'], ['결제', '시각'], ['주문일'], ['date']])
  }
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

// CSV(또는 XLSX) 파일 한 개를 행 배열로 파싱
async function parseOrderFile(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', codepage: 949 }) // 한국어 CSV(EUC-KR) 폴백
  const sheet = wb.Sheets[wb.SheetNames[0]]
  // header:1 로 raw 2D 배열 받아 자체 헤더 감지
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  if (matrix.length === 0) return { headers: [], rows: [] }

  // 첫 비어있지 않은 행을 헤더로 사용
  let headerRowIdx = 0
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].some(c => c && String(c).trim())) {
      headerRowIdx = i
      break
    }
  }
  const headers = matrix[headerRowIdx].map(h => String(h || '').trim())
  const dataRows = matrix.slice(headerRowIdx + 1).filter(r => r.some(c => c && String(c).trim()))
  return { headers, rows: dataRows }
}

// 행을 자동 감지된 컬럼 인덱스를 사용해 정규화 객체로 변환
function rowToOrder(row, cols) {
  const get = i => (i >= 0 ? String(row[i] ?? '').trim() : '')
  return {
    name: get(cols.name),
    phone: get(cols.phone),
    phoneNorm: normalizePhone(get(cols.phone)),
    email: get(cols.email),
    product: get(cols.product),
    productType: get(cols.productType),
    method: get(cols.method),
    amount: get(cols.amount),
    finalAmount: get(cols.finalAmount),
    status: get(cols.status),
    date: get(cols.date)
  }
}

// POST: CSV 업로드 → 환불 필터 → 시트와 dedup → 미리보기 반환
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('orderFile')
    const year = formData.get('year') || '26'
    const tabName = formData.get('tabName')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'CSV 파일이 필요합니다.' }, { status: 400 })
    }
    if (!tabName) {
      return NextResponse.json({ error: '결제자 시트 탭을 선택해주세요.' }, { status: 400 })
    }

    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    const logs = [`연도 ${year} / 탭 "${tabName}"`, `업로드 파일: ${file.name}`]

    // 1. CSV 파싱
    const { headers: csvHeaders, rows: csvRows } = await parseOrderFile(file)
    if (csvHeaders.length === 0 || csvRows.length === 0) {
      return NextResponse.json({ error: 'CSV에서 데이터를 읽지 못했습니다.' }, { status: 400 })
    }

    const csvCols = detectColumns(csvHeaders)
    if (csvCols.phone < 0 || csvCols.name < 0) {
      return NextResponse.json({
        error: 'CSV에서 구매자/전화번호 컬럼을 찾지 못했습니다. 헤더를 확인해주세요.',
        detectedHeaders: csvHeaders
      }, { status: 400 })
    }

    logs.push(`CSV 헤더 ${csvHeaders.length}개 감지 / 데이터 ${csvRows.length}건`)

    // 환불 필터 적용
    const allOrders = csvRows.map(r => rowToOrder(r, csvCols))
    const refunded = []
    const valid = []
    for (const o of allOrders) {
      if (isRefundStatus(o.status)) {
        refunded.push(o)
      } else {
        valid.push(o)
      }
    }
    logs.push(`환불/취소 제외: ${refunded.length}건 / 유효 주문: ${valid.length}건`)

    // 2. 결제자 시트 데이터 가져오기 (전화번호 dedup)
    const range = encodeURIComponent(`'${tabName}'!A:ZZ`)
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
    const sheetRes = await googleSheetsApiFetch(sheetUrl)

    if (sheetRes.error) {
      const body = { error: sheetRes.error }
      if (sheetRes.serviceEmail) body.serviceEmail = sheetRes.serviceEmail
      return NextResponse.json(body, { status: sheetRes.status || 500 })
    }

    const sheetRows = sheetRes.data.values || []
    if (sheetRows.length === 0) {
      return NextResponse.json({
        error: '시트가 비어있습니다. 헤더가 있는 탭을 선택해주세요.'
      }, { status: 400 })
    }

    const sheetHeaders = sheetRows[0] || []
    const sheetCols = detectColumns(sheetHeaders)
    if (sheetCols.phone < 0) {
      return NextResponse.json({
        error: '시트에서 전화번호 컬럼을 찾지 못해 중복 검사가 불가합니다.',
        detectedHeaders: sheetHeaders
      }, { status: 400 })
    }

    logs.push(`시트 헤더 ${sheetHeaders.length}개 / 기존 행 ${sheetRows.length - 1}건`)

    // 시트 기존 전화번호 셋 (정규화)
    const existingPhones = new Set()
    for (let i = 1; i < sheetRows.length; i++) {
      const phone = normalizePhone(sheetRows[i][sheetCols.phone] || '')
      if (phone) existingPhones.add(phone)
    }

    // 3. 신규/중복 분리
    const newOrders = []
    const duplicates = []
    const invalid = []
    const dedupInBatch = new Set()
    for (const o of valid) {
      if (!o.phoneNorm) {
        invalid.push(o)
        continue
      }
      if (existingPhones.has(o.phoneNorm)) {
        duplicates.push(o)
        continue
      }
      // CSV 안에서도 같은 번호가 여러 번 나오면 첫 건만 채택
      if (dedupInBatch.has(o.phoneNorm)) {
        duplicates.push(o)
        continue
      }
      dedupInBatch.add(o.phoneNorm)
      newOrders.push(o)
    }
    logs.push(`최종: 신규 추가 후보 ${newOrders.length}건 / 중복 ${duplicates.length}건 / 전화번호 누락 ${invalid.length}건`)

    // 신규 행을 시트 컬럼 구조에 맞춰 미리 변환
    const colCount = sheetHeaders.length
    const previewRows = newOrders.map(o => {
      const row = new Array(colCount).fill('')
      const set = (idx, val) => { if (idx >= 0 && idx < colCount) row[idx] = val }
      set(sheetCols.name, o.name)
      set(sheetCols.phone, o.phone)
      set(sheetCols.email, o.email)
      set(sheetCols.product, o.product)
      set(sheetCols.productType, o.productType)
      set(sheetCols.method, o.method)
      set(sheetCols.amount, o.amount)
      set(sheetCols.status, o.status || '결제완료')
      set(sheetCols.date, o.date)
      return row
    })

    return NextResponse.json({
      success: true,
      year,
      tabName,
      sheetHeaders,
      sheetCols,
      stats: {
        csvTotal: csvRows.length,
        refunded: refunded.length,
        duplicates: duplicates.length,
        invalid: invalid.length,
        newCount: newOrders.length
      },
      newOrders: newOrders.map(o => ({
        name: o.name, phone: o.phone, email: o.email,
        product: o.product, amount: o.amount, status: o.status, date: o.date
      })),
      duplicates: duplicates.map(o => ({
        name: o.name, phone: o.phone, status: o.status
      })),
      refunded: refunded.map(o => ({
        name: o.name, phone: o.phone, amount: o.amount, status: o.status
      })),
      invalid: invalid.map(o => ({ name: o.name, status: o.status })),
      previewRows,
      logs
    })

  } catch (error) {
    console.error('Order sync preview error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

// PUT: 미리보기에서 확인된 행을 시트 끝에 append
export async function PUT(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { year, tabName, rows } = body

    if (!year || !tabName) {
      return NextResponse.json({ error: 'year, tabName 필수' }, { status: 400 })
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '추가할 행이 없습니다.' }, { status: 400 })
    }

    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
    }

    const range = encodeURIComponent(`'${tabName}'!A1`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
    const result = await googleSheetsApiFetch(url, {
      method: 'POST',
      body: JSON.stringify({ values: rows })
    })

    if (result.error) {
      const respBody = { error: result.error }
      if (result.serviceEmail) respBody.serviceEmail = result.serviceEmail
      return NextResponse.json(respBody, { status: result.status || 500 })
    }

    return NextResponse.json({
      success: true,
      appendedRows: rows.length,
      updatedRange: result.data.updates?.updatedRange || '',
      updatedCells: result.data.updates?.updatedCells || 0
    })

  } catch (error) {
    console.error('Order sync commit error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

// 서비스 계정에서 발생할 수 있는 콜드 스타트 대응 (불필요한 export 방지)
export const runtime = 'nodejs'
export const maxDuration = 60
