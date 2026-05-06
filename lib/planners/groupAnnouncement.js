// 단톡방 공지 시리즈 생성 봇.
// D-1 / D-day / D+1 시점별 공지 3개.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'groupAnnouncement'

const DEFAULT_REFERENCES = `=== D-1 공지 예시 ===
"📌 내일 라이브 안내
일시: 내일(목) 저녁 7:30
링크: 단톡방에 30분 전 공지
준비물: 노트와 펜
오늘 자기 전에 ✏️ 공책 한 권 옆에 놓아주세요."

=== D-day 공지 예시 ===
"⏰ 오늘 7:30 라이브 시작!
30분 후 링크 올라갑니다. 미리 단톡방 새로고침 한번 해주세요.
오늘 못 들으시는 분도 다시보기 안내드릴 예정이니 너무 걱정 마세요."

=== D+1 공지 예시 ===
"어제 라이브 잘 들으셨어요? 🙌
- 다시보기 링크: …
- 자료 다운로드: …
- 어제 약속드린 #{혜택}: …
오늘 안에 꼭 받아가세요."`

const DEFAULT_INSTRUCTIONS = `- 3개 시점 모두 작성: D-1(전날 저녁), D-day(시작 30분 전), D+1(다음날 오전)
- 각 공지 200~400자
- 이모지 1~2개로 시각 분리
- 단톡방용 어조 — 친근하지만 정보 명확
- 시간/링크/준비물은 자리표시 [시간], [링크], [혜택]로 두기
- 공지 끝에 항상 다음 행동(action) 명시`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 단톡방 운영 전문가입니다. 무료강의 단톡방에 보낼 D-1 / D-day / D+1 공지 3종을 작성합니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "announcements": [
    { "timing": "D-1", "title": "내일 라이브 안내", "body": "...본문...", "callToAction": "오늘 자기 전에 노트 준비" },
    { "timing": "D-day", "title": "오늘 라이브 시작", "body": "...", "callToAction": "단톡방 새로고침" },
    { "timing": "D+1", "title": "어제 라이브 정리", "body": "...", "callToAction": "자료 다운로드" }
  ]
}`
}

export async function planGroupAnnouncement(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 단톡방 공지 시리즈(D-1 / D-day / D+1) 3종을 작성하세요.\n\n${buildContextMessage(ctx)}\n\nJSON만 출력.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 6000 })
  return { ...result, configSource: source }
}
