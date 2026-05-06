// 첨부파일 URL에서 텍스트 추출.
// 지원: PDF (Gemini로 OCR 포함 추출) + 평문(text/markdown/json/xml).
// DOCX/HWP 등은 미지원 → 에러 throw.
//
// PDF 추출 방식: Gemini 2.x 멀티모달에 PDF를 inlineData(base64)로 전달하고
// "원문 텍스트만 추출" 프롬프트로 받음.
//   장점:
//     - 스캔본 PDF(이미지) OCR 자동
//     - 표/레이아웃 이해
//     - pdfjs worker 의존성 제거 (Next.js 빌드 이슈 영구 해결)
//   단점:
//     - API 호출 비용·지연
//     - inlineData는 요청 페이로드 ~20MB 한계 → 큰 파일은 분할/Files API 필요(현 한도 초과면 throw)
//
// 모델: GEMINI_MODEL 환경변수, 기본 gemini-2.0-flash. (다른 라우트와 통일)

import { GoogleGenAI } from '@google/genai'

// gemini-2.0-flash는 2026-05부터 신규 프로젝트에 비공개. 2.5-flash가 후속 모델.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
// inlineData 한도 보수적으로 18MB. 실제 한도는 ~20MB지만 base64 오버헤드(+33%) 감안.
const INLINE_DATA_LIMIT_BYTES = 18 * 1024 * 1024

const EXTRACT_PROMPT = [
  '다음 PDF의 모든 본문 텍스트를 그대로 추출해서 출력해.',
  '규칙:',
  '- 본문 텍스트만 출력. 설명·요약·마크다운·코드블록 절대 금지.',
  '- 페이지 구분이 필요하면 빈 줄 하나로만.',
  '- 표는 가능한 한 행 단위 줄바꿈으로 평문화.',
  '- 머리글/바닥글/페이지번호 등 반복 요소는 생략.',
  '- 이미지 안의 글자도 OCR해서 본문 흐름에 맞춰 포함.',
].join('\n')

let _geminiClient = null
function getGeminiClient() {
  if (_geminiClient) return _geminiClient
  // env 값 끝의 줄바꿈/공백이 붙으면 Google이 "API_KEY_INVALID"로 거절함 (CLAUDE.md §5-6 참조).
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
  }
  _geminiClient = new GoogleGenAI({ apiKey })
  return _geminiClient
}

async function extractPdfTextWithGemini(buffer, fileName) {
  if (buffer.length > INLINE_DATA_LIMIT_BYTES) {
    throw new Error(
      `PDF가 너무 큽니다 (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
      `현재 inlineData 한도 ${(INLINE_DATA_LIMIT_BYTES / 1024 / 1024).toFixed(0)}MB까지만 지원.`
    )
  }
  const client = getGeminiClient()
  const base64 = buffer.toString('base64')

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: EXTRACT_PROMPT },
        ],
      },
    ],
  })

  const text = (response?.text || '').trim()
  if (!text) {
    throw new Error(`Gemini 응답이 비어있습니다. (파일: ${fileName})`)
  }
  return text
}

export async function extractTextFromUrl(url, mimeType, fileName = '') {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`파일 다운로드 실패 (HTTP ${res.status})`)

  const lower = (mimeType || '').toLowerCase()

  // PDF — Gemini로 추출
  if (lower.includes('pdf')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    try {
      return await extractPdfTextWithGemini(buffer, fileName)
    } catch (e) {
      throw new Error('PDF 파싱 실패 (Gemini): ' + (e?.message || e))
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
      let text = await extractTextFromUrl(a.file_url, a.mime_type, a.file_name)
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
