import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 직원 목록 조회 (업무 요청 시 담당자 선택용)
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, name, username')
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ users: data || [] })
  } catch (error) {
    console.error('직원 목록 조회 오류:', error)
    return NextResponse.json({ error: '직원 목록 조회 실패' }, { status: 500 })
  }
}
