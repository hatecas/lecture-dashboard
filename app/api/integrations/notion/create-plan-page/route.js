// 프로젝트 기획 봇 결과(PPT outline / 전자책 기획안 / etc)를 그대로 받아 노션 DB에 페이지 생성.
// create-meeting-report와 다른 점:
//  - sessionId/DB 조회 X — 클라이언트가 만든 title + markdown을 그대로 받음.
//  - 그래서 어떤 봇 결과든 generic하게 처리 가능 (PPT outline에서 시작했지만 향후 모든 봇 결과에 재활용).
//
// POST { title, markdown }
//   title: string (페이지 이름, 노션 "이름" 컬럼 — title 타입 가정)
//   markdown: string (페이지 본문 — markdownToNotionBlocks가 변환)
//
// 응답: { success, url, pageId, blockCount, truncated }
//
// 필요 env:
//   - NOTION_API_KEY
//   - NOTION_MEETING_DATABASE_ID (정리본/봇 결과 같은 DB 공유)

import { verifyApiAuth } from '@/lib/apiAuth'
import { createMeetingReportPage, parseNotionDatabaseId } from '@/lib/integrations/notion-write'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const title = (body.title || '').trim()
  const markdown = (body.markdown || '').trim()
  if (!title) return Response.json({ error: 'title 필수' }, { status: 400 })
  if (!markdown) return Response.json({ error: 'markdown 필수' }, { status: 400 })

  try {
    const result = await createMeetingReportPage({
      databaseId,
      title,
      markdown,
      extraProperties: {},
    })

    return Response.json({
      success: true,
      url: result.url,
      pageId: result.pageId,
      blockCount: result.blockCount,
      truncated: result.truncated,
    })
  } catch (e) {
    return Response.json({
      error: e?.message || String(e),
    }, { status: 500 })
  }
}
