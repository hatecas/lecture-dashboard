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
    const applicantsFile = formData.get('applicants')
    const payersFile = formData.get('payers')

    if (!applicantsFile || !payersFile) {
      return NextResponse.json({ success: false, error: '두 파일이 모두 필요합니다.' })
    }

    const logs = ['파일 업로드 완료']

    // 파일 읽기
    const applicantsBuffer = await applicantsFile.arrayBuffer()
    const payersBuffer = await payersFile.arrayBuffer()

    logs.push('파일 파싱 중...')

    // Excel/CSV 파싱
    const applicantsWb = XLSX.read(applicantsBuffer)
    const payersWb = XLSX.read(payersBuffer)

    const applicantsSheet = applicantsWb.Sheets[applicantsWb.SheetNames[0]]
    const payersSheet = payersWb.Sheets[payersWb.SheetNames[0]]

    const applicantsData = XLSX.utils.sheet_to_json(applicantsSheet)
    const payersData = XLSX.utils.sheet_to_json(payersSheet)

    logs.push(`신청자 데이터: ${applicantsData.length}명`)
    logs.push(`결제자 데이터: ${payersData.length}명`)

    // 컬럼 찾기
    const applicantHeaders = Object.keys(applicantsData[0] || {})
    const payerHeaders = Object.keys(payersData[0] || {})

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
    const applicantMap = new Map()
    for (const row of applicantsData) {
      const phone = normalizePhone(row[applicantPhoneCol])
      if (phone) {
        applicantMap.set(phone, {
          inflow: inflowCol ? row[inflowCol] : '(알 수 없음)',
          ...row
        })
      }
    }

    logs.push('매칭 시작...')

    // 결제자와 매칭
    const results = []
    let matched = 0
    let unmatched = 0

    for (const payer of payersData) {
      const phone = normalizePhone(payer[payerPhoneCol])
      const matchedApplicant = applicantMap.get(phone)

      if (matchedApplicant) {
        results.push({
          ...payer,
          유입경로: matchedApplicant.inflow,
          매칭상태: '매칭됨'
        })
        matched++
      } else {
        results.push({
          ...payer,
          유입경로: '(미매칭)',
          매칭상태: '미매칭'
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
    const unmatchedResults = results.filter(r => r.매칭상태 === '미매칭')
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
      total: payersData.length,
      logs,
      downloadUrl
    })

  } catch (error) {
    console.error('Inflow match error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
