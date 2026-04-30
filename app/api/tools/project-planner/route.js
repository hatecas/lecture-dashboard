import { verifyApiAuth } from '@/lib/apiAuth'
import { planners, PLANNER_META } from '@/lib/planners'

export const runtime = 'nodejs'
export const maxDuration = 120

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

  // 병렬 실행. 한 항목 실패가 다른 항목 실패로 번지지 않게 각자 try/catch.
  const settled = await Promise.all(
    validTasks.map(async (taskKey) => {
      const start = Date.now()
      try {
        const { plan, usage, model } = await planners[taskKey](context)
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
  })
}
