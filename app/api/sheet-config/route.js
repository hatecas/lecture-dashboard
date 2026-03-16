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
    const { data, error } = await supabase
      .from('sheet_column_config')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .single()

    if (error && error.code === 'PGRST116') {
      // No rows found - return defaults
      return NextResponse.json({ config: null })
    }
    if (error) throw error

    return NextResponse.json({ config: data })
  } catch (error) {
    console.error('Sheet config fetch error:', error)
    return NextResponse.json({ error: '시트 설정을 불러올 수 없습니다.' }, { status: 500 })
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

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('sheet_column_config')
        .update({
          sheet_id: sheetId,
          data_range: dataRange,
          header_keyword: headerKeyword,
          column_mappings: columnMappings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await supabase
        .from('sheet_column_config')
        .insert({
          sheet_id: sheetId,
          data_range: dataRange,
          header_keyword: headerKeyword,
          column_mappings: columnMappings
        })
        .select()
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json({ config: result })
  } catch (error) {
    console.error('Sheet config save error:', error)
    return NextResponse.json({ error: '시트 설정을 저장할 수 없습니다.' }, { status: 500 })
  }
}
