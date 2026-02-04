import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const instructorSession = searchParams.get('name') // 예: "홍시삼분 4기"

  try {
    // 구글 시트 ID
    const sheetId = '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw'
    
    // 필요한 컬럼: A(강사명), G(총매출), Q(GDN전환단가), R(메타전환단가), AA(카톡방DB), AP(구매전환율)
    const range = 'A:AP'
    
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`
    
    const response = await fetch(url)
    const text = await response.text()
    
    // 구글 시트 응답 파싱 (앞뒤 제거)
    const json = JSON.parse(text.substring(47, text.length - 2))
    const rows = json.table.rows

    // 헤더 행 찾기 (A열이 '강사명'인 행)
    let headerIndex = 0
    for (let i = 0; i < rows.length; i++) {
      const cellValue = rows[i].c[0]?.v
      if (cellValue === '강사명') {
        headerIndex = i
        break
      }
    }

    // 데이터 찾기
    let result = null
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i].c
      const name = row[0]?.v // A열: 강사명
      
      if (name && name.trim() === instructorSession.trim()) {
        // G열(인덱스 6): 총매출
        // Q열(인덱스 16): GDN 전환단가
        // R열(인덱스 17): 메타 전환단가
        // AA열(인덱스 26): 카톡방 DB
        // AP열(인덱스 41): 구매전환율
        
        const revenue = row[6]?.v || 0
        const gdnCost = row[16]?.v || 0
        const metaCost = row[17]?.v || 0
        const kakaoDb = row[26]?.v || 0
        const conversionRate = row[41]?.v || 0
        
        const avgConversionCost = (gdnCost + metaCost) / 2

        result = {
          name: name,
          revenue: revenue,
          conversionCost: Math.round(avgConversionCost),
          kakaoRoomDb: kakaoDb,
          purchaseConversionRate: conversionRate
        }
        break
      }
    }

    if (result) {
      return NextResponse.json(result)
    } else {
      return NextResponse.json({ error: '데이터를 찾을 수 없습니다', name: instructorSession }, { status: 404 })
    }

  } catch (error) {
    console.error('시트 API 오류:', error)
    return NextResponse.json({ error: '시트 데이터 로드 실패' }, { status: 500 })
  }
}