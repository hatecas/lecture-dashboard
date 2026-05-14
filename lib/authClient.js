// 클라이언트 측 인증 토큰 처리 공통 헬퍼.
//
// 통합 이전: components/Dashboard.js, Login.js 등에서 localStorage.getItem('authToken')을
//           직접 70여 곳에서 호출. 토큰 만료(401) 시 자동 로그아웃이 어떤 화면은 처리되고
//           어떤 화면은 안 돼서 사용자가 "응답 없음" 상태로 멍해지는 경우 있었음.
// 통합 후 : 모든 fetch는 apiFetch() 한 군데로. 401이면 토큰 지우고 로그인 화면으로 리다이렉트.

const TOKEN_KEY = 'authToken'

export function getAuthToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearAuthToken() {
  setAuthToken(null)
}

export function getAuthHeaders() {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  }
}

// 401 처리: 토큰 지우고 로그인 화면으로. 이미 리다이렉트 중이면 중복 호출 무시.
let redirecting = false
function redirectToLogin() {
  if (redirecting) return
  if (typeof window === 'undefined') return
  redirecting = true
  clearAuthToken()
  // 페이지 전체 리로드로 로그인 화면 강제 표시 (page.js의 세션 셸이 처리)
  window.location.reload()
}

// fetch wrapper: Authorization 자동 부착 + 401 자동 로그아웃.
// 기존 fetch와 호출 시그니처 동일 — options.headers에 추가 헤더 넘기면 합쳐짐.
export async function apiFetch(url, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  }
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401) {
    redirectToLogin()
  }
  return res
}

// 전역 fetch 패치 — 우리 자체 API(/api/*)에서 401 받으면 자동 로그아웃.
// 기존 코드 70여 곳의 fetch() 호출을 일일이 apiFetch로 바꿀 필요 없이
// 한 곳에서 모든 fetch를 가로채서 401만 검사 → 토큰 망가지면 즉시 로그인 화면.
// 외부 도메인(Supabase, Google, 슝, 채널톡, Anthropic) 호출은 우리 인증과 무관하므로 패스.
if (typeof window !== 'undefined' && !window.__authFetchPatched) {
  window.__authFetchPatched = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch(input, init)
    try {
      const url = typeof input === 'string'
        ? input
        : (input && typeof input.url === 'string' ? input.url : '')
      // 우리 자체 API만 감시 — 절대경로(/api/) 또는 같은 origin
      const isOwnApi = url.startsWith('/api/') ||
                       (typeof window.location !== 'undefined' && url.startsWith(window.location.origin + '/api/'))
      if (isOwnApi && response.status === 401) {
        redirectToLogin()
      }
    } catch {
      // URL 추출 실패 시 무시
    }
    return response
  }
}
