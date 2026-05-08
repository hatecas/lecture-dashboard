// 정리봇 결과를 노션 강사미팅 기록 데이터베이스에 새 페이지로 자동 생성.
// POST { sessionId } — 해당 세션의 저장된 정리본을 노션에 push.
//
// 필요 env:
//  - NOTION_API_KEY (이미 있음)
//  - NOTION_MEETING_DATABASE_ID (신규) — '강사미팅 기록' 데이터베이스 ID
//
// 통합 권한:
//  - 콘텐츠 읽기 + 콘텐츠 삽입 + 콘텐츠 업데이트 (notion.so/my-integrations에서)
//  - 데이터베이스도 통합과 '연결' 되어있어야 함

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'
import { createMeetingReportPage, parseNotionDatabaseId } from '@/lib/integrations/notion-write'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.NOTION_API_KEY) {
    return Response.json({
      error: 'NOTION_API_KEY 미설정. .env.local 또는 Vercel Settings에 추가하고 재배포/재시작 하세요.',
    }, { status: 500 })
  }

  const databaseIdRaw = (process.env.NOTION_MEETING_DATABASE_ID || '').trim()
  if (!databaseIdRaw) {
    return Response.json({
      error: 'NOTION_MEETING_DATABASE_ID 미설정. .env.local 및 Vercel Settings에 강사미팅 기록 DB ID를 추가하세요.',
    }, { status: 500 })
  }
  const databaseId = parseNotionDatabaseId(databaseIdRaw)
  if (!databaseId) {
    return Response.json({
      error: `NOTION_MEETING_DATABASE_ID 형식 오류 (${databaseIdRaw}). 32자 hex 또는 UUID여야 합니다.`,
    }, { status: 500 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '잘못된 JSON' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) {
    return Response.json({ error: 'sessionId는 필수' }, { status: 400 })
  }

  // 1) 세션에서 강사 정보 + 정리본 조회
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('id, instructor_id, session_name, instructors(name)')
    .eq('id', sessionId)
    .maybeSingle()
  if (sessErr || !session) {
    return Response.json({
      error: `세션 조회 실패: ${sessErr?.message || '세션을 찾을 수 없습니다.'}`,
    }, { status: 404 })
  }
  const instructorName = session.instructors?.name || '(강사명 미상)'

  const { data: summary, error: sumErr } = await supabase
    .from('instructor_summaries')
    .select('id, content_md, version, updated_at')
    .eq('instructor_id', session.instructor_id)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (sumErr || !summary || !summary.content_md) {
    return Response.json({
      error: '정리본을 찾을 수 없습니다. 먼저 정리봇으로 정리본을 생성해주세요.',
    }, { status: 400 })
  }

  // 2) 페이지 제목
  const title = `[${instructorName}] 미팅 보고서`

  // 3) 노션 페이지 생성
  try {
    const result = await createMeetingReportPage({
      databaseId,
      title,
      markdown: summary.content_md,
      extraProperties: {
        // 담당PM/진행사항/상태는 일단 비워둠 — 사용자가 노션에서 수동 지정
      },
    })

    return Response.json({
      success: true,
      url: result.url,
      pageId: result.pageId,
      title,
      blockCount: result.blockCount,
      truncated: result.truncated,
      version: summary.version,
    })
  } catch (e) {
    return Response.json({
      error: e?.message || String(e),
    }, { status: 500 })
  }
}
