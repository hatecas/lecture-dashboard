import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// Google Sheets API 호출 헬퍼 (서비스 계정 인증)
async function googleSheetsApiFetch(url) {
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    const errorData = await response.json()
    const googleMsg = errorData.error?.message || ''
    console.error('Google Sheets API error:', response.status, googleMsg)

    if (response.status === 403) {
      const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''
      return {
        error: '스프레드시트 접근 권한이 없습니다.',
        serviceEmail,
        status: 403
      }
    }
    if (response.status === 404) {
      return { error: '스프레드시트를 찾을 수 없습니다. URL을 확인해주세요.', status: 404 }
    }
    return { error: googleMsg || '알 수 없는 오류', status: response.status }
  }

  return { data: await response.json() }
}

// Google Sheets API를 사용하여 시트의 모든 탭 정보 가져오기
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { spreadsheetUrl } = await request.json()

    if (!spreadsheetUrl) {
      return NextResponse.json({ error: '스프레드시트 URL이 필요합니다.' }, { status: 400 })
    }

    const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) {
      return NextResponse.json({ error: '유효한 구글 스프레드시트 URL이 아닙니다.' }, { status: 400 })
    }
    const spreadsheetId = match[1]

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties(title),sheets(properties(sheetId,title,index))`
    const result = await googleSheetsApiFetch(url)

    if (result.error) {
      const body = { error: result.error }
      if (result.serviceEmail) body.serviceEmail = result.serviceEmail
      return NextResponse.json(body, { status: result.status })
    }

    const tabs = result.data.sheets.map(sheet => ({
      gid: sheet.properties.sheetId,
      title: sheet.properties.title,
      index: sheet.properties.index
    })).sort((a, b) => a.index - b.index)

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetTitle: result.data.properties?.title || '',
      tabs
    })

  } catch (error) {
    console.error('Sheets API error:', error)
    const msg = error.message?.includes('환경변수')
      ? error.message
      : '서버 오류가 발생했습니다.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// 특정 탭의 데이터 가져오기 (API 모드용)
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const spreadsheetId = searchParams.get('spreadsheetId')
    const sheetName = searchParams.get('sheetName')

    if (!spreadsheetId) {
      return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
    }

    const range = sheetName ? `'${sheetName}'!A:ZZ` : 'A:ZZ'
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    const result = await googleSheetsApiFetch(url)

    if (result.error) {
      const body = { error: result.error }
      if (result.serviceEmail) body.serviceEmail = result.serviceEmail
      return NextResponse.json(body, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      values: result.data.values || []
    })

  } catch (error) {
    console.error('Sheets data fetch error:', error)
    const msg = error.message?.includes('환경변수')
      ? error.message
      : '서버 오류가 발생했습니다.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
