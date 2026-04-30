// 무료 전자책 기획안 생성 봇.
// 지침/레퍼런스는 DB(ai_prompts / ai_references)에서 로드. DB가 비어있으면 아래 DEFAULT로 폴백.
// 어드민 UI: 사이드바 → '🪄 기획 봇 설정' → 전자책

import { loadPlannerConfig } from './_config'

const FEATURE_KEY = 'ebook'

// DB 비어있을 때 사용할 1차 초안. 어드민 UI에서 수정·확장 권장.
const DEFAULT_REFERENCES = `=== 청담언니 루시 - 월 2,500만 원 번 유튜브 수익화 설계도 ===
"유튜브, 영상 잘 만드는 사람이 돈 벌까요? 아니요, '설계' 잘하는 사람이 법니다"

"열심히"가 배신하는 시장, 유튜브
유튜브 AI 부업 강의를 한 번이라도 들어본 사람은 압니다. 챗GPT로 대본 쓰고, 다른 AI로 이미지 만들고, 캡컷으로 편집하고. 툴 두세 개를 왔다 갔다 하다 보면 어느새 다섯 시간이 사라집니다. 말이 좋아 자동화지, 실제로는 사람이 일일이 옮기고 붙여넣는 노가다입니다.

1. 열심히 하는 것과 잘 설계하는 것
유튜브는 '영상 올리는 곳'이 아니라 검색 엔진입니다.

2. 툴 3개 켜는 동안, 저는 이미 영상을 올렸습니다
챗GPT, 미드저니, 캡컷 다 써본 결과 — 툴이 많을수록 완성되는 영상은 없습니다.

3. "진짜 수익은 '노동'이 멈출 때 시작됩니다"
'제작'이 아니라 '수익 구조'를 고민해야 합니다.

4. 2026년형 유튜브 수익화의 비밀
- '수익 구조' > '구독자 수'
- AI가 여러분의 직원이 됩니다
- 채널 삭제에 대비하세요`

const DEFAULT_INSTRUCTIONS = `- 톤: 강사가 직접 1인칭으로 말하는 느낌. 권위 + 진정성. 광고 멘트 X.
- 도입: 도발적/역설적 한 줄(쌍따옴표). 통념을 뒤집는 후크.
- 본문 구성: 4섹션. 각 섹션은 작은 제목 + 200~400자 본문.
  · 섹션 1: 시장의 통념 vs 실제 — 문제 진단
  · 섹션 2: 강사 본인 경험 — 시행착오, 결론
  · 섹션 3: 차별화 인사이트 — 다른 곳에서 못 듣는 관점
  · 섹션 4: 구체적 전략 — 불릿 3~4개로 정리
- CTA: "전자책 받으러 가기" + 무료 라이브 강의 안내 (날짜는 [날짜] 자리표시)
- 금지: "꼭 보세요!", "지금 바로!" 같은 닳은 표현
- 길이: 전체 800~1500자`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 무료 전자책 기획 전문가입니다. 강사가 무료 전자책으로 수강생을 모집할 때 쓸 상세페이지의 카피를 작성합니다.

== 참고 모범 사례 (이 톤·구조를 모방) ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 추가 설명 텍스트 절대 금지. 마크다운 코드블록 X.
{
  "thumbnailCopy": "썸네일에 들어갈 짧은 후킹 문구 (15자 이내, 숫자 포함 권장)",
  "title": "전자책 제목 (40자 이내)",
  "introHook": "쌍따옴표로 감싼 도발적 한 줄 후크",
  "problemFraming": "통념의 문제를 짚는 도입 단락 (200~300자)",
  "sections": [
    { "heading": "섹션 1 제목", "body": "섹션 1 본문 200~400자" },
    { "heading": "섹션 2 제목", "body": "섹션 2 본문 200~400자" },
    { "heading": "섹션 3 제목", "body": "섹션 3 본문 200~400자" },
    { "heading": "섹션 4 제목 (불릿 4개 포함 가능)", "body": "섹션 4 본문 200~400자" }
  ],
  "cta": "전자책 받으러 가기 안내 + 무료 라이브 강의 안내 (날짜 자리 표시: [날짜])"
}`
}

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

export async function planEbook({ instructor, sessionName, topic, additionalContext = '' }) {
  // DB에서 지침·레퍼런스 로드. 비어있으면 위 DEFAULT_*로 폴백.
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })

  const SYSTEM_PROMPT = buildSystemPrompt({ instructions, references })

  const userMessage = `다음 정보로 무료 전자책 기획안을 작성하세요.

강사: ${instructor}
강의/기수: ${sessionName || '미정'}
주제: ${topic}
${additionalContext ? `\n[추가 컨텍스트]\n${additionalContext}` : ''}

위 강사의 톤으로, 작성 지침과 출력 형식을 따라 JSON만 출력하세요.`

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 500)}`)
  }

  const data = await response.json()
  const text = data?.content?.[0]?.text || ''
  const usage = data?.usage || {}

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('JSON 응답을 찾을 수 없음. 원문: ' + text.slice(0, 500))
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    throw new Error('JSON 파싱 실패: ' + e.message + ' / 원문: ' + jsonMatch[0].slice(0, 500))
  }

  return { plan: parsed, usage, model: MODEL, configSource: source }
}
