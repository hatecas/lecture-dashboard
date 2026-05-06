// 붐업 멘트(스타일별) 생성 봇.
// 단톡방/라이브 시작 직전 분위기 띄우는 멘트 3종(친근형/도발형/정보형) 생성.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'boomUp'

const DEFAULT_REFERENCES = `=== 친근형 예시 ===
"여러분~ 오늘 저녁 7시 30분 라이브에서 만나요!
저번에 약속드린 그 자료, 오늘 다 풀어드릴게요. 노트랑 펜 준비해주세요 ✏️"

=== 도발형 예시 ===
"솔직히 말해서, 오늘 라이브 안 들으시면 손해예요.
다른 데서는 절대 못 듣는 이야기 30분 안에 다 풀어드립니다."

=== 정보형 예시 ===
"📌 오늘 7:30 라이브 미리보기
1) 왜 90%가 첫 달에 그만두는지
2) 제가 직접 깨진 케이스 3건
3) 진짜 살아남은 사람들의 공통점"`

const DEFAULT_INSTRUCTIONS = `- 각 멘트 80~150자
- 친근형: 이모지 1~2개, 반말체 X, 존댓말 + 친근한 어투
- 도발형: 통념을 뒤집는 한 줄로 시작, 자극적이되 광고 멘트 X
- 정보형: 번호/불릿로 미리보기, 구체적 키워드 노출
- 모두 "지금 바로!", "꼭 보세요!" 같은 닳은 표현 금지`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 강사가 단톡방/라이브 직전에 보내는 붐업 멘트를 작성하는 전문가입니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 추가 설명 텍스트 절대 금지. 마크다운 코드블록 X.
{
  "messages": [
    { "style": "친근형", "text": "..." },
    { "style": "도발형", "text": "..." },
    { "style": "정보형", "text": "..." }
  ]
}`
}

export async function planBoomUp(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 붐업 멘트를 작성하세요.\n\n${buildContextMessage(ctx)}\n\n위 정보 기반으로 친근형/도발형/정보형 3종을 모두 작성. JSON만 출력.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 1500 })
  return { ...result, configSource: source }
}
