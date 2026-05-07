// 사전 점검(precheck) — 본 생성 전에 입력이 충분한지 빠르게 평가하고
// 부족하면 강사에게 물어볼 질문 2~4개를 제안한다.
// Sonnet 4.6 한 번 호출(consolidated): 선택된 모든 봇의 요구사항을 묶어서 한 번에 검토.
// 응답시간 ~2~4초 목표. 실패 시 클라이언트는 점검을 건너뛰고 곧장 본 생성으로 넘어감.

import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'
import { planners, PLANNER_META } from '@/lib/planners'
import { callPlannerLLM } from '@/lib/planners/_anthropic'

export const runtime = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// 봇별로 차별성 있는 결과물에 필요한 자료. 사전 점검 시스템 프롬프트에 들어감.
const BOT_REQUIREMENTS = {
  ebook:             '강사가 제공한 전자책 PDF/텍스트 원문(필수), 강사 본인의 시행착오·수치 사례, 일반론과 다른 차별 인사이트',
  boomUp:            '강사 1인칭 화법 톤 샘플(반말/존댓말/이모지 빈도), 라이브 일시·링크, 강의 차별점 한두 줄',
  alimtalk:          '강사가 채널톡에서 평소 쓰는 어조 샘플, 강사가 보통 답장 유도하는 시나리오(인입/후속/리마인드 등)',
  viralQ:            '청중 페르소나(직업/소득대/연령/관심사), 단톡방 분위기(친근/공식), 강의 주제와 연결되는 청중 고민',
  ppt:               '강사 본인의 구체적 시행착오 사례, 매출/구독자 등 수치 자료, 전후 비교(Before/After) 가능한 케이스',
  salesPage:         '강사 수익 인증/수강생 후기/사회적 증거 자료, 정규 강의 커리큘럼 미리보기, 가격/혜택 스펙',
  groupAnnouncement: '라이브 일시(KST), 자료 다운로드/다시보기 링크 형태, 단톡방 운영 톤 샘플',
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })
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
    sessionId,
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
    return Response.json({ error: '점검할 항목이 없습니다.' }, { status: 400 })
  }

  const validTasks = enabledTasks.filter(
    (t) => planners[t] && PLANNER_META[t]?.enabled !== false
  )
  if (validTasks.length === 0) {
    return Response.json({ error: '실행 가능한 항목이 없습니다.' }, { status: 400 })
  }

  // 전자책 첨부 개수 (메타만 본다, 본문 추출은 본 생성에서)
  let ebookAttachmentCount = 0
  if (sessionId && validTasks.includes('ebook')) {
    try {
      const { count } = await supabase
        .from('instructor_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('file_role', 'ebook')
      ebookAttachmentCount = count || 0
    } catch (e) {
      console.warn('[precheck] ebook 첨부 조회 실패:', e?.message)
    }
  }

  // 정리봇 정리본이 있으면 ready 판단에 반영 (정리본 충실하면 ready=true 비중↑)
  let hasSummary = false
  let summaryLength = 0
  if (sessionId) {
    try {
      const { data: sumRow } = await supabase
        .from('instructor_summaries')
        .select('content_md')
        .eq('session_id', sessionId)
        .maybeSingle()
      if (sumRow?.content_md && sumRow.content_md.trim()) {
        hasSummary = true
        summaryLength = sumRow.content_md.length
      }
    } catch (e) {
      console.warn('[precheck] 정리본 조회 실패:', e?.message)
    }
  }

  const botNeeds = validTasks
    .map((t) => `- [${PLANNER_META[t]?.label || t}]: ${BOT_REQUIREMENTS[t] || '(특별 요구사항 없음)'}`)
    .join('\n')

  const systemPrompt = `당신은 N잡연구소 강사 자료 검토 담당자입니다. 강사가 제공한 입력으로 선택된 기획 항목들을 만들기에 충분한지 빠르게 평가하고, 부족한 경우 강사에게 직접 물어볼 질문 2~4개를 제안합니다.

== 이번에 만들어야 할 항목 + 각 항목이 필요한 자료 ==
${botNeeds}

== 평가 원칙 ==
- 강사명·기수·주제만으로도 일반론적 카피는 만들 수 있지만, 차별화·진정성 있는 결과물에는 강사 본인의 1인칭 경험·구체 수치·톤 샘플이 필요합니다.
- 위에 나열된 각 항목의 핵심 자료가 부족하면 ready=false로 판정.
- "추가 컨텍스트"가 충실하거나 첨부 자료가 풍부하면 ready=true도 가능. 단, 단순히 강사명·주제만 있으면 false로 보세요.
- 전자책 봇이 선택됐는데 전자책 첨부가 0개면 무조건 ready=false (전자책 원문이 핵심 자료).
- "[강사 자료 정리본]"이 함께 제공된다면 그 안의 강사 프로필·페르소나·인사이트·톤 샘플을 우선 참고. 정리본이 충실하면 ready=true 가능성↑.

== 질문 작성 규칙 ==
- 강사가 직접 답하기 좋게 구체적이고 답변 가능한 형태(50자 이내).
- "차별점은 무엇인가요?" 같은 추상적 질문 금지.
- 좋은 예: "강사 본인이 이 분야에서 가장 크게 시행착오 겪은 사례 1개?", "청중은 주로 어떤 직업·소득대인가요?", "라이브 종료 후 어떤 결제 상품으로 연결되나요?"
- 모든 봇에 두루 도움 될 질문 우선. 봇별로 중복되는 정보를 묻지 마세요.

== 출력 형식 ==
반드시 JSON 하나만 출력. 마크다운 코드블록 X. 추가 설명 텍스트 X.
{
  "ready": true,
  "summary": "현재 입력 평가 한 줄 (예: '주제와 강사명만 있고 차별점 자료 부재')",
  "questions": [
    "강사에게 물어볼 구체적 질문 1",
    "질문 2",
    "질문 3"
  ]
}

ready=true면 questions=[] (빈 배열). ready=false면 questions에 2~4개.`

  const userMessage = `다음 입력을 검토하세요.

강사: ${instructor}
강의/기수: ${sessionName || '미정'}
주제: ${topic}
${additionalContext ? `\n[추가 컨텍스트]\n${additionalContext}` : '\n[추가 컨텍스트] (없음)'}
${validTasks.includes('ebook')
  ? `\n[전자책 첨부] ${ebookAttachmentCount > 0 ? `${ebookAttachmentCount}개 첨부됨` : '없음 (전자책 봇 사용 시 필수)'}`
  : ''}
${hasSummary
  ? `\n[강사 자료 정리본] ${summaryLength}자 분량 존재 (별도 정리봇으로 만들어둠 — 본 생성 시 자동 주입됨)`
  : '\n[강사 자료 정리본] 없음 (정리봇으로 만들면 모든 봇 결과물 품질↑)'}

위 입력으로 위에 나열된 기획 항목들을 만들기에 충분한지 판단. JSON만 출력.`

  try {
    const result = await callPlannerLLM({
      systemPrompt,
      userMessage,
      maxTokens: 1500,
    })
    const plan = result.plan || {}
    return Response.json({
      success: true,
      ready: plan.ready === true,
      summary: typeof plan.summary === 'string' ? plan.summary : '',
      questions: Array.isArray(plan.questions) ? plan.questions.filter((q) => typeof q === 'string' && q.trim()) : [],
      executed: validTasks,
      model: result.model,
      usage: result.usage,
    })
  } catch (e) {
    console.error('[precheck] 실패:', e)
    return Response.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
