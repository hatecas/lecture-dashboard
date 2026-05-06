// 파일(PDF/이미지/텍스트)을 받아 Gemini로 텍스트 추출만 해서 돌려줌.
// 영구 저장 X — 결과 텍스트는 호출자(어드민 UI)가 ai_references.content로 따로 저장.
//
// 권한: jinwoo만.
// body: multipart/form-data, file=<File>
// 응답: { text, fileName, mimeType, charCount, truncated }

import { verifyApiAuth } from '@/lib/apiAuth'
import { extractTextFromBuffer } from '@/lib/planners/_text'

export const runtime = 'nodejs'
export const maxDuration = 120

const PER_FILE_CHAR_LIMIT = 80000

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return Response.json({ error: auth.error || '인증이 필요합니다.' }, { status: 401 })
  }
  if (auth.user?.username !== 'jinwoo') {
    return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'multipart/form-data 형식이 아님' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'file 필드가 필요합니다.' }, { status: 400 })
  }

  const fileName = file.name || 'untitled'
  const mimeType = file.type || ''
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    let text = await extractTextFromBuffer(buffer, mimeType, fileName)
    if (!text) throw new Error('추출된 텍스트가 비어있습니다.')
    let truncated = false
    if (text.length > PER_FILE_CHAR_LIMIT) {
      text = text.slice(0, PER_FILE_CHAR_LIMIT)
      truncated = true
    }
    return Response.json({
      success: true,
      text,
      fileName,
      mimeType,
      charCount: text.length,
      truncated,
    })
  } catch (e) {
    return Response.json(
      { error: e?.message || String(e), fileName, mimeType },
      { status: 400 }
    )
  }
}
