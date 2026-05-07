// 정리봇 (Summarize Bot).
// 강사가 업로드한 자료(파일/노션 링크/녹음 등) + 추가 컨텍스트를 분석해
// 다른 기획 봇들이 컨텍스트로 쓸 수 있는 깔끔한 markdown 정리본을 만든다.
//
// 두 모드:
//  - generateSummary: 처음 생성 또는 전체 재생성 (자료 기반)
//  - reviseSummary  : 기존 정리본 + 사용자 수정 요청 → 부분 반영해 재출력
//
// 출력: markdown 문자열. 표(GFM)·헤더·불릿·인용 자유롭게 사용.
// JSON 파싱 우회를 위해 _anthropic.callPlannerLLM 대신 자체 callMarkdownLLM 사용.

import { loadPlannerConfig } from './_config'

const FEATURE_KEY = 'summarize'

const DEFAULT_INSTRUCTIONS = `- 본문은 markdown으로 작성. 표는 GitHub Flavored Markdown 표 문법 (| 헤더 | ... |) 사용
- 다음 섹션을 권장(자료에 맞게 가감 가능):
  · ## 강사 프로필 — 이름·전문분야·경력·차별점 (표 형식 권장)
  · ## 청중 페르소나 — 직업/소득대/연령/관심사 (표 또는 불릿)
  · ## 핵심 인사이트 — 강사가 제공한 자료에서 도출되는 통찰 (불릿 5~8개)
  · ## 시행착오 사례 — Before/After 형태의 표 또는 인용
  · ## 수치 자료 — 매출·구독자·전환율 등 (있으면 표)
  · ## 강사 톤 샘플 — > 인용 블록으로 강사 1인칭 발화 예시
  · ## 강의 차별점 — 시장 통념과의 차이 (불릿)
  · ## 추가 메모 — 위에 안 들어가는 자료
- 자료에 명시되지 않은 사실은 추측해서 적지 말 것. 빈칸이면 "자료 부족 — 강사 확인 필요"로 표기
- 강사 1인칭 인용은 자료 안에서만 가져옴 (창작 X)
- 전체 길이: A4 1~2장 분량 (~1500~3000자)
- 첫 줄에 "_정리: YYYY-MM-DD / 강사: ... / 기수: ..._" 메타 한 줄`

const DEFAULT_REFERENCES = `=== 좋은 정리본 예시 ===
_정리: 2026-05-07 / 강사: 청담언니 루시 / 기수: 1기_

## 강사 프로필
| 항목 | 내용 |
|---|---|
| 이름 | 청담언니 루시 |
| 전문 분야 | 유튜브 AI 자동화 수익화 |
| 경력 | LUCY AI Studio 운영, 월 2,500만원 수익화 |
| 차별점 | "설계가 답이다" — 영상 제작이 아닌 수익 구조 설계 중심 |

## 청중 페르소나
- 30~45세 직장인 (월급 200~400만원대)
- AI 부업 강의 1~2개 들어봤지만 수익화 실패
- 챗GPT/캡컷 등 툴은 쓰는데 돈은 안 벌리는 사람

## 핵심 인사이트
- 유튜브는 영상 올리는 곳이 아니라 검색 엔진
- 툴 많이 쓸수록 완성되는 영상은 적음
- 진짜 수익은 노동이 멈출 때 시작
- '수익 구조' > '구독자 수'

## 시행착오 사례
| 시기 | Before | After |
|---|---|---|
| 시작 6개월 | 매일 영상 1편 직접 편집 (5시간/편) | 자동화 설계 후 1시간/편 |
| 첫 수익화 | 광고 수익 5만원/월 | 제휴/디지털상품 + 광고 → 2,500만원/월 |

## 강사 톤 샘플
> "여러분, 솔직히 말씀드리면 — 1년 전엔 저도 이거 절대 몰랐어요."
> "툴 두세 개 켜놓고 왔다 갔다 하다 보면 5시간이 사라집니다. 말이 좋아 자동화지."

## 강의 차별점
- 영상 제작 강의가 아닌 수익 구조 설계 강의
- AI를 직원처럼 쓰는 법 공개
- 채널 삭제 리스크까지 다룸 (다른 강의는 안 다룸)`

function buildGenerateSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 강사 자료 정리 전문가입니다. 강사가 제공한 다양한 자료(전자책 PDF, 노션 페이지 링크, 미팅 녹음, 메모 등)를 분석해 다른 기획 봇들이 참고할 수 있는 깔끔한 markdown 정리본을 만듭니다.

== 작성 원칙 (가장 중요) ==
- 사용자 메시지에 [강사 자료] 섹션이 포함됩니다. 그 안의 사실만 사용해 정리하세요.
- 자료에 없는 정보를 추측·창작하지 마세요. 빈칸은 "자료 부족 — 강사 확인 필요"로 표기.
- 강사 1인칭 인용은 자료에 실제로 있는 표현만. 만들지 마세요.
- 정리본은 후속 기획 봇(전자책/붐업/채널톡 등)이 컨텍스트로 읽기 좋아야 함 — 구조화·요약된 형태.

== 참고 모범 사례 (구조·형식 참고만) ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
markdown 한 덩어리만 출력. JSON·코드블록·설명 텍스트 절대 금지. 곧장 _정리: ... 줄로 시작.`
}

function buildReviseSystemPrompt({ references, instructions }) {
  return `당신은 N잡연구소의 강사 자료 정리 전문가입니다. 기존 정리본을 사용자 수정 요청에 맞게 부분 수정합니다.

== 수정 원칙 (가장 중요) ==
- 사용자가 "[수정 요청]"으로 지목한 부분만 정확히 수정/추가/삭제하세요.
- 사용자가 언급하지 않은 섹션은 원본 그대로 유지 (마음대로 다시 쓰지 마세요).
- 수정 요청이 자료에 없는 사실 추가를 요구하면, 정중히 "자료 부족 — 강사 확인 필요"로 표기.
- 형식(markdown 표/헤더/불릿)은 원본 정리본과 동일한 스타일로.
- 첫 줄의 _정리: ... 메타는 새 날짜로 갱신.

== 참고 모범 사례 (스타일 참고용) ==
${references}

== 작성 지침 ==
${instructions}

