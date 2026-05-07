// 정리봇 API.
// GET  ?sessionId=X            → 해당 (강사,기수)의 기존 정리본 조회 (없으면 null) — JSON
// POST { action: 'generate' }  → SSE 스트림. 자료 추출 + 정리 + 저장 진행상황 실시간 푸시
// POST { action: 'revise', feedback: "..." } → SSE 스트림. 기존 정리본 + 피드백으로 수정
//
// SSE 이벤트:
//   start         { action }
//   phase         { phase: 'extracting' | 'ai_writing' | 'saving' | 'done' }
//   item_start    { kind: 'file' | 'notion', name }
//   item_progress { kind, name, blocks?, chars? }
//   item_done     { kind, name, charCount, durationMs }
//   item_error    { kind, name, error }
//   ai_start      {}
//   ai_done       { durationMs }
//   result        { summary }    ← 최종 저장된 row
//   fatal         { message }

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'
import { generateSummary, reviseSummary } from '@/lib/planners/summarize'
import { extractTextFromUrl } from '@/lib/planners/_text'
import { isNotionUrl, fetchNotionPageAsMarkdown } from '@/lib/integrations/notion'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5분 (Vercel hobby 한도). 진행상황 SSE 표시되므로 여유롭게.

const PER_FILE_CHAR_LIMIT = 80000

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

  // SSE 스트림 시작
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event, data) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`))
        } catch {}
      }

      try {
        send('start', { action })

        // ───── 1. 첨부 추출 (generate만) ─────
        let attachments = []
        let extractedTexts = []
        if (action === 'generate') {
          send('phase', { phase: 'extracting' })
          try {
            attachments = await loadAttachments(instructorId, sessionId)
          } catch (e) {
            console.error('[summary] 첨부 로드 실패:', e?.message || e)
          }

          const extractableFiles = attachments.filter(isExtractableFile)
          const notionLinks = attachments.filter(isNotionLink)

          // 1a. 파일 추출 (PDF/이미지/텍스트) — Gemini OCR 통과
          for (const f of extractableFiles) {
            const name = f.file_name
            send('item_start', { kind: 'file', name })
            const start = Date.now()
            try {
              let text = await extractTextFromUrl(f.file_url, f.mime_type, f.file_name)
              if (!text) throw new Error('추출된 텍스트가 비어있습니다.')
              let truncated = false
              if (text.length > PER_FILE_CHAR_LIMIT) {
                text = text.slice(0, PER_FILE_CHAR_LIMIT)
                truncated = true
              }
              extractedTexts.push({ name, text, truncated })
              send('item_done', { kind: 'file', name, charCount: text.length, durationMs: Date.now() - start, truncated })
            } catch (e) {
              const msg = e?.message || String(e)
              extractedTexts.push({ name, text: '', error: msg })
              send('item_error', { kind: 'file', name, error: msg })
            }
          }

          // 1b. 노션 링크 추출 — 페이지 블록 카운트 실시간 푸시
          for (const a of notionLinks) {
            const name = a.file_name || a.file_url
            send('item_start', { kind: 'notion', name })
            const start = Date.now()
            try {
              if (!process.env.NOTION_API_KEY) {
                throw new Error('NOTION_API_KEY 미설정 — .env.local 또는 Vercel env에 추가 후 재시작')
              }
              const r = await fetchNotionPageAsMarkdown(a.file_url, {
                onProgress: ({ count }) => {
                  send('item_progress', { kind: 'notion', name, blocks: count })
                },
              })
              if (!r.markdown || !r.markdown.trim()) {
                throw new Error('노션 페이지가 비어있거나 본문이 없습니다.')
              }
              let text = r.markdown
              let truncated = r.truncated || false
              if (text.length > PER_FILE_CHAR_LIMIT) {
                text = text.slice(0, PER_FILE_CHAR_LIMIT)
                truncated = true
              }
              extractedTexts.push({ name, text, truncated })
              send('item_done', { kind: 'notion', name, charCount: text.length, blocks: r.blockCount, durationMs: Date.now() - start, truncated })
            } catch (e) {
              const msg = e?.message || String(e)
              extractedTexts.push({ name, text: '', error: msg })
              send('item_error', { kind: 'notion', name, error: msg })
            }
          }
        }

        // ───── 2. AI 정리/수정 ─────
        send('phase', { phase: 'ai_writing' })
        send('ai_start', {})
        const aiStart = Date.now()
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
          })
        }
        send('ai_done', { durationMs: Date.now() - aiStart })

        // ───── 3. DB 저장 ─────
        send('phase', { phase: 'saving' })
        const newContent = result.content_md
        const newVersion = action === 'revise' ? (currentSummary.version || 1) + 1 : 1
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
          throw new Error('DB 저장 실패: ' + upErr.message)
        }

        send('phase', { phase: 'done' })
        send('result', { summary: upserted })
      } catch (e) {
        console.error('[summary] 스트림 실패:', e)
        send('fatal', { message: e?.message || String(e) })
      } finally {
        closed = true
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
