// 봇 공통 Anthropic 호출 + JSON 파싱 헬퍼.
// 각 planner(boomUp.js, alimtalk.js 등)가 시스템 프롬프트와 사용자 메시지만 만들어 호출.

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * Claude 호출 → text 응답에서 JSON 추출/파싱 → { plan, usage, model } 반환.
 * 시스템 프롬프트는 prompt-caching ephemeral로 묶어 5분 내 재호출 시 90% 할인.
 *
 * @param {object} args
 * @param {string} args.systemPrompt - 시스템 프롬프트(레퍼런스/지침 포함)
 * @param {string} args.userMessage - 사용자 메시지
 * @param {number} [args.maxTokens=4096]
 * @param {string} [args.model]
 */
export async function callPlannerLLM({ systemPrompt, userMessage, maxTokens = 4096, model = DEFAULT_MODEL }) {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
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
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
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
