import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// GET: 저장된 시트 목록 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('saved_sheets')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ sheets: data || [] })
  } catch (error) {
    console.error('Saved sheets fetch error:', error)
    return NextResponse.json({ error: '시트 목록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

// POST: 새 시트 추가
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { name, url } = await request.json()

    if (!name || !url) {
      return NextResponse.json({ error: '시트 이름과 URL이 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('saved_sheets')
      .insert({ name, url })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ sheet: data })
  } catch (error) {
    console.error('Save sheet error:', error)
    return NextResponse.json({ error: '시트를 저장할 수 없습니다.' }, { status: 500 })
  }
}

// DELETE: 시트 삭제
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { ids } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '삭제할 시트 ID가 필요합니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('saved_sheets')
      .delete()
      .in('id', ids)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete sheet error:', error)
    return NextResponse.json({ error: '시트를 삭제할 수 없습니다.' }, { status: 500 })
  }
}
