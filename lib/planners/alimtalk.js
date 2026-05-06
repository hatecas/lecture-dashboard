// 알림톡 / 채널톡 멘트 생성 봇.
// 슝 알림톡 변수(#{이름}, #{날짜} 등)에 그대로 꽂을 수 있는 본문 + 채널톡 후속 멘트.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'alimtalk'

const DEFAULT_REFERENCES = `=== 알림톡 본문 예시 ===
#{이름}님 안녕하세요, N잡연구소입니다.

오늘(#{날짜}) 저녁 7시 30분, 신청하신 무료강의가 시작됩니다.

📍 강의 링크: 단톡방에 공지드립니다
📍 준비물: 노트와 펜
📍 시간: 약 1시간 30분

오늘 라이브 끝나고 #{혜택}도 함께 안내드릴 예정이에요.
시간 맞춰 들어와주세요.

=== 채널톡 후속 예시 ===
어제 라이브 잘 들으셨어요?
혹시 라이브 못 들으셨거나 궁금한 게 있으시면 편하게 답장 주세요!`

const DEFAULT_INSTRUCTIONS = `- 알림톡 본문은 1000자 이내, 줄바꿈 잘 써서 가독성↑
- 변수는 #{이름}, #{날짜}, #{혜택} 형태로 표기 (슝 알림톡 표준)
- 첫 줄에 발신자(N잡연구소) 명시
- 광고성 표현(%, 할인, !)은 알림톡 정책 위반 — 정보성 어조 유지
- 채널톡 후속 멘트는 짧게(2~3문장), 답장 유도`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 알림톡/채널톡 멘트 작성 전문가입니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "alimtalkBody": "알림톡 본문 (변수 포함, 줄바꿈 \\n으로)",
  "variables": [
    { "name": "#{이름}", "description": "수신자 이름" }
  ],
  "channelFollowup": "채널톡으로 보낼 후속 메시지(2~3문장)"
}`
}

export async function planAlimtalk(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 알림톡 본문과 채널톡 후속 멘트를 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 3500 })
  return { ...result, configSource: source }
}
