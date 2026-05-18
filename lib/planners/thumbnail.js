// 전자책/무료강의 썸네일 기획안 생성 봇.
//
// **이전 버전과의 차이점:**
//   - 모델: Sonnet 4.6 → **Opus 4.7** (디자인·카피라이팅 안목 최상)
//   - 학습 방식: 텍스트 요약 → **vision 첨부** (8장 레퍼런스를 봇이 실제로 보면서 판단)
//   - 비용: prompt caching(ephemeral, 5분 TTL)으로 첫 호출만 ~$0.15, 캐시 히트 ~$0.025
//
// 출력 JSON은 Phase 2(실제 이미지 합성: Gemini 배경 + 강사 누끼 + HTML 텍스트 오버레이)
// 까지 그대로 사용할 수 있도록 합성 파이프라인에 필요한 모든 메타데이터를 포함.

import fs from 'fs'
import path from 'path'
import { Agent } from 'undici'
import { loadPlannerConfig } from './_config'

const FEATURE_KEY = 'thumbnail'
const MODEL = 'claude-opus-4-7'
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'

// 큰 vision 입력(8장 이미지) + 긴 출력에 대비해 fetch 타임아웃 늘림.
const LONG_TIMEOUT_DISPATCHER = new Agent({
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
  connectTimeout: 30_000,
})

// 8장 레퍼런스 메타. 봇이 이미지와 한 쌍으로 보면서 어떤 패턴인지 학습.
// 파일은 ./assets/thumbnails/ref-NN.jpg.
const REFERENCE_THUMBNAILS = [
  { file: 'ref-01.jpg', label: '윤쇼 — 쿠팡 건강식품 (DARK_MONEY 타입)',
    note: '어두운 올리브 배경 + 약 한 알 모티프, 헤드라인 오렌지 강조("월 1억"), 하단에 강사 인용·핵심 가치 텍스트 4줄' },
  { file: 'ref-02.jpg', label: '숏폼 GPT 프롬프트 (TEXT_HERO 미니멀)',
    note: '흰색 배경 + 분홍 강조("8천만 원"), 상단 작은 태그라인("영상 단 하나로"), 하단 강사 사진(누끼) + 노트북 콜라주' },
  { file: 'ref-03.jpg', label: '씨오 — 중국 사입 브랜딩 (BOOK_COVER 타입)',
    note: '베이지 종이 텍스처 + 중앙 벽돌색 사각 블록 안 흰 텍스트, 상단 영문 헤더(INTERVISION/CCIO), 좌우 세로 영문, 하단 인용 박스 + 작은 강사 사진' },
  { file: 'ref-04.jpg', label: '인피디 — 인스타 캐러셀 (TEXT_HERO 핑크 그라데이션)',
    note: '핑크-퍼플 그라데이션 + 네온 사각 프레임 + N잡연구소/인피디 세로 영문, 상단 큰 헤드라인("월 1000번"), 하단 강사 사진(누끼) + 별점 박스 2개' },
  { file: 'ref-05.jpg', label: '설아 — AI 플레이리스트 (OBJECT_MOTIF 파스텔)',
    note: '파스텔 핑크-오렌지 수채화 배경 + 강사명 oval 박스("설아"), 강사 사진 합성, 하단 음악 재생바·LP 음반 오브제' },
  { file: 'ref-06.jpg', label: '션 — 유튜브 쇼츠 (TEXT_HERO 블랙 + 오렌지 띠)',
    note: '검정 배경 + 노트북 글로우 이미지, 영문 부제(THE SECRET...), 하단 오렌지 띠 박스(강조 카피 + 약력 2~3줄) + 강사 사진' },
  { file: 'ref-07.jpg', label: '지구미 — 영화드라마 쇼츠 (TEXT_HERO 파스텔 블루)',
    note: '연한 블루-스카이 그라데이션 + 흰색·노란색 헤드라인("부업에서 / 퇴사까지"), 상단 작은 태그라인 2줄, 하단 강사 사진 + 인용 박스' },
  { file: 'ref-08.jpg', label: '영상 1000만원 (DARK_MONEY 검정+노랑)',
    note: '거의 검정 + 지폐 흐릿한 사진 + 회로 패턴, 헤드라인 노랑("1,000만원"), 손글씨 인용 한 단락, 하단 강사 약력 4~5줄' },
]

// 빌드/dev 모두에서 동작하는 절대 경로
const THUMBNAILS_DIR = path.join(process.cwd(), 'lib', 'planners', 'assets', 'thumbnails')

// 한 번 읽으면 모듈 메모리에 보관 (서버리스 인스턴스 워밍 시 재사용).
// base64 인코딩이 비싸진 않지만 8장 매번 다시 읽는 것보단 낫다.
let cachedImageBlocks = null