== 출력 형식 ==
수정 반영된 정리본 markdown 한 덩어리만 출력. JSON·코드블록·설명 텍스트 절대 금지.`
}

function buildAttachmentsSection(attachments = [], extractedTexts = []) {
  if (!attachments.length && !extractedTexts.length) return '\n[강사 자료]\n(첨부된 자료 없음)\n'

  const lines = ['', '[강사 자료]']

  if (attachments.length) {
    lines.push('\n=== 첨부 목록 ===')
    attachments.forEach((a, i) => {
      const role = a.file_role === 'ebook' ? '[전자책]' : (a.session_id ? '[기수전용]' : '[강사공통]')
      const meta = a.file_type === 'link'
        ? `${role} ${a.file_name} → ${a.file_url}`
        : `${role} ${a.file_name} (${a.file_type || 'unknown'})`
      const desc = a.description ? ` :: ${a.description}` : ''
      lines.push(`${i + 1}. ${meta}${desc}`)
    })
  }

  const usable = extractedTexts.filter((e) => e.text && e.text.trim())
  if (usable.length > 0) {
    lines.push('\n=== 추출된 본문 ===')
    usable.forEach((e, i) => {
      lines.push(`\n--- 자료 ${i + 1}: ${e.name}${e.truncated ? ' (※ 길이 제한으로 일부만)' : ''} ---`)
      lines.push(e.text)
    })
  }

  const failed = extractedTexts.filter((e) => e.error)
  if (failed.length > 0) {
    lines.push('\n=== 본문 추출 불가 ===')
    failed.forEach((e) => lines.push(`- ${e.name}: ${e.error}`))
  }

  return lines.join('\n') + '\n'
}

// 정리봇 전용: JSON 파싱 안 하고 raw markdown 텍스트 반환하는 호출.
async function callMarkdownLLM({ systemPrompt, userMessage, maxTokens = 5000, model = 'claude-sonnet-4-6' }) {
  const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
  const RETRYABLE = new Set([429, 500, 502, 503, 504, 529])
  const BACKOFF = [1000, 3000, 7000]
  const MAX_RETRIES = 3

  let response
  let lastErrText = ''
  let lastStatus = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    if (response.ok) break
    lastStatus = response.status
    lastErrText = await response.text()
    if (!RETRYABLE.has(response.status) || attempt === MAX_RETRIES) {
      if (response.status === 529) throw new Error(`Anthropic 과부하(529). ${MAX_RETRIES + 1}회 재시도 후 실패.`)
      if (response.status === 429) throw new Error(`Anthropic 레이트리밋(429). ${MAX_RETRIES + 1}회 재시도 후 실패.`)
      throw new Error(`Anthropic ${response.status}: ${lastErrText.slice(0, 500)}`)
    }
    await new Promise((r) => setTimeout(r, BACKOFF[attempt] || 7000))
  }
  if (!response.ok) throw new Error(`Anthropic ${lastStatus}: ${lastErrText.slice(0, 500)}`)

  const data = await response.json()
  const text = (data?.content?.[0]?.text || '').trim()
  if (!text) throw new Error('정리봇 응답이 비어있습니다.')
  const stopReason = data?.stop_reason || ''
  if (stopReason === 'max_tokens') {
    return {
      content_md: text + '\n\n_(※ 출력이 길어 일부 잘림. 수정 요청으로 빠진 부분을 추가하세요.)_',
      usage: data.usage,
      model,
      stopReason,
    }
  }
  return { content_md: text, usage: data.usage, model, stopReason }
}

/**
 * 새 정리본 생성 (또는 전체 재생성).
 * @param {object} ctx
 *   instructor, sessionName, additionalContext, attachments, extractedTexts
 */
export async function generateSummary(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildGenerateSystemPrompt({ references, instructions })
  const userMessage = `다음 정보로 정리본 markdown을 작성하세요.

강사: ${ctx.instructor}
강의/기수: ${ctx.sessionName || '미정'}
${ctx.additionalContext ? `\n[추가 컨텍스트]\n${ctx.additionalContext}\n` : ''}
${buildAttachmentsSection(ctx.attachments, ctx.extractedTexts)}

위 자료만 사용해서 정리본을 markdown으로 한 덩어리 출력하세요.`
  const result = await callMarkdownLLM({ systemPrompt, userMessage, maxTokens: 5000 })
  return { ...result, configSource: source }
}

/**
 * 기존 정리본 + 사용자 수정 요청 → 부분 수정된 정리본.
 * @param {object} ctx
 *   instructor, sessionName, currentSummary, userFeedback, attachments?, extractedTexts?
 */
export async function reviseSummary(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })
  const systemPrompt = buildReviseSystemPrompt({ references, instructions })
  const today = new Date().toISOString().slice(0, 10)
  const userMessage = `다음 정리본을 사용자 수정 요청대로 부분 수정하세요. (오늘 날짜: ${today})

강사: ${ctx.instructor}
강의/기수: ${ctx.sessionName || '미정'}

[기존 정리본]
${ctx.currentSummary}

[수정 요청]
${ctx.userFeedback}

${(ctx.attachments?.length || ctx.extractedTexts?.length) ? buildAttachmentsSection(ctx.attachments, ctx.extractedTexts) : ''}

수정 반영된 정리본 markdown만 출력. 사용자가 안 건드리라고 한 섹션은 그대로 유지하세요.`
  const result = await callMarkdownLLM({ systemPrompt, userMessage, maxTokens: 5000 })
  return { ...result, configSource: source }
}
