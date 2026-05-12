// 에러 로그 조회 (개발자 전용).
//
// 보안:
//  1. NODE_ENV !== 'production' (로컬 dev 서버) 또는
//  2. 인증된 사용자가 jinwoo (배포 환경에서도 슈퍼 관리자만 가능)
//  둘 중 하나여야 접근 허용. 그 외엔 404 가장.
//
// GET /api/dev/error-logs
//   ?route=...    : 라우트 prefix 필터
//   ?code=...     : 에러 코드 필터
//   ?username=... : 사용자 필터
//   ?since=...    : ISO 시각 이후 (예: '2026-05-12T00:00:00Z')
//   ?limit=100&offset=0
//
// DELETE /api/dev/error-logs?id=<uuid> : 단건 삭제 (jinwoo만)
// DELETE /api/dev/error-logs?before=<iso> : 이전 로그 일괄 삭제 (jinwoo만)

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function isLocalhost(request) {
  // dev 서버는 NODE_ENV=development
  if (process.env.NODE_ENV !== 'production') return true
  // 추가 안전장치: Vercel 배포 환경 변수 — VERCEL=1이면 절대 dev 환경 아님
  return false
}

async function ensureDevAccess(request) {
  // 1) 로컬 dev면 통과
  if (isLocalhost(request)) return { ok: true }
  // 2) 인증된 jinwoo만 통과
  const auth = await verifyApiAuth(request)
  if (auth.authenticated && auth.user?.username === 'jinwoo') {
    return { ok: true }
  }
  // 그 외에는 존재하지 않는 라우트인 척
  return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
}

export async function GET(request) {
  const guard = await ensureDevAccess(request)
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const route = searchParams.get('route')
  const code = searchParams.get('code')
  const username = searchParams.get('username')
  const since = searchParams.get('since')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500)
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

  let q = supabase
    .from('error_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (route) q = q.ilike('route', `${route}%`)
  if (code) q = q.eq('error_code', code)
  if (username) q = q.eq('username', username)
  if (since) q = q.gte('created_at', since)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 코드별 카운트 (대시보드용 — 최근 24시간)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: stats } = await supabase
    .from('error_logs')
    .select('error_code')
    .gte('created_at', since24h)

  const codeStats = {}
  if (Array.isArray(stats)) {
    for (const r of stats) {
      const k = r.error_code || 'UNKNOWN'
      codeStats[k] = (codeStats[k] || 0) + 1
    }
  }

  return Response.json({
    logs: data || [],
    codeStats24h: codeStats,
    env: process.env.NODE_ENV || 'unknown',
  })
}

export async function DELETE(request) {
  const guard = await ensureDevAccess(request)
  if (!guard.ok) return guard.response

  // 추가 안전: 삭제는 jinwoo만 (localhost에서는 OK)
  const auth = await verifyApiAuth(request)
  const isJinwoo = auth.authenticated && auth.user?.username === 'jinwoo'
  if (process.env.NODE_ENV === 'production' && !isJinwoo) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const before = searchParams.get('before')
  if (!id && !before) return Response.json({ error: 'id 또는 before 필요' }, { status: 400 })

  let q = supabase.from('error_logs').delete()
  if (id) q = q.eq('id', id)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q.select('id')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true, deletedCount: (data || []).length })
}
