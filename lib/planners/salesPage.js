// 무료 상페 카피 생성 봇.
// 무료강의 상세페이지 섹션별 카피.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'salesPage'

const DEFAULT_REFERENCES = `=== 무료강의 상페 구조 예시 ===
[히어로 카피]
"월급 빼고 월 500, 1년 만에 만든 방법"
"매일 1시간만 쓰면 됩니다."

[Pain — 문제 정의]
"이런 거 하고 계시지 않으세요?
- 유튜브 보면서 따라하다가 두 달 만에 포기
- ChatGPT는 쓰는데 돈은 안 벌리는…"

[Promise — 약속]
"이 강의 끝나면, 첫 수익까지 가는 가장 짧은 길을 알게 됩니다."

[Proof — 증거]
"강사 본인 수익 인증 + 수강생 후기 3개"

[Plan — 구체 커리큘럼 미리보기]
"1주차: …, 2주차: …"

[CTA]
"무료강의 신청하고 자료 받기 →"`

const DEFAULT_INSTRUCTIONS = `- 후킹은 첫 1초가 결정 — 히어로 카피는 15자 이내 + 보조 카피 한 줄
- Pain은 구체적 행동/감정 묘사 (추상적 X)
- Promise는 시간/결과를 수치로
- Proof는 강사가 제공한 자료 안에서만 인용 (없으면 자리표시 [수치])
- 광고심의 위반 표현 금지: "100% 보장", "절대", "최고", 수치 과장
- 전체 길이: 모바일 1스크롤로 흐름 파악 가능하게`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 무료강의 상세페이지 카피라이터입니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "headline": "메인 카피 (15자 이내)",
  "subheadline": "보조 카피 한 줄",
  "painPoints": ["수강생이 겪는 구체적 문제 1", "문제 2", "문제 3"],
  "promise": "이 강의가 약속하는 결과 (구체 수치 포함)",
  "proof": "강사 신뢰 근거 — 자료에 있는 수치/사례 위주",
  "curriculumPreview": [
    { "session": "1주차", "title": "...", "preview": "..." }
  ],
  "cta": "버튼 카피 + 보조 안내"
}`
}

export async function planSalesPage(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 무료강의 상페 카피를 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 5000 })
  return { ...result, configSource: source }
}
