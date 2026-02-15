import { verifyApiAuth } from '@/lib/apiAuth'
import { Agent } from 'undici'

// Vercel Hobby 플랜 최대 300초 (로컬에선 제한 없음)
export const maxDuration = 300

// undici body timeout을 30분으로 설정 (기본 5분이라 긴 분석 시 끊김)
const longTimeoutDispatcher = new Agent({
  bodyTimeout: 30 * 60 * 1000,
  headersTimeout: 30 * 60 * 1000,
})

/**
 * HuggingFace Space 절전모드 대응:
 * 무료 HF Space는 비활성 시 절전 진입 → 요청하면 "Application not found" 반환
 * /health로 먼저 깨우고 200 응답 대기 후 실제 요청 전송
 */
async function ensureBackendAwake(baseUrl) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        console.log(`[backend] 백엔드 활성 확인 (시도 ${attempt})`)
        return true
      }
      const text = await res.text()
      console.log(`[backend] 응답 ${res.status}: ${text.slice(0, 200)} (시도 ${attempt})`)
      // HuggingFace "Application not found" = 절전 중 → 대기 후 재시도
      if (text.includes('Application not found') || res.status === 404) {
        console.log(`[backend] HuggingFace 절전 중, 깨우기 대기...`)
        await new Promise(r => setTimeout(r, attempt * 5000))
        continue
      }
      // 다른 에러 (백엔드는 실행 중이지만 다른 문제)
      return true
    } catch (e) {
      console.log(`[backend] 연결 실패: ${e.message} (시도 ${attempt})`)
      if (attempt < 5) {
        await new Promise(r => setTimeout(r, attempt * 3000))
      }
    }
  }
  return false
}

export async function POST(request) {
  // Python 백엔드 URL (런타임에 환경변수 읽기)
  const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
  console.log('[lecture-analyze-gemini] PYTHON_BACKEND_URL:', PYTHON_BACKEND_URL)

  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // HuggingFace Space 절전모드 대응: 먼저 백엔드가 깨어있는지 확인
    const isAwake = await ensureBackendAwake(PYTHON_BACKEND_URL)
    if (!isAwake) {
      return new Response(JSON.stringify({
        error: 'Python 백엔드가 응답하지 않습니다. HuggingFace Space가 절전 중일 수 있습니다.\n\n해결 방법: https://huggingface.co/spaces 에서 Space를 직접 열어 깨운 후 다시 시도해주세요.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // FormData를 그대로 Python 백엔드로 전달
    const formData = await request.formData()

    // Python 백엔드로 프록시 (bodyTimeout 30분)
    const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
      dispatcher: longTimeoutDispatcher,
    })

    if (!backendResponse.ok && !backendResponse.headers.get('content-type')?.includes('text/event-stream')) {
      const errText = await backendResponse.text()
      return new Response(JSON.stringify({ error: `Python 백엔드 오류: ${errText}` }), {
        status: backendResponse.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // SSE 스트림을 그대로 클라이언트에 전달
    return new Response(backendResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('[lecture-analyze-gemini] 프록시 에러:', error)
    return new Response(JSON.stringify({
      error: `Python 백엔드 연결 실패: ${error.message}\n\nPython 백엔드가 실행 중인지 확인하세요.`
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
