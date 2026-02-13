import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 상담 이력 조회 (검색 포함)
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    let query = supabase
      .from('cs_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`customer_inquiry.ilike.%${search}%,agent_response.ilike.%${search}%,tags.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ history: [], total: 0 })
      }
      throw error
    }

    return NextResponse.json({ history: data || [], total: count || 0 })
  } catch (error) {
    console.error('상담 이력 조회 오류:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

// 상담 이력 단건 추가
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()

    // 엑셀 벌크 업로드
    if (body.bulk && Array.isArray(body.items)) {
      const records = body.items.map(item => ({
        category: item.category || '일반',
        customer_inquiry: item.customer_inquiry || '',
        agent_response: item.agent_response || '',
        tags: item.tags || '',
        result: item.result || ''
      })).filter(r => r.customer_inquiry && r.agent_response)

      if (records.length === 0) {
        return NextResponse.json({ error: '유효한 데이터가 없습니다' }, { status: 400 })
      }

      // 500개씩 배치 삽입
      let inserted = 0
      for (let i = 0; i < records.length; i += 500) {
        const batch = records.slice(i, i + 500)
        const { error } = await supabase.from('cs_history').insert(batch)
        if (error) throw error
        inserted += batch.length
      }

      return NextResponse.json({ success: true, count: inserted })
    }

    // 단건 추가
    const { category, customer_inquiry, agent_response, tags, result } = body

    if (!customer_inquiry || !agent_response) {
      return NextResponse.json({ error: '고객 문의와 답변은 필수입니다' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cs_history')
      .insert({ category: category || '일반', customer_inquiry, agent_response, tags: tags || '', result: result || '' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ item: data })
  } catch (error) {
    console.error('상담 이력 추가 오류:', error)
    return NextResponse.json({ error: '추가 실패' }, { status: 500 })
  }
}

// 상담 이력 삭제
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { id, deleteAll } = await request.json()

    if (deleteAll) {
      const { error } = await supabase.from('cs_history').delete().neq('id', 0)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const { error } = await supabase.from('cs_history').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('상담 이력 삭제 오류:', error)
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}
