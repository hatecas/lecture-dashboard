import { verifyApiAuth } from '@/lib/apiAuth'
import { getSubtitles } from 'youtube-caption-extractor'

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

// Helper: Fetch YouTube captions (same as Gemini route)
async function fetchYoutubeCaptions(videoId, onProgress) {
  onProgress('YouTube 자막 가져오는 중...')
  try {
    let subtitles = await getSubtitles({ videoID: videoId, lang: 'ko' })
    if (!subtitles || subtitles.length === 0) {
      onProgress('한국어 자막 없음, 영어 자막 시도 중...')
      subtitles = await getSubtitles({ videoID: videoId, lang: 'en' })
    }
    if (!subtitles || subtitles.length === 0) return null
    const transcript = subtitles.map(s => s.text).join(' ')
    onProgress(`자막 추출 완료: ${transcript.length.toLocaleString()}자`)
    return transcript
  } catch (err) {
    onProgress(`자막 추출 실패: ${err.message}`)
    return null
  }
}

// Helper: Download YouTube audio — try yt-dlp first, fallback to ytdl-core
async function downloadYoutubeAudio(url, onProgress) {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')
  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`

  // 1차: yt-dlp 시도 (로컬 환경에서만 동작)
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const execFileAsync = promisify(execFile)

    const tmpDir = os.tmpdir()
    const outPath = path.join(tmpDir, `yt_${videoId}`)

    onProgress('yt-dlp로 오디오 다운로드 시도 중...')
    await execFileAsync('yt-dlp', [
      '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', `${outPath}.%(ext)s`, '--no-playlist', fullUrl
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 180000 })

    const expectedPath = `${outPath}.mp3`
    let audioPath = expectedPath
    try {
      await fs.access(expectedPath)
    } catch {
      const files = await fs.readdir(tmpDir)
      const match = files.find(f => f.startsWith(`yt_${videoId}.`))
      if (!match) throw new Error('파일 없음')
      audioPath = path.join(tmpDir, match)
    }

    const audioBuffer = await fs.readFile(audioPath)
    const ext = path.extname(audioPath).slice(1) || 'mp3'
    fs.unlink(audioPath).catch(() => {})
    onProgress(`yt-dlp 다운로드 완료: ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)
    return { audioBuffer, ext, mimeType: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`, title: `yt_${videoId}` }
  } catch {
    onProgress('yt-dlp 사용 불가, ytdl-core로 폴백...')
  }

  // 2차: ytdl-core 폴백 (Vercel 호환)
  const ytdl = (await import('@distube/ytdl-core')).default
  onProgress('YouTube 영상 정보 가져오는 중...')
  const info = await ytdl.getInfo(fullUrl)
  const title = info.videoDetails.title
  const duration = parseInt(info.videoDetails.lengthSeconds || '0')
  onProgress(`영상: "${title}" (${Math.floor(duration / 60)}분 ${duration % 60}초)`)

  const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' })
    || ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
  if (!format) throw new Error('오디오 포맷을 찾을 수 없습니다.')

  onProgress('오디오 다운로드 중...')
  const stream = ytdl(fullUrl, { format })
  const chunks = []
  for await (const chunk of stream) { chunks.push(chunk) }
  const audioBuffer = Buffer.concat(chunks)
  const ext = format.container || 'webm'
  onProgress(`다운로드 완료: ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)
  return { audioBuffer, ext, mimeType: format.mimeType?.split(';')[0] || `audio/${ext}`, title }
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
    formData.append('model', 'gpt-4o-transcribe')
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

// Helper: Call GPT-4o once with given messages
async function callGPT(systemPrompt, userContent, openaiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
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

// Helper: Split transcript into chunks by character limit
function splitTranscript(transcript, maxChars = 100000) {
  if (transcript.length <= maxChars) return [transcript]

  const chunks = []
  let remaining = transcript

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('. ', maxChars)
    if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf(' ', maxChars)
    if (splitAt < maxChars * 0.5) splitAt = maxChars

    chunks.push(remaining.slice(0, splitAt + 1))
    remaining = remaining.slice(splitAt + 1)
  }

  return chunks
}

