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
import { transcribeAudioFromUrl } from '@/lib/integrations/transcribe'
import { logError, classifyAnthropicError } from '@/lib/errorLog'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5분 (Vercel hobby 한도). 진행상황 SSE 표시되므로 여유롭게.

// 첨부 자료 한 개당 본문 한도. Anthropic 입력 토큰 분당 한도(429) 회피 + 비용 절감.
// 80K → 50K 축소 (이전엔 5개 첨부면 400K자 = ~100K토큰 → 한 번에 분당 한도 초과 잦음)
const PER_FILE_CHAR_LIMIT = 50000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// 본문 추출 가능한 파일 첨부(PDF/이미지/텍스트). 오디오는 별도 분기.
const EXTRACTABLE_MIME_PREFIXES = ['application/pdf', 'image/', 'text/']
const EXTRACTABLE_MIME_INCLUDES = ['markdown', 'json', 'xml']
function isExtractableFile(att) {
  if (att.file_type === 'link') return false
  const mime = (att.mime_type || '').toLowerCase()
  if (!mime) return false
  return EXTRACTABLE_MIME_PREFIXES.some((p) => mime.startsWith(p))
      || EXTRACTABLE_MIME_INCLUDES.some((s) => mime.includes(s))
}

// 오디오 첨부 (m4a/mp3/wav 등). MIME으로 우선 판정, 없으면 파일명 확장자로.
const AUDIO_EXT_RE_FILE = /\.(mp3|m4a|mp4a|wav|aac|ogg|oga|flac|aiff?|opus|wma)$/i
function isAudioFile(att) {
  if (att.file_type === 'link') return false
  const mime = (att.mime_type || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  // 일부 케이스는 audio/mp4 → m4a여서 mime이 'audio/'로 시작 안 할 수 있음
  if (mime === 'video/mp4' && /\.m4a$/i.test(att.file_name || '')) return true
  // mime 비어있는 경우 확장자 fallback
  if (!mime && att.file_name && AUDIO_EXT_RE_FILE.test(att.file_name)) return true
  return false
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

      // 첨부 추출/AI 호출 실패를 error_logs DB에 기록 (UI엔 이미 SSE item_error로 표시됨).
      // 에러 로그 조회 페이지에서 발생 원인을 확인할 수 있게.
      const logItemFailure = async (kind, name, err) => {
        try {
          await logError({
            request,
            error: err,
            route: '/api/tools/project-planner/summary',
            method: 'POST',
            username: auth.user?.username,
            errorCode: classifyAnthropicError(err),
            context: {
              phase: 'item_extract',
              itemKind: kind,
              itemName: name,
              instructor,
              sessionId,
              action,
            },
          })
        } catch {/* 로깅 실패는 본 흐름에 영향 X */}
      }

      try {
        send('start', { action })

        // ───── 1. 첨부 추출 (generate만) ─────
        // 자료를 두 카테고리로 분리:
        //  - source: 데이터 소스 (file_role !== 'summary_reference') — 새 정리본의 사실/내용 출처
        //  - reference: 정리본 양식 레퍼런스 (file_role === 'summary_reference') — 양식·구조만 모방
        // (file_role === 'ebook'은 다른 봇용, 정리봇에선 source로 취급)
        let attachments = []
        let sourceExtractedTexts = []
        let referenceExtractedTexts = []
        if (action === 'generate') {
          send('phase', { phase: 'extracting' })
          try {
            attachments = await loadAttachments(instructorId, sessionId)
          } catch (e) {
            console.error('[summary] 첨부 로드 실패:', e?.message || e)
          }

          const referenceAttachments = attachments.filter((a) => a.file_role === 'summary_reference')
          const sourceAttachments = attachments.filter((a) => a.file_role !== 'summary_reference')

          // role별로 따로 처리: 소스는 sourceExtractedTexts에, 레퍼런스는 referenceExtractedTexts에 누적
          const processAttachmentGroup = async (atts, bucket, bucketName) => {
            const extractableFiles = atts.filter(isExtractableFile)
            const audioFiles = atts.filter(isAudioFile)
            const notionLinks = atts.filter(isNotionLink)

            for (const f of extractableFiles) {
              const name = f.file_name
              const itemKind = bucketName === 'reference' ? 'reference-file' : 'file'
              send('item_start', { kind: itemKind, name })
              const start = Date.now()
              try {
                let text = await extractTextFromUrl(f.file_url, f.mime_type, f.file_name)
                if (!text) throw new Error('추출된 텍스트가 비어있습니다.')
                let truncated = false
                if (text.length > PER_FILE_CHAR_LIMIT) {
                  text = text.slice(0, PER_FILE_CHAR_LIMIT)
                  truncated = true
                }
                bucket.push({ name, text, truncated })
                send('item_done', { kind: itemKind, name, charCount: text.length, durationMs: Date.now() - start, truncated })
              } catch (e) {
                const msg = e?.message || String(e)
                bucket.push({ name, text: '', error: msg })
                send('item_error', { kind: itemKind, name, error: msg })
                await logItemFailure(itemKind, name, e)
              }
            }

            // 오디오 파일 (m4a/mp3 등) — Gemini로 받아쓰기
            for (const f of audioFiles) {
              const name = f.file_name
              send('item_start', { kind: 'audio', name })
              try {
                if (!process.env.GEMINI_API_KEY) {
                  throw new Error('GEMINI_API_KEY 미설정 — Vercel/.env.local에 추가 후 재시작 필요')
                }
                const r = await transcribeAudioFromUrl(f.file_url, {
                  displayName: name,
                  mimeType: f.mime_type,
                  onStage: (stage, info) => {
                    send('item_progress', {
                      kind: 'audio', name,
                      stage,
                      bytes: info?.sizeBytes,
                      mode: info?.mode,
                    })
                  },
                })
                let text = r.text
                let truncated = false
                if (text.length > PER_FILE_CHAR_LIMIT) {
                  text = text.slice(0, PER_FILE_CHAR_LIMIT)
                  truncated = true
                }
                bucket.push({ name: `🎵 ${name} (받아쓰기)`, text, truncated })
                send('item_done', {
                  kind: 'audio', name,
                  charCount: text.length,
                  durationMs: r.durationMs,
                  mode: r.mode,
                  truncated,
                })
              } catch (e) {
                const msg = e?.message || String(e)
                bucket.push({ name, text: '', error: msg })
                send('item_error', { kind: 'audio', name, error: msg })
                await logItemFailure('audio', name, e)
              }
            }

            for (const a of notionLinks) {
              const name = a.file_name || a.file_url
              const itemKind = bucketName === 'reference' ? 'reference-notion' : 'notion'
              send('item_start', { kind: itemKind, name })
              const start = Date.now()
              try {
                if (!process.env.NOTION_API_KEY) {
                  throw new Error('NOTION_API_KEY 미설정 — .env.local 또는 Vercel env에 추가 후 재시작')
                }
                const r = await fetchNotionPageAsMarkdown(a.file_url, {
                  onProgress: ({ count }) => send('item_progress', { kind: itemKind, name, blocks: count }),
                  onAudioProgress: (info) => {
                    const audioName = `🎵 ${info.name} (in ${name})`
                    if (info.status === 'start') send('item_start', { kind: 'audio', name: audioName })
                    else if (info.status === 'progress') send('item_progress', { kind: 'audio', name: audioName, stage: info.stage, bytes: info.bytes, mode: info.mode })
                    else if (info.status === 'done') send('item_done', { kind: 'audio', name: audioName, charCount: info.charCount, durationMs: info.durationMs, mode: info.mode })
                    else if (info.status === 'error') send('item_error', { kind: 'audio', name: audioName, error: info.error })
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
                bucket.push({ name, text, truncated })
                send('item_done', {
                  kind: itemKind, name,
                  charCount: text.length,
                  blocks: r.blockCount,
                  durationMs: Date.now() - start,
                  truncated,
                  audioCount: r.audioCount || 0,
                  audioOk: r.audioOk || 0,
                })
              } catch (e) {
                const msg = e?.message || String(e)
                bucket.push({ name, text: '', error: msg })
                send('item_error', { kind: itemKind, name, error: msg })
                await logItemFailure(itemKind, name, e)
              }
            }
          }

          // 소스 먼저 (시간 더 걸리는 무거운 자료) → 그 다음 레퍼런스
          await processAttachmentGroup(sourceAttachments, sourceExtractedTexts, 'source')
          await processAttachmentGroup(referenceAttachments, referenceExtractedTexts, 'reference')
        }

        // ───── 2. AI 정리/수정 ─────
        send('phase', { phase: 'ai_writing' })
        send('ai_start', {})
        const aiStart = Date.now()
        let result
        if (action === 'generate') {
          const sourceAttachmentsForAI = attachments.filter((a) => a.file_role !== 'summary_reference')
          const referenceAttachmentsForAI = attachments.filter((a) => a.file_role === 'summary_reference')
          result = await generateSummary({
            instructor,
            sessionName: sessionName || '',
            additionalContext,
            sourceAttachments: sourceAttachmentsForAI,
            sourceExtractedTexts,
            referenceAttachments: referenceAttachmentsForAI,
            referenceExtractedTexts,
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
        const logged = await logError({
          request,
          error: e,
          route: '/api/tools/project-planner/summary',
          method: 'POST',
          username: auth.user?.username,
          errorCode: classifyAnthropicError(e),
          context: { phase: 'stream', action, instructor, sessionId },
        })
        send('fatal', { message: logged.userMessage, errorId: logged.id, rawMessage: e?.message || String(e) })
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
