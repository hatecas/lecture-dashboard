import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const YOUTUBE_API_KEY = 'AIzaSyB0EjAxzu3JxwqZYf0cfB4sN5DNbZFSpbA'

// UTC를 KST로 변환
function toKST(isoString) {
  const date = new Date(isoString)
  return date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 유튜브 API 호출
async function youtubeRequest(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`)
  Object.entries({ ...params, key: YOUTUBE_API_KEY }).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v)
  })

  const res = await fetch(url.toString())
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'YouTube API 오류')
  }
  return res.json()
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'start':
        return handleStart(body)
      case 'poll':
        return handlePoll(body)
      case 'stop':
        return handleStop(body)
      case 'download':
        return handleDownload(body)
      case 'status':
        return handleStatus(body)
      case 'list':
        return handleList()
      case 'delete':
        return handleDelete(body)
      default:
        return NextResponse.json({ success: false, error: '알 수 없는 액션' })
    }
  } catch (error) {
    console.error('YouTube chat error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}

// 수집 시작
async function handleStart({ videoId, targetUser, sessionName }) {
  if (!videoId) {
    return NextResponse.json({ success: false, error: '비디오 ID를 입력하세요.' })
  }

  // 비디오 정보 조회
  const videoData = await youtubeRequest('videos', {
    part: 'liveStreamingDetails,snippet',
    id: videoId
  })

  if (!videoData.items?.length) {
    return NextResponse.json({ success: false, error: '영상을 찾을 수 없습니다.' })
  }

  const video = videoData.items[0]
  const liveChatId = video.liveStreamingDetails?.activeLiveChatId

  if (!liveChatId) {
    return NextResponse.json({ success: false, error: '라이브 채팅을 찾을 수 없습니다. (라이브 중인 영상인지 확인하세요)' })
  }

  const videoTitle = video.snippet?.title || '제목 없음'

  // 세션 생성
  const { data: session, error } = await supabase
    .from('youtube_chat_sessions')
    .insert({
      video_id: videoId,
      live_chat_id: liveChatId,
      video_title: videoTitle,
      session_name: sessionName || videoTitle,
      target_user: targetUser || null,
      status: 'collecting',
      message_count: 0
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return NextResponse.json({ success: false, error: 'DB 저장 실패: ' + error.message })
  }

  return NextResponse.json({
    success: true,
    session,
    message: '수집 시작됨'
  })
}

// 메시지 폴링
async function handlePoll({ sessionId }) {
  // 세션 조회
  const { data: session, error: sessionError } = await supabase
    .from('youtube_chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ success: false, error: '세션을 찾을 수 없습니다.' })
  }

  if (session.status !== 'collecting') {
    return NextResponse.json({
      success: true,
      stopped: true,
      message: '수집이 중지된 상태입니다.',
      messageCount: session.message_count
    })
  }

  try {
    // 유튜브 채팅 메시지 조회
    const chatData = await youtubeRequest('liveChat/messages', {
      liveChatId: session.live_chat_id,
      part: 'snippet,authorDetails',
      maxResults: 200,
      pageToken: session.next_page_token || undefined
    })

    const items = chatData.items || []
    const newMessages = []
    const logs = []

    for (const item of items) {
      const messageId = item.id
      if (item.snippet?.type !== 'textMessageEvent') continue

      const author = item.authorDetails?.displayName || '알 수 없음'
      const message = item.snippet?.displayMessage
      const publishedAt = item.snippet?.publishedAt

      if (!message) continue

      // 유저 필터링
      if (session.target_user) {
        const target = session.target_user
        if (!(author === target ||
              author === `@${target}` ||
              (target.startsWith('@') && author === target))) {
          continue
        }
      }

      // 중복 체크 (DB에서)
      const { data: existing } = await supabase
        .from('youtube_chat_messages')
        .select('id')
        .eq('session_id', sessionId)
        .eq('message_id', messageId)
        .single()

      if (existing) continue

      // 새 메시지 저장
      const timeKST = toKST(publishedAt)

      const { error: insertError } = await supabase
        .from('youtube_chat_messages')
        .insert({
          session_id: sessionId,
          message_id: messageId,
          author,
          message,
          time_kst: timeKST,
          published_at: publishedAt
        })

      if (!insertError) {
        newMessages.push({ author, message, time: timeKST })
        logs.push(`[${author}] ${message}`)
      }
    }

    // 세션 업데이트
    const newCount = session.message_count + newMessages.length
    await supabase
      .from('youtube_chat_sessions')
      .update({
        message_count: newCount,
        next_page_token: chatData.nextPageToken || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    return NextResponse.json({
      success: true,
      newMessages: newMessages.length,
      totalMessages: newCount,
      logs,
      pollingInterval: chatData.pollingIntervalMillis || 60000
    })

  } catch (error) {
    const errorMsg = error.message

    // 할당량 초과
    if (errorMsg.includes('quotaExceeded')) {
      await supabase
        .from('youtube_chat_sessions')
        .update({ status: 'error', error_message: '할당량 초과' })
        .eq('id', sessionId)

      return NextResponse.json({
        success: false,
        error: '할당량 초과! 수집이 중지됩니다.',
        quotaExceeded: true
      })
    }

    // 라이브 종료
    if (errorMsg.includes('liveChatEnded') || errorMsg.includes('liveChatNotFound')) {
      await supabase
        .from('youtube_chat_sessions')
        .update({ status: 'ended', error_message: '라이브 종료됨' })
        .eq('id', sessionId)

      return NextResponse.json({
        success: true,
        stopped: true,
        message: '라이브가 종료되었습니다.',
        messageCount: session.message_count
      })
    }

    throw error
  }
}

// 수집 중지
async function handleStop({ sessionId }) {
  const { error } = await supabase
    .from('youtube_chat_sessions')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, message: '수집 중지됨' })
}

// 상태 조회
async function handleStatus({ sessionId }) {
  const { data: session, error } = await supabase
    .from('youtube_chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, session })
}

// 세션 목록
async function handleList() {
  const { data: sessions, error } = await supabase
    .from('youtube_chat_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, sessions })
}

// 세션 삭제
async function handleDelete({ sessionId }) {
  // 메시지 먼저 삭제
  await supabase
    .from('youtube_chat_messages')
    .delete()
    .eq('session_id', sessionId)

  // 세션 삭제
  const { error } = await supabase
    .from('youtube_chat_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true, message: '삭제됨' })
}

// 다운로드
async function handleDownload({ sessionId }) {
  // 세션 조회
  const { data: session } = await supabase
    .from('youtube_chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ success: false, error: '세션을 찾을 수 없습니다.' })
  }

  // 메시지 조회
  const { data: messages, error } = await supabase
    .from('youtube_chat_messages')
    .select('author, message, time_kst, published_at')
    .eq('session_id', sessionId)
    .order('published_at', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message })
  }

  // Excel 생성
  const excelData = messages.map(m => ({
    '이름': m.author,
    '채팅': m.message,
    '시간': m.time_kst
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)
  XLSX.utils.book_append_sheet(wb, ws, '채팅')

  const excelBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

  return NextResponse.json({
    success: true,
    downloadUrl,
    filename: `${session.session_name || 'chat'}_${messages.length}건.xlsx`,
    messageCount: messages.length
  })
}
