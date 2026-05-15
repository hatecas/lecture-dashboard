// 붐업 멘트(스타일별) 생성 봇.
// 단톡방/라이브 시작 직전 분위기 띄우는 멘트 3종(친근형/도발형/정보형) 생성.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'boomUp'

const DEFAULT_REFERENCES = `=== 친근형 (짧은 후크형) ===
🔓 (LIVE) 지금 들어오신 분들만 드릴게요..🤫
💰20분 만에 알고리즘 타는 영상 만들어 → 월 2천
⚡라이브 참여자 한정 특별 혜택
✔️ AI 사이트 체험권 (🎁추첨)
✔️ 전자책 4권 (라이브 이후 비번 공개)
⚠️ 다시보기 없습니다. 지금 입장하세요!
👇지금 바로 입장👇

=== 도발형 (짧은 자극형) ===
📢(실시간) 수업중에 사주로 수익 내는거 보여드립니다.
🔥(선착순 인원 한정) 마지막 사주 수익화 비밀 라이브 진행중!
❌더 이상의 수익 자랑만 하는 강의는 이제 그만!
뭘 팔지? 어떻게 팔지? 어디서 팔지?
여러분들이 가장 궁금해하시는거 오늘 전부 알려드립니다.
❌다시보기 없습니다❌
👇지금 바로 입장하세요!👇

=== 정보형 (혜택 나열형) ===
🔥 18일 만에 순익 1,020만원 달성한 수강생?!
💥 경험 없어도 OK!
💥 소자본으로 시작 가능
🎁 참여만 해도 4가지 무료 제공
📘 초보자 가이드
📄 협찬 요청 대본+템플릿
⌨️ 브랜드 로고+이름 만드는 AI 프롬프트
❌다시보기는 제공되지 않습니다. 지금 바로 입장하세요!🔥`

const DEFAULT_INSTRUCTIONS = `- 친근형: 후크 한 줄 + 핵심 혜택 2~3개 + CTA. 이모지 활용. 따뜻한 톤.
- 도발형: 통념 뒤집기/긴장 유발 한 줄 + 짧은 질문 나열 + 마감 한 줄.
- 정보형: 수치/성과 후크 + 혜택 불릿 3~4개 + 마감 멘트.
- 공통: "지금 바로!", "꼭 보세요!" 같은 닳은 클리셰 금지. 강사 고유 톤 살릴 것.`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 강사가 단톡방/라이브 직전에 보내는 붐업 멘트를 작성하는 전문가입니다.

== 참고 모범 사례 (톤과 구조만 참고, 분량은 절대 모방 금지) ==
${references}

== 작성 지침 ==
${instructions}

== ★ 분량 절대 준수 (최우선 제약) ★ ==
- 각 멘트는 **6~12줄, 공백 포함 300자 이내**.
- 참고 사례가 길어 보여도 그 길이를 절대 모방하지 마세요. 핵심만 압축.
- 1줄 후크 → 혜택 2~4개(불릿) → 마감/CTA 한 줄 → 그 이상은 잘라내세요.
- 강사 본인 서사·이력·수강생 케이스 길게 풀지 마세요. 한 줄 수치만.
- 작성 후 스스로 글자 수 점검. 300자 넘으면 다시 줄이세요. 짧을수록 좋습니다.

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
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 3000 })
  return { ...result, configSource: source }
}