// Helper: Analyze transcript with GPT — supports Map-Reduce for long transcripts
async function analyzeWithGPT(transcript, prompt, openaiKey, onProgress) {
  const CHUNK_LIMIT = 100000

  // Short transcript: single-pass
  if (transcript.length <= CHUNK_LIMIT) {
    onProgress('GPT-4o로 분석 중...')
    return await callGPT(prompt, transcript, openaiKey)
  }

  // Long transcript: Map-Reduce
  const chunks = splitTranscript(transcript, CHUNK_LIMIT)
  onProgress(`장시간 강의 감지 (${transcript.length.toLocaleString()}자) — ${chunks.length}개 구간으로 분할 분석합니다...`)

  const mapPrompt = `당신은 온라인 강의 분석 전문가입니다. 아래는 장시간 강의의 일부 구간입니다.
이 구간의 내용을 다음 형식으로 상세하게 요약해주세요:
- 핵심 내용 요약 (5~10문장)
- 주요 키워드 및 반복 메시지
- 판매 전환 포인트 (수강 유도, 할인, 긴급성 등)
- 수강생 반응 유도 구간
- 특이사항`

  const summaries = []
  for (let i = 0; i < chunks.length; i++) {
    onProgress(`구간 ${i + 1}/${chunks.length} 분석 중...`)
    const summary = await callGPT(mapPrompt, chunks[i], openaiKey)
    summaries.push(summary)
    onProgress(`${i + 1}/${chunks.length} 구간 분석 완료`)
  }

  // Reduce
  onProgress('전체 구간 종합 분석 중...')
  const reduceInput = summaries.map((s, i) => `=== 구간 ${i + 1}/${chunks.length} ===\n${s}`).join('\n\n')
  const reducePrompt = `아래는 장시간 강의(총 ${chunks.length}개 구간)의 구간별 분석 결과입니다.
이 모든 구간의 분석을 종합하여, 다음 원본 프롬프트의 형식에 맞게 최종 분석 리포트를 작성해주세요.

[원본 분석 프롬프트]
${prompt}

[구간별 분석 결과]
${reduceInput}`

  return await callGPT('당신은 온라인 교육업계의 무료강의 분석 전문가입니다.', reducePrompt, openaiKey)
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

        let audioBuffer, fileName, mimeType, transcript

        if (inputMode === 'youtube') {
          const youtubeUrl = formData.get('youtubeUrl')
          if (!youtubeUrl) throw new Error('YouTube URL이 필요합니다.')

          const videoId = extractVideoId(youtubeUrl)
          if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')

          // 1차: 자막 추출 시도 (무료, 빠름 — 다운로드 불필요)
          sendProgress('자막 추출 시도', 10, 'YouTube 자막을 가져오는 중...')
          const captionText = await fetchYoutubeCaptions(videoId, (msg) => {
            sendProgress('자막 추출', 15, msg)
          })

          if (captionText && captionText.length > 50) {
            // 자막 성공 → 다운로드/전사 스킵, 바로 GPT 분석
            sendProgress('자막 분석 중', 30, `자막 ${captionText.length.toLocaleString()}자 확보, GPT-4o로 분석 중...`)
            transcript = captionText
          } else {
            // 2차: 자막 없음 → 오디오 다운로드 + Whisper 전사
            sendProgress('YouTube 처리 중', 20, '자막 없음, 오디오 다운로드로 전환...')

            const result = await downloadYoutubeAudio(youtubeUrl, (msg) => {
              sendProgress('YouTube 처리 중', 25, msg)
            })

            audioBuffer = result.audioBuffer
            fileName = `audio.${result.ext}`
            mimeType = result.mimeType
            sendProgress('오디오 추출 완료', 30, `${result.title} - ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB`)
          }
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

        // Whisper 전사 (자막 경로에서는 이미 transcript가 있으므로 스킵)
        if (!transcript) {
          sendProgress('AI 전사 시작', 35, 'Whisper로 음성을 텍스트로 변환합니다...')

          const chunkCount = Math.ceil(audioBuffer.length / (24 * 1024 * 1024))
          let currentChunk = 0

          transcript = await transcribeAudio(audioBuffer, fileName, mimeType, openaiKey, (msg) => {
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
        }

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
