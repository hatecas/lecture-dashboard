import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 정책 목록 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('cs_policies')
      .select('*')
      .order('category', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      // 테이블이 없으면 빈 배열 반환
      if (error.code === '42P01') {
        return NextResponse.json({ policies: [] })
      }
      throw error
    }

    return NextResponse.json({ policies: data || [] })
  } catch (error) {
    console.error('CS 정책 조회 오류:', error)
    return NextResponse.json({ error: '정책 조회 실패' }, { status: 500 })
  }
}

// 정책 추가
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { title, category, content } = await request.json()

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용은 필수입니다' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cs_policies')
      .insert({ title, category: category || '일반', content })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ policy: data })
  } catch (error) {
    console.error('CS 정책 추가 오류:', error)
    return NextResponse.json({ error: '정책 추가 실패' }, { status: 500 })
  }
}

// 정책 수정
export async function PUT(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { id, title, category, content } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cs_policies')
      .update({ title, category, content, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ policy: data })
  } catch (error) {
    console.error('CS 정책 수정 오류:', error)
    return NextResponse.json({ error: '정책 수정 실패' }, { status: 500 })
  }
}

// 정책 삭제
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const { error } = await supabase
      .from('cs_policies')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CS 정책 삭제 오류:', error)
    return NextResponse.json({ error: '정책 삭제 실패' }, { status: 500 })
  }
}
