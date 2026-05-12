// 강의 PPT outline 생성 봇.
// 실제 N잡연구소 강사 무료강의 PPT 3종(씨오/옆집CEO/에어, 각 252·256·292장)을
// 분석해서 추출한 공통 구조 기반. 평균 267장.
//
// 분석 스크립트: scripts/inspect-ppt-references.js (DB에서 ai_references 조회)
//
// 사용자가 구조 순서를 직접 바꿀 수 있음 (Dashboard.js의 '구조 설정' 모달).
// ctx.structureOrder가 있으면 그 순서대로 시스템 프롬프트에 명시. 없으면 기본 8단계.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'ppt'

const KIND_DEFINITIONS = {
  hook:        { label: '후크',              desc: '도발적 한 줄·충격적 수치·도입 후크 — 5~15장' },
  intro:       { label: '강사 소개',         desc: '이름·나이·직업·취미·환영·라포 형성 — 5~10장' },
  proof:       { label: '성과 증명',         desc: '매출·순익·연소득 스크린샷, 구체 수치 — 10~20장' },
  journey:     { label: '일대기/시행착오',   desc: '연도별 타임라인이 핵심, 감정선 빌드업 — 20~50장' },
  myth:        { label: '통념 깨기',         desc: '"다들 ~한다고 알지만 실제로는…", 퀴즈 — 10~20장' },
  info:        { label: '본론 챕터',         desc: 'CHAPTER 01~07 노하우·사례·실전 팁 — 80~150장' },
  qna:         { label: 'Q&A 시뮬레이션',    desc: '"끝물 아닌가요?", "초기비용 드나요?" 류 — 10~20장' },
  testimonial: { label: '수강생 후기',       desc: '★ 3단 구조: 상황 → 코칭 내용 → 결과 — 10~20장' },
  cta:         { label: '정규 강의 모집',    desc: '회차·혜택·가격·마감일·특별혜택 — 20~40장' },
  outro:       { label: '마무리',           desc: '간단한 감사 인사 정도 (동기부여 호소 X)' },
}

const DEFAULT_STRUCTURE_ORDER = [
  'hook', 'intro', 'proof', 'journey', 'myth', 'info', 'qna', 'testimonial', 'cta',
  // outro는 사용자 요청에 따라 기본 비포함 — "마지막 동기부여 멘트" 자제.
  //   필요하면 사용자가 구조 설정에서 추가 가능.
]

