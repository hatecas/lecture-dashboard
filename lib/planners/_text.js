// 첨부파일 URL에서 텍스트 추출.
// 현재는 PDF + 평문(text/markdown/json) 지원. DOCX/HWP 등은 미지원 → 에러 throw.
//
// pdf-parse: Next.js에서 모듈 평가 시 테스트 PDF 자동 로드 시도하다 실패 → 동적 import로 우회.

export async function extractTextFromUrl(url, mimeType) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`파일 다운로드 실패 (HTTP ${res.status})`)

  const lower = (mimeType || '').toLowerCase()

  // PDF
  if (lower.includes('pdf')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    try {
      const mod = await import('pdf-parse')
      const pdfParse = mod?.default || mod
      const data = await pdfParse(buffer)
      return (data?.text || '').trim()
    } catch (e) {
      throw new Error('PDF 파싱 실패: ' + (e?.message || e))
    }
  }

  // 평문 계열
  if (
    lower.startsWith('text/') ||
    lower.includes('markdown') ||
    lower === 'application/json' ||
    lower === 'application/xml'
  ) {
    return (await res.text()).trim()
  }

  throw new Error(`지원하지 않는 파일 형식 (${mimeType || '미상'}). PDF 또는 텍스트 파일을 사용해주세요.`)
}

const PER_FILE_CHAR_LIMIT = 80000

/**
 * @param {Array<{file_url:string, mime_type?:string, file_name:string}>} attachments
 * @returns {Promise<Array<{name:string, text:string, error?:string, truncated?:boolean}>>}
 */
export async function extractEbookContents(attachments) {
  const out = []
  for (const a of attachments) {
    const entry = { name: a.file_name }
    try {
      let text = await extractTextFromUrl(a.file_url, a.mime_type)
      if (!text) throw new Error('추출된 텍스트가 비어있습니다.')
      if (text.length > PER_FILE_CHAR_LIMIT) {
        text = text.slice(0, PER_FILE_CHAR_LIMIT)
        entry.truncated = true
      }
      entry.text = text
    } catch (e) {
      entry.text = ''
      entry.error = e?.message || String(e)
    }
    out.push(entry)
  }
  return out
}
