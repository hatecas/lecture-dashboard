// 큰 파일(>4.5MB)을 Vercel 함수 우회해서 Supabase Storage에 직접 업로드하기 위한
// signed upload URL 발급 엔드포인트.
//
// 흐름:
//   1) 클라이언트 → POST /api/files/sign-upload  with { instructor_id, file_name, file_size }
//   2) 서버 → 새 storage_path 생성 + Supabase createSignedUploadUrl로 토큰 발급
//   3) 클라이언트 → supabase.storage.uploadToSignedUrl(path, token, file)  ← 큰 파일 직접 업로드
//   4) 클라이언트 → POST /api/files  with { storage_path, ... }  ← 메타데이터 DB 기록

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// 200MB. 클라이언트와 동일한 한도 (Dashboard.js의 MAX_FILE_BYTES와 일치 유지).
const MAX_FILE_BYTES = 200 * 1024 * 1024

// 서버 전용 클라이언트 (service_role 우선, 없으면 anon — 대부분의 경우 service_role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || '인증 필요' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 })
  }

  const { instructor_id, file_name, file_size } = body || {}
  if (!instructor_id) return NextResponse.json({ error: 'instructor_id 필요' }, { status: 400 })
  if (!file_name) return NextResponse.json({ error: 'file_name 필요' }, { status: 400 })

  if (typeof file_size === 'number' && file_size > MAX_FILE_BYTES) {
    return NextResponse.json({
      error: `파일이 너무 큽니다 (${(file_size / 1024 / 1024).toFixed(1)}MB). 최대 ${MAX_FILE_BYTES / 1024 / 1024}MB까지만 지원합니다.`,
    }, { status: 413 })
  }

  // 파일명 정규화 (영문/숫자/.-/ _ 외 제거)
  const safeName = String(file_name)
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200)
  const storagePath = `instructor_${instructor_id}/${Date.now()}_${safeName}`

  try {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUploadUrl(storagePath)
    if (error) throw error
    return NextResponse.json({
      success: true,
      storage_path: storagePath,
      // signedUrl: 직접 PUT 가능한 풀 URL (필요 시 사용)
      signed_url: data.signedUrl,
      token: data.token,
      path: data.path,
      max_bytes: MAX_FILE_BYTES,
    })
  } catch (e) {
    console.error('[files/sign-upload] 실패:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
