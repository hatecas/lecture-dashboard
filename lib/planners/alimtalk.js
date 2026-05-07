// 채널톡 멘트 생성 봇.
// (참고) 알림톡은 슝 템플릿 시스템에서 별도 관리하므로 이 봇은 채널톡 멘트만 만든다.
// 강사가 채널톡 인입/후속 응대에 그대로 쓸 수 있는 시나리오별 멘트 3종 생성.
// 내부 task key는 호환성을 위해 'alimtalk'로 유지 (DB의 ai_prompts/ai_references 키와 일치).

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'alimtalk'

const DEFAULT_REFERENCES = `=== 시나리오 1: 강의 신청 직후 인입 응답 ===
"안녕하세요, 신청 감사드려요!
이번 라이브에서는 [핵심 주제]를 풀어드릴 예정이에요.
혹시 미리 궁금한 게 있으시면 편하게 답장 주세요. 라이브 때 우선해서 다뤄볼게요 🙌"

=== 시나리오 2: 라이브 후 후속 (D+1) ===
"어제 라이브 어떠셨어요?
중간에 못 들으신 부분이 있으면 말씀해주세요. 다시보기 보내드릴게요.
그리고 강의 들으면서 막힌 부분이 있으면 그것도 답장 주세요 — 케이스별로 도와드릴게요."

=== 시나리오 3: 답장 무응답자 리마인드 (D+3) ===
"혹시 라이브 못 들으셨어요? 😢
바쁘셨으면 다시보기 보내드릴 수 있어요. '다시보기'라고만 답장 주시면 바로 보내드립니다."`

const DEFAULT_INSTRUCTIONS = `- 채널톡은 1:1 실시간 대화 — 길지 않게(150~300자), 답장 유도가 핵심
- 시나리오별로 톤/목적이 달라야 함:
  · 인입 응답: 따뜻하게 환영 + 기대감 + 답장 트리거
  · 후속: 공감 + 케이스별 도움 제안 + 구체적 답장 유형 제시
  · 리마인드: 부담 X, 한 단어 답장으로 리액션 가능하게(예: "다시보기"만 보내달라)
- 광고성 표현(%, 할인, !!) 자제, 정보·관심 어조
- 강사 본인이 보내는 듯한 1인칭 톤 (운영팀 X)
- 변수 사용 X (채널톡은 보통 직접 입력) — 자연스러운 한국어로`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 강사가 채널톡(1:1 메신저)에서 보내는 멘트를 작성하는 전문가입니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 추가 설명 텍스트 절대 금지. 마크다운 코드블록 X.
{
  "messages": [
    { "scenario": "신청 직후 인입 응답", "text": "..." },
    { "scenario": "라이브 후 후속 (D+1)", "text": "..." },
    { "scenario": "답장 무응답자 리마인드 (D+3)", "text": "..." }
  ]
}`
}

export async function planAlimtalk(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 채널톡 멘트를 시나리오 3종으로 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 3000 })
  return { ...result, configSource: source }
}
