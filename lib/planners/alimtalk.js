// 채널톡 멘트 생성 봇.
// (참고) 알림톡은 슝 템플릿 시스템에서 별도 관리하므로 이 봇은 채널톡 멘트만 만든다.
// 강사가 채널톡(1:1 메신저)에서 그대로 보낼 수 있는 단일 멘트 1개 생성.
// 양식은 어드민이 기획 봇 설정 → 채널톡 멘트 → 레퍼런스에 등록한 모범 사례를 따라감.
// 내부 task key는 호환성을 위해 'alimtalk'로 유지 (DB의 ai_prompts/ai_references 키와 일치).

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'alimtalk'

const DEFAULT_REFERENCES = `=== 짧은 후크형 ===
🔓 (LIVE) 지금 들어오신 분들만 드릴게요..🤫
💰20분 만에 알고리즘 타는 영상 만들어 → 월 2천
⚡라이브 참여자 한정 특별 혜택
✔️ AI 사이트 체험권 (🎁추첨)
✔️ 전자책 4권 (라이브 이후 비번 공개)
⚠️ 다시보기 없습니다. 지금 입장하세요!
👇지금 바로 입장👇

=== 자극형 ===
📢(실시간) 수업중에 사주로 수익 내는거 보여드립니다.
🔥(선착순 인원 한정) 마지막 사주 수익화 비밀 라이브 진행중!
❌더 이상의 수익 자랑만 하는 강의는 이제 그만!
뭘 팔지? 어떻게 팔지? 어디서 팔지?
오늘 전부 알려드립니다.
❌다시보기 없습니다❌
👇지금 바로 입장하세요!👇

=== 혜택 나열형 ===
🔥 18일 만에 순익 1,020만원 달성한 수강생?!
💥 경험 없어도 OK!
💥 소자본으로 시작 가능
🎁 참여만 해도 4가지 무료 제공
📘 초보자 가이드
📄 협찬 요청 대본+템플릿
⌨️ 브랜드 로고+이름 만드는 AI 프롬프트
❌다시보기는 제공되지 않습니다. 지금 바로 입장하세요!🔥`

const DEFAULT_INSTRUCTIONS = `- 채널톡은 라이브 직전 단톡방/푸시 멘트 — 길지 않게, 즉시 행동을 유도.
- 1줄 후크 → 혜택 불릿 2~4개 → 마감/CTA 한 줄 구조.
- 강사 본인이 보내는 듯한 1인칭 톤 (운영팀 X).
- 레퍼런스에 이모지(🔥 ✅ ⚠️ 등)가 있으면 같은 톤으로 자연스럽게 사용.
- #{변수}가 레퍼런스에 있으면 같은 자리에 그대로 보존 (운영팀이 채움).
- "지금 바로!", "꼭 보세요!" 같은 닳은 클리셰는 자제, 강사 고유 멘트 살릴 것.`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소 강사가 채널톡/단톡방에서 라이브 직전 보내는 멘트를 작성하는 전문가입니다.

== 참고 모범 사례 (톤과 구조만 참고, 분량은 절대 모방 금지) ==
${references}

== 작성 지침 ==
${instructions}

== ★ 분량 절대 준수 (최우선 제약) ★ ==
- 본문은 **6~12줄, 공백 포함 300자 이내**.
- 참고 사례가 길어 보여도 그 길이를 절대 모방하지 마세요. 핵심만 압축.
- 1줄 후크 → 혜택 불릿 2~4개 → 마감/CTA 한 줄 → 그 이상은 잘라내세요.
- 강사 본인 서사·이력·수강생 케이스를 길게 풀지 마세요. 한 줄 수치만 인용.
- 작성 후 스스로 글자 수 점검. 300자 넘으면 다시 줄이세요. 짧을수록 좋습니다.

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
