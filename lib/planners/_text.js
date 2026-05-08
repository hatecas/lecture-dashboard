// 첨부파일 URL/버퍼에서 텍스트 추출.
// 지원: PDF + 이미지(jpg/png/webp/gif/heic) — Gemini OCR / 평문(text/markdown/json/xml).
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

const EXTRACT_PROMPT_PDF = [
  '다음 PDF의 모든 본문 텍스트를 그대로 추출해서 출력해.',
  '규칙:',
  '- 본문 텍스트만 출력. 설명·요약·마크다운·코드블록 절대 금지.',
  '- 페이지 구분이 필요하면 빈 줄 하나로만.',
  '- 표는 가능한 한 행 단위 줄바꿈으로 평문화.',
  '- 머리글/바닥글/페이지번호 등 반복 요소는 생략.',
  '- 이미지 안의 글자도 OCR해서 본문 흐름에 맞춰 포함.',
].join('\n')

const EXTRACT_PROMPT_IMAGE = [
  '이 이미지에 보이는 본문 텍스트를 그대로 추출해서 출력해 (OCR).',
  '',
  '규칙:',
  '- 텍스트만 출력. 설명·요약·마크다운·코드블록 절대 금지.',
  '- 위→아래, 왼→오른쪽 자연스러운 읽기 순서로.',
  '- 단락이 나뉘면 빈 줄 하나로만 구분.',
  '- 워터마크·페이지번호·반복 UI 요소는 생략.',
  '',
  '★ 이모지 — 매우 중요:',
  '- 줄 시작 / 중간 / 끝에 있는 모든 이모지를 원래 위치에 그대로 보존.',
  '  예: "🚨 이거 진짜 무료로..." → 🚨 그대로 출력.',
  '  예: "✅ 무료강의 일정 :" → ✅ 그대로 출력.',
  '- 이모지를 텍스트 설명("[경고 이모지]" 같은)으로 바꾸지 마세요. 유니코드 그대로.',
  '- 자주 등장하는 것들: 🚨 📌 🎁 🔥 ✅ ⚠️ ❌ ✔ 🙏 ⏰ 📢 ‼️ 💬 ✏️ 📅 📍 🎵 🎯',
  '',
  '★ 광고/배너 이미지 안의 텍스트는 무시:',
  '- 이미지 안에 또 다른 광고성 이미지(배너, 썸네일, 디자인 그래픽)가 박혀있으면 그 안의 카피·로고·CTA는 추출하지 마세요.',
  '- 일반 채팅/메모/문서의 본문 텍스트만 추출.',
  '- 광고 배너인지 본문 텍스트인지 애매하면 본문 텍스트 추출.',
  '',
  '- 글자가 전혀 없으면 이미지 내용을 한국어로 1~2문장 묘사.',
].join('\n')

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
])

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

async function extractWithGeminiInline(buffer, mimeType, prompt, fileName) {
  if (buffer.length > INLINE_DATA_LIMIT_BYTES) {
    throw new Error(
      `파일이 너무 큽니다 (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
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
          { inlineData: { mimeType, data: base64 } },
          { text: prompt },
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

// 버퍼 + mime 으로부터 텍스트 추출. URL 다운로드와 분리해 재사용.
export async function extractTextFromBuffer(buffer, mimeType, fileName = '') {
  const lower = (mimeType || '').toLowerCase()

  // PDF
  if (lower.includes('pdf')) {
    try {
      return await extractWithGeminiInline(buffer, 'application/pdf', EXTRACT_PROMPT_PDF, fileName)
    } catch (e) {
      throw new Error('PDF 파싱 실패 (Gemini): ' + (e?.message || e))
    }
  }

  // 이미지 OCR
  if (lower.startsWith('image/') && SUPPORTED_IMAGE_MIMES.has(lower)) {
    try {
      // jpg는 일부 환경에서 'image/jpg'로 오기도 함 → Gemini는 'image/jpeg' 표준
      const sentMime = lower === 'image/jpg' ? 'image/jpeg' : lower
      return await extractWithGeminiInline(buffer, sentMime, EXTRACT_PROMPT_IMAGE, fileName)
    } catch (e) {
      throw new Error('이미지 OCR 실패 (Gemini): ' + (e?.message || e))
    }
  }

  // 평문 계열
  if (
    lower.startsWith('text/') ||
    lower.includes('markdown') ||
    lower === 'application/json' ||
    lower === 'application/xml'
  ) {
    return buffer.toString('utf-8').trim()
  }

  throw new Error(`지원하지 않는 파일 형식 (${mimeType || '미상'}). PDF/이미지/텍스트 파일을 사용해주세요.`)
}

export async function extractTextFromUrl(url, mimeType, fileName = '') {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`파일 다운로드 실패 (HTTP ${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return extractTextFromBuffer(buffer, mimeType, fileName)
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
