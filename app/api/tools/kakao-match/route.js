import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// 전화번호 정규화 함수
function normalizePhone(phone) {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[^0-9]/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('010')) {
    return cleaned
  }
  if (cleaned.length === 10 && cleaned.startsWith('10')) {
    return '0' + cleaned
  }
  return cleaned
}

// 이름 정규화 (공백, 특수문자 제거)
function normalizeName(name) {
  if (!name) return ''
  return String(name)
    .replace(/\s+/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim()
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

// 이름 컬럼 찾기
function findNameColumn(headers) {
  const namePatterns = ['이름', '성명', 'name', '고객명', '회원명', '입금자', '입금자명', '주문자']
  for (const header of headers) {
    for (const pattern of namePatterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 카톡 로그 파싱 (txt 파일)
function parseKakaoLog(text) {
  const entries = []
  const lines = text.split('\n')

  for (const line of lines) {
    // 카카오톡 오픈채팅 입장 메시지 패턴
    // "홍길동님이 들어왔습니다." 또는 "[오전 10:30] 홍길동님이 들어왔습니다."
    const enterMatch = line.match(/\[?[오전후]*\s*\d{1,2}:\d{2}\]?\s*(.+?)님이\s*들어왔습니다/i)
    if (enterMatch) {
      entries.push({
        name: enterMatch[1].trim(),
        type: '입장'
      })
      continue
    }

    // "홍길동 님이 들어왔습니다" 패턴
    const enterMatch2 = line.match(/(.+?)\s*님이\s*들어왔습니다/i)
    if (enterMatch2) {
      entries.push({
        name: enterMatch2[1].trim(),
        type: '입장'
      })
    }
  }

  return entries
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const kakaoLogFile = formData.get('kakaoLog')
    const payersFile = formData.get('payers')

    if (!kakaoLogFile || !payersFile) {
      return NextResponse.json({ success: false, error: '두 파일이 모두 필요합니다.' })
    }

    const logs = ['파일 업로드 완료']

    // 결제자 파일 읽기
    const payersBuffer = await payersFile.arrayBuffer()
    const payersWb = XLSX.read(payersBuffer)
    const payersSheet = payersWb.Sheets[payersWb.SheetNames[0]]
    const payersData = XLSX.utils.sheet_to_json(payersSheet)

    logs.push(`결제자 데이터: ${payersData.length}명`)

    // 카톡 로그 파일 읽기
    let kakaoEntries = []
    const kakaoFileName = kakaoLogFile.name.toLowerCase()

    if (kakaoFileName.endsWith('.txt')) {
      // TXT 파일 처리
      const text = await kakaoLogFile.text()
      kakaoEntries = parseKakaoLog(text)
      logs.push(`카톡 로그 파싱: ${kakaoEntries.length}명 입장 기록`)
    } else {
      // Excel/CSV 파일 처리
      const kakaoBuffer = await kakaoLogFile.arrayBuffer()
      const kakaoWb = XLSX.read(kakaoBuffer)
      const kakaoSheet = kakaoWb.Sheets[kakaoWb.SheetNames[0]]
      const kakaoData = XLSX.utils.sheet_to_json(kakaoSheet)

      const kakaoHeaders = Object.keys(kakaoData[0] || {})
      const kakaoNameCol = findNameColumn(kakaoHeaders)

      if (kakaoNameCol) {
        for (const row of kakaoData) {
          if (row[kakaoNameCol]) {
            kakaoEntries.push({
              name: String(row[kakaoNameCol]).trim(),
              type: '입장'
            })
          }
        }
      }
      logs.push(`카톡 입장자 데이터: ${kakaoEntries.length}명`)
    }

    // 결제자 컬럼 찾기
    const payerHeaders = Object.keys(payersData[0] || {})
    const payerNameCol = findNameColumn(payerHeaders)
    const payerPhoneCol = findPhoneColumn(payerHeaders)

    logs.push(`결제자 이름 컬럼: ${payerNameCol || '(없음)'}`)
    logs.push(`결제자 전화번호 컬럼: ${payerPhoneCol || '(없음)'}`)

    // 결제자 맵 생성 (이름 -> 결제자 정보)
    const payerMap = new Map()
    for (const payer of payersData) {
      if (payerNameCol && payer[payerNameCol]) {
        const normalizedName = normalizeName(payer[payerNameCol])
        if (!payerMap.has(normalizedName)) {
          payerMap.set(normalizedName, payer)
        }
      }
    }

    logs.push('매칭 시작...')

    // 카톡 입장자와 결제자 매칭
    const results = []
    let matched = 0
    let unmatched = 0
    const processedNames = new Set()

    for (const entry of kakaoEntries) {
      const normalizedName = normalizeName(entry.name)

      // 중복 처리 방지
      if (processedNames.has(normalizedName)) {
        continue
      }
      processedNames.add(normalizedName)

      const matchedPayer = payerMap.get(normalizedName)

      if (matchedPayer) {
        results.push({
          카톡이름: entry.name,
          매칭상태: '결제완료',
          ...(payerNameCol ? { 결제자이름: matchedPayer[payerNameCol] } : {}),
          ...(payerPhoneCol ? { 결제자연락처: matchedPayer[payerPhoneCol] } : {}),
        })
        matched++
      } else {
        results.push({
          카톡이름: entry.name,
          매칭상태: '미결제',
          결제자이름: '',
          결제자연락처: ''
        })
        unmatched++
      }
    }

    logs.push(`매칭 완료: ${matched}명 결제완료, ${unmatched}명 미결제`)

    // 결과 Excel 생성
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(results)
    XLSX.utils.book_append_sheet(wb, ws, '전체결과')

    // 결제완료만
    const matchedResults = results.filter(r => r.매칭상태 === '결제완료')
    if (matchedResults.length > 0) {
      const matchedWs = XLSX.utils.json_to_sheet(matchedResults)
      XLSX.utils.book_append_sheet(wb, matchedWs, '결제완료')
    }

    // 미결제만
    const unmatchedResults = results.filter(r => r.매칭상태 === '미결제')
    if (unmatchedResults.length > 0) {
      const unmatchedWs = XLSX.utils.json_to_sheet(unmatchedResults)
      XLSX.utils.book_append_sheet(wb, unmatchedWs, '미결제')
    }

    // Excel 파일을 base64로 변환
    const excelBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

    return NextResponse.json({
      success: true,
      matched,
      unmatched,
      totalKakao: processedNames.size,
      logs,
      downloadUrl
    })

  } catch (error) {
    console.error('Kakao match error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
