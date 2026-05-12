// 봇 공통 Anthropic 호출 + JSON 파싱 헬퍼.
// 각 planner(boomUp.js, alimtalk.js 등)가 시스템 프롬프트와 사용자 메시지만 만들어 호출.

import { Agent } from 'undici'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

// PPT 봇처럼 32k 출력 토큰을 한 번에 요구하는 호출은 Anthropic 응답에 5~7분 걸림.
// Node.js undici fetch 기본 headersTimeout/bodyTimeout이 300초(5분)라 그대로 두면
// 정확히 5분에 끊김. 15분으로 늘림. (Anthropic 자체 한도가 ~10분 정도라 그 이상은 의미 X)
const LONG_TIMEOUT_DISPATCHER = new Agent({
  headersTimeout: 900_000,  // 15분
  bodyTimeout: 900_000,     // 15분
  connectTimeout: 30_000,   // 연결 자체는 30초 한도
})

// 재시도 대상: 429(rate limit), 503(service unavailable), 529(overloaded), 500/502/504(transient).
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529])
const MAX_RETRIES = 4
// 429(레이트 리밋) 전용 — 분당 한도 리셋 기다리도록 길게
const RATE_LIMIT_BACKOFF_MS = [5000, 20000, 45000, 90000]
// 5xx(과부하/일시 오류) — 짧게
const TRANSIENT_BACKOFF_MS = [1000, 3000, 7000, 15000]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 429 응답의 Retry-After 헤더(초) 우선, 없으면 폴백 백오프 사용
function pickWaitMs(response, attempt) {
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after')
    const sec = retryAfter ? parseInt(retryAfter, 10) : NaN
    if (!Number.isNaN(sec) && sec > 0) {
      return Math.min(sec * 1000, 120000) // 최대 2분
    }
    return RATE_LIMIT_BACKOFF_MS[attempt] || 90000
  }
  return TRANSIENT_BACKOFF_MS[attempt] || 15000
}

/**
 * Claude 호출 → text 응답에서 JSON 추출/파싱 → { plan, usage, model } 반환.
 * 시스템 프롬프트는 prompt-caching ephemeral로 묶어 5분 내 재호출 시 90% 할인.
 * 일시적 오류(429/503/529 등)는 exponential backoff로 자동 재시도.
 *
 * @param {object} args
 * @param {string} args.systemPrompt - 시스템 프롬프트(레퍼런스/지침 포함)
 * @param {string} args.userMessage - 사용자 메시지
 * @param {number} [args.maxTokens=4096]
 * @param {string} [args.model]
 */
export async function callPlannerLLM({ systemPrompt, userMessage, maxTokens = 4096, model = DEFAULT_MODEL }) {
  const requestBody = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

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
      body: requestBody,
      // 큰 출력(PPT 봇 32k) 시 응답에 5~10분 걸려도 fetch가 timeout 안 나도록.
      dispatcher: LONG_TIMEOUT_DISPATCHER,
    })

    if (response.ok) break

    lastStatus = response.status
    lastErrText = await response.text()

    // 재시도 대상이 아니거나 마지막 시도였으면 던진다.
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
      // 사용자 친화 메시지 매핑.
      if (response.status === 529) {
        throw new Error(
          `Anthropic 서버가 일시적으로 과부하 상태입니다(529 Overloaded). ` +
          `${MAX_RETRIES + 1}회 재시도 후에도 실패. 잠시 후 다시 시도해주세요.`
        )
      }
      if (response.status === 429) {
        throw new Error(
          `Anthropic 분당 입력 토큰 한도 초과(429). ${MAX_RETRIES + 1}회 재시도 후에도 실패. ` +
          `다음 중 하나로 대처해주세요:\n` +
          `· 2~3분 기다렸다가 다시 시도\n` +
          `· 첨부 자료 일부를 제거하거나 더 작은 페이지로 나누기\n` +
          `· (장기) Anthropic 콘솔에서 사용량 등급(tier) 상향`
        )
      }
      throw new Error(`Anthropic ${response.status}: ${lastErrText.slice(0, 500)}`)
    }

    // 백오프 대기 후 재시도. 429는 Retry-After 헤더 우선.
    await sleep(pickWaitMs(response, attempt))
  }

  if (!response.ok) {
    throw new Error(`Anthropic ${lastStatus} (재시도 후): ${lastErrText.slice(0, 500)}`)
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
    // 가장 흔한 원인: 응답이 max_tokens에 걸려 JSON 끝부분에서 잘림.
    // stop_reason='end_turn'이 아닌 경우 사용자에게 명확히 알린다.
    if (stopReason === 'max_tokens') {
      throw new Error(
        `출력이 max_tokens(${maxTokens})를 초과해 잘렸습니다. ` +
        `해당 봇 모듈의 maxTokens를 늘려주세요. ` +
        `(원문 끝부분: ...${text.slice(-200)})`
      )
    }
    throw new Error('JSON 파싱 실패: ' + e.message + ' / stop_reason=' + stopReason + ' / 원문: ' + jsonMatch[0].slice(0, 500))
  }

  return { plan: parsed, usage, model, stopReason }
}

/**
 * 표준 사용자 메시지 빌더. 강사/기수/주제/추가 컨텍스트를 일관 포맷으로.
 */
export function buildContextMessage({ instructor, sessionName, topic, additionalContext }) {
  return `강사: ${instructor}
강의/기수: ${sessionName || '미정'}
주제: ${topic}
${additionalContext ? `\n[추가 컨텍스트]\n${additionalContext}` : ''}`
}
