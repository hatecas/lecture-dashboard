// Notion 페이지 → markdown 변환 라우트.
// GET ?url=<notion url>
// 인증 필요. 정리봇이 내부 호출용으로 쓰지만 단독 테스트도 가능.

import { verifyApiAuth } from '@/lib/apiAuth'
import { fetchNotionPageAsMarkdown, isNotionUrl } from '@/lib/integrations/notion'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.NOTION_API_KEY) {
    return Response.json({
      error: 'NOTION_API_KEY 환경변수가 설정되지 않았습니다. .env.local 또는 Vercel Settings에 추가 후 재시작/재배포 하세요.',
    }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const url = (searchParams.get('url') || '').trim()
  if (!url) {
    return Response.json({ error: 'url 쿼리 파라미터 필수' }, { status: 400 })
  }
  if (!isNotionUrl(url)) {
    return Response.json({ error: 'Notion URL이 아닙니다 (notion.so / notion.site만 지원)' }, { status: 400 })
  }

  try {
    const result = await fetchNotionPageAsMarkdown(url)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
