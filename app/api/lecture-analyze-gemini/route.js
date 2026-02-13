import { verifyApiAuth } from '@/lib/apiAuth'
// @google/genai: Turbopack이 정적 분석 못하도록 변수로 우회
const _genaiPkg = '@google/' + 'genai'
async function getGoogleGenAI(apiKey) {
  const mod = await import(/* webpackIgnore: true */ _genaiPkg)
  return new mod.GoogleGenAI({ apiKey })
}
// youtube-caption-extractor: Turbopack이 정적 분석 못하도록 변수로 우회
const _captionPkg = 'youtube-caption-' + 'extractor'
async function getSubtitles(options) {
  const mod = await import(/* webpackIgnore: true */ _captionPkg)
  return mod.getSubtitles(options)
}
import { createClient } from '@supabase/supabase-js'

// Supabase client for caching
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

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

// Helper: Fetch YouTube captions (auto-generated or manual subtitles)
async function fetchYoutubeCaptions(videoId, onProgress) {
  onProgress('YouTube 자막 가져오는 중...')

  try {
    // Try Korean captions first
    let subtitles = await getSubtitles({ videoID: videoId, lang: 'ko' })

    if (!subtitles || subtitles.length === 0) {
      onProgress('한국어 자막 없음, 영어 자막 시도 중...')
      subtitles = await getSubtitles({ videoID: videoId, lang: 'en' })
    }

    if (!subtitles || subtitles.length === 0) {
      return null
    }

    const transcript = subtitles.map(s => s.text).join(' ')
    onProgress(`자막 추출 완료: ${transcript.length.toLocaleString()}자`)
    return transcript
  } catch (err) {
    onProgress(`자막 추출 실패: ${err.message}`)
    return null
  }
}

// Helper: Call Gemini API once with given text
async function callGemini(text, geminiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }]
      })
    }
  )

  const data = await res.json()

  if (!res.ok || data.error) {
    const errMsg = data.error?.message || JSON.stringify(data.error) || `HTTP ${res.status}`
    throw new Error(`Gemini API 오류: ${errMsg}`)
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// Helper: Split transcript into chunks by character limit, respecting sentence boundaries
function splitTranscript(transcript, maxChars = 100000) {
  if (transcript.length <= maxChars) return [transcript]

  const chunks = []
  let remaining = transcript

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    // Find a good split point (sentence boundary near maxChars)
    let splitAt = remaining.lastIndexOf('. ', maxChars)
    if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf(' ', maxChars)
    if (splitAt < maxChars * 0.5) splitAt = maxChars

    chunks.push(remaining.slice(0, splitAt + 1))
    remaining = remaining.slice(splitAt + 1)
  }

  return chunks
}

// Helper: Analyze text transcript with Gemini — supports Map-Reduce for long transcripts
async function analyzeTranscriptWithGemini(transcript, prompt, geminiKey, onProgress) {
  const CHUNK_LIMIT = 100000 // ~100k chars per chunk

  // Short transcript: single-pass analysis
  if (transcript.length <= CHUNK_LIMIT) {
    onProgress('Gemini로 자막 텍스트 분석 중...')
    const result = await callGemini(`${prompt}\n\n---\n\n${transcript}`, geminiKey)
    onProgress('분석 완료!')
    return result || '분석 결과가 비어있습니다.'
  }

  // Long transcript: Map-Reduce
  const chunks = splitTranscript(transcript, CHUNK_LIMIT)
  onProgress(`장시간 강의 감지 (${transcript.length.toLocaleString()}자) — ${chunks.length}개 구간으로 분할 분석합니다...`)

  // MAP phase: summarize each chunk in parallel
  const mapPrompt = `당신은 온라인 강의 분석 전문가입니다. 아래는 장시간 강의의 일부 구간입니다.
이 구간의 내용을 다음 형식으로 상세하게 요약해주세요:
- 핵심 내용 요약 (5~10문장)
- 주요 키워드 및 반복 메시지
- 판매 전환 포인트 (수강 유도, 할인, 긴급성 등)
- 수강생 반응 유도 구간
- 특이사항

구간 내용:\n\n`

  const summaries = []

  // Process chunks in parallel batches of 3 (to respect Gemini rate limits)
  const BATCH_SIZE = 3
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const batchPromises = batch.map((chunk, j) => {
      const chunkIdx = i + j + 1
      onProgress(`구간 ${chunkIdx}/${chunks.length} 분석 중...`)
      return callGemini(`${mapPrompt}${chunk}`, geminiKey)
    })

    const results = await Promise.all(batchPromises)
    summaries.push(...results)
    onProgress(`${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} 구간 분석 완료`)
  }

  // REDUCE phase: combine all summaries into final analysis
  onProgress('전체 구간 종합 분석 중...')

  const reduceInput = summaries.map((s, i) => `=== 구간 ${i + 1}/${chunks.length} ===\n${s}`).join('\n\n')
  const reducePrompt = `아래는 장시간 강의(총 ${chunks.length}개 구간)의 구간별 분석 결과입니다.
이 모든 구간의 분석을 종합하여, 다음 원본 프롬프트의 형식에 맞게 최종 분석 리포트를 작성해주세요.

[원본 분석 프롬프트]
${prompt}

[구간별 분석 결과]
${reduceInput}`

  const finalAnalysis = await callGemini(reducePrompt, geminiKey)
  onProgress('분석 완료!')
  return finalAnalysis || '분석 결과가 비어있습니다.'
}

