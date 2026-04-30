// 프로젝트 기획 봇별 지침/레퍼런스 CRUD (관리자 전용 — username='jinwoo')
//
// GET ?feature_key=ebook (선택)
//   feature_key 미지정: { prompts: [...], references: [...] } 전체 반환
//   지정 시: { prompt: {...}, references: [...] } 그 기능만
//
// POST { action, ... }
//   action='save-instructions'  body: { featureKey, instructions }
//   action='add-reference'      body: { featureKey, title, content, tags?, meta?, sortOrder? }
//   action='update-reference'   body: { id, title?, content?, tags?, meta?, enabled?, sortOrder? }
//   action='delete-reference'   body: { id }

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function ensureAdmin(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return { ok: false, response: Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 }) }
  }
  if (auth.user?.username !== 'jinwoo') {
    return { ok: false, response: Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }
  return { ok: true, auth }
}

export async function GET(request) {
  const guard = await ensureAdmin(request)
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const featureKey = searchParams.get('feature_key')

  try {
    if (featureKey) {
      const [{ data: prompt }, { data: references }] = await Promise.all([
        supabase.from('ai_prompts').select('*').eq('feature_key', featureKey).maybeSingle(),
        supabase.from('ai_references').select('*').eq('feature_key', featureKey)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      return Response.json({ success: true, prompt: prompt || null, references: references || [] })
    }

    const [{ data: prompts }, { data: references }] = await Promise.all([
      supabase.from('ai_prompts').select('*'),
      supabase.from('ai_references').select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    return Response.json({ success: true, prompts: prompts || [], references: references || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const guard = await ensureAdmin(request)
  if (!guard.ok) return guard.response
  const username = guard.auth.user.username

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '잘못된 JSON' }, { status: 400 })
  }

  const { action } = body

  try {
    if (action === 'save-instructions') {
      const { featureKey, instructions } = body
      if (!featureKey || typeof instructions !== 'string') {
        return Response.json({ error: 'featureKey, instructions 필수' }, { status: 400 })
      }
      // upsert
      const { data, error } = await supabase
        .from('ai_prompts')
        .upsert({ feature_key: featureKey, instructions, updated_by: username }, { onConflict: 'feature_key' })
        .select()
        .single()
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, prompt: data })
    }

    if (action === 'add-reference') {
      const { featureKey, title, content, tags = [], meta = {}, sortOrder = 0 } = body
      if (!featureKey || !title || !content) {
        return Response.json({ error: 'featureKey, title, content 필수' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('ai_references')
        .insert({
          feature_key: featureKey,
          title: String(title).trim(),
          content: String(content).trim(),
          tags: Array.isArray(tags) ? tags : [],
          meta: typeof meta === 'object' && meta !== null ? meta : {},
          sort_order: Number(sortOrder) || 0,
        })
        .select()
        .single()
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, reference: data })
    }

    if (action === 'update-reference') {
      const { id, ...patch } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })
      const allowed = {}
      if (patch.title !== undefined) allowed.title = String(patch.title).trim()
      if (patch.content !== undefined) allowed.content = String(patch.content).trim()
      if (patch.tags !== undefined) allowed.tags = Array.isArray(patch.tags) ? patch.tags : []
      if (patch.meta !== undefined) allowed.meta = typeof patch.meta === 'object' && patch.meta !== null ? patch.meta : {}
      if (patch.enabled !== undefined) allowed.enabled = !!patch.enabled
      if (patch.sortOrder !== undefined) allowed.sort_order = Number(patch.sortOrder) || 0
      if (Object.keys(allowed).length === 0) {
        return Response.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('ai_references')
        .update(allowed)
        .eq('id', id)
        .select()
        .single()
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, reference: data })
    }

    if (action === 'delete-reference') {
      const { id } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })
      const { error } = await supabase.from('ai_references').delete().eq('id', id)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    return Response.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
