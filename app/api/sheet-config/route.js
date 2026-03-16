import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// GET: 시트 설정 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    // 먼저 테이블 구조 확인
    const { data, error } = await supabase
      .from('sheet_column_config')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .single()

    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ config: null })
    }
    if (error) {
      return NextResponse.json({
        error: `DB 오류: ${error.message}`,
        hint: error.hint || null,
        columns_info: '테이블에 필요한 컬럼: sheet_id(text), data_range(text), header_key(text), column_mappings(jsonb)'
      }, { status: 500 })
    }

    // 테이블 컬럼 구조 반환 (디버깅용)
    const columns = data ? Object.keys(data) : []

    return NextResponse.json({ config: data, columns })
  } catch (error) {
    return NextResponse.json({ error: `시트 설정 로드 실패: ${error.message}` }, { status: 500 })
  }
}

// POST: 시트 설정 저장 (upsert)
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { sheetId, dataRange, headerKeyword, columnMappings } = await request.json()

    if (!sheetId || !dataRange || !headerKeyword) {
      return NextResponse.json({ error: '시트 ID, 데이터 범위, 헤더 키워드가 필요합니다.' }, { status: 400 })
    }

    // Check if config exists
    const { data: existing } = await supabase
      .from('sheet_column_config')
      .select('id')
      .limit(1)
      .single()

    const configData = {
      sheet_id: sheetId,
      data_range: dataRange,
      header_key: headerKeyword,
      columns: columnMappings,
      updated_at: new Date().toISOString()
    }

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('sheet_column_config')
        .update(configData)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) {
        return NextResponse.json({
          error: `저장 실패: ${error.message}`,
          hint: error.hint || null,
          detail: error.details || null
        }, { status: 500 })
      }
      result = data
    } else {
      const { data, error } = await supabase
        .from('sheet_column_config')
        .insert(configData)
        .select()
        .single()
      if (error) {
        return NextResponse.json({
          error: `저장 실패: ${error.message}`,
          hint: error.hint || null,
          detail: error.details || null
        }, { status: 500 })
      }
      result = data
    }

    return NextResponse.json({ config: result })
  } catch (error) {
    return NextResponse.json({ error: `시트 설정 저장 실패: ${error.message}` }, { status: 500 })
  }
}