// Helper: Analyze YouTube URL directly with Gemini SDK
async function analyzeYoutubeWithGeminiSDK(youtubeUrl, prompt, geminiKey, onProgress) {
  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`

  onProgress('Gemini SDK로 YouTube 영상 직접 분석 중...')

  const ai = await getGoogleGenAI(geminiKey)
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        parts: [
          { fileData: { fileUri: cleanUrl, mimeType: 'video/mp4' } },
          { text: prompt }
        ]
      }
    ],
  })

  const text = response.text
  if (!text) throw new Error('분석 결과가 비어있습니다.')
  onProgress('분석 완료!')
  return text
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
    return { audioBuffer, ext, mimeType: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}` }
  } catch {
    onProgress('yt-dlp 사용 불가, ytdl-core로 폴백...')
  }

  // 2차: ytdl-core 폴백 (Vercel 호환)
  const ytdl = (await import('@distube/ytdl-core')).default
  onProgress('YouTube 영상 정보 가져오는 중...')
  const info = await ytdl.getInfo(fullUrl)
  const duration = parseInt(info.videoDetails.lengthSeconds || '0')
  onProgress(`영상: "${info.videoDetails.title}" (${Math.floor(duration / 60)}분 ${duration % 60}초)`)

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
  return { audioBuffer, ext, mimeType: format.mimeType?.split(';')[0] || `audio/${ext}` }
}

// Helper: Analyze uploaded file with Gemini (via File API)
async function analyzeFileWithGemini(fileBuffer, fileName, mimeType, prompt, geminiKey, onProgress) {
  const ai = await getGoogleGenAI(geminiKey)

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

          const videoId = extractVideoId(youtubeUrl)
          if (!videoId) throw new Error('유효하지 않은 YouTube URL입니다.')

          // 캐시 확인: 같은 영상 + 같은 프롬프트의 기존 분석 결과
          const promptHash = prompt.length + '_' + prompt.slice(0, 50).replace(/\s+/g, '')
          const cacheKey = `${videoId}_${promptHash}`

          if (supabase) {
            try {
              const { data: cached } = await supabase
                .from('lecture_analysis_cache')
                .select('analysis')
                .eq('cache_key', cacheKey)
                .single()

              if (cached?.analysis) {
                sendProgress('캐시 적중', 95, '이전에 분석한 결과를 불러옵니다.')
                analysis = cached.analysis

                sseEvent(controller, encoder, { type: 'result', analysis })
                controller.close()
                return
              }
            } catch { /* cache miss, continue */ }
          }

          // 1차: YouTube 자막 추출 시도 (빠르고 무료)
          sendProgress('자막 추출 시도', 10, 'YouTube 자막을 가져오는 중...')

          const captionText = await fetchYoutubeCaptions(videoId, (msg) => {
            sendProgress('자막 추출', 15, msg)
          })

          if (captionText && captionText.length > 50) {
            // 자막 성공 → 텍스트만으로 Gemini 분석 (빠르고 저렴)
            sendProgress('자막 분석 중', 30, `자막 ${captionText.length.toLocaleString()}자 확보, Gemini로 분석 중...`)

            analysis = await analyzeTranscriptWithGemini(captionText, prompt, geminiKey, (msg) => {
              sendProgress('Gemini 분석 중', 70, msg)
            })
          } else {
            // 2차: 자막 실패 → Gemini SDK로 YouTube URL 직접 분석 시도
            sendProgress('영상 분석 전환', 20, '자막을 찾을 수 없어 Gemini에 영상을 직접 전달합니다...')

            try {
              analysis = await analyzeYoutubeWithGeminiSDK(youtubeUrl, prompt, geminiKey, (msg) => {
                sendProgress('Gemini 분석 중', 50, msg)
              })
            } catch (sdkErr) {
              // 3차: SDK 실패 → 오디오 다운로드 후 Gemini File API로 분석
              sendProgress('오디오 다운로드 전환', 25, `영상 직접 분석 실패 (${sdkErr.message}), 오디오 다운로드로 전환합니다...`)

              const audio = await downloadYoutubeAudio(youtubeUrl, (msg) => {
                sendProgress('오디오 다운로드', 35, msg)
              })

              sendProgress('Gemini 업로드 중', 55, `오디오 ${(audio.audioBuffer.length / (1024 * 1024)).toFixed(1)}MB를 Gemini에 업로드합니다...`)

              analysis = await analyzeFileWithGemini(audio.audioBuffer, `audio.${audio.ext}`, audio.mimeType, prompt, geminiKey, (msg) => {
                const percent = msg.includes('업로드') ? 60 : msg.includes('처리 중') ? 70 : 85
                sendProgress('Gemini 분석 중', percent, msg)
              })
            }
          }

          // 캐시 저장 (fire-and-forget)
          if (supabase && analysis) {
            supabase
              .from('lecture_analysis_cache')
              .upsert({ cache_key: cacheKey, video_id: videoId, analysis, created_at: new Date().toISOString() })
              .then(() => {})
              .catch(() => {})
          }

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