const DEFAULT_REFERENCES = `=== N잡연구소 강사 무료강의 PPT 공통 구조 (실제 252·256·292장 PPT 분석) ===

기본 8단계로 흐르며, 단계별 표준 분량은 다음과 같습니다. (사용자가 순서/포함 여부를 직접 바꿀 수 있으니
이 순서는 참고용 — 실제 사용 순서는 user message의 [구조 지시]를 따르세요.)

[hook] 후크 — 5~15장
    - 첫 슬라이드부터 충격적 수치 또는 도발적 한 줄로 시선 잡기.
    - 예: "유튜브로", "허황된 얘기 X", "저 이걸로 3,200만원 벌었습니다", "96년생, 만 29세"

[intro] 강사 소개 + 라포 형성 — 5~10장
    - 짧고 친근하게. 이름, 나이, 직업, 별명, 취미.
    - 예: "정식으로 인사드립니다 좋아하는 일로 돈 버는 옆집CEO입니다"

[proof] 강사 성과 증명 — 10~20장
    - 구체적 수치, 정산 스크린샷, 매출/순익/연소득.
    - 예: "월 평균 매출 4,000~5,000만원", "순수익 880만원", "연 소득 4.9억"

[journey] 강사 일대기 / 시행착오 — 20~50장 (★ 핵심 분량)
    - 연도별 타임라인이 가장 흔한 형식. "2016年", "2018年", "2021.06" 식.
    - 본인이 어떻게 시작했고, 무엇이 안 됐고, 어떤 우연한 발견으로 전환점이 왔는지.

[myth] 통념 깨기 / 왜 이 분야인가 — 10~20장
    - "다들 ~한다고 알지만 실제로는…" 형식 또는 퀴즈.

[info] 본론 — 챕터별 노하우 — 80~150장 (★ 최대 분량)
    - 5~7개 챕터로 나뉨. 각 챕터 머리에 "CHAPTER 01.", "CHAPTER 02." 슬라이드.

[qna] Q&A 시뮬레이션 — 10~20장
    - 예상 질문 미리 답변: "끝물 아닌가요?", "초기비용 드나요?", "수익 안나면 어떡하죠?"
    - 같은 답변 슬라이드 2~3번 반복도 OK ("안 날 수가 없습니다." × 3).

[testimonial] 수강생 후기 — 10~20장 (★ 매우 중요 — 3단 구조 강제)
    - 단순히 "OO하시는 분이 결과 냈어요"가 아니라 반드시 다음 3단 구조로 풀어 쓸 것:
      1. 수강생 상황 언급 (나이/직업/기존 시도/한계/고민 등)
      2. 강사가 어떤 부분을 어떻게 코칭했는지 구체적으로 (개인톡 OK)
      3. 그래서 어떤 결과를 냈는지 (수익/성과/변화)
    - 예시 (좋은 패턴):
      "이 분은 50대 남성분이셨어요. 컴맹이셨고 원래 다른 강의도 결제했었는데 너무 어려웠다고 하셨어요.
       제 강의는 튜브 마스터 쓰니까 쉽게 할 수 있다고 하셨는데, 그럼에도 모르는 부분이 있다고 하셔서
       제가 ○○ 부분을 개인톡으로 코칭해드렸던 기억이 납니다. 결과적으로 채널 개설 2개월 만에
       월 ○○만원 수익이 시작됐어요."
    - 예시 (피해야 할 패턴, 너무 짧음):
      "50대 남성분이에요. 컴퓨터 잘 모르는데도 튜브마스터 쓰니까 할 수 있었다고요."
    - 각 후기는 본문 슬라이드 2~3장으로 풀어내거나 발표 멘트에서 3단 구조로 풀 것.

[cta] 정규 강의 모집 — 20~40장
    - 정규 강의 일정 (회차별), 혜택 N개, 가격, 마감일, 특별 혜택.

[outro] 마무리 — 0~3장 (★ 기본은 생성 X — 사용자가 명시 요청 시에만)
    - "마지막으로 드리고 싶은 말", "동기부여 멘트", "한 번 더 도전하세요" 류 호소는 만들지 마세요.
    - 정규 강의 모집(cta) 뒤에 바로 "Q&A" 슬라이드 정도로 자연스럽게 끝내세요.
    - 사용자가 구조 설정에서 outro를 추가한 경우에만 짧은 감사 인사(1~2장).

=== 슬라이드 형식 특징 ===
- 빈 슬라이드 / 한 줄 슬라이드 비중 큼: "VS", "X", "🤩", "(빈 슬라이드)". 본문은 빈 배열.
- 반복 슬라이드도 강조 용도면 정상.
- 본문은 짧을수록 좋음. 슬라이드 = 보조 자료. 핵심은 발표 멘트.
- CHAPTER 슬라이드 명시적 표기.

=== 발표 멘트 톤 예시 ===
"여러분, 솔직히 말씀드리면 이건 제가 1년 전에는 절대 몰랐던 거예요.
지금부터 보여드리는 화면 — 이게 제가 처음으로 월 100을 넘긴 그달의 정산 캡처예요…"`

const DEFAULT_INSTRUCTIONS = `## 분량 — 매우 중요
- N잡연구소 실제 PPT는 평균 **267장**(252·256·292장 데이터).
- 목표 분량: **220~300장**. 강사 자료가 길면 300장 이상도 OK.
- 절대 30·50·100장 같은 짧은 버전 만들지 말 것.

## 구조 — user message의 [구조 지시]를 따를 것
- user message에 [구조 지시] 섹션이 있으면 그 순서대로 슬라이드를 만들 것.
- 각 단계의 표준 분량은 위 [참고 모범 사례]를 따르되, 사용자가 명시한 비중이 있으면 우선.
- [구조 지시]에 없는 단계는 생성하지 말 것 (특히 outro가 빠져있으면 마무리 동기부여 멘트 X).

## 슬라이드 작성 규칙
- 슬라이드 제목: 짧게 (20자 이내). 한 줄 메시지·의문문·이모지·"VS"·"X" 같은 단편도 OK.
- 본문 불릿: 0~3개. 빈 슬라이드 적극 허용 (kind='empty').
- 발표 멘트(speakerNotes): 강사 1인칭 톤. **토큰 효율 위해 짧게**:
  - 일대기/시행착오: 80~200자
  - 본론 정보: 50~150자
  - 빈/전환 슬라이드: 20~60자
  - 후크: 40~100자
  - **수강생 후기(testimonial): 150~300자** (3단 구조 풀어내기 위해 약간 더 길게 허용)
  - 평균 100자 안쪽 목표.
- CHAPTER 표지 슬라이드는 따로 만들기.

## 수강생 후기 — ★ 3단 구조 필수 (사용자 요청)
- "OO하시는 분이 결과 냈어요" 식 한 줄 후기 절대 금지.
- 모든 testimonial 슬라이드(또는 발표 멘트)는 반드시:
  ① 수강생 상황 (나이/직업/기존 시도/한계) →
  ② 강사 코칭 내용 (구체적으로 어느 부분을 어떻게) →
  ③ 결과 (수익·성과·변화)
- 좋은 예: 위 [참고 모범 사례]의 testimonial 항목 참조.

## outro 자제
- "마지막으로 드리고 싶은 말", "동기부여 호소", "한 번 더 도전하세요" 류 마무리 멘트 만들지 마세요.
- 사용자가 [구조 지시]에서 outro를 명시한 경우에만 짧은 감사 인사 정도.

## 강사 자료 활용
- 첨부된 강사 녹음/메모/레퍼런스 PPT의 흐름을 그대로 따라가라.
- 강사 영상에서 1분 동안 일화를 풀면 PPT 2~5장으로.`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 강의 PPT 기획 전문가입니다. 실제 강사들이 무료강의에서 사용하는 200~300장 분량의 PPT를 슬라이드별 outline + 발표 멘트 형태로 작성합니다.

