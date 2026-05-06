import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'
import { planners, PLANNER_META } from '@/lib/planners'
import { extractEbookContents } from '@/lib/planners/_text'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabaseSelf = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// 전자책 파일을 입력으로 받는 task 목록.
// 새 봇이 전자책을 입력으로 쓰려면 여기에 추가하면 자동으로 텍스트 추출됨.
const TASKS_NEEDING_EBOOK = new Set(['ebook'])

// POST /api/tools/project-planner
// body: {
//   instructor: string,
//   sessionName?: string,
//   topic: string,
//   additionalContext?: string,
//   enabledTasks: string[]  // PLANNER_META keys (예: ['ebook'])
// }
// 응답: { success, results: { [taskKey]: { ok, plan|error, usage?, durationMs } } }
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '잘못된 JSON' }, { status: 400 })
  }

  const {
    instructor,
    sessionName,
    sessionId,           // 신규: 전자책 첨부 조회용
    topic,
    additionalContext,
    enabledTasks = [],
  } = body

  if (!instructor || typeof instructor !== 'string') {
    return Response.json({ error: 'instructor는 필수' }, { status: 400 })
  }
  if (!topic || typeof topic !== 'string') {
    return Response.json({ error: 'topic은 필수' }, { status: 400 })
  }
  if (!Array.isArray(enabledTasks) || enabledTasks.length === 0) {
    return Response.json({ error: '최소 하나의 기획 항목을 선택하세요 (enabledTasks)' }, { status: 400 })
  }

  // 활성화 안 된 / 모르는 task 거름
  const validTasks = []
  const skipped = {}
  for (const t of enabledTasks) {
    if (!planners[t]) {
      skipped[t] = '미구현 또는 알 수 없는 항목'
      continue
    }
    if (PLANNER_META[t] && PLANNER_META[t].enabled === false) {
      skipped[t] = '준비 중'
      continue
    }
    validTasks.push(t)
  }

  if (validTasks.length === 0) {
    return Response.json({
      error: '실행 가능한 기획 항목이 없습니다.',
      skipped,
    }, { status: 400 })
  }

  const context = {
    instructor: instructor.trim(),
    sessionName: (sessionName || '').trim(),
    topic: topic.trim(),
    additionalContext: (additionalContext || '').trim(),
  }

  // 전자책 입력이 필요한 task가 하나라도 있으면 첨부에서 텍스트 추출.
  let ebookContents = []
  let ebookExtractionMessages = []
  const needsEbook = validTasks.some((t) => TASKS_NEEDING_EBOOK.has(t))
  if (needsEbook && sessionId) {
    try {
      const { data: ebookRows, error } = await supabaseSelf
        .from('instructor_attachments')
        .select('id, file_name, file_url, mime_type, file_type, file_role')
        .eq('session_id', sessionId)
        .eq('file_role', 'ebook')
      if (error) throw error
      if (ebookRows && ebookRows.length > 0) {
        ebookContents = await extractEbookContents(ebookRows)
        ebookExtractionMessages = ebookContents
          .filter((e) => e.error)
          .map((e) => `${e.name}: ${e.error}`)
      }
    } catch (e) {
      console.error('전자책 텍스트 추출 실패:', e)
      ebookExtractionMessages.push('전자책 조회 실패: ' + (e?.message || e))
    }
  }

  // 전자책이 필수인 task에서 실제로 추출된 본문이 0이면 fail-fast.
  const ebookOk = ebookContents.some((e) => e.text && e.text.trim())
  // 진단: 첨부는 있는데 추출이 모두 실패한 케이스(예: pdf-parse 모듈 누락)와
  // 첨부 자체가 없는 케이스를 구분해서 사용자에게 알린다.
  const ebookHasRows = ebookContents.length > 0
  const ebookFailureReason = needsEbook
    ? (ebookHasRows && !ebookOk
        ? `전자책 파일은 있으나 텍스트 추출 실패. 원인: ${ebookExtractionMessages.join(' | ') || '알 수 없음'}`
        : !ebookHasRows
          ? '전자책 원문이 필요합니다. 자료 업로드 영역에서 [📚 전자책]으로 강사 전자책 PDF/텍스트를 먼저 추가해주세요.'
          : null)
    : null

  // 병렬 실행. 한 항목 실패가 다른 항목 실패로 번지지 않게 각자 try/catch.
  const settled = await Promise.all(
    validTasks.map(async (taskKey) => {
      const start = Date.now()
      try {
        const taskContext = { ...context }
        if (TASKS_NEEDING_EBOOK.has(taskKey)) {
          if (!ebookOk) {
            throw new Error(ebookFailureReason || '전자책 원문이 필요합니다.')
          }
          taskContext.ebookContents = ebookContents
        }
        const { plan, usage, model } = await planners[taskKey](taskContext)
        return {
          task: taskKey,
          ok: true,
          plan,
          usage,
          model,
          durationMs: Date.now() - start,
        }
      } catch (err) {
        return {
          task: taskKey,
          ok: false,
          error: err?.message || String(err),
          durationMs: Date.now() - start,
        }
      }
    })
  )

  const results = {}
  for (const r of settled) results[r.task] = r

  return Response.json({
    success: true,
    results,
    skipped,
    requested: enabledTasks,
    executed: validTasks,
    ebookSummary: needsEbook ? {
      count: ebookContents.length,
      successCount: ebookContents.filter(e => e.text && e.text.trim()).length,
      issues: ebookExtractionMessages,
      truncated: ebookContents.some(e => e.truncated),
    } : null,
  })
}
