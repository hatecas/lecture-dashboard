import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// GET: 매핑 전체 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('payer_tab_mappings')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // { "25_탭이름": { instructor, cohort }, ... } 형태로 변환
    const mappings = {}
    for (const row of (data || [])) {
      const key = `${row.year}_${row.tab_raw}`
      mappings[key] = {
        instructor: row.instructor,
        cohort: row.cohort
      }
    }

    return NextResponse.json({ success: true, mappings })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: 매핑 저장 (upsert)
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { year, tabRaw, instructor, cohort } = await request.json()

    if (!year || !tabRaw || !instructor) {
      return NextResponse.json({ error: 'year, tabRaw, instructor 필수' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('payer_tab_mappings')
      .upsert({
        year,
        tab_raw: tabRaw,
        instructor: instructor.trim(),
        cohort: (cohort || '').trim(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'year,tab_raw' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, mapping: data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: 매핑 삭제 (초기화)
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { year, tabRaw } = await request.json()

    if (!year || !tabRaw) {
      return NextResponse.json({ error: 'year, tabRaw 필수' }, { status: 400 })
    }

    const { error } = await supabase
      .from('payer_tab_mappings')
      .delete()
      .eq('year', year)
      .eq('tab_raw', tabRaw)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
