import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// 전화번호 정규화 함수
function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')
  // 010-1234-5678 형식 또는 01012345678 형식 처리
  if (cleaned.length === 11 && cleaned.startsWith('010')) {
    return cleaned
  }
  if (cleaned.length === 10 && cleaned.startsWith('10')) {
    return '0' + cleaned
  }
  return cleaned
}

// 전화번호 컬럼 찾기
function findPhoneColumn(headers) {
  const phonePatterns = ['연락처', '전화번호', '전화', 'phone', '핸드폰', '휴대폰', '휴대전화', '연락번호']
  for (const header of headers) {
    for (const pattern of phonePatterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 유입경로 컬럼 찾기
function findInflowColumn(headers) {
  const inflowPatterns = ['유입경로', '유입', '경로', '채널', 'source', 'inflow', 'channel', '알게된경로', '어떻게']
  for (const header of headers) {
    for (const pattern of inflowPatterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const applicantsFiles = formData.getAll('applicants')
    const payersFiles = formData.getAll('payers')

    if (applicantsFiles.length === 0 || payersFiles.length === 0) {
      return NextResponse.json({ success: false, error: '두 쪽 모두 파일이 필요합니다.' })
    }

    const logs = [`신청자 파일 ${applicantsFiles.length}개, 결제자 파일 ${payersFiles.length}개 업로드됨`]

    // 모든 신청자 파일 병합
    let allApplicantsData = []
    for (const file of applicantsFiles) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet)
      allApplicantsData = allApplicantsData.concat(data)
      logs.push(`신청자 파일 "${file.name}": ${data.length}건`)
    }

    // 모든 결제자 파일 병합
    let allPayersData = []
    for (const file of payersFiles) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet)
      allPayersData = allPayersData.concat(data)
      logs.push(`결제자 파일 "${file.name}": ${data.length}건`)
    }

    logs.push(`총 신청자: ${allApplicantsData.length}명, 총 결제자: ${allPayersData.length}명`)

    // 컬럼 찾기
    const applicantHeaders = Object.keys(allApplicantsData[0] || {})
    const payerHeaders = Object.keys(allPayersData[0] || {})

    const applicantPhoneCol = findPhoneColumn(applicantHeaders)
    const payerPhoneCol = findPhoneColumn(payerHeaders)
    const inflowCol = findInflowColumn(applicantHeaders)

    if (!applicantPhoneCol) {
      return NextResponse.json({ success: false, error: '신청자 데이터에서 전화번호 컬럼을 찾을 수 없습니다.' })
    }
    if (!payerPhoneCol) {
      return NextResponse.json({ success: false, error: '결제자 데이터에서 전화번호 컬럼을 찾을 수 없습니다.' })
    }

    logs.push(`신청자 전화번호 컬럼: ${applicantPhoneCol}`)
    logs.push(`결제자 전화번호 컬럼: ${payerPhoneCol}`)
    logs.push(`유입경로 컬럼: ${inflowCol || '(없음)'}`)

    // 신청자 맵 생성 (전화번호 -> 유입경로)
    // 중복 시 먼저 신청한 것(첫 번째)을 유지
    const applicantMap = new Map()
    for (const row of allApplicantsData) {
      const phone = normalizePhone(row[applicantPhoneCol])
      if (phone && !applicantMap.has(phone)) {
        // 이미 등록된 번호가 아닐 때만 저장 (먼저 나온 것 = 먼저 신청한 것 유지)
        applicantMap.set(phone, {
          inflow: inflowCol ? row[inflowCol] : '',
          ...row
        })
      }
    }

    logs.push('매칭 시작...')

    // 결제자와 매칭
    const results = []
    let matched = 0
    let unmatched = 0

    for (const payer of allPayersData) {
      const phone = normalizePhone(payer[payerPhoneCol])
      const matchedApplicant = applicantMap.get(phone)

      if (matchedApplicant) {
        results.push({
          ...payer,
          유입경로: matchedApplicant.inflow
        })
        matched++
      } else {
        results.push({
          ...payer,
          유입경로: ''
        })
        unmatched++
      }
    }

    logs.push(`매칭 완료: ${matched}명 매칭됨, ${unmatched}명 미매칭`)

    // 결과 Excel 생성
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(results)
    XLSX.utils.book_append_sheet(wb, ws, '매칭결과')

    // 미매칭만 따로 시트 추가
    const unmatchedResults = results.filter(r => !r.유입경로)
    if (unmatchedResults.length > 0) {
      const unmatchedWs = XLSX.utils.json_to_sheet(unmatchedResults)
      XLSX.utils.book_append_sheet(wb, unmatchedWs, '미매칭')
    }

    // Excel 파일을 base64로 변환
    const excelBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

    return NextResponse.json({
      success: true,
      matched,
      unmatched,
      total: allPayersData.length,
      logs,
      downloadUrl
    })

  } catch (error) {
    console.error('Inflow match error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
