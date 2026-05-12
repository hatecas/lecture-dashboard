// 프로젝트 기획 봇 생성 결과 자동 저장 + 조회 + 삭제.
//
// 계정별 분리: owner_username으로 자동 필터. 본인 것만 보이고 본인 것만 삭제 가능.
// (관리자 jinwoo는 모든 계정 결과 조회 가능 — 향후 확장. 현재는 본인 것만.)
//
// POST   body: { taskKey, sessionId?, instructorName, sessionName?, topic?, additionalContext?, plan, usage?, model? }
//        → { success, id }
// GET    ?taskKey=&instructorName=&limit=&offset=
//        → { plans: [...] }  // owner_username == 현재 토큰 사용자
// GET    ?id=...
//        → { plan: {...} }   // 본인 것만
// DELETE ?id=...
//        → { success }       // 본인 것만

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })
  const username = auth.user?.username
  if (!username) return Response.json({ error: '사용자명 누락' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: '잘못된 JSON' }, { status: 400 }) }

  const {
    taskKey,
    sessionId = null,
    instructorId = null,
    instructorName,
    sessionName = null,
    topic = null,
    additionalContext = null,
    plan,
    usage = null,
    model = null,
  } = body

  if (!taskKey || typeof taskKey !== 'string') return Response.json({ error: 'taskKey 필수' }, { status: 400 })
  if (!instructorName || typeof instructorName !== 'string') return Response.json({ error: 'instructorName 필수' }, { status: 400 })
  if (!plan || typeof plan !== 'object') return Response.json({ error: 'plan 필수 (object)' }, { status: 400 })

  const { data, error } = await supabase
    .from('generated_plans')
    .insert({
      task_key: taskKey,
      session_id: sessionId,
      instructor_id: instructorId,
      instructor_name: instructorName,
      session_name: sessionName,
      topic,
      additional_context: additionalContext,
      plan,
      usage,
      model,
      owner_username: username,
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[saved-plans POST] 저장 실패:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, id: data.id, createdAt: data.created_at })
}

export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })
  const username = auth.user?.username
  if (!username) return Response.json({ error: '사용자명 누락' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const taskKey = searchParams.get('taskKey')
  const instructorName = searchParams.get('instructorName')
  const sessionId = searchParams.get('sessionId')
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 500)
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

  // 상세 1건 조회
  if (id) {
    const { data, error } = await supabase
      .from('generated_plans')
      .select('*')
      .eq('id', id)
      .eq('owner_username', username) // 본인 것만
      .maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!data) return Response.json({ error: '찾을 수 없거나 권한이 없습니다.' }, { status: 404 })
    return Response.json({ plan: data })
  }

  // 목록
  let q = supabase
    .from('generated_plans')
    .select('id, task_key, instructor_name, session_name, topic, model, usage, created_at')
    .eq('owner_username', username)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (taskKey) q = q.eq('task_key', taskKey)
  if (instructorName) q = q.eq('instructor_name', instructorName)
  if (sessionId) q = q.eq('session_id', sessionId)

  const { data, error } = await q
  if (error) {
    console.error('[saved-plans GET] 조회 실패:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ plans: data || [] })
}

export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })
  const username = auth.user?.username
  if (!username) return Response.json({ error: '사용자명 누락' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })

  // 본인 것만 삭제. 다른 사람 row는 owner_username 조건 때문에 매치 안 됨 → 0 rows.
  const { data, error } = await supabase
    .from('generated_plans')
    .delete()
    .eq('id', id)
    .eq('owner_username', username)
    .select('id')

  if (error) {
    console.error('[saved-plans DELETE] 실패:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return Response.json({ error: '찾을 수 없거나 본인 소유가 아닙니다.' }, { status: 404 })
  }
  return Response.json({ success: true, id: data[0].id })
}
