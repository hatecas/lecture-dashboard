// 강사·기수 등록 — service_role 키로 RLS 완전 우회.
// 클라이언트의 anon-key 직접 INSERT가 silently 실패하거나 SELECT 정책에
// 가려 새 행이 보이지 않는 문제를 영구 해결.
//
// POST { action: 'create-instructor', name }
//   → instructor 1개 + placeholder session(session_name='준비중') 자동 생성
//   → { instructor: {id, name, ...}, placeholderSession: {...}|null }
//
// POST { action: 'create-session', instructor_id, session_name, topic?, free_class_date? }
//   → { session: {...} }
//
// POST { action: 'delete-instructor', id }   → cascade로 session 함께 정리
// POST { action: 'delete-session', id }
//
// GET                                         → { instructors: [...], sessions: [...with instructors join] }

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const isUsingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const [instRes, sessRes] = await Promise.all([
      supabase.from('instructors').select('*').order('name'),
      supabase.from('sessions').select('*, instructors(name)'),
    ])
    if (instRes.error) throw instRes.error
    if (sessRes.error) throw sessRes.error
    const instructorsData = instRes.data || []
    const sessionsData = sessRes.data || []
    console.log(
      `[/api/admin/instructors GET] usingServiceRole=${isUsingServiceRole} ` +
      `instructors.count=${instructorsData.length} sessions.count=${sessionsData.length} ` +
      `instructors=[${instructorsData.map(i => i.name).join(', ')}]`
    )
    return Response.json({
      success: true,
      instructors: instructorsData,
      sessions: sessionsData,
      _diagnostic: { usingServiceRole: isUsingServiceRole },
    })
  } catch (err) {
    console.error('[/api/admin/instructors GET] error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return Response.json({ error: '잘못된 JSON' }, { status: 400 }) }
  const { action } = body

  try {
    if (action === 'create-instructor') {
      const name = String(body.name || '').trim()
      if (!name) return Response.json({ error: '강사명 필수' }, { status: 400 })

      const { data: created, error: instErr } = await supabase
        .from('instructors')
        .insert({ name })
        .select()
        .single()
      if (instErr) {
        console.error(`[POST create-instructor] INSERT 실패 name="${name}":`, instErr)
        return Response.json({ error: '강사 INSERT 실패: ' + instErr.message, code: instErr.code }, { status: 500 })
      }
      if (!created || !created.id) {
        console.error(`[POST create-instructor] INSERT 후 row 없음 (read-back 차단)`)
        return Response.json({ error: 'INSERT 후 행을 가져올 수 없음 (RLS SELECT 정책 의심)' }, { status: 500 })
      }
      console.log(`[POST create-instructor] inserted id=${created.id} name="${created.name}"`)

      // 진단: INSERT 직후 별도 SELECT로 실제 DB에 commit 됐는지 검증.
      // service_role로 select했는데 0 rows이면 트랜잭션 문제 등 더 깊은 이슈.
      const { data: verify, error: verifyErr } = await supabase
        .from('instructors')
        .select('id, name, created_at')
        .eq('id', created.id)
        .maybeSingle()
      if (verifyErr || !verify) {
        console.error(`[POST create-instructor] VERIFY 실패! id=${created.id} name="${created.name}" verify=${JSON.stringify(verify)} err=${verifyErr?.message}`)
        return Response.json({
          error: 'INSERT는 성공했는데 직후 SELECT에서 행이 안 보입니다. DB 트리거/뷰/제약 확인 필요.',
          createdId: created.id,
          verify,
          verifyErr: verifyErr?.message,
        }, { status: 500 })
      }
      console.log(`[POST create-instructor] verified ok: id=${verify.id}`)

      // 자리표시 기수 자동 생성 (실패해도 강사 등록은 살림)
      let placeholderSession = null
      try {
        const { data: ph, error: phErr } = await supabase
          .from('sessions')
          .insert({
            instructor_id: created.id,
            session_name: '준비중',
            topic: '',
            free_class_date: null,
          })
          .select()
          .single()
        if (!phErr && ph) {
          placeholderSession = ph
        } else if (phErr) {
          console.warn('[instructors API] placeholder session 실패:', phErr.message)
        }
      } catch (e) {
        console.warn('[instructors API] placeholder session 예외:', e?.message || e)
      }

      return Response.json({
        success: true,
        instructor: created,
        placeholderSession,
        _diagnostic: { usingServiceRole: isUsingServiceRole },
      })
    }

    if (action === 'create-session') {
      const instructor_id = body.instructor_id
      const session_name = String(body.session_name || '').trim()
      if (!instructor_id || !session_name) {
        return Response.json({ error: 'instructor_id, session_name 필수' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          instructor_id,
          session_name,
          topic: body.topic || '',
          free_class_date: body.free_class_date || null,
        })
        .select('*, instructors(name)')
        .single()
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, session: data })
    }

    if (action === 'delete-instructor') {
      const { id } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })
      // cascade: 첨부, 기수 함께 정리
      await supabase.from('instructor_attachments').delete().eq('instructor_id', id)
      await supabase.from('sessions').delete().eq('instructor_id', id)
      const { error } = await supabase.from('instructors').delete().eq('id', id)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    if (action === 'delete-session') {
      const { id } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })
      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    return Response.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
