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

const DEFAULT_INSTRUCTIONS = `- 톤: 강사가 직접 1인칭으로 말하는 느낌. 권위 + 진정성.
- ★ 어미는 "다나까"체와 "해요"체를 자연스럽게 섞어 쓸 것. 다나까 일색 금지.
  · 다나까체: "~합니다", "~입니다", "~했습니다" — 권위·단정·논리적 마무리에 사용
  · 해요체: "~해요", "~예요", "~거든요", "~잖아요" — 부드러운 연결·공감·말 걸기에 사용
  · 한 단락 안에 두 어미가 자연스럽게 나오도록. 무리한 비율 강제 X (대화하듯)
  · 광고 멘트 X. "꼭 보세요!", "지금 바로!" 같은 닳은 표현 금지
- 도입: 도발적/역설적 한 줄(쌍따옴표). 통념을 뒤집는 후크.
- ★ 본문 구성: 4섹션. **호기심·궁금증을 자극하는 티저(teaser)** 형태로 작성.
  · 핵심 인사이트의 결론, 정답, 구체적 방법론, 단계별 절차는 풀어쓰지 말 것
  · "왜 그런지", "어떻게 하는지"를 본문에서 다 알려주면 전자책 받을 이유가 사라짐
  · 대신 "이런 문제가 있다", "이런 차이가 있다", "이렇게 했더니 결과가 달랐다"
    까지만. 그 답은 전자책에서 풀린다는 식으로 마무리
  · 강사 경험·일화·수치는 구체적으로 제시하되, "왜 그렇게 되는지의 메커니즘"
    은 전자책 안에 있다는 인상 유지
  · 섹션 1: 시장 통념 vs 실제 — 문제 제기 (정답 X, 모순 노출만)
  · 섹션 2: 강사 시행착오 1~2건 — 사건만 제시, 해법 X
  · 섹션 3: 다른 곳에서 못 듣는 관점 — 결론 한 문장만 던지고 "왜 그런지는 안에서"
  · 섹션 4: 무엇을 얻을 수 있는지 미리보기 — 챕터 제목·항목만 나열, 본문 X
  · 각 섹션 200~400자
- ★ CTA 구조 (반드시 이 순서):
  1) **첫 줄: 호기심 자극 후크 질문** — 강사 본인의 구체적 키워드·수치·인물·일화를
     집어넣은 "~가 궁금하신가요?" 형태 한 줄.
     · 좋은 예: "🚀 '윤쇼의 쿠팡 상품 등록 비법'이 궁금하신가요?"
     · 좋은 예: "💡 '친구의 40만원을 지켜준 노하우'가 궁금하신가요?"
     · 좋은 예: "🎯 '월 200만원 만든 첫 3개월의 시행착오'가 궁금하신가요?"
     · 나쁜 예: "전자책이 궁금하신가요?" (구체적 키워드 X — 너무 일반적)
     · 나쁜 예: "지금 바로 받아보세요" (호기심 자극 X)
  2) 강사 인용 — 쌍따옴표 한 단락 (격려·다정·해요체 권장)
  3) 버튼 안내 한 줄 — "[전자책 받으러 가기] 버튼을 클릭해주세요" 같은 형태
- ★ 절대 금지 (CTA에 절대 들어가면 안 되는 것):
  · "무료 라이브 강의", "무료 강의", "무료 특강", "추가 강의" 같은 단어
  · 강의 일정·날짜·시간 (예: "5월 11일(월) 오후 7:30") 또는 자리표시 [날짜] [시간]
  · "전자책과 강의를 함께 보시면 더 도움이 됩니다" 같은 문장
  · 위 항목이 단 하나라도 들어가면 출력은 실패로 간주됨
- 길이: 전체 800~1500자`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 무료 전자책 기획 전문가입니다. 강사가 무료 전자책으로 수강생을 모집할 때 쓸 상세페이지의 카피를 작성합니다.

== 작성 원칙 (가장 중요) ==
사용자 메시지에 [강사가 제공한 전자책 원문] 섹션이 포함됩니다. 이 원문이 **핵심 자료**입니다.
- 전자책에서 강사가 실제로 다루는 주제·개념·사례·차별점만 사용해 기획안을 작성하세요.
- 전자책에 없는 외부 사례·통계·전략을 임의로 끌어오지 마세요.
- 전자책의 톤·표현·강사 1인칭 어조를 흡수해 카피로 옮기세요.
- 아래 참고 모범 사례는 "구조와 어조"의 본보기일 뿐이며, 콘텐츠는 반드시 전자책 원문 기반.

== 참고 모범 사례 (구조·톤만 모방, 내용은 가져오지 말 것) ==
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
  "cta": "3블록 구조: (1) 강사 키워드 들어간 '~가 궁금하신가요?' 후크 한 줄, (2) 강사 인용 한 단락(쌍따옴표), (3) [전자책 받으러 가기] 버튼 안내 한 줄. 무료 강의·일정·날짜·시간 절대 X."
}

== 톤·문체 강조 ==
- 다나까체("~합니다")와 해요체("~해요", "~거든요")를 자연스럽게 섞어주세요.
- 본문 4섹션은 인사이트의 정답·메커니즘·방법을 풀어쓰지 말고, 호기심을 자극하는 티저로.

== CTA 강조 ==
- CTA 첫 줄은 반드시 강사 본인의 구체적 키워드/수치/인물/일화가 들어간
  "~가 궁금하신가요?" 형태 호기심 후크. 일반적 "전자책이 궁금하신가요?" 금지.
- CTA에 무료 강의 / 라이브 / 일정 / 날짜 / 시간 단어가 단 하나라도 들어가면 실패.
- CTA 마지막은 [전자책 받으러 가기] 버튼 안내 한 줄로 끝. 그 뒤에 추가 줄 X.`
}

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

export async function planEbook({ instructor, sessionName, topic, additionalContext = '', ebookContents = [] }) {
  // DB에서 지침·레퍼런스 로드. 비어있으면 위 DEFAULT_*로 폴백.
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })

  const SYSTEM_PROMPT = buildSystemPrompt({ instructions, references })

  // 전자책 원문 섹션 빌드 (있을 때만).
  let ebookSection = ''
  if (Array.isArray(ebookContents) && ebookContents.length > 0) {
    const usable = ebookContents.filter((e) => e.text && e.text.trim())
    if (usable.length > 0) {
      ebookSection = '\n\n[강사가 제공한 전자책 원문 — 핵심 자료]\n' + usable
        .map((e, i) => `\n=== 전자책 ${i + 1}: ${e.name}${e.truncated ? ' (※ 길이 제한으로 일부만 발췌)' : ''} ===\n${e.text}`)
        .join('\n\n')
    }
  }

  const userMessage = `다음 정보로 무료 전자책 기획안을 작성하세요.

강사: ${instructor}
강의/기수: ${sessionName || '미정'}
주제: ${topic}
${additionalContext ? `\n[추가 컨텍스트]\n${additionalContext}` : ''}${ebookSection}

위 정보 — 특히 전자책 원문 — 을 핵심으로, 작성 지침과 출력 형식을 따라 JSON만 출력하세요.`

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
