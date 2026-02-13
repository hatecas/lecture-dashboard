import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

const CHANNEL_API = 'https://api.channel.io/open'

function getChannelHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-access-key': process.env.CHANNEL_ACCESS_KEY || '',
    'x-access-secret': process.env.CHANNEL_ACCESS_SECRET || ''
  }
}

// 채널톡 user-chats에서 사용자 이름으로 필터링 (전체 페이지네이션)
async function searchUsersByName(query) {
  const headers = getChannelHeaders()
  const matchedUsers = []
  const MAX_PAGES = 50 // 안전 제한: 최대 50페이지 × 100개 = 5000개/상태

  for (const state of ['opened', 'closed']) {
    let since = undefined
    let page = 0

    while (page < MAX_PAGES) {
      let url = `${CHANNEL_API}/v5/user-chats?state=${state}&sortOrder=desc&limit=100`
      if (since) url += `&since=${encodeURIComponent(since)}`

      const res = await fetch(url, { headers })
      if (!res.ok) break

      const data = await res.json()
      const chats = data.userChats || []
      const users = data.users || []

      for (const user of users) {
        const userName = user.profile?.name || user.name || ''
        if (userName.includes(query) && !matchedUsers.find(u => u.id === user.id)) {
          matchedUsers.push(user)
        }
      }

      // 응답의 next 커서로 다음 페이지 조회 (Base64 인코딩된 커서)
      if (!data.next || chats.length === 0) break
      since = data.next
      page++
    }
  }

  return matchedUsers
}

// 특정 사용자의 채팅 목록 조회
async function getUserChats(userId) {
  const headers = getChannelHeaders()

  const res = await fetch(`${CHANNEL_API}/v5/users/${userId}/user-chats?sortOrder=desc&limit=10`, {
    headers
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`채팅 목록 조회 실패: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.userChats || []
}

// 특정 채팅의 메시지 조회
async function getChatMessages(userChatId) {
  const headers = getChannelHeaders()

  const res = await fetch(`${CHANNEL_API}/v5/user-chats/${userChatId}/messages?sortOrder=asc&limit=50`, {
    headers
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`메시지 조회 실패: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.messages || []
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { action, query, userId, chatId } = await request.json()

    if (!process.env.CHANNEL_ACCESS_KEY || !process.env.CHANNEL_ACCESS_SECRET) {
      return NextResponse.json({
        error: '채널톡 API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.'
      }, { status: 400 })
    }

    if (action === 'search-users') {
      if (!query) {
        return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 })
      }
      const users = await searchUsersByName(query)
      return NextResponse.json({ users })
    }

    if (action === 'get-chats') {
      if (!userId) {
        return NextResponse.json({ error: 'userId가 필요합니다' }, { status: 400 })
      }
      const chats = await getUserChats(userId)
      return NextResponse.json({ chats })
    }

    if (action === 'get-messages') {
      if (!chatId) {
        return NextResponse.json({ error: 'chatId가 필요합니다' }, { status: 400 })
      }
      const messages = await getChatMessages(chatId)
      return NextResponse.json({ messages })
    }

    // 통합 조회: 이름으로 검색 → 채팅 목록 → 최근 대화 내용
    if (action === 'fetch-conversations') {
      if (!query) {
        return NextResponse.json({ error: '소비자 이름/검색어가 필요합니다' }, { status: 400 })
      }

      const users = await searchUsersByName(query)

      if (users.length === 0) {
        return NextResponse.json({
          conversations: [],
          message: `"${query}" 이름의 소비자를 찾을 수 없습니다.`
        })
      }

      const allConversations = []

      for (const user of users.slice(0, 3)) {
        const userName = user.profile?.name || user.name || '알 수 없음'
        const chats = await getUserChats(user.id)

        for (const chat of chats.slice(0, 3)) {
          const messages = await getChatMessages(chat.id)

          const formattedMessages = messages.map(msg => ({
            sender: msg.personType === 'user' ? userName : '상담원',
            text: msg.plainText || msg.message || '',
            createdAt: msg.createdAt,
            personType: msg.personType
          })).filter(m => m.text)

          if (formattedMessages.length > 0) {
            allConversations.push({
              chatId: chat.id,
              userName,
              userId: user.id,
              createdAt: chat.createdAt,
              state: chat.state,
              messages: formattedMessages
            })
          }
        }
      }

      return NextResponse.json({
        conversations: allConversations,
        userCount: users.length,
        message: allConversations.length > 0
          ? `"${query}" 관련 ${allConversations.length}개의 대화를 찾았습니다.`
          : `"${query}" 소비자의 대화 기록이 없습니다.`
      })
    }

    return NextResponse.json({ error: '알 수 없는 action입니다' }, { status: 400 })

  } catch (error) {
    console.error('채널톡 대화 조회 오류:', error)
    return NextResponse.json({ error: error.message || '채널톡 대화 조회 중 오류 발생' }, { status: 500 })
  }
}
