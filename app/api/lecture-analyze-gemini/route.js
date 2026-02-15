import { verifyApiAuth } from '@/lib/apiAuth'
import { Agent } from 'undici'

// Python 백엔드 URL (환경변수로 설정)
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'

// Long-running route: 30 min timeout
export const maxDuration = 1800

// undici body timeout을 30분으로 설정 (기본 5분이라 긴 분석 시 끊김)
const longTimeoutDispatcher = new Agent({
  bodyTimeout: 30 * 60 * 1000,
  headersTimeout: 30 * 60 * 1000,
})

export async function POST(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
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
      error: `Python 백엔드 연결 실패: ${error.message}\n\nPython 백엔드가 실행 중인지 확인하세요:\ncd backend && pip install -r requirements.txt && python main.py`
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
