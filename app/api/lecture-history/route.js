import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'save':
        return handleSave(body)
      case 'list':
        return handleList()
      case 'get':
        return handleGet(body)
      case 'delete':
        return handleDelete(body)
      default:
        return NextResponse.json({ success: false, error: '알 수 없는 액션' })
    }
  } catch (error) {
    console.error('Lecture history error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}

async function handleSave({ youtubeUrl, videoTitle, videoDuration, analysis, prompt }) {
  if (!analysis) {
    return NextResponse.json({ success: false, error: '분석 결과가 필요합니다.' })
  }

  const { data, error } = await supabase
    .from('lecture_analysis_history')
    .insert({
      youtube_url: youtubeUrl || null,
      video_title: videoTitle || null,
      video_duration: videoDuration || null,
      analysis,
      prompt: prompt || null
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase save error:', error)
    return NextResponse.json({ success: false, error: 'DB 저장 실패: ' + error.message })
  }

  return NextResponse.json({ success: true, item: data })
}

async function handleList() {
  const { data: items, error } = await supabase
    .from('lecture_analysis_history')
    .select('id, youtube_url, video_title, video_duration, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, items })
}

async function handleGet({ id }) {
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID가 필요합니다.' })
  }

  const { data: item, error } = await supabase
    .from('lecture_analysis_history')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, item })
}

async function handleDelete({ id }) {
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID가 필요합니다.' })
  }

  const { error } = await supabase
    .from('lecture_analysis_history')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, message: '삭제됨' })
}
