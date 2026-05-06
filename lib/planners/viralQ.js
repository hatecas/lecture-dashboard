// 바이럴 질문 생성 봇.
// 단톡방/오픈톡에서 참여를 끌어내는 질문 10개.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'viralQ'

const DEFAULT_REFERENCES = `=== 좋은 바이럴 질문 예시 ===
[경험 공유형]
"지금까지 시도해본 부업 중에 제일 후회되는 건 뭐였어요?"

[갈등 노출형]
"월급 200으로 평생 살 vs 월급 0이지만 자기 사업 — 어느 쪽이세요?"

[수치 자극형]
"한 달에 얼마 벌면 회사 그만둘 수 있다고 생각하세요? 댓글로 적어주세요."

[자기진단형]
"오늘 하루 핸드폰 화면 시간 몇 시간 나왔어요? 솔직하게."

[양자택일형]
"AI한테 일자리 뺏긴다 vs 내가 AI를 쓰는 사람이 된다 — 뭐가 더 현실적?"`

const DEFAULT_INSTRUCTIONS = `- 총 10개. 카테고리는 경험 공유형/갈등 노출형/수치 자극형/자기진단형/양자택일형/관찰형 등을 골고루
- 각 질문 30~80자
- "여러분 어떠세요?" 같은 닳은 형태 금지
- 댓글/답장 유도가 명확한 구체적 질문
- 부정적/공격적 톤 X. 호기심·자기반성 자극`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 단톡방 운영 전문가입니다. 강의 주제와 관련된 바이럴 질문 10개를 작성합니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "questions": [
    { "category": "경험 공유형", "text": "..." },
    { "category": "갈등 노출형", "text": "..." }
  ]
}`
}

export async function planViralQ(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의 주제 단톡방에서 쓸 바이럴 질문 10개를 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력. questions 배열에 정확히 10개.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 3500 })
  return { ...result, configSource: source }
}