function loadReferenceImageBlocks() {
  if (cachedImageBlocks) return cachedImageBlocks
  const blocks = []
  for (const ref of REFERENCE_THUMBNAILS) {
    try {
      const filePath = path.join(THUMBNAILS_DIR, ref.file)
      const bytes = fs.readFileSync(filePath)
      const base64 = bytes.toString('base64')
      const mediaType = ref.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
      blocks.push({
        text: `[레퍼런스 ${blocks.length + 1}] ${ref.label}\n특징: ${ref.note}`,
        image: {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
      })
    } catch (e) {
      // 이미지 누락이면 그 레퍼런스만 스킵 (전체 실패 방지)
      console.warn(`[thumbnail] 레퍼런스 이미지 로드 실패: ${ref.file} — ${e.message}`)
    }
  }
  cachedImageBlocks = blocks
  return blocks
}

const DEFAULT_INSTRUCTIONS = `[전체 톤]
- 강한 수치 헤드라인이 항상 중심. 추상적 형용사("성공", "꿀팁") 금지.
- 헤드라인은 2~3줄로 분할 — 1줄에 다 넣지 말 것.
- 핵심 수치(돈/개수/배수)는 "accent" 필드로 추출해 색상 강조.
- 광고심의 위반 표현 금지: "100% 보장", "절대", "무조건", "반드시 성공".

[디자인 타입 선택 가이드]
- TEXT_HERO: 강사 신뢰도가 높고 헤드라인 임팩트로 승부 (가장 흔한 기본값)
- BOOK_COVER: 강의가 "체계적 커리큘럼/기획" 성격일 때 (창업·브랜딩 등)
- OBJECT_MOTIF: 주제가 시각적 오브제로 표현 가능할 때 (음악·요리·SNS 등)
- DARK_MONEY: 수익화/돈/실전 성과 강조 (재테크·셀러·부업)

[강사 자료가 부족할 때]
- 강사 이력·수치가 없으면 자리표시자 [수치] [이력] 으로 두기. 가짜 X.
- 강사 인용이 없으면 testimonial을 null로.`

function buildSystemTextHeader() {
  return `당신은 N잡연구소 강의/전자책 썸네일 기획 전문가입니다.

== 학습 자료 ==
바로 아래에 N잡연구소가 실제로 사용한 썸네일 8장이 첨부됩니다. 각 이미지의 헤드라인 배치·폰트 weight·컬러 강조 방식·강사 사진 합성 위치·인용 박스 스타일·약력 표기 등 시각적 디테일까지 직접 보면서 학습하세요.

이 8장의 공통 DNA를 파악한 뒤, 새 강사 정보를 받으면 그 강사에게 가장 적합한 디자인 타입을 골라 명세를 작성합니다.`
}

function buildSystemTextFooter({ instructions }) {
  return `== 작성 지침 ==
${instructions}

== 출력 (텍스트 봇이지만 합성 파이프라인이 이어집니다) ==
이 JSON은 다음 단계에서 실제 이미지로 합성됩니다:
  1) backgroundPrompt → Gemini 2.5 Flash Image로 배경 생성
  2) headline/sub/tagline → HTML/Canvas로 텍스트 오버레이 (한글 정확)
  3) 강사 사진 → 별도로 누끼 처리 후 합성
그래서 backgroundPrompt에 "인물·글자" 절대 금지하고, 텍스트는 명확히 분리해서 출력하세요.

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X. 추가 설명 X.
{
  "designType": "TEXT_HERO" | "BOOK_COVER" | "OBJECT_MOTIF" | "DARK_MONEY",
  "designRationale": "왜 이 타입을 골랐는지 한 줄 이유 (학습한 레퍼런스 중 어느 것과 가장 결이 같은지도 언급)",
  "topTagline": "상단 작은 한 줄 (예: '영상 단 하나로'). 없으면 빈 문자열",
  "headline": {
    "lines": ["헤드라인 1줄", "2줄", "3줄 (선택)"],
    "accent": "그 중 색상 강조할 핵심 수치 (예: '8천만 원'). 없으면 빈 문자열"
  },
  "subheadline": "보조 카피 한 줄 (선택; 헤드라인 아래 또는 책 표지의 부제). 없으면 빈 문자열",
  "instructorBadge": {
    "name": "강사 이름 (예: '설아', '씨오')",
    "style": "OVAL" | "PILL" | "TEXT_ONLY" | "BOTTOM_CORNER",
    "title": "강사 한 줄 타이틀 (예: '브랜딩·중국사입 전문가'). 없으면 빈 문자열"
  },
  "colorPalette": {
    "background": "#000000",
    "accent": "#facc15",
    "text": "#ffffff",
    "subtext": "#cbd5e1"
  },
  "backgroundPrompt": "Gemini용 한국어 프롬프트. 인물·한글 금지. 세로 1080×1620 명시. 학습한 레퍼런스의 분위기를 구체적 사물/조명/구도로 풀어쓸 것.",
  "objectMotifs": ["배경에 들어갈 오브제 1~2개 (예: 'LP 음반', '핸드폰', '약 숟가락'). 없으면 빈 배열"],
  "composition": {
    "headlineArea": "TOP_60" | "CENTER_BOX" | "TOP_LEFT",
    "instructorPhotoPosition": "BOTTOM_LEFT" | "BOTTOM_RIGHT" | "BOTTOM_CENTER" | "NONE",
    "logoPosition": "TOP_RIGHT" | "BOTTOM_CENTER" | "BOTTOM_LEFT" | "BOTTOM_RIGHT"
  },
  "testimonial": {
    "quote": "강사 인용 (쌍따옴표 안 텍스트)",
    "attribution": "강사 직책·이름"
  },
  "ctaBox": {
    "stars": "★★★★★ 또는 빈 문자열",
    "lines": ["박스 안 1줄", "2줄", "3줄"]
  },
  "instructorCredentials": ["하단에 작게 들어갈 약력 줄 1", "줄 2", "줄 3", "줄 4"],
  "designerNotes": "디자이너에게 전달할 메모 한 단락 — 학습한 레퍼런스 중 어떤 작품과 가장 비슷한 결인지, 어떤 디테일(폰트 weight, 컬러 명도, 강사 사진 크기) 참고해야 하는지 구체적으로."
}

testimonial / ctaBox / instructorCredentials 중 디자인에 안 쓰는 항목은 null 또는 빈 배열.`
}

function buildContextMessage({ instructor, sessionName, topic, additionalContext }) {
  return `강사: ${instructor}
강의/기수: ${sessionName || '미정'}
주제: ${topic}
${additionalContext ? `\n[추가 컨텍스트]\n${additionalContext}` : ''}`
}

export async function planThumbnail(ctx) {
  const { instructions, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: '', // vision 첨부로 대체
  })

  const imageBlocks = loadReferenceImageBlocks()

  // Anthropic API 제약: system 배열은 type='text' 블록만 받음.
  // 이미지는 messages[].content에 넣어야 함.
  //
  // 캐시 전략:
  //   - system: 헤더 + 푸터(지침/출력형식) 텍스트 한 덩어리, cache_control: ephemeral
  //   - messages[0].content[]:
  //       · "아래는 학습 자료" 텍스트
  //       · 8장 × (라벨 텍스트 + 이미지 블록) — 마지막 블록에 cache_control 걸어 학습 자료까지 캐시
  //       · 실제 강사 컨텍스트 텍스트 (매번 다름; 캐시 외부)
  //   - 5분 내 재호출 시 system + 학습 자료(8장) 모두 캐시 히트 → 90% 할인
  const systemText = buildSystemTextHeader() + '\n\n' + buildSystemTextFooter({ instructions })

  const userContent = [
    { type: 'text', text: '아래는 학습 자료 — N잡연구소가 실제로 사용한 썸네일 8장입니다. 각 이미지를 직접 보면서 디자인 DNA를 파악하세요.' },
  ]
  imageBlocks.forEach(({ text, image }, idx) => {
    userContent.push({ type: 'text', text })
    // 마지막 이미지에 cache_control → 학습 자료 전체가 캐시 경계 안에 들어감
    if (idx === imageBlocks.length - 1) {
      userContent.push({ ...image, cache_control: { type: 'ephemeral' } })
    } else {
      userContent.push(image)
    }
  })
  userContent.push({
    type: 'text',
    text: `\n위 8장을 종합해 다음 강의의 썸네일 기획안을 작성하세요.\n\n${buildContextMessage(ctx)}\n\n1080×1620 세로 썸네일 명세 JSON만 출력.`,
  })

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
      max_tokens: 5000,
      system: [
        { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userContent }],
    }),
    dispatcher: LONG_TIMEOUT_DISPATCHER,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 600)}`)
  }

  const data = await response.json()
  const text = data?.content?.[0]?.text || ''
  const usage = data?.usage || {}
  const stopReason = data?.stop_reason || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('JSON 응답을 찾을 수 없음. 원문: ' + text.slice(0, 500))
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    if (stopReason === 'max_tokens') {
      throw new Error(`출력이 max_tokens(5000)를 초과해 잘렸습니다. 원문 끝: ...${text.slice(-200)}`)
    }
    throw new Error('JSON 파싱 실패: ' + e.message + ' / 원문: ' + jsonMatch[0].slice(0, 500))
  }

  return { plan: parsed, usage, model: MODEL, stopReason, configSource: source }
}
