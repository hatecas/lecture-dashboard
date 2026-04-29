import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'
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

// 시트 표시용 포맷: 010-xxxx-xxxx
function formatPhoneDisplay(phone) {
  if (!phone) return ''
  const n = normalizePhone(phone)
  if (n.length === 11 && n.startsWith('010')) {
    return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`
  }
  return String(phone)
}

// 0-indexed 컬럼 인덱스를 시트 컬럼 문자(A, B, ..., Z, AA, ...)로 변환
function colLetter(idx) {
  if (idx < 0) return ''
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
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

// 주문 객체 배열 + 시트 정보를 받아 환불 필터 + 시트 dedup + previewRows 생성을 수행한다.
async function buildPreview({ orders, year, tabName, logs, sourceTotal, sourceLabel }) {
  const spreadsheetId = PAYER_SHEETS[year]
  if (!spreadsheetId) {
    return { error: '유효하지 않은 연도입니다.', status: 400 }
  }

  // 환불 필터
  const refunded = []
  const valid = []
  for (const o of orders) {
    if (isRefundStatus(o.status)) refunded.push(o)
    else valid.push(o)
  }
  logs.push(`환불/취소 제외: ${refunded.length}건 / 유효 주문: ${valid.length}건`)

  // 결제자 시트 데이터 (전화번호 dedup)
  const range = encodeURIComponent(`'${tabName}'!A:ZZ`)
  const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
  const sheetRes = await googleSheetsApiFetch(sheetUrl)
  if (sheetRes.error) {
    return {
      error: sheetRes.error,
      serviceEmail: sheetRes.serviceEmail,
      status: sheetRes.status || 500
    }
  }

  const sheetRows = sheetRes.data.values || []
  if (sheetRows.length === 0) {
    return { error: '시트가 비어있습니다. 헤더가 있는 탭을 선택해주세요.', status: 400 }
  }

  const sheetHeaders = sheetRows[0] || []
  const sheetCols = detectColumns(sheetHeaders)
  if (sheetCols.phone < 0) {
    return {
      error: '시트에서 전화번호 컬럼을 찾지 못해 중복 검사가 불가합니다.',
      detectedHeaders: sheetHeaders,
      status: 400
    }
  }
  logs.push(`시트 헤더 ${sheetHeaders.length}개 / 기존 행 ${sheetRows.length - 1}건`)

  const existingPhones = new Set()
  for (let i = 1; i < sheetRows.length; i++) {
    const phone = normalizePhone(sheetRows[i][sheetCols.phone] || '')
    if (phone) existingPhones.add(phone)
  }

  const newOrders = []
  const duplicates = []
  const invalid = []
  const dedupInBatch = new Set()
  for (const o of valid) {
    if (!o.phoneNorm) { invalid.push(o); continue }
    if (existingPhones.has(o.phoneNorm)) { duplicates.push(o); continue }
    if (dedupInBatch.has(o.phoneNorm)) { duplicates.push(o); continue }
    dedupInBatch.add(o.phoneNorm)
    newOrders.push(o)
  }
  logs.push(`최종: 신규 추가 후보 ${newOrders.length}건 / 중복 ${duplicates.length}건 / 전화번호 누락 ${invalid.length}건`)

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

  return {
    body: {
      success: true,
      year,
      tabName,
      source: sourceLabel,
      sheetHeaders,
      sheetCols,
      stats: {
        csvTotal: sourceTotal,
        sourceTotal,
        refunded: refunded.length,
        duplicates: duplicates.length,
        invalid: invalid.length,
        newCount: newOrders.length
      },
      newOrders: newOrders.map(o => ({
        name: o.name, phone: o.phone, email: o.email,
        product: o.product, amount: o.amount, status: o.status, date: o.date
      })),
      duplicates: duplicates.map(o => ({ name: o.name, phone: o.phone, status: o.status })),
      refunded: refunded.map(o => ({ name: o.name, phone: o.phone, amount: o.amount, status: o.status })),
      invalid: invalid.map(o => ({ name: o.name, status: o.status })),
      previewRows,
      logs
    }
  }
}

// productTitle/orderName 첫 대괄호 안에서 강사명 추출.
// 패턴: [N잡연구소X홍시삼분]2기..., [N잡연구소x토리맘]..., [사뚜xN잡연구소]...,
//       [현우 2기]..., [김탄생]..., [N잡연구소X에어3기]..., [노바작가x]...,
//       [온비전x머니탱크]... (x는 콜라보 마커 → x 이후는 모두 제거)
function extractInstructorName(title) {
  if (!title) return null
  const m = String(title).match(/^\s*\[([^\]]+)\]/)
  if (!m) return null
  let name = m[1]
  // 1) N잡연구소 + 연결자(x/X/×) 제거 (앞/뒤 양쪽)
  name = name.replace(/N\s*잡\s*연구소\s*[xX×]?/gi, '')
  name = name.replace(/[xX×]\s*N\s*잡\s*연구소/gi, '')
  // 2) "강사명x콜라보/기타" 패턴: 첫 x(대소문자/×) 이후 전부 제거
  name = name.replace(/\s*[xX×].*$/, '')
  // 3) 기수 제거: " 2기", "3기" 등 (이름 끝의 숫자기)
  name = name.replace(/\s*\d+\s*기\s*$/, '')
  // 4) 양옆 공백/특수문자 정리
  name = name.replace(/^[\s\-:·,]+|[\s\-:·,]+$/g, '').trim()
  return name || null
}

// PostgREST 기본 응답 한계(1000행) 회피용 페이지네이션 헬퍼.
// queryFactory: 새 쿼리를 만드는 함수 (offset 적용 전 상태). range만 다르게 호출됨.
async function fetchAllPaginated(queryFactory, pageSize = 1000, hardLimit = 50000) {
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

// 날짜 범위 검증: ISO 문자열 두 개를 받아 정규화. 최대 일수 초과 시 에러.
function normalizeDateRange(fromStr, toStr, maxDays = 31) {
  if (!fromStr || !toStr) return { error: '시작일/종료일을 모두 입력해주세요.' }
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { error: '날짜 형식이 올바르지 않습니다.' }
  }
  if (from > to) return { error: '시작일이 종료일보다 늦을 수 없습니다.' }
  const days = Math.ceil((to - from) / (1000 * 60 * 60 * 24))
  if (days > maxDays) {
    return { error: `조회 기간은 최대 ${maxDays}일까지 가능합니다. (현재 ${days}일)` }
  }
  // to를 종료일 23:59:59로 확장 (사용자 입력은 보통 날짜만)
  const toEnd = new Date(to)
  toEnd.setHours(23, 59, 59, 999)
  return { from: from.toISOString(), to: toEnd.toISOString(), days }
}

// nlab Supabase: TossCustomer를 강사명 + 기간으로 필터해 주문 객체 배열로 반환
async function fetchOrdersFromNlab(instructor, dateRange) {
  const supabase = getNlabSupabase()
  // productTitle 또는 orderName이 강사명을 포함하는 COURSE 결제 건을 가져온다.
  // EBOOK 등은 제외 (productType = 'COURSE' 만). 1000행 한계 회피 위해 페이지네이션.
  const data = await fetchAllPaginated(() => {
    let q = supabase
      .from('TossCustomer')
      .select(`
        id, orderId, orderName, productTitle, productType, productOption,
        finalPrice, originalPrice, discountPrice,
        paymentStatus, cancelAmount, cancelReason, canceledAt,
        createdAt,
        User:userId ( username, nickname, phone, email )
      `)
      .eq('productType', 'COURSE')
      .or(`productTitle.ilike.%${instructor}%,orderName.ilike.%${instructor}%`)
      .order('createdAt', { ascending: false })
    if (dateRange?.from) q = q.gte('createdAt', dateRange.from)
    if (dateRange?.to) q = q.lte('createdAt', dateRange.to)
    return q
  })

  // ILIKE는 부분 일치라 비슷한 이름(예: "션" → "김선호")까지 들어올 수 있음.
  // 첫 대괄호에서 추출한 정확한 강사명이 일치하는 행만 남긴다.
  const filtered = data.filter(row => {
    const fromTitle = extractInstructorName(row.productTitle)
    const fromOrder = extractInstructorName(row.orderName)
    return fromTitle === instructor || fromOrder === instructor
  })

  return filtered.map(row => {
    const u = row.User || {}
    // paymentStatus를 한국어로 변환 (기존 환불 필터가 '환불'/'취소' 키워드로 동작)
    let status = row.paymentStatus || ''
    const refundedFlag = (row.cancelAmount && row.cancelAmount > 0) || row.canceledAt
    if (refundedFlag || /CANCEL|REFUND|FAIL|ABORT/i.test(status)) {
      status = '환불/취소'
    } else if (/COMPLETE|DONE|PAID/i.test(status)) {
      status = '결제완료'
    }

    // 상품명 + 옵션명 병합 (옵션이 있으면 더 상세하게)
    let product = row.productTitle || row.orderName || ''
    const optName = row.productOption?.name
    if (optName && !product.includes(optName)) {
      product = `${product} - ${optName}`
    }

    // 결제일자 포맷 (YYYY-MM-DD HH:MM)
    let date = ''
    if (row.createdAt) {
      const d = new Date(row.createdAt)
      const pad = n => String(n).padStart(2, '0')
      date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const phone = u.phone || ''
    return {
      name: u.username || u.nickname || '',
      phone,
      phoneNorm: normalizePhone(phone),
      email: u.email || '',
      product,
      productType: row.productType || '',
      method: row.productType === 'COURSE' ? '카드/계좌이체' : '',
      amount: row.finalPrice != null ? String(row.finalPrice) : '',
      finalAmount: row.finalPrice != null ? String(row.finalPrice) : '',
      status,
      date
    }
  })
}

// POST: 주문 미리보기. 두 가지 모드를 지원.
// - multipart/form-data + orderFile: 기존 CSV 업로드 방식
// - application/json + { instructor, year, tabName }: nlab Supabase 직접 조회
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    let year, tabName, orders, logs, sourceTotal, sourceLabel

    if (isJson) {
      // === Supabase 모드 ===
      const body = await request.json()
      const instructor = (body.instructor || '').trim()
      year = body.year || '26'
      tabName = body.tabName

      if (!instructor) {
        return NextResponse.json({ error: '강사를 선택해주세요.' }, { status: 400 })
      }
      if (!tabName) {
        return NextResponse.json({ error: '결제자 시트 탭을 선택해주세요.' }, { status: 400 })
      }
      if (!PAYER_SHEETS[year]) {
        return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
      }

      // 선택적 날짜 범위 (보내면 적용, 없으면 전체 기간)
      let dateRange = null
      if (body.from || body.to) {
        const r = normalizeDateRange(body.from, body.to)
        if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
        dateRange = r
      }

      logs = [`연도 ${year} / 탭 "${tabName}"`, `nlab DB에서 강사 "${instructor}" 결제 내역 조회 중...`]
      if (dateRange) logs.push(`기간: ${body.from} ~ ${body.to} (${dateRange.days}일)`)
      orders = await fetchOrdersFromNlab(instructor, dateRange)
      sourceTotal = orders.length
      sourceLabel = `supabase:${instructor}`
      logs.push(`Supabase에서 ${orders.length}건 조회됨`)
    } else {
      // === CSV 업로드 모드 (기존 호환) ===
      const formData = await request.formData()
      const file = formData.get('orderFile')
      year = formData.get('year') || '26'
      tabName = formData.get('tabName')

      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'CSV 파일이 필요합니다.' }, { status: 400 })
      }
      if (!tabName) {
        return NextResponse.json({ error: '결제자 시트 탭을 선택해주세요.' }, { status: 400 })
      }
      if (!PAYER_SHEETS[year]) {
        return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 })
      }

      logs = [`연도 ${year} / 탭 "${tabName}"`, `업로드 파일: ${file.name}`]

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
      orders = csvRows.map(r => rowToOrder(r, csvCols))
      sourceTotal = csvRows.length
      sourceLabel = `csv:${file.name}`
    }

    const result = await buildPreview({ orders, year, tabName, logs, sourceTotal, sourceLabel })
    if (result.error) {
      const respBody = { error: result.error }
      if (result.serviceEmail) respBody.serviceEmail = result.serviceEmail
      if (result.detectedHeaders) respBody.detectedHeaders = result.detectedHeaders
      return NextResponse.json(respBody, { status: result.status || 500 })
    }

    return NextResponse.json(result.body)

  } catch (error) {
    console.error('Order sync preview error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

// GET: 강사 목록 (드롭다운용).
// Teacher 테이블은 메인 노출용으로 16명만 등록돼 있어 실제 강사진 전체를 못 담는다.
// 따라서 결제가 완료된 COURSE 주문(TossCustomer)의 productTitle/orderName을 파싱해
// 첫 대괄호 안에서 강사명을 추출하고 주문 건수 순으로 정렬해 반환한다.
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }
  try {
    // 쿼리스트링에서 날짜 범위 파싱 (필수)
    const url = new URL(request.url)
    const fromStr = url.searchParams.get('from')
    const toStr = url.searchParams.get('to')

    const range = normalizeDateRange(fromStr, toStr, 31)
    if (range.error) {
      return NextResponse.json({ error: range.error }, { status: 400 })
    }

    const supabase = getNlabSupabase()
    // 지정 기간 내 결제 완료된 COURSE 주문의 제목만 가져온다 (가벼운 쿼리: 컬럼 2개만).
    // PostgREST 기본 1000행 한계가 있어 페이지네이션 필수.
    const data = await fetchAllPaginated(() => supabase
      .from('TossCustomer')
      .select('productTitle, orderName')
      .eq('productType', 'COURSE')
      .eq('paymentStatus', 'COMPLETED')
      .gte('createdAt', range.from)
      .lte('createdAt', range.to)
    )

    // 강사명별 주문/강의 집계
    const map = new Map()
    for (const row of data) {
      const name =
        extractInstructorName(row.productTitle) ||
        extractInstructorName(row.orderName)
      if (!name) continue
      if (!map.has(name)) {
        map.set(name, { name, orderCount: 0, courses: new Set() })
      }
      const entry = map.get(name)
      entry.orderCount += 1
      if (row.productTitle) entry.courses.add(row.productTitle)
    }

    const teachers = [...map.values()]
      .map(e => ({
        name: e.name,
        orderCount: e.orderCount,
        courseCount: e.courses.size
      }))
      .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, 'ko'))

    return NextResponse.json({
      success: true,
      teachers,
      totalOrders: data.length,
      range: { from: fromStr, to: toStr, days: range.days }
    })
  } catch (error) {
    console.error('Order sync teachers error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

// PUT: 미리보기에서 확인된 행을 시트 끝에 append.
// 추가하면서 다음 변환 자동 적용:
//   A열: =Row()-1 공식
//   C열(전화번호): 010-xxxx-xxxx 포맷
//   F열(결제 방법): "카드" 고정 (Toss 결제만 처리하는 흐름)
//   H열(최종 결제 금액): =IF(G{row}="결제완료", E{row}, IF(G{row}="전체환불", 0))
// append 후 batchUpdate로 셀 서식 초기화 (Arial 11pt, 흰 배경, 검정 글자, 볼드 X)
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

    // 1) 시트 헤더 + 현재 행 수 조회 (컬럼 자동 감지 + 새 행 시작 번호 계산용)
    const readRange = encodeURIComponent(`'${tabName}'!A:ZZ`)
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${readRange}`
    const readRes = await googleSheetsApiFetch(readUrl)
    if (readRes.error) {
      const respBody = { error: readRes.error }
      if (readRes.serviceEmail) respBody.serviceEmail = readRes.serviceEmail
      return NextResponse.json(respBody, { status: readRes.status || 500 })
    }
    const sheetRows = readRes.data.values || []
    if (sheetRows.length === 0) {
      return NextResponse.json({ error: '시트가 비어있습니다.' }, { status: 400 })
    }
    const sheetHeaders = sheetRows[0] || []
    const sheetCols = detectColumns(sheetHeaders)

    const colCount = sheetHeaders.length
    const startRowNumber = sheetRows.length + 1 // 1-indexed: 헤더(1) + 데이터 N → 다음 행은 N+2 = sheetRows.length+1

    // 2) 행마다 공식/포맷 주입
    const noColIdx = 0 // A열은 항상 No (사용자 요구사항)
    const phoneIdx = sheetCols.phone
    const methodIdx = sheetCols.method
    const statusIdx = sheetCols.status
    const amountIdx = sheetCols.amount
    const finalIdx = sheetCols.finalAmount
    const statusLetter = statusIdx >= 0 ? colLetter(statusIdx) : ''
    const amountLetter = amountIdx >= 0 ? colLetter(amountIdx) : ''

    const enrichedRows = rows.map((row, i) => {
      const r = new Array(colCount).fill('')
      // 기존 값 복사 (시트 컬럼 수보다 짧거나 길어도 안전하게)
      for (let c = 0; c < Math.min(row.length, colCount); c++) {
        r[c] = row[c] != null ? row[c] : ''
      }
      const rowNum = startRowNumber + i

      // A열: 자동 번호
      if (noColIdx < colCount) r[noColIdx] = '=Row()-1'

      // 전화번호 표시 포맷
      if (phoneIdx >= 0 && r[phoneIdx]) r[phoneIdx] = formatPhoneDisplay(r[phoneIdx])

      // 결제 방법은 항상 "카드" (이 경로는 Toss 카드 결제 동기화)
      if (methodIdx >= 0) r[methodIdx] = '카드'

      // 최종 결제 금액 IF 공식 (행번호 정확 적용)
      if (finalIdx >= 0 && statusLetter && amountLetter) {
        r[finalIdx] = `=IF(${statusLetter}${rowNum}="결제완료", ${amountLetter}${rowNum}, IF(${statusLetter}${rowNum}="전체환불", 0))`
      }
      return r
    })

    // 3) Append 실행
    const appendRange = encodeURIComponent(`'${tabName}'!A1`)
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
    const appendRes = await googleSheetsApiFetch(appendUrl, {
      method: 'POST',
      body: JSON.stringify({ values: enrichedRows })
    })
    if (appendRes.error) {
      const respBody = { error: appendRes.error }
      if (appendRes.serviceEmail) respBody.serviceEmail = appendRes.serviceEmail
      return NextResponse.json(respBody, { status: appendRes.status || 500 })
    }

    // 4) 추가된 영역의 행 인덱스 파싱: e.g. "'tab'!A14:N26"
    const updatedRange = appendRes.data.updates?.updatedRange || ''
    const m = updatedRange.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    let formattingCleared = false
    if (m) {
      const startRow0 = parseInt(m[2], 10) - 1
      const endRow0 = parseInt(m[4], 10) // exclusive

      // 5) 탭의 sheetId 조회 (batchUpdate에 필요)
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`
      const metaRes = await googleSheetsApiFetch(metaUrl)
      if (!metaRes.error) {
        const sheet = (metaRes.data.sheets || []).find(s => s.properties?.title === tabName)
        const sheetId = sheet?.properties?.sheetId
        if (sheetId !== undefined) {
          // 6) 셀 서식 초기화 (배경 흰색, Arial 11pt, 검정, 볼드/이탤릭 해제)
          const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`
          const batchRes = await googleSheetsApiFetch(batchUrl, {
            method: 'POST',
            body: JSON.stringify({
              requests: [{
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: startRow0,
                    endRowIndex: endRow0,
                    startColumnIndex: 0,
                    endColumnIndex: Math.max(colCount, 14)
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 1, green: 1, blue: 1 },
                      textFormat: {
                        fontFamily: 'Arial',
                        fontSize: 11,
                        bold: false,
                        italic: false,
                        foregroundColor: { red: 0, green: 0, blue: 0 }
                      }
                    }
                  },
                  fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat'
                }
              }]
            })
          })
          formattingCleared = !batchRes.error
        }
      }
    }

    return NextResponse.json({
      success: true,
      appendedRows: rows.length,
      updatedRange,
      updatedCells: appendRes.data.updates?.updatedCells || 0,
      formattingCleared
    })

  } catch (error) {
    console.error('Order sync commit error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

// 서비스 계정에서 발생할 수 있는 콜드 스타트 대응 (불필요한 export 방지)
export const runtime = 'nodejs'
export const maxDuration = 60
