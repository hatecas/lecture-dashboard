// 채널톡 멘트 생성 봇.
// (참고) 알림톡은 슝 템플릿 시스템에서 별도 관리하므로 이 봇은 채널톡 멘트만 만든다.
// 강사가 채널톡(1:1 메신저)에서 그대로 보낼 수 있는 단일 멘트 1개 생성.
// 양식은 어드민이 기획 봇 설정 → 채널톡 멘트 → 레퍼런스에 등록한 모범 사례를 따라감.
// 내부 task key는 호환성을 위해 'alimtalk'로 유지 (DB의 ai_prompts/ai_references 키와 일치).

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'alimtalk'

const DEFAULT_REFERENCES = `=== 채널톡 멘트 모범 사례 ===
"안녕하세요, 신청 감사드려요!
이번 라이브에서는 [핵심 주제]를 풀어드릴 예정이에요.
혹시 미리 궁금한 게 있으시면 편하게 답장 주세요. 라이브 때 우선해서 다뤄볼게요 🙌"`

const DEFAULT_INSTRUCTIONS = `- 채널톡은 1:1 실시간 대화 — 길지 않게(150~400자), 답장 유도가 핵심
- 광고성 표현(%, 할인, !!) 자제, 정보·관심 어조
- 강사 본인이 보내는 듯한 1인칭 톤 (운영팀 X)
- 레퍼런스에 이모지(🙌 ✅ ⚠️ 등)가 있으면 같은 톤으로 자연스럽게 사용
- #{변수}가 레퍼런스에 있으면 같은 자리에 그대로 보존 (운영팀이 채움)`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 강사가 채널톡(1:1 메신저)에서 보내는 멘트를 작성하는 전문가입니다.

== 참고 모범 사례 (양식·톤·구조 모방 대상) ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 추가 설명 텍스트 절대 금지. 마크다운 코드블록 X.
{
  "fullText": "채널톡에 그대로 복붙 가능한 멘트 본문 한 덩어리",
  "placeholders": ["채워지지 않은 #{...} 자리표시자 목록 (없으면 빈 배열)"]
}`
}

export async function planAlimtalk(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 채널톡 멘트를 위 모범 사례 양식대로 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력. 자료에 없는 정보는 #{...} 자리표시자 그대로 두세요.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 2500 })
  return { ...result, configSource: source }
}
