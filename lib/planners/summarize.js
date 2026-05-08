// 정리봇 (Summarize Bot).
// 강사 자료 → 깔끔한 markdown 정리본을 만든다. 자료를 두 카테고리로 분리해서 처리:
//
//   1) 🎯 정리본 레퍼런스 (file_role='summary_reference')
//      - 잘 정리된 다른 강사 정리본을 PDF/markdown 등으로 export 한 자료.
//      - 정리봇이 "구조·섹션 분류·표 형식·톤·강조 방식"만 모방.
//      - **이 자료의 내용·사실은 절대 새 정리본에 옮겨가지 않음** (다른 강사 데이터니까).
//
//   2) 📁 데이터 소스 (file_role='material' 또는 그 외)
//      - 미팅 녹음·메모·노션 페이지·인터뷰·강사 자기소개 등.
//      - 정리본의 **실제 내용**은 오로지 이쪽에서만 추출.
//
// 즉, "이 레퍼런스들처럼 생긴 정리본을 만들되, 데이터는 이 소스에서만 뽑아라" 흐름.
// 레퍼런스가 0개면 코드 안 DEFAULT_REFERENCES(또는 DB 설정)로 폴백.
//
// 두 모드:
//  - generateSummary: 새 정리본 생성 (또는 전체 재생성)
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

