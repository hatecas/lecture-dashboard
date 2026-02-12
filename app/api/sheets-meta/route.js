import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

// Google Sheets API를 사용하여 시트의 모든 탭 정보 가져오기
export async function POST(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { spreadsheetUrl, apiKey } = await request.json()

    if (!spreadsheetUrl) {
      return NextResponse.json({ error: '스프레드시트 URL이 필요합니다.' }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Google API 키가 필요합니다.' }, { status: 400 })
    }

    // URL에서 스프레드시트 ID 추출
    const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) {
      return NextResponse.json({ error: '유효한 구글 스프레드시트 URL이 아닙니다.' }, { status: 400 })
    }
    const spreadsheetId = match[1]

    // Google Sheets API 호출 - 스프레드시트 메타데이터 가져오기
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=properties(title),sheets(properties(sheetId,title,index))`

    const response = await fetch(url)

    if (!response.ok) {
      const errorData = await response.json()
      const googleMsg = errorData.error?.message || ''
      console.error('Google Sheets API error:', response.status, googleMsg)
      if (response.status === 403) {
        return NextResponse.json({
          error: `Google API 접근 거부 (403): ${googleMsg || 'API 키 또는 스프레드시트 공유 설정을 확인하세요.'}`
        }, { status: 403 })
      }
      if (response.status === 404) {
        return NextResponse.json({
          error: '스프레드시트를 찾을 수 없습니다. URL을 확인하거나 "링크가 있는 모든 사용자" 공유 설정을 확인하세요.'
        }, { status: 404 })
      }
      return NextResponse.json({ error: googleMsg || '알 수 없는 오류', status: response.status })
    }

    const data = await response.json()

    // 탭 정보 추출
    const tabs = data.sheets.map(sheet => ({
      gid: sheet.properties.sheetId,
      title: sheet.properties.title,
      index: sheet.properties.index
    })).sort((a, b) => a.index - b.index)

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetTitle: data.properties?.title || '',
      tabs
    })

  } catch (error) {
    console.error('Sheets API error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// 특정 탭의 데이터 가져오기 (API 모드용)
export async function GET(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const spreadsheetId = searchParams.get('spreadsheetId')
    const apiKey = searchParams.get('apiKey')
    const sheetName = searchParams.get('sheetName')

    if (!spreadsheetId || !apiKey) {
      return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
    }

    // 범위 설정 (시트명이 있으면 포함)
    const range = sheetName ? `'${sheetName}'!A:ZZ` : 'A:ZZ'

    // Google Sheets API 호출 - 데이터 가져오기
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`

    const response = await fetch(url)

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json({ error: error.error?.message || '데이터를 가져올 수 없습니다.' }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      values: data.values || []
    })

  } catch (error) {
    console.error('Sheets data fetch error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
