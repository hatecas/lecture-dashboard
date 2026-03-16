import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { sheetId, dataRange } = await request.json()
    if (!sheetId || !dataRange) {
      return NextResponse.json({ error: '시트 ID와 범위가 필요합니다.' }, { status: 400 })
    }

    const accessToken = await getGoogleAccessToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${dataRange}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Sheet preview API error:', err)
      return NextResponse.json({ error: '시트 데이터 접근 실패' }, { status: 500 })
    }

    const data = await response.json()
    const rows = data.values || []

    // 최대 10행만 반환
    return NextResponse.json({ rows: rows.slice(0, 10) })
  } catch (error) {
    console.error('Sheet preview error:', error)
    return NextResponse.json({ error: '시트 미리보기 로드 실패' }, { status: 500 })
  }
}
