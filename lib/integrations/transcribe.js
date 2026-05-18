// 오디오 → 한국어 텍스트 받아쓰기 (Gemini 2.5 Flash).
// 노션 페이지 안 audio 블록의 음성 파일을 자동 transcribe하는 데 사용.
//
// 두 가지 모드:
//   - inline (파일 ≤ 18MB): base64로 직접 전달 — 빠름, 추가 latency 거의 없음
//   - Files API (파일 > 18MB): Gemini Files에 upload 후 file_uri 사용
//                              (1시간 이상 오디오는 보통 30~50MB라 이쪽으로 빠짐)
//
// 비용 (참고): Gemini 2.5 Flash 오디오 입력 ~$0.075/초 단가, 1시간 오디오 ~$0.10
// 시간 (참고): 1시간 오디오 → 받아쓰기 60~150초

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const INLINE_LIMIT_BYTES = 18 * 1024 * 1024 // 18MB
const MAX_AUDIO_BYTES = 200 * 1024 * 1024 // 200MB 안전 캡 (그 이상은 거부)
const FILES_API_POLL_INTERVAL_MS = 2000
// 50MB+ 큰 오디오는 Gemini Files API의 PROCESSING → ACTIVE 전환에 60초 이상 걸리는 경우 있음.
// 60초 → 180초로 늘림. (Vercel maxDuration 300초보다 작아 timeout 충돌 X.)
const FILES_API_POLL_TIMEOUT_MS = 180000

const TRANSCRIBE_PROMPT = [
  '이 오디오의 모든 발화 내용을 한국어로 받아쓰기 해주세요.',
  '규칙:',
  '- 본문 텍스트만 출력. 설명·요약·마크다운 코드블록 금지.',
  '- 화자 구분 표기 X (그냥 자연스러운 한국어 문장 흐름).',
  '- 시간 표시 X.',
  '- "음...", "어...", "그..." 같은 간투사는 생략 OK.',
  '- 잘 안 들리는 부분은 [불명확]으로 표시.',
  '- 한 단락이 길면 자연스러운 위치에서 빈 줄로 구분.',
].join('\n')

let _client = null
function getClient() {
  if (_client) return _client
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
  _client = new GoogleGenAI({ apiKey })
  return _client
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// URL extension에서 MIME 추정. 노션 signed URL은 보통 ?쿼리 앞에 .mp3/.m4a 등이 붙어있음.
function detectAudioMime(url, fallback = 'audio/mp3') {
  if (!url) return fallback
  const cleanPath = url.split('?')[0].toLowerCase()
  if (cleanPath.endsWith('.mp3')) return 'audio/mp3'
  if (cleanPath.endsWith('.m4a')) return 'audio/mp3' // Gemini는 m4a를 mp3로 받음
  if (cleanPath.endsWith('.mp4')) return 'audio/mp3'
  if (cleanPath.endsWith('.aac')) return 'audio/aac'
  if (cleanPath.endsWith('.wav')) return 'audio/wav'
  if (cleanPath.endsWith('.ogg')) return 'audio/ogg'
  if (cleanPath.endsWith('.flac')) return 'audio/flac'
  if (cleanPath.endsWith('.aiff') || cleanPath.endsWith('.aif')) return 'audio/aiff'
  return fallback
}

// 1시간 한국어 받아쓰기 = 보통 30K~50K 토큰. Gemini 2.5 Flash 기본 max_output_tokens가
// 8192라 그대로 두면 긴 오디오가 silently truncate되어 "결과 0자" 또는 중간 끊김으로 나옴.
// 65536으로 명시 (모델 한도 가까이) → 1시간+ 미팅 녹음도 안전.
const TRANSCRIBE_GEN_CONFIG = { maxOutputTokens: 65536 }

// generateContent 호출 재시도 정책.
// 재시도 대상:
//   - "fetch failed" / "ECONNRESET" / "ETIMEDOUT" 등 일시적 네트워크 오류
//   - 빈 응답 (Gemini가 가끔 silently 빈 텍스트 반환)
// 비대상: 인증 오류, 400 잘못된 요청 등
const MAX_GEN_RETRIES = 2
const RETRY_BACKOFF_MS = [3000, 10000]

function isTransientGenError(err) {
  const msg = (err?.message || '').toLowerCase()
  return /fetch failed|econnreset|etimedout|socket hang up|network|aborted|timeout/.test(msg)
}

async function callGenerateContentWithRetry(client, contents, label) {
  let lastErr = null
  for (let attempt = 0; attempt <= MAX_GEN_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: TRANSCRIBE_GEN_CONFIG,
      })
      const text = (response?.text || '').trim()
      if (text) return text
      // 빈 응답 — 한 번 재시도. 그래도 빈응답이면 에러로 종료.
      lastErr = new Error(`Gemini 응답이 비어있습니다 (받아쓰기 결과 0자). [${label}, 시도 ${attempt + 1}]`)
      if (attempt < MAX_GEN_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] || 10000)
        continue
      }
      throw lastErr
    } catch (err) {
      lastErr = err
      if (attempt < MAX_GEN_RETRIES && isTransientGenError(err)) {
        await sleep(RETRY_BACKOFF_MS[attempt] || 10000)
        continue
      }
      throw err
    }
  }
  throw lastErr || new Error('Gemini 받아쓰기 실패 (원인 미상)')
}

async function transcribeInline(buffer, mimeType) {
  const client = getClient()
  return await callGenerateContentWithRetry(client, [{
    role: 'user',
    parts: [
      { inlineData: { mimeType, data: buffer.toString('base64') } },
      { text: TRANSCRIBE_PROMPT },
    ],
  }], 'inline')
}

