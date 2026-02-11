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

// 컬럼 인덱스로 값 가져오기 (0부터 시작)
function getColumnValue(row, colIndex) {
  const keys = Object.keys(row)
  if (colIndex < keys.length) {
    return row[keys[colIndex]]
  }
  return ''
}

// 날짜 문자열을 비교 가능한 형태로 변환
function parseDate(dateStr) {
  if (!dateStr) return null
  const str = String(dateStr).trim()

  // Excel 시리얼 넘버 처리 (숫자인 경우)
  if (!isNaN(str) && str !== '') {
    const excelDate = parseFloat(str)
    // Excel 날짜는 1900-01-01부터 시작 (단, 1900년 2월 29일 버그 보정)
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000)
    return jsDate.getTime()
  }

  // "2026. 1. 15. 오후 6:14:31" 형식 (구글폼 등)
  const googleFormMatch = str.match(/(\d{4})\.\s*(\d+)\.\s*(\d+)\.\s*(오전|오후)\s*(\d+):(\d+):?(\d+)?/)
  if (googleFormMatch) {
    const [, year, month, day, ampm, hour, minute, second] = googleFormMatch
    let h = parseInt(hour)
    if (ampm === '오후' && h < 12) h += 12
    if (ampm === '오전' && h === 12) h = 0
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minute), parseInt(second) || 0).getTime()
  }

  // "1월 13일 오후 8시 9분" 형식
  const koreanMatch = str.match(/(\d+)월\s*(\d+)일\s*(오전|오후)?\s*(\d+)시\s*(\d+)분?/)
  if (koreanMatch) {
    const [, month, day, ampm, hour, minute] = koreanMatch
    let h = parseInt(hour)
    if (ampm === '오후' && h < 12) h += 12
    if (ampm === '오전' && h === 12) h = 0
    const year = new Date().getFullYear()
    return new Date(year, parseInt(month) - 1, parseInt(day), h, parseInt(minute) || 0).getTime()
  }

  // 일반적인 날짜 형식 시도
  const parsed = Date.parse(str)
  if (!isNaN(parsed)) return parsed

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

    // 모든 신청자 파일 병합 (파일명 포함)
    // 신청자: D열(인덱스 3) = 전화번호, E열(인덱스 4) = 신청일
    const applicantMap = new Map()
    for (const file of applicantsFiles) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      // 파일명에서 확장자 제거하여 유입경로로 사용
      const fileName = file.name.replace(/\.(xlsx|xls|csv)$/i, '')

      for (const row of data) {
        // D열(인덱스 3) = 전화번호
        const phone = normalizePhone(getColumnValue(row, 3))

        if (phone) {
          // E열(인덱스 4) = 신청일
          const applyDate = getColumnValue(row, 4)
          const applyTimestamp = parseDate(applyDate)

          const existing = applicantMap.get(phone)

          // 기존 데이터가 없거나, 현재 데이터가 더 빠른 날짜인 경우 업데이트
          if (!existing) {
            applicantMap.set(phone, {
              신청일: applyDate,
              유입경로: fileName,
              _timestamp: applyTimestamp
            })
          } else if (applyTimestamp && existing._timestamp && applyTimestamp < existing._timestamp) {
            // 현재 신청일이 더 빠른 경우 교체
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

    // 모든 결제자 파일 병합
    // 결제자: C열(인덱스 2) = 구매자, D열(인덱스 3) = 전화번호, G열(인덱스 6) = 결제금액, J열(인덱스 9) = 결제일
    let allPayersData = []
    for (const file of payersFiles) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      allPayersData = allPayersData.concat(data)
      logs.push(`결제자 파일 "${file.name}": ${data.length}건`)
    }

    logs.push(`총 결제자: ${allPayersData.length}명`)

    // 환불 제외 (결제금액 0 이하)
    let refundCount = 0
    const validPayers = allPayersData.filter(payer => {
      const 결제금액 = getColumnValue(payer, 6) // G열
      const amount = parseFloat(String(결제금액).replace(/[^0-9.-]/g, '')) || 0
      if (amount <= 0) {
        refundCount++
        return false
      }
      return true
    })

    logs.push(`환불 제외: ${refundCount}명`)
    logs.push(`유효 결제자: ${validPayers.length}명`)
    logs.push('매칭 시작...')

    // 결제자와 매칭하여 새로운 형식으로 출력
    const results = []
    const unmatchedList = []
    let matched = 0
    let unmatched = 0

    for (const payer of validPayers) {
      // 결제자 데이터에서 필요한 컬럼 추출
      const 구매자 = getColumnValue(payer, 2)      // C열
      const 전화번호Raw = getColumnValue(payer, 3)  // D열
      const 결제금액 = getColumnValue(payer, 6)    // G열
      const 결제일 = getColumnValue(payer, 9)      // J열

      const phone = normalizePhone(전화번호Raw)
      const matchedApplicant = applicantMap.get(phone)

      if (matchedApplicant) {
        results.push({
          구매자: 구매자,
          전화번호: 전화번호Raw,
          결제금액: 결제금액,
          결제일: 결제일,
          신청일: matchedApplicant.신청일,
          유입경로: matchedApplicant.유입경로
        })
        matched++
      } else {
        // 미매칭은 별도 리스트에 저장
        unmatchedList.push({
          구매자: 구매자,
          전화번호: 전화번호Raw,
          결제금액: 결제금액,
          결제일: 결제일,
          신청일: '',
          유입경로: '(직접구매)'
        })
        unmatched++
      }
    }

    logs.push(`매칭 완료: ${matched}명 매칭됨, ${unmatched}명 미매칭(직접구매)`)

    // 새 Excel 파일 생성
    const wb = XLSX.utils.book_new()

    // 매칭된 결과 시트
    if (results.length > 0) {
      const ws = XLSX.utils.json_to_sheet(results)
      XLSX.utils.book_append_sheet(wb, ws, '매칭결과')
    }

    // 미매칭(직접구매) 시트
    if (unmatchedList.length > 0) {
      const unmatchedWs = XLSX.utils.json_to_sheet(unmatchedList)
      XLSX.utils.book_append_sheet(wb, unmatchedWs, '직접구매')
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
