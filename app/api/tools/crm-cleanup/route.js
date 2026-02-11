import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// 전화번호 정규화 함수
function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')

  // 11자리 전화번호 (010-xxxx-xxxx)
  if (cleaned.length === 11 && cleaned.startsWith('010')) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7) + '-' + cleaned.slice(7)
  }
  // 10자리 전화번호 (10-xxxx-xxxx -> 010-xxxx-xxxx)
  if (cleaned.length === 10 && cleaned.startsWith('10')) {
    return '0' + cleaned.slice(0, 2) + '-' + cleaned.slice(2, 6) + '-' + cleaned.slice(6)
  }
  // 지역번호 (02, 031 등)
  if (cleaned.length >= 9 && cleaned.length <= 10) {
    if (cleaned.startsWith('02')) {
      // 서울 (02-xxx-xxxx 또는 02-xxxx-xxxx)
      if (cleaned.length === 9) {
        return '02-' + cleaned.slice(2, 5) + '-' + cleaned.slice(5)
      } else {
        return '02-' + cleaned.slice(2, 6) + '-' + cleaned.slice(6)
      }
    } else {
      // 기타 지역번호 (0xx-xxx-xxxx 또는 0xx-xxxx-xxxx)
      if (cleaned.length === 10) {
        return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 6) + '-' + cleaned.slice(6)
      } else {
        return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7) + '-' + cleaned.slice(7)
      }
    }
  }
  return cleaned
}

// 전화번호 컬럼 찾기
function findPhoneColumn(headers) {
  const phonePatterns = ['연락처', '전화번호', '전화', 'phone', '핸드폰', '휴대폰', '휴대전화', '연락번호', 'mobile', 'cell']
  for (const header of headers) {
    for (const pattern of phonePatterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 이름 정규화 (공백 제거, 트림)
function normalizeName(name) {
  if (!name) return ''
  return String(name).replace(/\s+/g, ' ').trim()
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 필요합니다.' })
    }

    const logs = ['파일 업로드 완료']

    // 파일 읽기
    const buffer = await file.arrayBuffer()
    logs.push('파일 파싱 중...')

    // Excel/CSV 파싱
    const wb = XLSX.read(buffer)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    const originalCount = data.length
    logs.push(`원본 레코드 수: ${originalCount}`)

    // 컬럼 찾기
    const headers = Object.keys(data[0] || {})
    const phoneCol = findPhoneColumn(headers)

    logs.push(`전화번호 컬럼: ${phoneCol || '(자동 감지 실패)'}`)

    // 데이터 정리
    const seen = new Set()
    const cleanedData = []
    let duplicatesRemoved = 0
    let phoneFormatted = 0

    for (const row of data) {
      // 전화번호 정규화
      if (phoneCol && row[phoneCol]) {
        const original = row[phoneCol]
        const normalized = normalizePhone(row[phoneCol])
        row[phoneCol] = normalized

        if (original !== normalized) {
          phoneFormatted++
        }

        // 중복 체크 (전화번호 기준)
        const key = normalized.replace(/-/g, '')
        if (seen.has(key)) {
          duplicatesRemoved++
          continue
        }
        seen.add(key)
      }

      // 모든 문자열 필드 트림
      for (const key of Object.keys(row)) {
        if (typeof row[key] === 'string') {
          row[key] = row[key].trim()
        }
      }

      cleanedData.push(row)
    }

    logs.push(`중복 제거: ${duplicatesRemoved}건`)
    logs.push(`전화번호 형식 변경: ${phoneFormatted}건`)
    logs.push(`정리 후 레코드 수: ${cleanedData.length}`)

    // 결과 Excel 생성
    const newWb = XLSX.utils.book_new()
    const newWs = XLSX.utils.json_to_sheet(cleanedData)
    XLSX.utils.book_append_sheet(newWb, newWs, '정리된데이터')

    // Excel 파일을 base64로 변환
    const excelBuffer = XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' })
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

    return NextResponse.json({
      success: true,
      originalCount,
      cleanedCount: cleanedData.length,
      duplicatesRemoved,
      phoneFormatted,
      logs,
      downloadUrl
    })

  } catch (error) {
    console.error('CRM cleanup error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