async function transcribeViaFilesApi(buffer, mimeType, displayName) {
  const client = getClient()
  // /tmp는 Vercel 서버리스에서도 쓰기 가능
  const tmpPath = path.join(os.tmpdir(), `nb-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`)
  fs.writeFileSync(tmpPath, buffer)

  try {
    let uploaded = await client.files.upload({
      file: tmpPath,
      config: { mimeType, displayName: displayName || 'audio.bin' },
    })

    // PROCESSING → ACTIVE 대기
    const start = Date.now()
    while (uploaded?.state === 'PROCESSING') {
      if (Date.now() - start > FILES_API_POLL_TIMEOUT_MS) {
        throw new Error(`Gemini Files API 처리 타임아웃 (${FILES_API_POLL_TIMEOUT_MS / 1000}s)`)
      }
      await sleep(FILES_API_POLL_INTERVAL_MS)
      uploaded = await client.files.get({ name: uploaded.name })
    }
    if (uploaded?.state !== 'ACTIVE') {
      throw new Error(`Gemini Files API 상태 비정상: ${uploaded?.state || 'unknown'}`)
    }

    return await callGenerateContentWithRetry(client, [{
      role: 'user',
      parts: [
        { fileData: { mimeType, fileUri: uploaded.uri } },
        { text: TRANSCRIBE_PROMPT },
      ],
    }], `files-api/${displayName}`)
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
    // 업로드된 파일은 Gemini가 48시간 후 자동 삭제 — 명시 삭제는 생략(API 호출 줄이기)
  }
}

/**
 * URL의 오디오를 받아쓰기.
 * @param {string} url - 오디오 URL (노션 signed URL, Drive 직접 다운로드 URL 등)
 * @param {object} [opts]
 * @param {string} [opts.mimeType] - 미상이면 URL에서 추정
 * @param {string} [opts.displayName] - 디버그/UI용
 * @param {(stage: 'downloading'|'uploading'|'transcribing'|'done', info?:object) => void} [opts.onStage]
 * @returns {Promise<{ text: string, sizeBytes: number, mode: 'inline'|'files-api', durationMs: number }>}
 */
export async function transcribeAudioFromUrl(url, opts = {}) {
  const t0 = Date.now()
  const onStage = opts.onStage || (() => {})
  const displayName = opts.displayName || 'audio'

  // 1. 다운로드
  onStage('downloading', { url })
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`오디오 다운로드 실패 (HTTP ${res.status})`)
  }

  const responseContentType = (res.headers.get('content-type') || '').toLowerCase()
  // HTML/JSON 응답이면 audio 파일이 아님 — Drive 권한 문제 등
  if (responseContentType.includes('text/html') || responseContentType.startsWith('application/json')) {
    throw new Error(
      `다운로드 응답이 오디오가 아닙니다 (Content-Type: ${responseContentType}). ` +
      `Drive 파일이라면 '링크 있는 모든 사용자 보기' 권한으로 공유되어 있는지 확인해주세요.`
    )
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error(
      `오디오 파일이 너무 큽니다 (${(buffer.length / 1024 / 1024).toFixed(0)}MB). ` +
      `현재 ${MAX_AUDIO_BYTES / 1024 / 1024}MB까지만 지원.`
    )
  }

  // MIME 결정: 응답 헤더 우선, 그다음 hint, 마지막 URL 추정
  let mimeType = opts.mimeType
  if (responseContentType.startsWith('audio/')) {
    mimeType = responseContentType.split(';')[0].trim()
  } else if (!mimeType) {
    mimeType = detectAudioMime(url)
  }
  // 오디오 아닌 다른 미디어(image/video)는 즉시 거부 — Gemini가 받아도 받아쓰기 못 함
  if (!mimeType.startsWith('audio/')) {
    throw new Error(
      `오디오 파일이 아닙니다 (감지된 MIME: ${mimeType}, 응답 Content-Type: ${responseContentType}). ` +
      `받아쓰기 스킵.`
    )
  }

  return await _transcribeBuffer(buffer, mimeType, displayName, onStage, t0)
}

// 버퍼 + MIME 직접 받아서 받아쓰기 (Drive에서 미리 받아둔 경우)
export async function transcribeAudioFromBuffer(buffer, mimeType, opts = {}) {
  const t0 = Date.now()
  const onStage = opts.onStage || (() => {})
  const displayName = opts.displayName || 'audio'
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error(`오디오 파일이 너무 큽니다 (${(buffer.length / 1024 / 1024).toFixed(0)}MB).`)
  }
  if (!mimeType?.startsWith('audio/')) {
    throw new Error(`오디오 MIME이 아닙니다: ${mimeType}`)
  }
  return await _transcribeBuffer(buffer, mimeType, displayName, onStage, t0)
}

async function _transcribeBuffer(buffer, mimeType, displayName, onStage, t0) {
  let text
  let mode
  if (buffer.length <= INLINE_LIMIT_BYTES) {
    onStage('transcribing', { mode: 'inline', sizeBytes: buffer.length })
    text = await transcribeInline(buffer, mimeType)
    mode = 'inline'
  } else {
    onStage('uploading', { sizeBytes: buffer.length })
    onStage('transcribing', { mode: 'files-api', sizeBytes: buffer.length })
    text = await transcribeViaFilesApi(buffer, mimeType, displayName)
    mode = 'files-api'
  }
  if (!text) throw new Error('Gemini 응답이 비어있습니다 (받아쓰기 결과 0자).')
  const durationMs = Date.now() - t0
  onStage('done', { sizeBytes: buffer.length, mode, durationMs, charCount: text.length })
  return { text, sizeBytes: buffer.length, mode, durationMs }
}
