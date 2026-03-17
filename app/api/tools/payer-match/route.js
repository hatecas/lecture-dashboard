import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'
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

function getColumnValue(row, colIndex) {
  const keys = Object.keys(row)
  return colIndex < keys.length ? row[keys[colIndex]] : ''
}

function parseDate(dateStr) {
  if (!dateStr) return null
  const str = String(dateStr).trim()

  if (!isNaN(str) && str !== '') {
    const excelDate = parseFloat(str)
    return new Date((excelDate - 25569) * 86400 * 1000).getTime()
  }

  const googleFormMatch = str.match(/(\d{4})\.\s*(\d+)\.\s*(\d+)\.\s*(오전|오후)\s*(\d+):(\d+):?(\d+)?/)
  if (googleFormMatch) {
    const [, year, month, day, ampm, hour, minute, second] = googleFormMatch
    let h = parseInt(hour)
    if (ampm === '오후' && h < 12) h += 12
    if (ampm === '오전' && h === 12) h = 0
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minute), parseInt(second) || 0).getTime()
  }

  const koreanMatch = str.match(/(\d+)월\s*(\d+)일\s*(오전|오후)?\s*(\d+)시\s*(\d+)분?/)
  if (koreanMatch) {
    const [, month, day, ampm, hour, minute] = koreanMatch
    let h = parseInt(hour)
    if (ampm === '오후' && h < 12) h += 12
    if (ampm === '오전' && h === 12) h = 0
    return new Date(new Date().getFullYear(), parseInt(month) - 1, parseInt(day), h, parseInt(minute) || 0).getTime()
  }

  const parsed = Date.parse(str)
  return !isNaN(parsed) ? parsed : null
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const applicantsFiles = formData.getAll('applicants')
    const year = formData.get('year')
    const tabName = formData.get('tabName')

    if (applicantsFiles.length === 0) {
      return NextResponse.json({ success: false, error: '신청자 파일이 필요합니다.' })
    }
    if (!year || !tabName) {
      return NextResponse.json({ success: false, error: '결제자 시트 탭을 선택해주세요.' })
    }

    const logs = [`신청자 파일 ${applicantsFiles.length}개 업로드됨`]

    // 1. 신청자 파일 파싱
    const applicantMap = new Map()
    for (const file of applicantsFiles) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const fileName = file.name.replace(/\.(xlsx|xls|csv)$/i, '')

      for (const row of data) {
        const phone = normalizePhone(getColumnValue(row, 3)) // D열 = 전화번호
        if (phone) {
          const applyDate = getColumnValue(row, 4) // E열 = 신청일
          const applyTimestamp = parseDate(applyDate)
          const existing = applicantMap.get(phone)

          if (!existing || (applyTimestamp && existing._timestamp && applyTimestamp < existing._timestamp)) {
            applicantMap.set(phone, {
              신청일: applyDate,
              유입경로: fileName,
              _timestamp: applyTimestamp
            })
          }
        }
      }
      logs.push(`신청자 파일 "${file.name}": ${data.length}건`)
    }
    logs.push(`신청자 맵: ${applicantMap.size}명 (중복 제거됨)`)

    // 2. 구글 시트에서 결제자 데이터 가져오기
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
    let phoneColIndex = -1, nameColIndex = -1, amountColIndex = -1, dateColIndex = -1, methodColIndex = -1, statusColIndex = -1

    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || '').toString().replace(/\s/g, '').toLowerCase()
      if (phoneColIndex === -1 && (h.includes('전화') || h.includes('연락처') || h.includes('핸드폰') || h.includes('휴대폰') || h.includes('phone'))) phoneColIndex = i
      if (nameColIndex === -1 && (h.includes('이름') || h.includes('성명') || h.includes('구매자') || h.includes('name') || h.includes('수강생'))) nameColIndex = i
      if (amountColIndex === -1 && (h.includes('결제금액') || h.includes('금액') || h.includes('amount') || h.includes('price'))) amountColIndex = i
      if (dateColIndex === -1 && (h.includes('결제일') || h.includes('date'))) dateColIndex = i
      if (methodColIndex === -1 && (h.includes('결제방법') || h.includes('결제수단') || h.includes('결제종류') || h.includes('payment'))) methodColIndex = i
      if (statusColIndex === -1 && (h.includes('결제구분') || h.includes('결제상태') || h.includes('결제부분'))) statusColIndex = i
    }

    const dataRows = rows.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()))

    // 결제자 파싱
    const validPayers = []
    let refundCount = 0
    for (const row of dataRows) {
      const name = nameColIndex >= 0 ? (row[nameColIndex] || '').toString().trim() : ''
      const phoneRaw = phoneColIndex >= 0 ? (row[phoneColIndex] || '').toString().trim() : ''
      const amount = amountColIndex >= 0 ? (row[amountColIndex] || '').toString().trim() : ''
      const date = dateColIndex >= 0 ? (row[dateColIndex] || '').toString().trim() : ''
      const method = methodColIndex >= 0 ? (row[methodColIndex] || '').toString().trim() : ''
      const status = statusColIndex >= 0 ? (row[statusColIndex] || '').toString().trim() : ''

      // 전체환불이면 제외
      if (status === '전체환불') {
        refundCount++
        continue
      }

      // 결제금액이 0 이하면 환불로 제외
      const amountNum = parseFloat(String(amount).replace(/[^0-9.-]/g, '')) || 0
      if (amountNum <= 0 && amount) {
        refundCount++
        continue
      }

      if (name || phoneRaw) {
        validPayers.push({ name, phoneRaw, phone: normalizePhone(phoneRaw), amount, date, method })
      }
    }

    logs.push(`시트 결제자: ${dataRows.length}건 (환불 ${refundCount}건 제외)`)
    logs.push(`유효 결제자: ${validPayers.length}명`)
    logs.push('매칭 시작...')

    // 3. 매칭
    const results = []
    const unmatchedList = []
    let matched = 0, unmatched = 0

    for (const payer of validPayers) {
      const matchedApplicant = payer.phone ? applicantMap.get(payer.phone) : null

      if (matchedApplicant) {
        results.push({
          구매자: payer.name,
          전화번호: payer.phoneRaw,
          결제금액: payer.amount,
          결제일: payer.date,
          신청일: matchedApplicant.신청일,
          유입경로: matchedApplicant.유입경로,
          결제수단: payer.method
        })
        matched++
      } else {
        unmatchedList.push({
          구매자: payer.name,
          전화번호: payer.phoneRaw,
          결제금액: payer.amount,
          결제일: payer.date,
          신청일: '',
          유입경로: '(직접구매)',
          결제수단: payer.method
        })
        unmatched++
      }
    }

    logs.push(`매칭 완료: ${matched}명 매칭됨, ${unmatched}명 미매칭(직접구매)`)

    // 4. Excel 결과 생성
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
    console.error('Payer match error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
