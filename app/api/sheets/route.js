import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  try {
    const sheetId = '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw'
    const range = 'A:AR'
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`

    const response = await fetch(url)
    const text = await response.text()
    const json = JSON.parse(text.substring(47, text.length - 2))
    const rows = json.table.rows

    // 헤더 행 찾기 (gviz API가 이미 헤더를 분리한 경우 rows에는 데이터만 있음)
    let startIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c[0]?.v === '강사명') {
        startIndex = i + 1
        break
      }
    }

    // 전체 데이터 파싱
    const allData = []
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i].c
      const rowName = row[0]?.v
      if (!rowName) continue

      // 카드매출/계좌매출 2열 추가로 기존 인덱스 +2
      const revenue = row[8]?.v || 0          // 최종매출액 (I열, 기존 G+2)
      const operatingProfit = row[10]?.v || 0 // 영업이익 (K열, 기존 I+2)
      const profitMargin = row[11]?.v || 0    // 영업이익률 (L열, 기존 J+2)
      const adSpend = row[17]?.v || 0         // 광고비 (R열, 기존 P+2)
      const gdnConvCost = row[18]?.v || 0     // GDN전환단가 (S열, 기존 Q+2)
      const metaConvCost = row[19]?.v || 0    // 메타전환단가 (T열, 기존 R+2)
      const kakaoDb = row[28]?.v || 0         // 카톡방 (AC열, 기존 AA+2)
      const liveViewers = row[29]?.v || 0     // 동시접속 (AD열, 기존 AB+2)
      const totalPurchases = row[34]?.v || 0  // 결제건수 (AI열, 기존 AG+2)
      const conversionRate = row[43]?.v || 0  // 전환율 (AR열, 기존 AP+2)
      const freeClassDate = row[1]?.f || null // 무료강의날짜 (B열, 변경 없음)

      allData.push({
        name: rowName.replace(/\s+/g, ' ').trim(),
        revenue,
        operatingProfit,
        profitMargin: Math.round(profitMargin * 10000) / 100,
        adSpend,
        conversionCost: Math.round((gdnConvCost + metaConvCost) / 2),
        gdnConvCost,
        metaConvCost,
        kakaoRoomDb: kakaoDb,
        liveViewers,
        totalPurchases,
        purchaseConversionRate: conversionRate,
        freeClassDate
      })
    }

    // 특정 이름 조회
    if (name) {
      const normalizedName = name.replace(/\s+/g, ' ').trim()
      const found = allData.find(d => d.name === normalizedName)
      if (found) return NextResponse.json(found)
      return NextResponse.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 })
    }

    // 전체 반환
    return NextResponse.json({ data: allData })

  } catch (error) {
    console.error('시트 API 오류:', error)
    return NextResponse.json({ error: '시트 데이터 로드 실패' }, { status: 500 })
  }
}