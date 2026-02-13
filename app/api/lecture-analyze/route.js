import { verifyApiAuth } from '@/lib/apiAuth'

// Long-running route: 5 min timeout for processing large audio files
export const maxDuration = 300

// Helper: Send SSE event
function sseEvent(controller, encoder, data) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

// Helper: Split buffer into chunks of maxSize bytes
function splitBuffer(buffer, maxSize) {
  const chunks = []
  for (let i = 0; i < buffer.length; i += maxSize) {
    chunks.push(buffer.slice(i, Math.min(i + maxSize, buffer.length)))
  }
  return chunks
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

// Helper: Download YouTube audio as buffer
async function downloadYoutubeAudio(url, onProgress) {
  const ytdl = (await import('@distube/ytdl-core')).default

  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')

  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`

  onProgress('YouTube 영상 정보 가져오는 중...')
  const info = await ytdl.getInfo(fullUrl)
  const title = info.videoDetails.title
  const duration = parseInt(info.videoDetails.lengthSeconds || '0')

  onProgress(`영상: "${title}" (${Math.floor(duration / 60)}분 ${duration % 60}초)`)

  // Get audio-only format
  const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' })
    || ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })

  if (!format) throw new Error('오디오 포맷을 찾을 수 없습니다.')

  onProgress('오디오 다운로드 중...')
  const stream = ytdl(fullUrl, { format })

  const chunks = []
  let downloaded = 0
  const contentLength = parseInt(format.contentLength || '0')

  for await (const chunk of stream) {
    chunks.push(chunk)
    downloaded += chunk.length
    if (contentLength > 0) {
      const percent = Math.round((downloaded / contentLength) * 100)
      if (percent % 10 === 0) {
        onProgress(`오디오 다운로드 중... ${percent}% (${(downloaded / (1024 * 1024)).toFixed(1)}MB)`)
      }
    }
  }

  const audioBuffer = Buffer.concat(chunks)
  const ext = format.container || 'webm'
  const mimeType = format.mimeType?.split(';')[0] || `audio/${ext}`

  onProgress(`다운로드 완료: ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)

  return { audioBuffer, ext, mimeType, title }
}

// Helper: Transcribe audio buffer with Whisper API (handles chunking)
async function transcribeAudio(audioBuffer, fileName, mimeType, openaiKey, onProgress) {
  const MAX_CHUNK_SIZE = 24 * 1024 * 1024 // 24MB (under 25MB limit)

  let chunks
  if (audioBuffer.length <= MAX_CHUNK_SIZE) {
    chunks = [audioBuffer]
  } else {
    chunks = splitBuffer(audioBuffer, MAX_CHUNK_SIZE)
    onProgress(`파일이 ${chunks.length}개 청크로 분할됩니다 (총 ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB)`)
  }

  const transcripts = []

  for (let i = 0; i < chunks.length; i++) {
    onProgress(`전사 중... (${i + 1}/${chunks.length})`)

    const ext = fileName.split('.').pop() || 'mp3'
    const chunkFileName = chunks.length > 1 ? `chunk_${i + 1}.${ext}` : fileName

    const formData = new FormData()
    const blob = new Blob([chunks[i]], { type: mimeType || 'audio/mpeg' })
    formData.append('file', blob, chunkFileName)
    formData.append('model', 'whisper-1')
    formData.append('language', 'ko')
    formData.append('response_format', 'text')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Whisper API 오류 (청크 ${i + 1}): ${errText}`)
    }

    const text = await response.text()
    transcripts.push(text.trim())
    onProgress(`전사 완료 (${i + 1}/${chunks.length})`)
  }

  return transcripts.join('\n\n')
}

// Helper: Analyze transcript with GPT
async function analyzeWithGPT(transcript, prompt, openaiKey, onProgress) {
  onProgress('GPT-4o로 분석 중...')

  // Truncate if transcript is very long (GPT token limit)
  const maxChars = 120000 // ~30k tokens for GPT-4o
  const truncated = transcript.length > maxChars
    ? transcript.slice(0, maxChars) + '\n\n...(이하 생략, 전체 분량이 너무 길어 일부만 분석)'
    : transcript

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: truncated }
      ],
      max_tokens: 4000,
      temperature: 0.3
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`GPT API 오류: ${errText}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
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
        const openaiKey = formData.get('openaiKey')
        const prompt = formData.get('prompt')
        const inputMode = formData.get('inputMode')

        if (!openaiKey) throw new Error('OpenAI API Key가 필요합니다.')
        if (!prompt) throw new Error('분석 프롬프트가 필요합니다.')

        let audioBuffer, fileName, mimeType

        if (inputMode === 'youtube') {
          // YouTube 오디오 추출
          const youtubeUrl = formData.get('youtubeUrl')
          if (!youtubeUrl) throw new Error('YouTube URL이 필요합니다.')

          sendProgress('YouTube 처리 중', 10, '영상에서 오디오를 추출합니다...')

          const result = await downloadYoutubeAudio(youtubeUrl, (msg) => {
            sendProgress('YouTube 처리 중', 20, msg)
          })

          audioBuffer = result.audioBuffer
          fileName = `audio.${result.ext}`
          mimeType = result.mimeType

          sendProgress('오디오 추출 완료', 30, `${result.title} - ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)
        } else {
          // 파일 업로드
          const audioFile = formData.get('audioFile')
          if (!audioFile) throw new Error('오디오 파일이 필요합니다.')

          sendProgress('파일 처리 중', 15, '업로드된 파일을 처리합니다...')

          const arrayBuffer = await audioFile.arrayBuffer()
          audioBuffer = Buffer.from(arrayBuffer)
          fileName = audioFile.name || 'audio.mp3'
          mimeType = audioFile.type || 'audio/mpeg'

          sendProgress('파일 준비 완료', 30, `${fileName} - ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)
        }

        // Whisper 전사
        sendProgress('AI 전사 시작', 35, 'Whisper로 음성을 텍스트로 변환합니다...')

        const chunkCount = Math.ceil(audioBuffer.length / (24 * 1024 * 1024))
        let currentChunk = 0

        const transcript = await transcribeAudio(audioBuffer, fileName, mimeType, openaiKey, (msg) => {
          if (msg.includes('전사 중')) {
            currentChunk++
            const progress = 35 + Math.round((currentChunk / chunkCount) * 40)
            sendProgress('전사 중', Math.min(progress, 75), msg)
          } else if (msg.includes('분할')) {
            sendProgress('전사 준비', 35, msg)
          } else {
            sendProgress('전사 중', 70, msg)
          }
        })

        if (!transcript || transcript.trim().length === 0) {
          throw new Error('전사 결과가 비어있습니다. 오디오 파일을 확인해주세요.')
        }

        sendProgress('전사 완료', 80, `전사 완료: ${transcript.length.toLocaleString()}자`)

        // GPT 분석
        sendProgress('AI 분석 중', 85, 'GPT-4o가 강의 내용을 분석합니다...')

        const analysis = await analyzeWithGPT(transcript, prompt, openaiKey, (msg) => {
          sendProgress('AI 분석 중', 90, msg)
        })

        // 결과 전송
        sseEvent(controller, encoder, {
          type: 'result',
          transcript,
          analysis
        })

      } catch (error) {
        sseEvent(controller, encoder, {
          type: 'error',
          message: error.message || '알 수 없는 오류가 발생했습니다.'
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
