import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

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

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${dataRange}`
    const response = await fetch(url)
    const text = await response.text()

    const startIdx = text.indexOf('(')
    const endIdx = text.lastIndexOf(')')
    if (startIdx === -1 || endIdx === -1) {
      return NextResponse.json({ error: '시트 응답 형식 오류' }, { status: 500 })
    }
    const json = JSON.parse(text.substring(startIdx + 1, endIdx))
    const rows = json.table.rows

    // 최대 10행만 반환
    const preview = rows.slice(0, 10).map(r =>
      (r.c || []).map(c => c?.f || c?.v || '')
    )

    return NextResponse.json({ rows: preview })
  } catch (error) {
    console.error('Sheet preview error:', error)
    return NextResponse.json({ error: '시트 미리보기 로드 실패' }, { status: 500 })
  }
}
