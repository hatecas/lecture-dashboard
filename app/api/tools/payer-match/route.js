import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'
import { logError, errorResponse } from '@/lib/errorLog'
import * as XLSX from 'xlsx'

const PAYER_SHEETS = {
  '25': '1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg',
  '26': '1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA'
}

function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('010')) return cleaned
  if (cleaned.length === 10 && cleaned.startsWith('10')) return '0' + cleaned
  return cleaned
}

// PostgREST 1000행 한계 회피
async function fetchAllPaginated(queryFactory, pageSize = 1000, hardLimit = 100000) {
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

function toAmountNumber(raw) {
  if (raw == null) return 0
  const cleaned = String(raw).replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// POST /api/tools/payer-match
// body: { year: '25'|'26', tabName: string,
//         freeCourseIds?: number[],                                            // DB 모드
//         manualApplicants?: [{ name?, phone, label?, appliedAt? }, ...] }     // 엑셀 업로드 모드
// 신청자 명단을 두 가지 방법 중 하나로 가져와 결제자 시트와 전화번호로 매칭.
//   - DB 모드: nlab DB의 ApplyCourse → User
//   - 엑셀 업로드 모드: 클라이언트에서 파싱한 명단을 그대로 받음 (DB 외부 유입경로용)
// 매칭 결과는 결제금액을 number 셀로 export하여 시트에서 SUM이 동작하도록 함.
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  let yearForCtx = null
  let tabNameForCtx = null
  let freeCourseIdsForCtx = null
  try {
    const body = await request.json().catch(() => ({}))
    const { freeCourseIds, manualApplicants, year, tabName } = body || {}
    yearForCtx = year
    tabNameForCtx = tabName
    freeCourseIdsForCtx = Array.isArray(freeCourseIds) ? freeCourseIds.slice(0, 20) : freeCourseIds

    const hasCourseIds = Array.isArray(freeCourseIds) && freeCourseIds.length > 0
    const hasManualApplicants = Array.isArray(manualApplicants) && manualApplicants.length > 0
    if (!hasCourseIds && !hasManualApplicants) {
      return NextResponse.json({ success: false, error: '강의를 1개 이상 선택하거나 엑셀 파일을 업로드해주세요.' })
    }
    if (!year || !tabName) {
      return NextResponse.json({ success: false, error: '결제자 시트 탭을 선택해주세요.' })
    }

    const logs = []

    // 1·2. 신청자 맵 구성 — DB 모드 / 엑셀 업로드 모드
    const applicantMap = new Map()
    let invalidPhoneCount = 0

    if (hasCourseIds) {
      const supabase = getNlabSupabase()

      // FreeCourse title 매핑 (유입경로 라벨용)
      const { data: courseRows, error: courseErr } = await supabase
        .from('FreeCourse')
        .select('id, title')
        .in('id', freeCourseIds)
      if (courseErr) {
        return NextResponse.json({ success: false, error: 'FreeCourse 조회 실패: ' + courseErr.message })
      }
      const courseTitleMap = new Map()
      for (const c of courseRows || []) courseTitleMap.set(c.id, c.title || `강의#${c.id}`)
      logs.push(`선택 강의 ${courseRows?.length || 0}개`)

      // ApplyCourse → User.phone, createdAt
      const applies = await fetchAllPaginated(() =>
        supabase
          .from('ApplyCourse')
          .select('id, freeCourseId, createdAt, User:userId(phone)')
          .in('freeCourseId', freeCourseIds)
      )
      logs.push(`신청자 행 ${applies.length}건 (DB)`)

      for (const a of applies) {
        const phone = normalizePhone(a.User?.phone)
        if (!phone) { invalidPhoneCount++; continue }
        const ts = a.createdAt ? Date.parse(a.createdAt) : null
        const courseTitle = courseTitleMap.get(a.freeCourseId) || `강의#${a.freeCourseId}`
        const existing = applicantMap.get(phone)
        if (!existing || (ts && existing._timestamp && ts < existing._timestamp)) {
          applicantMap.set(phone, {
            신청일: a.createdAt || '',
            유입경로: courseTitle,
            _timestamp: ts
          })
        }
      }
      logs.push(`신청자 맵: ${applicantMap.size}명 (중복 제거, 전화번호 없음 ${invalidPhoneCount}건 제외)`)
    } else {
      // 엑셀 업로드 모드 — 행마다 label(유입경로)을 따로 둘 수 있게 허용.
      // 클라이언트가 파일별로 label을 다르게 보낸 경우 (예: 'GDN.xlsx', '돈깨비.xlsx') 그 라벨 그대로 사용.
      let labeled = 0
      for (const item of manualApplicants) {
        if (!item || typeof item !== 'object') continue
        const phone = normalizePhone(item.phone)
        if (!phone) { invalidPhoneCount++; continue }
        const rawTs = item.appliedAt ? Date.parse(item.appliedAt) : null
        const ts = Number.isFinite(rawTs) ? rawTs : null
        const label = (typeof item.label === 'string' && item.label.trim()) || '(엑셀 업로드)'
        const existing = applicantMap.get(phone)
        if (!existing || (ts && existing._timestamp && ts < existing._timestamp)) {
          applicantMap.set(phone, {
            신청일: item.appliedAt || '',
            유입경로: label,
            _timestamp: ts
          })
          if (item.label) labeled++
        }
      }
      logs.push(`엑셀 업로드 명단 ${manualApplicants.length}건 (전화번호 없음 ${invalidPhoneCount}건 제외, 라벨 부여 ${labeled}건)`)
      logs.push(`신청자 맵: ${applicantMap.size}명 (중복 제거)`)
    }

    // 3. 결제자 시트 데이터
    const spreadsheetId = PAYER_SHEETS[year]
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: '유효하지 않은 연도입니다.' })
    }
    logs.push(`시트 "${tabName}" 결제자 데이터 불러오는 중...`)

    const accessToken = await getGoogleAccessToken()
    const range = encodeURIComponent(`'${tabName}'!A:ZZ`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
    const sheetRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (!sheetRes.ok) {
      return NextResponse.json({ success: false, error: '시트 데이터를 가져올 수 없습니다.' })
    }
    const sheetData = await sheetRes.json()
    const rows = sheetData.values || []
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '시트에 데이터가 없습니다.' })
    }

    // 헤더로 컬럼 자동 감지
    const headers = rows[0] || []
    let phoneColIndex = -1, nameColIndex = -1, amountColIndex = -1, dateColIndex = -1, methodColIndex = -1, statusColIndex = -1, finalAmountColIndex = -1

    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || '').toString().replace(/\s/g, '').toLowerCase()
      if (phoneColIndex === -1 && (h.includes('전화') || h.includes('연락처') || h.includes('핸드폰') || h.includes('휴대폰') || h.includes('phone'))) phoneColIndex = i
      if (nameColIndex === -1 && (h.includes('이름') || h.includes('성명') || h.includes('구매자') || h.includes('name') || h.includes('수강생'))) nameColIndex = i
      if (finalAmountColIndex === -1 && (h.includes('최종') && h.includes('금액'))) finalAmountColIndex = i
      if (amountColIndex === -1 && !h.includes('최종') && (h.includes('결제금액') || h.includes('금액') || h.includes('amount') || h.includes('price'))) amountColIndex = i
      if (dateColIndex === -1 && (h.includes('결제일') || h.includes('date'))) dateColIndex = i
      if (methodColIndex === -1 && (h.includes('결제방법') || h.includes('결제수단') || h.includes('결제종류') || h.includes('payment'))) methodColIndex = i
      if (statusColIndex === -1 && (h.includes('결제구분') || h.includes('결제상태') || h.includes('결제부분'))) statusColIndex = i
    }

    const dataRows = rows.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()))

    const validPayers = []
    let refundCount = 0
    for (const row of dataRows) {
      const name = nameColIndex >= 0 ? (row[nameColIndex] || '').toString().trim() : ''
      const phoneRaw = phoneColIndex >= 0 ? (row[phoneColIndex] || '').toString().trim() : ''
      const amountRaw = amountColIndex >= 0 ? (row[amountColIndex] || '').toString().trim() : ''
      const finalAmount = finalAmountColIndex >= 0 ? (row[finalAmountColIndex] || '').toString().trim() : ''
      const date = dateColIndex >= 0 ? (row[dateColIndex] || '').toString().trim() : ''
      const method = methodColIndex >= 0 ? (row[methodColIndex] || '').toString().trim() : ''
      const status = statusColIndex >= 0 ? (row[statusColIndex] || '').toString().trim() : ''

      if (status === '전체환불') {
        refundCount++
        continue
      }

      const amountSrc = status === '부분환불' && finalAmount ? finalAmount : amountRaw
      const amountNum = toAmountNumber(amountSrc)
      if (amountNum <= 0 && amountSrc) {
        refundCount++
        continue
      }

      if (name || phoneRaw) {
        validPayers.push({
          name,
          phoneRaw,
          phone: normalizePhone(phoneRaw),
          amount: amountNum, // number — Excel SUM 가능하게
          date,
          method,
          status: status || '결제완료'
        })
      }
    }

    logs.push(`시트 결제자: ${dataRows.length}건 (환불 ${refundCount}건 제외)`)
    logs.push(`유효 결제자: ${validPayers.length}명`)
    logs.push('매칭 시작...')

    // 4. 매칭
    const results = []
    const unmatchedList = []
    let matched = 0, unmatched = 0

    for (const payer of validPayers) {
      const matchedApplicant = payer.phone ? applicantMap.get(payer.phone) : null
      const baseRow = {
        구매자: payer.name,
        전화번호: payer.phoneRaw,
        결제금액: payer.amount, // number
        결제일: payer.date,
        결제수단: payer.method,
        결제상태: payer.status,
      }
      if (matchedApplicant) {
        results.push({ ...baseRow, 신청일: matchedApplicant.신청일, 유입경로: matchedApplicant.유입경로 })
        matched++
      } else {
        unmatchedList.push({ ...baseRow, 신청일: '', 유입경로: '(직접구매)' })
        unmatched++
      }
    }

    logs.push(`매칭 완료: ${matched}명 매칭됨, ${unmatched}명 미매칭(직접구매)`)

    // 5. Excel — 결제금액은 number라 자동으로 t='n' 셀로 저장됨 (SUM 가능)
    const wb = XLSX.utils.book_new()
    if (results.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results), '매칭결과')
    }
    if (unmatchedList.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedList), '직접구매')
    }

    const excelBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

    return NextResponse.json({
      success: true,
      matched,
      unmatched,
      total: validPayers.length,
      logs,
      downloadUrl,
      matchedData: results,
      unmatchedData: unmatchedList
    })
  } catch (error) {
    const logged = await logError({
      request,
      error,
      route: '/api/tools/payer-match',
      errorCode: 'INTERNAL',
      username: auth?.user?.username,
      context: { year: yearForCtx, tabName: tabNameForCtx, freeCourseIds: freeCourseIdsForCtx },
    })
    return NextResponse.json({ success: false, error: logged.userMessage, errorId: logged.id || undefined }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 60
