// 강사·기수별 프로젝트 기획 입력값(무료 강의 주제 + 추가 컨텍스트) GET/POST.
// 사용자가 저장 → DB에 upsert → 다음 접속 시 자동 복원.

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function getInstructorIdFromSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('instructor_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data?.instructor_id || null
}

export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = (searchParams.get('sessionId') || '').trim()
  if (!sessionId) return Response.json({ error: 'sessionId는 필수' }, { status: 400 })

  const { data, error } = await supabase
    .from('session_planner_inputs')
    .select('topic, additional_context, updated_by, updated_at')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) {
    console.error('[planner-inputs GET] 조회 실패:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({
    inputs: data || { topic: '', additional_context: '', updated_by: null, updated_at: null },
  })
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: '잘못된 JSON' }, { status: 400 }) }

  const { sessionId, topic = '', additionalContext = '' } = body
  if (!sessionId) return Response.json({ error: 'sessionId 필수' }, { status: 400 })

  const instructorId = await getInstructorIdFromSession(sessionId)
  if (!instructorId) return Response.json({ error: '존재하지 않는 sessionId' }, { status: 404 })

  const { data, error } = await supabase
    .from('session_planner_inputs')
    .upsert({
      session_id: sessionId,
      instructor_id: instructorId,
      topic: String(topic || ''),
      additional_context: String(additionalContext || ''),
      updated_by: auth.user?.username || 'unknown',
    }, { onConflict: 'session_id' })
    .select('topic, additional_context, updated_by, updated_at')
    .single()
  if (error) {
    console.error('[planner-inputs POST] 저장 실패:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ success: true, inputs: data })
}
