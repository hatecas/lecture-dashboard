// 관리자 계정 CRUD (jinwoo 전용).
//
// GET                                        → { admins: [{id, name, username, features}] }
// POST { action: 'create', name, username, password, features?: string[] }
// POST { action: 'update', id, name?, username?, password?, features? }
// POST { action: 'delete', id }
//
// 비밀번호: 기존 admins 테이블의 password_hash 컬럼이 평문 저장 패턴 → 동일하게 평문 저장 (login 흐름과 일치).

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const ALL_FEATURE_KEYS = [
  'basic-dashboard', 'tools', 'resources', 'cs-ai',
  'lecture-analyzer', 'project-planner', 'sheet-settings', 'payer-data',
]
const DEFAULT_FEATURES = ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer']

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

async function fetchAccountsWithFeatures() {
  const { data: admins, error: adminErr } = await supabase
    .from('admins')
    .select('id, name, username, password_hash, created_at')
    .order('id', { ascending: true })
  if (adminErr) throw adminErr

  const { data: perms } = await supabase
    .from('user_permissions')
    .select('user_id, feature_key, enabled')

  const enriched = (admins || []).map((a) => {
    const isSuper = a.username === 'jinwoo'
    let features
    if (isSuper) {
      features = [...ALL_FEATURE_KEYS]
    } else {
      const userPerms = (perms || []).filter((p) => p.user_id === a.id)
      features = userPerms.length === 0
        ? [...DEFAULT_FEATURES]
        : userPerms.filter((p) => p.enabled).map((p) => p.feature_key)
    }
    return {
      id: a.id,
      name: a.name,
      username: a.username,
      password: a.password_hash, // 평문 (편집 시 노출용 — jinwoo만 접근)
      features,
      isSuperAdmin: isSuper,
      created_at: a.created_at,
    }
  })

  return enriched
}

export async function GET(request) {
  const guard = await ensureAdmin(request)
  if (!guard.ok) return guard.response
  try {
    const accounts = await fetchAccountsWithFeatures()
    return Response.json({ success: true, accounts, allFeatures: ALL_FEATURE_KEYS })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

async function applyFeatures(userId, features) {
  // 기존 권한 다 지우고 활성 기능만 enabled=true로 새로 삽입
  await supabase.from('user_permissions').delete().eq('user_id', userId)
  const rows = ALL_FEATURE_KEYS.map((key) => ({
    user_id: userId,
    feature_key: key,
    enabled: features.includes(key),
  }))
  const { error } = await supabase.from('user_permissions').insert(rows)
  if (error) throw error
}

export async function POST(request) {
  const guard = await ensureAdmin(request)
  if (!guard.ok) return guard.response

  let body
  try { body = await request.json() } catch { return Response.json({ error: '잘못된 JSON' }, { status: 400 }) }
  const { action } = body

  try {
    if (action === 'create') {
      const name = String(body.name || '').trim()
      const username = String(body.username || '').trim()
      const password = String(body.password || '').trim()
      const features = Array.isArray(body.features) ? body.features.filter((f) => ALL_FEATURE_KEYS.includes(f)) : DEFAULT_FEATURES

      if (!name || !username || !password) {
        return Response.json({ error: '이름·아이디·비밀번호는 필수입니다.' }, { status: 400 })
      }
      if (username === 'jinwoo') {
        return Response.json({ error: '슈퍼어드민(jinwoo)는 자동 등록되어 있습니다. 별도 계정 생성 불가.' }, { status: 400 })
      }

      // 중복 체크
      const { data: existing } = await supabase.from('admins').select('id').eq('username', username).maybeSingle()
      if (existing) {
        return Response.json({ error: `이미 사용 중인 아이디입니다: ${username}` }, { status: 400 })
      }

      const { data: created, error: insertErr } = await supabase
        .from('admins')
        .insert({ name, username, password_hash: password })
        .select()
        .single()
      if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

      await applyFeatures(created.id, features)
      return Response.json({ success: true, account: { id: created.id, name, username, password, features } })
    }

    if (action === 'update') {
      const { id } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })

      // 슈퍼어드민 보호
      const { data: target } = await supabase.from('admins').select('username').eq('id', id).maybeSingle()
      if (!target) return Response.json({ error: '대상 계정을 찾을 수 없습니다.' }, { status: 404 })
      if (target.username === 'jinwoo') {
        return Response.json({ error: '슈퍼어드민(jinwoo) 계정은 수정할 수 없습니다.' }, { status: 400 })
      }

      const patch = {}
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
      if (typeof body.username === 'string' && body.username.trim()) {
        const newUsername = body.username.trim()
        if (newUsername === 'jinwoo') {
          return Response.json({ error: 'jinwoo 아이디는 사용할 수 없습니다.' }, { status: 400 })
        }
        if (newUsername !== target.username) {
          const { data: dup } = await supabase.from('admins').select('id').eq('username', newUsername).maybeSingle()
          if (dup) return Response.json({ error: `이미 사용 중인 아이디입니다: ${newUsername}` }, { status: 400 })
        }
        patch.username = newUsername
      }
      if (typeof body.password === 'string' && body.password.trim()) patch.password_hash = body.password.trim()

      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await supabase.from('admins').update(patch).eq('id', id)
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
      }

      if (Array.isArray(body.features)) {
        const features = body.features.filter((f) => ALL_FEATURE_KEYS.includes(f))
        await applyFeatures(id, features)
      }

      return Response.json({ success: true })
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return Response.json({ error: 'id 필수' }, { status: 400 })

      const { data: target } = await supabase.from('admins').select('username').eq('id', id).maybeSingle()
      if (!target) return Response.json({ error: '대상 계정을 찾을 수 없습니다.' }, { status: 404 })
      if (target.username === 'jinwoo') {
        return Response.json({ error: '슈퍼어드민(jinwoo) 계정은 삭제할 수 없습니다.' }, { status: 400 })
      }

      // 권한 먼저 정리
      await supabase.from('user_permissions').delete().eq('user_id', id)
      // 세션 정리 (이 계정의 활성 토큰 무효화)
      await supabase.from('auth_sessions').delete().eq('admin_id', id)
      // 계정 삭제
      const { error: delErr } = await supabase.from('admins').delete().eq('id', id)
      if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

      return Response.json({ success: true })
    }

    return Response.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
