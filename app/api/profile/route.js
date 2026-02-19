import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 내 프로필 (연락처) 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('admins')
      .select('id, name, username, phone, slack_email')
      .eq('id', userId)
      .single()

    if (error) throw error

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error('프로필 조회 오류:', error)
    return NextResponse.json({ error: '프로필 조회 실패' }, { status: 500 })
  }
}

// 내 연락처 업데이트
export async function PUT(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { userId, phone, slack_email } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다' }, { status: 400 })
    }

    const updateData = {}
    if (phone !== undefined) updateData.phone = phone.replace(/-/g, '').trim()
    if (slack_email !== undefined) updateData.slack_email = slack_email.trim()

    const { data, error } = await supabase
      .from('admins')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, username, phone, slack_email')
      .single()

    if (error) throw error

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error('프로필 업데이트 오류:', error)
    return NextResponse.json({ error: '프로필 업데이트 실패' }, { status: 500 })
  }
}
