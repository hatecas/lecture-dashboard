import { createClient } from '@supabase/supabase-js'

// nlab.kr 운영 DB (강의 신청/결제 데이터). service_role 키 — 서버에서만 사용.
// 브라우저 코드에서 절대 import하지 말 것.
const url = process.env.NLAB_SUPABASE_URL
const serviceKey = process.env.NLAB_SUPABASE_SERVICE_ROLE_KEY

let _client = null

export function getNlabSupabase() {
  if (!url || !serviceKey) {
    throw new Error('NLAB_SUPABASE_URL / NLAB_SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
  }
  if (!_client) {
    _client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  }
  return _client
}
