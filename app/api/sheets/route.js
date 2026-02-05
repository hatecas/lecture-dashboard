import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  try {
    const sheetId = '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw'
    const range = 'A:AP'
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`

    const response = await fetch(url)
    const text = await response.text()
    const json = JSON.parse(text.substring(47, text.length - 2))
    const rows = json.table.rows

    // 헤더 행 찾기
    let headerIndex = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c[0]?.v === '강사명') {
        headerIndex = i
        break
      }
    }

    // 전체 데이터 파싱
    const allData = []
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i].c
      const rowName = row[0]?.v
      if (!rowName) continue

      const revenue = row[6]?.v || 0
      const gdnCost = row[16]?.v || 0
      const metaCost = row[17]?.v || 0
      const kakaoDb = row[26]?.v || 0
      const conversionRate = row[41]?.v || 0
      const freeClassDate = row[1]?.f || null

      allData.push({
        name: rowName.trim(),
        revenue,
        conversionCost: Math.round((gdnCost + metaCost) / 2),
        kakaoRoomDb: kakaoDb,
        purchaseConversionRate: conversionRate,
        freeClassDate
      })
    }

    // 특정 이름 조회
    if (name) {
      const found = allData.find(d => d.name === name.trim())
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