function buildGenerateSystemPrompt({ references, instructions, hasUserReferences }) {
  // 사용자가 직접 업로드한 정리본 레퍼런스가 있으면 "그 양식을 그대로 따르라" 강제.
  // 없으면 코드 안 DEFAULT_REFERENCES(또는 DB ai_references)를 약한 가이드로 사용.
  const referenceSection = hasUserReferences
    ? `== 정리본 레퍼런스 (양식·구조 모방 대상 — 내용은 절대 가져오지 말 것) ==
사용자 메시지의 "[정리본 레퍼런스]" 섹션에 잘 정리된 다른 강사들의 정리본 N개가 들어있습니다.
**이 레퍼런스의 역할은 단 하나 — 정리본의 양식·구조·섹션 분류·표 형식·강조 방식·톤을 그대로 모방하는 것입니다.**

엄수 사항:
- 레퍼런스 안의 강사명/사실/수치/일화는 **절대로 새 정리본에 옮겨오지 마세요.** (그건 다른 강사 정보입니다.)
- 레퍼런스가 강사 프로필 표를 쓰면 → 같은 표 구조로 (열 항목까지) 그대로 사용.
- 레퍼런스가 시행착오 사례를 Before/After 표로 정리했으면 → 같은 형식 사용.
- 레퍼런스가 강사 톤 샘플을 인용 블록으로 노출했으면 → 같은 형식 사용.
- 레퍼런스의 섹션 순서·헤더 레벨·이모지 사용 패턴까지 일관되게 따르세요.
- 여러 레퍼런스 간 양식이 다르면 가장 자주 등장하는 패턴 또는 가장 깔끔한 패턴을 채택.
`
    : `== 참고 모범 사례 (구조·형식 참고만, 내용은 가져오지 말 것) ==
${references}
`

  return `당신은 N잡연구소의 강사 자료 정리 전문가입니다. 기획자들이 인터뷰·녹음에 집중할 수 있도록, 강사 자료를 깔끔한 markdown 정리본으로 만듭니다.

== 작성 원칙 (가장 중요) ==
사용자 메시지는 두 카테고리로 나뉩니다:

  1) **[정리본 레퍼런스]** — 양식·구조만 모방하는 본보기. 안의 내용은 절대 옮기지 마세요.
  2) **[데이터 소스]** — 정리본의 실제 내용을 추출할 곳 (이번 강사의 녹음·메모·노션 등).

규칙:
- 새 정리본의 **모든 사실·수치·인용·일화**는 [데이터 소스]에서만 가져옵니다. 다른 곳에서 끌어오면 즉시 실패.
- [데이터 소스]에 없는 정보를 추측·창작하지 마세요. 빈칸이면 "자료 부족 — 강사 확인 필요"로 표기.
- 강사 1인칭 인용은 [데이터 소스]에 실제로 있는 발화만. 만들지 마세요.
- 양식은 위 [정리본 레퍼런스] (있으면) 또는 아래 모범 사례를 따라 일관되게.
- 정리본은 후속 기획 봇(전자책/붐업/채널톡 등)이 컨텍스트로 읽기 좋아야 함.

${referenceSection}

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

// 정리본 레퍼런스 섹션 (양식만 모방 — 내용은 가져오면 안 됨)
function buildReferencesSection(referenceTexts = []) {
  const usable = referenceTexts.filter((e) => e.text && e.text.trim())
  if (usable.length === 0) return ''
  const lines = ['', '[정리본 레퍼런스]', '※ 아래는 다른 강사들의 잘 정리된 정리본 예시입니다. 양식·구조·표 형식·톤만 모방하세요. 안의 사실/수치/인용/일화는 절대 새 정리본에 옮기지 마세요.']
  usable.forEach((e, i) => {
    lines.push(`\n--- 레퍼런스 ${i + 1}: ${e.name}${e.truncated ? ' (※ 길이 제한으로 일부만)' : ''} ---`)
    lines.push(e.text)
  })
  return lines.join('\n') + '\n'
}

// 데이터 소스 섹션 (실제 내용을 여기서만 가져옴)
function buildSourcesSection(attachments = [], extractedTexts = []) {
  if (!attachments.length && !extractedTexts.length) return '\n[데이터 소스]\n(첨부된 데이터 소스가 없습니다 — 정리본 작성 불가)\n'

  const lines = ['', '[데이터 소스]', '※ 새 정리본의 모든 사실·수치·인용은 오로지 이 섹션에서만 가져오세요.']

  if (attachments.length) {
    lines.push('\n=== 첨부 목록 ===')
    attachments.forEach((a, i) => {
      const role = a.file_role === 'ebook' ? '[전자책]'
        : (a.session_id ? '[기수전용]' : '[강사공통]')
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
// 재시도 정책은 _anthropic.callPlannerLLM과 동일: 429는 Retry-After 헤더 우선,
// 폴백은 5s/20s/45s/90s. 5xx는 1s/3s/7s/15s. 최대 4회 재시도.
async function callMarkdownLLM({ systemPrompt, userMessage, maxTokens = 5000, model = 'claude-sonnet-4-6' }) {
  const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
  const RETRYABLE = new Set([429, 500, 502, 503, 504, 529])
  const RATE_BACKOFF = [5000, 20000, 45000, 90000]
  const TRANSIENT_BACKOFF = [1000, 3000, 7000, 15000]
  const MAX_RETRIES = 4

  function pickWait(response, attempt) {
    if (response.status === 429) {
      const ra = response.headers.get('retry-after')
      const sec = ra ? parseInt(ra, 10) : NaN
      if (!Number.isNaN(sec) && sec > 0) return Math.min(sec * 1000, 120000)
      return RATE_BACKOFF[attempt] || 90000
    }
    return TRANSIENT_BACKOFF[attempt] || 15000
  }

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
      if (response.status === 529) {
        throw new Error(`Anthropic 과부하(529). ${MAX_RETRIES + 1}회 재시도 후 실패. 잠시 후 다시 시도하세요.`)
      }
      if (response.status === 429) {
        throw new Error(
          `Anthropic 분당 입력 토큰 한도 초과(429). ${MAX_RETRIES + 1}회 재시도 후 실패.\n\n` +
          `대처 방법:\n` +
          `· 2~3분 기다렸다가 다시 시도\n` +
          `· 첨부 자료 중 일부를 제거하거나 더 작은 페이지로 나누기\n` +
          `· (장기) Anthropic 콘솔에서 사용량 등급(tier) 상향 신청`
        )
      }
      throw new Error(`Anthropic ${response.status}: ${lastErrText.slice(0, 500)}`)
    }
    await new Promise((r) => setTimeout(r, pickWait(response, attempt)))
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
 * @param {string} ctx.instructor
 * @param {string} ctx.sessionName
 * @param {string} ctx.additionalContext
 * @param {Array} ctx.sourceAttachments       데이터 소스 첨부 (file_role='material' 등)
 * @param {Array} ctx.sourceExtractedTexts    위에서 본문 추출된 결과
 * @param {Array} ctx.referenceAttachments    레퍼런스 첨부 (file_role='summary_reference')
 * @param {Array} ctx.referenceExtractedTexts 레퍼런스에서 추출된 본문
 */
export async function generateSummary(ctx) {
  const { instructions, references, source } = await loadPlannerConfig(FEATURE_KEY, {
    instructions: DEFAULT_INSTRUCTIONS,
    references: DEFAULT_REFERENCES,
  })

  // 사용자가 직접 업로드한 정리본 레퍼런스가 1개라도 있고 본문 추출 OK면 그것을 사용.
  // 그렇지 않으면 코드/DB의 모범사례(references)로 폴백.
  const refTextsArr = Array.isArray(ctx.referenceExtractedTexts) ? ctx.referenceExtractedTexts : []
  const hasUserReferences = refTextsArr.some((e) => e?.text && e.text.trim())

  const systemPrompt = buildGenerateSystemPrompt({ references, instructions, hasUserReferences })

  const referencesSection = hasUserReferences
    ? buildReferencesSection(refTextsArr)
    : ''
  const sourcesSection = buildSourcesSection(ctx.sourceAttachments || [], ctx.sourceExtractedTexts || [])

  const userMessage = `다음 정보로 정리본 markdown을 작성하세요.

강사: ${ctx.instructor}
강의/기수: ${ctx.sessionName || '미정'}
${ctx.additionalContext ? `\n[추가 컨텍스트]\n${ctx.additionalContext}\n` : ''}
${referencesSection}
${sourcesSection}

위 [데이터 소스]만 사용해서 (사실/수치/인용 모두) 정리본을 markdown으로 한 덩어리 출력하세요.${hasUserReferences ? ' 양식은 [정리본 레퍼런스]를 그대로 따라가세요.' : ''}`
  const result = await callMarkdownLLM({ systemPrompt, userMessage, maxTokens: 5000 })
  return { ...result, configSource: source, hasUserReferences }
}

/**
 * 기존 정리본 + 사용자 수정 요청 → 부분 수정된 정리본.
 * @param {object} ctx
 *   instructor, sessionName, currentSummary, userFeedback
 *   (revise는 첨부 재추출 안 함 — 너무 느려서. 자료가 새로 추가됐다면 [처음부터 다시] 권장.)
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


수정 반영된 정리본 markdown만 출력. 사용자가 안 건드리라고 한 섹션은 그대로 유지하세요.`
  const result = await callMarkdownLLM({ systemPrompt, userMessage, maxTokens: 5000 })
  return { ...result, configSource: source }
}
