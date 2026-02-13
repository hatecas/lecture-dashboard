import { verifyApiAuth } from '@/lib/apiAuth'
import { GoogleGenAI } from '@google/genai'

// Long-running route: 5 min timeout for processing large video files
export const maxDuration = 300

// Helper: Send SSE event
function sseEvent(controller, encoder, data) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

// Helper: Extract YouTube video ID
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Helper: Fetch YouTube transcript (no auth required)
async function fetchYoutubeTranscript(videoId, onProgress) {
  onProgress('YouTube 자막 가져오는 중...')

  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    }
  })
  if (!res.ok) throw new Error(`YouTube 페이지 로드 실패: ${res.status}`)

  const html = await res.text()

  // Extract video title
  const titleMatch = html.match(/"title":"(.*?)"/) || html.match(/<title>(.*?)<\/title>/)
  const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&').replace(/ - YouTube$/, '') : ''

  // Find caption tracks
  const captionMatch = html.match(/"captionTracks":(\[.*?\])/)
  if (!captionMatch) {
    throw new Error('이 영상에 자막이 없습니다. 파일 업로드 방식을 이용해주세요.')
  }

  const tracks = JSON.parse(captionMatch[1])

  // Prefer Korean → auto-generated → first available
  const track = tracks.find(t => t.languageCode === 'ko' && t.kind !== 'asr')
    || tracks.find(t => t.languageCode === 'ko')
    || tracks.find(t => t.kind === 'asr')
    || tracks[0]

  if (!track) throw new Error('사용 가능한 자막 트랙이 없습니다.')

  onProgress(`자막 다운로드 중... (${track.name?.simpleText || track.languageCode})`)

  const captionRes = await fetch(track.baseUrl)
  if (!captionRes.ok) throw new Error('자막 다운로드 실패')

  const xml = await captionRes.text()

  // Parse XML → plain text
  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
  const transcript = segments
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n/g, ' '))
    .join(' ')
    .trim()

  if (!transcript) throw new Error('자막 내용이 비어있습니다.')

  onProgress(`자막 완료: ${transcript.length.toLocaleString()}자`)

  return { title, transcript }
}

// Helper: Analyze YouTube via transcript + Gemini text analysis
async function analyzeYoutubeWithGemini(youtubeUrl, prompt, geminiKey, onProgress) {
  const ai = new GoogleGenAI({ apiKey: geminiKey })

  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')

  const { title, transcript } = await fetchYoutubeTranscript(videoId, onProgress)

  onProgress('Gemini가 강의 내용을 분석 중...')

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { text: `[강의 제목: ${title}]\n\n[강의 자막 전문]\n${transcript}\n\n---\n\n${prompt}` }
    ],
  })

  return response.text
}

// Helper: Analyze uploaded file with Gemini (via File API)
async function analyzeFileWithGemini(fileBuffer, fileName, mimeType, prompt, geminiKey, onProgress) {
  const ai = new GoogleGenAI({ apiKey: geminiKey })

  onProgress('Gemini File API에 업로드 중...')

  // Upload file via File API
  const uploadedFile = await ai.files.upload({
    file: new Blob([fileBuffer], { type: mimeType }),
    config: { mimeType: mimeType },
  })

  onProgress('파일 처리 대기 중...')

  // Wait for file to be processed (poll status)
  let file = uploadedFile
  let attempts = 0
  while (file.state === 'PROCESSING' && attempts < 60) {
    await new Promise(r => setTimeout(r, 3000))
    file = await ai.files.get({ name: file.name })
    attempts++
    onProgress(`파일 처리 중... (${attempts * 3}초 경과)`)
  }

  if (file.state === 'FAILED') {
    throw new Error('Gemini 파일 처리에 실패했습니다.')
  }

  onProgress('Gemini가 영상을 분석 중...')

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        fileData: {
          fileUri: file.uri,
          mimeType: file.mimeType,
        },
      },
      { text: prompt }
    ],
  })

  return response.text
}

export async function POST(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // SSE 스트리밍 응답
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const sendProgress = (step, percent, detail) => {
        sseEvent(controller, encoder, { type: 'progress', step, percent, detail })
      }

      try {
        const formData = await request.formData()
        const geminiKey = formData.get('geminiKey')
        const prompt = formData.get('prompt')
        const inputMode = formData.get('inputMode')

        if (!geminiKey) throw new Error('Gemini API Key가 필요합니다.')
        if (!prompt) throw new Error('분석 프롬프트가 필요합니다.')

        let analysis

        if (inputMode === 'youtube') {
          const youtubeUrl = formData.get('youtubeUrl')
          if (!youtubeUrl) throw new Error('YouTube URL이 필요합니다.')

          sendProgress('YouTube 분석 시작', 10, 'Gemini가 YouTube 영상을 직접 분석합니다...')

          analysis = await analyzeYoutubeWithGemini(youtubeUrl, prompt, geminiKey, (msg) => {
            sendProgress('Gemini 분석 중', 50, msg)
          })

          sendProgress('분석 완료', 95, '결과를 정리합니다...')

        } else {
          // 파일 업로드 방식
          const videoFile = formData.get('videoFile')
          if (!videoFile) throw new Error('영상/오디오 파일이 필요합니다.')

          sendProgress('파일 처리 중', 10, '업로드된 파일을 처리합니다...')

          const arrayBuffer = await videoFile.arrayBuffer()
          const fileBuffer = Buffer.from(arrayBuffer)
          const fileName = videoFile.name || 'video.mp4'
          const mimeType = videoFile.type || 'video/mp4'

          sendProgress('Gemini 업로드 중', 20, `${fileName} - ${(fileBuffer.length / (1024 * 1024)).toFixed(1)}MB`)

          analysis = await analyzeFileWithGemini(fileBuffer, fileName, mimeType, prompt, geminiKey, (msg) => {
            const percent = msg.includes('업로드') ? 30 : msg.includes('처리 중') ? 50 : 70
            sendProgress('Gemini 분석 중', percent, msg)
          })

          sendProgress('분석 완료', 95, '결과를 정리합니다...')
        }

        // 결과 전송
        sseEvent(controller, encoder, {
          type: 'result',
          analysis
        })

      } catch (error) {
        let errMsg = '알 수 없는 오류'
        try {
          errMsg = [
            error?.message,
            error?.stderr,
            error?.shortMessage,
            error?.code && `code: ${error.code}`,
            error?.exitCode != null && `exitCode: ${error.exitCode}`,
          ].filter(Boolean).join(' | ') || JSON.stringify(error, Object.getOwnPropertyNames(error || {}))
        } catch (e) { errMsg = String(error) }
        sseEvent(controller, encoder, {
          type: 'error',
          message: errMsg
        })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
