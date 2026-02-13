import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

const CHANNEL_API = 'https://api.channel.io/open'

function getChannelHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-access-key': process.env.CHANNEL_ACCESS_KEY || '',
    'x-access-secret': process.env.CHANNEL_ACCESS_SECRET || ''
  }
}

// 대화 내용에서 카테고리 자동 분류
function detectCategory(text) {
  const lower = text.toLowerCase()
  if (/환불|취소|반환|돌려/.test(lower)) return '환불'
  if (/결제|카드|입금|송금|페이/.test(lower)) return '결제'
  if (/수강|강의|영상|재생|시청|접속/.test(lower)) return '수강'
  if (/불만|화가|짜증|최악|실망|사기/.test(lower)) return '컴플레인'
  return '일반'
}

// 채널톡 전체 대화를 페이지네이션으로 가져오기
async function fetchAllChannelChats() {
  const headers = getChannelHeaders()
  const allChats = []
  const allUsersMap = new Map()
  const MAX_PAGES = 50

  for (const state of ['opened', 'closed']) {
    let since = undefined
    let page = 0

    while (page < MAX_PAGES) {
      let url = `${CHANNEL_API}/v5/user-chats?state=${state}&sortOrder=desc&limit=100`
      if (since) url += `&since=${since}`

      const res = await fetch(url, { headers })
      if (!res.ok) break

      const data = await res.json()
      const chats = data.userChats || []
      const users = data.users || []

      for (const user of users) {
        allUsersMap.set(user.id, user)
      }

      for (const chat of chats) {
        allChats.push({ ...chat, state })
      }

      if (chats.length < 100) break
      since = chats[chats.length - 1].createdAt
      page++
    }
  }

  return { allChats, allUsersMap }
}

// 특정 채팅의 메시지 가져오기
async function getChatMessages(chatId) {
  const res = await fetch(
    `${CHANNEL_API}/v5/user-chats/${chatId}/messages?sortOrder=asc&limit=50`,
    { headers: getChannelHeaders() }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.messages || []
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  if (!process.env.CHANNEL_ACCESS_KEY || !process.env.CHANNEL_ACCESS_SECRET) {
    return NextResponse.json({ error: '채널톡 API 키가 설정되지 않았습니다.' }, { status: 400 })
  }

  try {
    // 1. 이미 동기화된 chatId 목록 조회 (중복 방지)
    const { data: existing } = await supabase
      .from('cs_history')
      .select('tags')
      .like('tags', 'channel:%')

    const syncedChatIds = new Set(
      (existing || [])
        .map(r => r.tags?.match(/channel:([^\s,]+)/)?.[1])
        .filter(Boolean)
    )

    // 2. 채널톡 전체 대화 가져오기
    const { allChats, allUsersMap } = await fetchAllChannelChats()

    // 3. 이미 동기화된 것 제외
    const newChats = allChats.filter(chat => !syncedChatIds.has(chat.id))

    if (newChats.length === 0) {
      return NextResponse.json({
        success: true,
        message: '새로 동기화할 대화가 없습니다.',
        synced: 0,
        total: allChats.length,
        alreadySynced: syncedChatIds.size
      })
    }

    // 4. 각 대화의 메시지를 가져와서 cs_history 레코드로 변환
    const records = []
    let processed = 0

    for (const chat of newChats) {
      const messages = await getChatMessages(chat.id)
      if (messages.length === 0) continue

      const user = allUsersMap.get(chat.userId)
      const userName = user?.profile?.name || user?.name || '알 수 없음'

      // 고객 메시지와 상담원 메시지 분리
      const customerMsgs = messages
        .filter(m => m.personType === 'user' && (m.plainText || m.message))
        .map(m => m.plainText || m.message)

      const agentMsgs = messages
        .filter(m => m.personType !== 'user' && (m.plainText || m.message))
        .map(m => m.plainText || m.message)

      // 고객 메시지와 상담원 메시지가 둘 다 있어야 의미 있는 이력
      if (customerMsgs.length === 0 || agentMsgs.length === 0) continue

      const customerInquiry = customerMsgs.join('\n')
      const agentResponse = agentMsgs.join('\n')

      records.push({
        category: detectCategory(customerInquiry),
        customer_inquiry: customerInquiry,
        agent_response: agentResponse,
        tags: `channel:${chat.id}`,
        result: chat.state === 'closed' ? '해결' : '진행중'
      })

      processed++

      // API 속도 제한 방지: 10개마다 잠시 대기
      if (processed % 10 === 0) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화 가능한 대화가 없습니다 (고객+상담원 메시지가 모두 있는 대화만 동기화됩니다).',
        synced: 0
      })
    }

    // 5. Supabase에 배치 삽입
    let inserted = 0
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500)
      const { error } = await supabase.from('cs_history').insert(batch)
      if (error) throw error
      inserted += batch.length
    }

    return NextResponse.json({
      success: true,
      message: `${inserted}개의 채널톡 대화를 상담이력에 동기화했습니다.`,
      synced: inserted,
      total: allChats.length,
      alreadySynced: syncedChatIds.size,
      skipped: newChats.length - inserted
    })
  } catch (error) {
    console.error('채널톡 동기화 오류:', error)
    return NextResponse.json({ error: `동기화 실패: ${error.message}` }, { status: 500 })
  }
}
