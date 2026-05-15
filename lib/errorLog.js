// 에러 로그 수집 + 사용자 친화 메시지 매핑.
//
// 사용 패턴:
//   import { logError, errorResponse } from '@/lib/errorLog'
//
//   try { ... } catch (e) {
//     const logged = await logError({
//       request, error: e, route: '/api/tools/project-planner',
//       errorCode: 'EXTERNAL_API', context: { instructor, taskKey },
//     })
//     return errorResponse(logged, 500)
//   }
//
// logError:
//   - DB의 error_logs 테이블에 상세 정보 저장 (실패해도 본 흐름 X).
//   - { id, userMessage, errorMessage } 반환.
//   - userMessage는 사용자에게 보여줄 친절한 문구 (errorCode 기반 매핑).
//
// errorResponse:
//   - { error: userMessage, errorId, ref } JSON 응답. 클라이언트는 errorId를 표시할 수 있음.
//   - 실제 errorMessage(스택 등)는 API 응답에 노출하지 않음.

import { createClient } from '@supabase/supabase-js'

// 별도 클라이언트 — 에러 로깅이 본 supabase 클라이언트 import에 의존하지 않게.
let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _supabaseClient
}

// 에러 코드별 사용자 친화 메시지 — 백엔드 상세를 노출하지 않으면서 원인 힌트만.
// 매핑되지 않은 코드는 fallback 메시지.
const USER_MESSAGES = {
  VALIDATION:      '요청 정보가 올바르지 않습니다. 입력값을 확인해주세요.',
  AUTH:            '로그인이 필요하거나 권한이 없습니다.',
  NOT_FOUND:       '요청한 자원을 찾을 수 없습니다.',
  RATE_LIMIT:      'API 호출 한도를 초과했습니다. 2~3분 뒤에 다시 시도해주세요.',
  EXTERNAL_API:    '외부 서비스(AI/노션/슝/시트 등) 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  DB:              '데이터 저장/조회 중 오류가 발생했습니다.',
  INTERNAL:        '서버 내부 오류가 발생했습니다.',
  TIMEOUT:         '응답 시간이 초과되었습니다. 자료가 너무 크거나 서버가 일시적으로 느린 상태일 수 있습니다.',
  TOKEN_LIMIT:     '응답이 토큰 한도를 넘어 잘렸습니다. 입력 자료를 줄이거나 봇 모듈의 maxTokens를 늘려주세요.',
}

const DEFAULT_USER_MESSAGE = '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

/**
 * 에러를 DB에 기록하고 사용자 친화 메시지를 만든다.
 * @param {object} args
 * @param {Request} [args.request]
 * @param {Error|string} args.error
 * @param {string} [args.route]        - 자동 추출(request.url) 가능
 * @param {string} [args.method]       - 자동 추출(request.method) 가능
 * @param {string} [args.username]
 * @param {string} [args.errorCode]    - 'VALIDATION'|'AUTH'|'NOT_FOUND'|'RATE_LIMIT'|'EXTERNAL_API'|'DB'|'INTERNAL'|'TIMEOUT'|'TOKEN_LIMIT'
 * @param {object} [args.context]
 * @param {string} [args.userMessage]  - 직접 지정. 없으면 errorCode 기반 매핑.
 * @returns {Promise<{ id: string|null, userMessage: string, errorMessage: string }>}
 */
export async function logError({ request, error, route, method, username, errorCode = 'INTERNAL', context, userMessage }) {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown'))
  const errorMessage = err.message || String(err)
  const stack = err.stack || null

  const finalUserMessage = userMessage || USER_MESSAGES[errorCode] || DEFAULT_USER_MESSAGE

  let routeFinal = route
  let methodFinal = method
  let userAgent = null
  let ip = null
  if (request) {
    try {
      if (!routeFinal) {
        const u = new URL(request.url)
        routeFinal = u.pathname
      }
      if (!methodFinal) methodFinal = request.method
      userAgent = request.headers.get('user-agent') || null
      ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
           request.headers.get('x-real-ip') ||
           null
    } catch {}
  }

  // 콘솔에는 항상 출력 (dev에서 즉시 보이도록)
  console.error(`[errorLog] ${errorCode} ${routeFinal || '?'} ${methodFinal || '?'}: ${errorMessage}`)
  if (stack) console.error(stack)

  // DB 저장. 실패해도 무시.
  let savedId = null
  try {
    const supabase = getSupabase()
    if (supabase) {
      const { data, error: insErr } = await supabase
        .from('error_logs')
        .insert({
          route: routeFinal || null,
          method: methodFinal || null,
          username: username || null,
          error_code: errorCode,
          error_message: errorMessage.slice(0, 4000),
          user_message: finalUserMessage,
          stack: stack ? stack.slice(0, 8000) : null,
          context: context && typeof context === 'object' ? context : null,
          user_agent: userAgent ? userAgent.slice(0, 500) : null,
          ip: ip ? ip.slice(0, 100) : null,
        })
        .select('id')
        .single()
      if (insErr) {
        console.error(
          '[errorLog] DB insert 실패:', insErr.message,
          '| details:', insErr.details || '-',
          '| hint:', insErr.hint || '-',
          '| code:', insErr.code || '-',
          '| usingServiceRole:', !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          '| url:', (process.env.NEXT_PUBLIC_SUPABASE_URL || '').slice(0, 40),
        )
      } else {
        savedId = data?.id || null
      }
    } else {
      console.error('[errorLog] supabase 클라이언트 생성 실패 — NEXT_PUBLIC_SUPABASE_URL 또는 키 환경변수 누락')
    }
  } catch (e) {
    console.error('[errorLog] DB 연결 실패:', e?.message)
  }

  return {
    id: savedId,
    userMessage: finalUserMessage,
    errorMessage,
  }
}

/**
 * 사용자에게 노출할 안전한 JSON 응답.
 * 실제 에러 원문/스택은 응답에 포함하지 않음. errorId가 있으면 사용자가 그 ID를 알려주면 개발자가 추적 가능.
 * @param {{id: string|null, userMessage: string}} logged
 * @param {number} [status=500]
 */
export function errorResponse(logged, status = 500) {
  const body = { error: logged.userMessage }
  if (logged.id) body.errorId = logged.id
  return Response.json(body, { status })
}

/**
 * Anthropic API 에러 메시지에서 errorCode 자동 분류.
 * @param {Error|string} error
 */
export function classifyAnthropicError(error) {
  const msg = (error?.message || String(error || '')).toLowerCase()
  if (/429|rate limit|분당.*한도/.test(msg)) return 'RATE_LIMIT'
  if (/max_tokens|토큰 한도|초과해 잘렸/.test(msg)) return 'TOKEN_LIMIT'
  if (/timeout|timed out|시간이 초과/.test(msg)) return 'TIMEOUT'
  if (/529|overload|과부하/.test(msg)) return 'EXTERNAL_API'
  if (/anthropic|claude|api/.test(msg)) return 'EXTERNAL_API'
  return 'INTERNAL'
}
