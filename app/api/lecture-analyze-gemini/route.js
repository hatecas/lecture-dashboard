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

// Helper: Download YouTube audio via system yt-dlp
async function downloadYoutubeAudio(url, onProgress) {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const fs = await import('fs/promises')
  const os = await import('os')
  const path = await import('path')
  const execFileAsync = promisify(execFile)

  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')

  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-gemini-'))

  try {
    onProgress('YouTube 영상 정보 가져오는 중...')
    const { stdout: infoJson } = await execFileAsync('yt-dlp', [
      '--dump-single-json', '--no-warnings', fullUrl
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 30000 })

    const info = JSON.parse(infoJson)
    const title = info.title || ''
    const duration = info.duration || 0
    onProgress(`영상: "${title}" (${Math.floor(duration / 60)}분 ${duration % 60}초)`)

    onProgress('YouTube 오디오 다운로드 중...')
    await execFileAsync('yt-dlp', [
      '-f', 'bestaudio',
      '-o', path.join(tmpDir, 'audio.%(ext)s'),
      '--no-warnings', fullUrl
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 240000 })

    const files = await fs.readdir(tmpDir)
    if (files.length === 0) throw new Error('다운로드된 파일을 찾을 수 없습니다.')

    const filePath = path.join(tmpDir, files[0])
    const buffer = await fs.readFile(filePath)
    const ext = files[0].split('.').pop() || 'webm'
    const mimeType = ext === 'm4a' ? 'audio/mp4' : ext === 'mp4' ? 'audio/mp4' : `audio/${ext}`

    onProgress(`다운로드 완료: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB`)

    return { buffer, ext, mimeType, title }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('yt-dlp가 설치되어 있지 않습니다. "winget install yt-dlp" 또는 "pip install yt-dlp"로 설치해주세요.')
    }
    throw error
  } finally {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  }
}

// Helper: Analyze YouTube video with Gemini (download + File API upload)
async function analyzeYoutubeWithGemini(youtubeUrl, prompt, geminiKey, onProgress) {
  const { buffer, ext, mimeType } = await downloadYoutubeAudio(youtubeUrl, onProgress)

  return analyzeFileWithGemini(buffer, `youtube_audio.${ext}`, mimeType, prompt, geminiKey, onProgress)
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
