import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai'
import { verifyApiAuth } from '@/lib/apiAuth'

// Vercel Hobby 최대 300초. Pro 플랜이면 더 길게 설정 가능.
export const maxDuration = 300
export const runtime = 'nodejs'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

// SSE 헬퍼
const sseEvent = (data) =>
  `data: ${JSON.stringify(data)}\n\n`

function extractVideoId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

async function analyzeYoutubeUrl(client, youtubeUrl, prompt, onProgress) {
  // Gemini는 공개 YouTube URL을 video/mp4 mime으로 from_uri 형태로 직접 받을 수 있음
  onProgress({ step: 'Gemini 요청 전송', percent: 25, detail: 'YouTube 영상을 Gemini에 전달합니다…' })
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: createUserContent([
      createPartFromUri(youtubeUrl, 'video/mp4'),
      prompt,
    ]),
  })
  const text = response?.text
  if (!text) throw new Error('Gemini 응답이 비어있습니다.')
  return text
}

async function analyzeUploadedFile(client, file, prompt, onProgress) {
  onProgress({ step: 'Gemini 업로드 중', percent: 20, detail: `${file.name || 'file'} 업로드…` })
  // SDK는 Blob/File 또는 path를 받음. 브라우저에서 받은 File은 Blob이라 그대로 전달.
  let uploaded = await client.files.upload({
    file,
    config: { mimeType: file.type || 'video/mp4' },
  })
  onProgress({ step: '파일 처리 대기', percent: 40, detail: `업로드 완료 (state=${uploaded.state})` })

  // 처리 완료까지 폴링 (PROCESSING → ACTIVE/FAILED)
  let waitTicks = 0
  while (uploaded.state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 3000))
    waitTicks += 1
    uploaded = await client.files.get({ name: uploaded.name })
    onProgress({
      step: '파일 처리 대기',
      percent: Math.min(40 + waitTicks * 2, 60),
      detail: `Gemini가 파일을 처리 중… (${waitTicks * 3}초)`,
    })
  }
  if (uploaded.state === 'FAILED') {
    throw new Error('Gemini 파일 처리 실패')
  }

  onProgress({ step: 'Gemini 분석 중', percent: 65, detail: '영상 분석 중…' })
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: createUserContent([
      createPartFromUri(uploaded.uri, uploaded.mimeType || file.type || 'video/mp4'),
      prompt,
    ]),
  })

  // 업로드 파일 정리(실패해도 무시)
  try {
    await client.files.delete({ name: uploaded.name })
  } catch (_) {}

  const text = response?.text
  if (!text) throw new Error('Gemini 응답이 비어있습니다.')
  return text
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error || '인증이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!process.env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const formData = await request.formData()
  const prompt = String(formData.get('prompt') || '').trim()
  const inputMode = String(formData.get('inputMode') || 'youtube')
  const youtubeUrl = String(formData.get('youtubeUrl') || '').trim()
  const videoFile = formData.get('videoFile')

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'prompt가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event) => controller.enqueue(enc.encode(sseEvent(event)))
      const onProgress = (event) => send({ type: 'progress', ...event })

      try {
        let analysis = null

        if (inputMode === 'youtube') {
          const videoId = extractVideoId(youtubeUrl)
          if (!videoId) {
            send({ type: 'error', message: '유효하지 않은 YouTube URL입니다.' })
            controller.close()
            return
          }
          const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`
          send({ type: 'progress', step: '준비', percent: 10, detail: 'YouTube URL 파싱 완료' })
          analysis = await analyzeYoutubeUrl(client, normalizedUrl, prompt, onProgress)
        } else {
          if (!videoFile || typeof videoFile.arrayBuffer !== 'function') {
            send({ type: 'error', message: '파일이 필요합니다.' })
            controller.close()
            return
          }
          analysis = await analyzeUploadedFile(client, videoFile, prompt, onProgress)
        }

        if (analysis) {
          send({ type: 'progress', step: '분석 완료', percent: 95, detail: '결과 정리 중…' })
          send({ type: 'result', analysis })
        } else {
          send({ type: 'error', message: '분석 결과가 비어있습니다.' })
        }
      } catch (err) {
        send({ type: 'error', message: `${err.name || 'Error'}: ${err.message || String(err)}` })
      } finally {
        try { controller.close() } catch (_) {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
