// 강의 PPT outline 생성 봇.
// 슬라이드별 outline + 발표 멘트 초안.

import { loadPlannerConfig } from './_config'
import { callPlannerLLM, buildContextMessage } from './_anthropic'

const FEATURE_KEY = 'ppt'

const DEFAULT_REFERENCES = `=== 좋은 무료강의 PPT 구조 예시 ===
1) 인트로 — 강사 자기소개 + 오늘 약속 (3장)
2) 시장 통념 깨기 — "다들 ~한다고 알지만 실제로는…" (3장)
3) 강사 본인 시행착오 — 구체적 수치/스크린샷 (4장)
4) 인사이트 정리 — 1~3 단계 프레임워크 (5장)
5) 적용 사례 — Before/After (3장)
6) 한계 + 솔루션 안내 — "혼자 하면 어려운 부분이 있어요" (2장)
7) 정규 강의 안내 + Q&A (2장)

=== 발표 멘트 톤 예시 ===
"여러분, 솔직히 말씀드리면 이건 제가 1년 전에는 절대 몰랐던 거예요.
지금부터 보여드리는 화면 — 이게 제가 처음으로 월 100을 넘긴 그달의 정산 캡처예요…"`

const DEFAULT_INSTRUCTIONS = `- 무료강의 기준 총 18~25장 추천
- 각 슬라이드: 짧은 제목(20자 이내) + 본문 불릿 2~5개 + 발표 멘트 80~200자
- 본문은 텍스트 위주가 아니라 키워드/수치 위주(슬라이드는 보조 자료)
- 발표 멘트는 강사가 1인칭으로 말하듯 자연스럽게
- 마지막 2~3장은 정규 강의 모집 자연스러운 전환`

function buildSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 강의 PPT 기획 전문가입니다. 무료강의 PPT의 슬라이드별 outline과 발표 멘트 초안을 작성합니다.

== 참고 모범 사례 ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
반드시 아래 JSON 구조 하나만 출력. 마크다운 코드블록 X.
{
  "title": "강의 전체 제목",
  "totalSlides": 20,
  "slides": [
    {
      "slideNumber": 1,
      "title": "슬라이드 제목",
      "bullets": ["불릿 1", "불릿 2"],
      "speakerNotes": "발표 멘트 80~200자"
    }
  ]
}`
}

export async function planPpt(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildSystemPrompt({ instructions, references })
  const userMessage = `다음 강의의 PPT outline + 발표 멘트를 작성하세요.\n\n${buildContextMessage(ctx)}\n\n위 정보로 슬라이드별 outline과 발표 멘트 초안을 JSON으로 출력. 슬라이드는 18~25장.`
  const result = await callPlannerLLM({ systemPrompt, userMessage, maxTokens: 8000 })
  return { ...result, configSource: source }
}
