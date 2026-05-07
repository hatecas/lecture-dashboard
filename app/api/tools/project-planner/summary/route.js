// 정리봇 API.
// GET  ?sessionId=X            → 해당 (강사,기수)의 기존 정리본 조회 (없으면 null)
// POST { action: 'generate' }  → 자료/컨텍스트 기반 신규 정리본 생성 후 upsert
// POST { action: 'revise', feedback: "..." } → 기존 정리본 + 피드백으로 수정 후 update

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'
import { generateSummary, reviseSummary } from '@/lib/planners/summarize'
import { extractEbookContents } from '@/lib/planners/_text'
import { isNotionUrl, fetchNotionPageAsMarkdown } from '@/lib/integrations/notion'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// 본문 추출 가능한 파일 첨부(PDF/이미지/텍스트)
const EXTRACTABLE_MIME_PREFIXES = ['application/pdf', 'image/', 'text/']
const EXTRACTABLE_MIME_INCLUDES = ['markdown', 'json', 'xml']
function isExtractableFile(att) {
  if (att.file_type === 'link') return false
  const mime = (att.mime_type || '').toLowerCase()
  if (!mime) return false
  return EXTRACTABLE_MIME_PREFIXES.some((p) => mime.startsWith(p))
      || EXTRACTABLE_MIME_INCLUDES.some((s) => mime.includes(s))
}

// 노션 링크 첨부 (file_type==='link' 이면서 URL 도메인이 notion.so/notion.site)
function isNotionLink(att) {
  if (att.file_type !== 'link') return false
  return isNotionUrl(att.file_url)
}

// 노션 링크 배열 → extractEbookContents와 동일 형식으로 변환
//   [{ name, text, error?, truncated? }]
async function extractNotionContents(notionLinks) {
  return await Promise.all(
    notionLinks.map(async (a) => {
      const entry = { name: a.file_name || a.file_url }
      try {
        const r = await fetchNotionPageAsMarkdown(a.file_url)
        if (!r.markdown || !r.markdown.trim()) {
          entry.text = ''
          entry.error = '노션 페이지가 비어있습니다.'
        } else {
          entry.text = r.markdown
          if (r.truncated) entry.truncated = true
        }
      } catch (e) {
        entry.text = ''
        entry.error = e?.message || String(e)
      }
      return entry
    })
  )
}

// instructor_id 조회 (sessionId로부터)
async function getInstructorIdFromSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('instructor_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data?.instructor_id || null
}

// (instructor, session)에 매칭되는 첨부 자료 조회. 강사공통(session_id IS NULL) + 기수전용 둘 다.
async function loadAttachments(instructorId, sessionId) {
  // 자체 DB의 instructor_attachments 스키마: instructor_id + session_id (nullable)
  const { data, error } = await supabase
    .from('instructor_attachments')
    .select('id, file_name, file_url, mime_type, file_type, file_role, description, session_id, instructor_id')
    .eq('instructor_id', instructorId)
    .or(`session_id.eq.${sessionId},session_id.is.null`)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = (searchParams.get('sessionId') || '').trim()
  if (!sessionId) {
    return Response.json({ error: 'sessionId는 필수' }, { status: 400 })
  }

  const instructorId = await getInstructorIdFromSession(sessionId)
  if (!instructorId) return Response.json({ summary: null })

  const { data, error } = await supabase
    .from('instructor_summaries')
    .select('id, content_md, version, updated_by, updated_at, created_at')
    .eq('instructor_id', instructorId)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ summary: data || null })
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) return Response.json({ error: '인증 필요' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })
  }

  let body
  try { body = await request.json() } catch { return Response.json({ error: '잘못된 JSON' }, { status: 400 }) }

  const { action, sessionId, instructor, sessionName, additionalContext = '', feedback = '' } = body

  if (!action || !['generate', 'revise'].includes(action)) {
    return Response.json({ error: 'action은 generate 또는 revise' }, { status: 400 })
  }
  if (!sessionId) return Response.json({ error: 'sessionId 필수' }, { status: 400 })
  if (!instructor) return Response.json({ error: 'instructor 필수' }, { status: 400 })

  const instructorId = await getInstructorIdFromSession(sessionId)
  if (!instructorId) return Response.json({ error: '존재하지 않는 sessionId' }, { status: 404 })

  // revise 모드면 기존 정리본 필수 + feedback 필수
  let currentSummary = null
  if (action === 'revise') {
    if (!feedback || !feedback.trim()) {
      return Response.json({ error: '수정 요청(feedback)이 비어있습니다.' }, { status: 400 })
    }
    const { data: existing } = await supabase
      .from('instructor_summaries')
      .select('id, content_md, version')
      .eq('instructor_id', instructorId)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (!existing || !existing.content_md) {
      return Response.json({ error: '수정할 기존 정리본이 없습니다. 먼저 정리 생성을 해주세요.' }, { status: 400 })
    }
    currentSummary = existing
  }

  // 첨부 자료 로드 + 본문 추출 (파일 + 노션 링크 둘 다)
  let attachments = []
  let extractedTexts = []
  try {
    attachments = await loadAttachments(instructorId, sessionId)
    const extractableFiles = attachments.filter(isExtractableFile)
    const notionLinks = attachments.filter(isNotionLink)

    const [fileTexts, notionTexts] = await Promise.all([
      extractableFiles.length > 0 ? extractEbookContents(extractableFiles) : Promise.resolve([]),
      notionLinks.length > 0 && process.env.NOTION_API_KEY
        ? extractNotionContents(notionLinks)
        : Promise.resolve(notionLinks.map((a) => ({
            name: a.file_name || a.file_url,
            text: '',
            error: process.env.NOTION_API_KEY
              ? '노션 링크 처리 비활성'
              : 'NOTION_API_KEY 미설정 — Vercel/.env.local에 추가 후 재시작',
          }))),
    ])
    extractedTexts = [...fileTexts, ...notionTexts]
  } catch (e) {
    console.error('[summary] 첨부/추출 실패:', e?.message || e)
    // 추출 실패해도 정리는 시도 (메타라도 가지고)
  }

  try {
    let result
    if (action === 'generate') {
      result = await generateSummary({
        instructor,
        sessionName: sessionName || '',
        additionalContext,
        attachments,
        extractedTexts,
      })
    } else {
      result = await reviseSummary({
        instructor,
        sessionName: sessionName || '',
        currentSummary: currentSummary.content_md,
        userFeedback: feedback,
        attachments,
        extractedTexts,
      })
    }

    const newContent = result.content_md
    const newVersion = action === 'revise' ? (currentSummary.version || 1) + 1 : 1

    // upsert
    const { data: upserted, error: upErr } = await supabase
      .from('instructor_summaries')
      .upsert({
        instructor_id: instructorId,
        session_id: sessionId,
        content_md: newContent,
        version: newVersion,
        updated_by: auth.user?.username || 'unknown',
      }, { onConflict: 'instructor_id,session_id' })
      .select('id, content_md, version, updated_by, updated_at, created_at')
      .single()
    if (upErr) {
      console.error('[summary] upsert 실패:', upErr)
      return Response.json({ error: 'DB 저장 실패: ' + upErr.message }, { status: 500 })
    }

    return Response.json({
      success: true,
      summary: upserted,
      action,
      usage: result.usage,
      model: result.model,
      stopReason: result.stopReason,
      attachmentSummary: {
        total: attachments.length,
        extracted: extractedTexts.filter((e) => e.text).length,
        extractFailed: extractedTexts.filter((e) => e.error).length,
      },
    })
  } catch (e) {
    console.error('[summary] 생성 실패:', e)
    return Response.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