핵심: 당신이 만드는 것은 "요약본"이 아니라 **실제 강의에서 강사가 한 장씩 넘기는 진짜 슬라이드 시퀀스**입니다. N잡연구소 실제 무료강의 PPT 3종(252·256·292장)에서 추출한 구조 기반.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "title": "강의 전체 제목",
  "totalSlides": 267,
  "slides": [
    {
      "slideNumber": 1,
      "kind": "hook|intro|proof|journey|myth|info|empty|qna|testimonial|cta|outro",
      "title": "슬라이드 제목 (또는 한 줄 메시지·이모지·기호)",
      "bullets": ["불릿 1", "불릿 2"],
      "speakerNotes": "발표 멘트"
    }
  ]
}

kind 값 정의:
- hook: 첫 후크·도발적 한 줄·충격적 수치
- intro: 강사 자기소개·환영·라포 형성
- proof: 성과 증명 (수치·캡처·매출·연소득)
- journey: 강사 일대기·시행착오·연도별 타임라인
- myth: 통념 깨기·퀴즈·왜 이 분야인가
- info: 본론 챕터 노하우·정보·사례 (CHAPTER 표지 포함)
- empty: 빈 슬라이드·한 줄 슬라이드·이모지만·"VS"·"X" (영상/이미지/감정 전환용)
- qna: 예상 Q&A 시뮬레이션
- testimonial: 수강생 후기 (★ 3단 구조 강제)
- cta: 정규 강의 모집·혜택·가격·일정
- outro: 마무리 (★ 사용자 명시 요청 시에만, 동기부여 호소 X)`
}

function buildStructureGuide(structureOrder) {
  const order = Array.isArray(structureOrder) && structureOrder.length > 0
    ? structureOrder.filter(k => KIND_DEFINITIONS[k])
    : DEFAULT_STRUCTURE_ORDER
  const lines = ['', '[구조 지시] — 사용자가 지정한 슬라이드 단계 순서. 반드시 이 순서대로, 이 단계들만 만들 것:']
  order.forEach((k, i) => {
    const def = KIND_DEFINITIONS[k]
    if (def) lines.push(`  ${i + 1}. ${k} (${def.label}): ${def.desc}`)
  })
  // 사용자가 명시 안 한 단계는 생성 금지
  const excluded = Object.keys(KIND_DEFINITIONS).filter(k => !order.includes(k))
  if (excluded.length > 0) {
    lines.push('')
    lines.push(`★ 위에 없는 단계는 절대 만들지 마세요. 특히 제외된: ${excluded.join(', ')}`)
  }
  return lines.join('\n')
}

export async function planPpt(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })

  const structureGuide = buildStructureGuide(ctx.structureOrder)

  const userMessage = `다음 강의의 PPT outline + 발표 멘트를 작성하세요.

${buildContextMessage(ctx)}
${structureGuide}

요구사항:
- 위 [구조 지시]의 순서대로 슬라이드를 만드세요. 그 외 단계는 절대 만들지 마세요.
- 각 단계의 표준 분량(참고 모범 사례 참조)을 따르되, 강사 자료에 맞춰 조절.
- 수강생 후기(testimonial)는 반드시 3단 구조(상황 → 코칭 → 결과)로 풀어내세요.
- 마무리 동기부여 멘트("마지막으로 드리고 싶은 말" 류)는 만들지 마세요.
- "요약본"이 아니라 실제 진행 슬라이드 시퀀스. 총 220~300장.
- JSON 구조 그대로 출력. 마크다운 코드블록 절대 X.`
  // 250+ 슬라이드 출력 — 평균 100~120 토큰 × 280장 ≈ 30k.
  // outro 제거 + 멘트 짧게 가이드로 더 효율적이 됨.
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 32000 })
  return { ...result, configSource: source }
}

// Dashboard.js가 구조 설정 모달에서 사용 (라벨/설명 동기화용).
export { KIND_DEFINITIONS, DEFAULT_STRUCTURE_ORDER }
