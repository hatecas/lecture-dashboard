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

// 채널톡 대화 목록에서 사용자 이름으로 필터링하여 대화 가져오기 (전체 페이지네이션)
async function fetchChannelConversations(customerName) {
  if (!process.env.CHANNEL_ACCESS_KEY || !process.env.CHANNEL_ACCESS_SECRET) {
    return { error: '채널톡 API 키가 설정되지 않았습니다.' }
  }

  try {
    // 1. 모든 user-chats를 페이지네이션으로 가져오며 이름 매칭
    const allChats = []
    const MAX_PAGES = 50 // 안전 제한: 최대 50페이지 × 100개 = 5000개/상태

    for (const state of ['opened', 'closed']) {
      let since = undefined
      let page = 0

      while (page < MAX_PAGES) {
        let url = `${CHANNEL_API}/v5/user-chats?state=${state}&sortOrder=desc&limit=100`
        if (since) url += `&since=${since}`

        const chatRes = await fetch(url, { headers: getChannelHeaders() })

        if (!chatRes.ok) {
          const errText = await chatRes.text()
          console.error(`채널톡 user-chats(${state}) p${page} 조회 실패:`, chatRes.status, errText)
          break
        }

        const chatData = await chatRes.json()
        const chats = chatData.userChats || []
        const users = chatData.users || []

        // users 배열에서 이름 매칭
        for (const chat of chats) {
          const user = users.find(u => u.id === chat.userId)
          const userName = user?.profile?.name || user?.name || ''

          if (userName && userName.includes(customerName)) {
            allChats.push({ chat, userName, userId: chat.userId })
          }
        }

        // 더 이상 데이터 없으면 종료
        if (chats.length < 100) break

        // 다음 페이지 커서 설정 (마지막 채팅의 createdAt 사용)
        since = chats[chats.length - 1].createdAt
        page++
      }
    }

    if (allChats.length === 0) {
      return { conversations: [], message: `"${customerName}" 이름의 소비자 대화를 찾을 수 없습니다.` }
    }

    // 2. 매칭된 채팅의 메시지 가져오기
    const allConversations = []

    for (const { chat, userName } of allChats.slice(0, 10)) {
      const msgRes = await fetch(
        `${CHANNEL_API}/v5/user-chats/${chat.id}/messages?sortOrder=asc&limit=50`,
        { headers: getChannelHeaders() }
      )

      if (!msgRes.ok) continue
      const msgData = await msgRes.json()
      const messages = (msgData.messages || [])
        .map(msg => ({
          sender: msg.personType === 'user' ? userName : '상담원',
          text: msg.plainText || msg.message || '',
          createdAt: msg.createdAt
        }))
        .filter(m => m.text)

      if (messages.length > 0) {
        allConversations.push({
          chatId: chat.id,
          userName,
          createdAt: chat.createdAt,
          state: chat.state,
          messages
        })
      }
    }

    return {
      conversations: allConversations,
      message: allConversations.length > 0
        ? `"${customerName}" 관련 ${allConversations.length}개의 대화를 찾았습니다.`
        : `"${customerName}" 소비자의 대화 기록이 없습니다.`
    }
  } catch (err) {
    console.error('채널톡 조회 오류:', err)
    return { error: `채널톡 조회 오류: ${err.message}` }
  }
}

// CS 정책 검색
async function searchPolicies(category) {
  try {
    let query = supabase.from('cs_policies').select('title, category, content').order('category')
    if (category && category !== '전체') {
      query = query.eq('category', category)
    }

    const { data: policies } = await query
    if (!policies || policies.length === 0) return { policies: [], message: '등록된 정책이 없습니다.' }

    return {
      policies: policies.map(p => ({
        title: p.title,
        category: p.category,
        content: p.content
      })),
      message: `${policies.length}개의 정책을 찾았습니다.`
    }
  } catch {
    return { policies: [], message: '정책 조회 중 오류 발생' }
  }
}

// 유사 상담 이력 검색
async function searchHistory(keywords) {
  try {
    const keywordList = keywords
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5)

    if (keywordList.length === 0) return { history: [], message: '검색 키워드가 부족합니다.' }

    const orFilter = keywordList.map(k => `customer_inquiry.ilike.%${k}%`).join(',')

    const { data } = await supabase
      .from('cs_history')
      .select('customer_inquiry, agent_response, category, result')
      .or(orFilter)
      .limit(10)

    if (!data || data.length === 0) return { history: [], message: '유사한 상담 이력이 없습니다.' }

    const scored = data.map(item => {
      const text = (item.customer_inquiry + ' ' + item.agent_response).toLowerCase()
      const score = keywordList.reduce((s, k) => s + (text.includes(k.toLowerCase()) ? 1 : 0), 0)
      return { ...item, score }
    })

    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, ...rest }) => rest)

    return {
      history: results,
      message: `${results.length}개의 유사 상담 이력을 찾았습니다.`
    }
  } catch {
    return { history: [], message: '이력 검색 중 오류 발생' }
  }
}

// 도구 정의
const tools = [
  {
    name: 'fetch_channel_conversations',
    description: '채널톡에서 특정 소비자/고객의 대화 내용을 가져옵니다. 사용자가 "OOO 고객 채널톡 가져와", "OOO 소비자 대화 내용 보여줘" 등의 요청을 하면 이 도구를 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: {
          type: 'string',
          description: '검색할 소비자/고객 이름'
        }
      },
      required: ['customer_name']
    }
  },
  {
    name: 'search_cs_policies',
    description: '우리 회사의 CS 대응 정책/매뉴얼을 검색합니다. 사용자가 "어떻게 대응해야 돼?", "환불 정책이 뭐야?", "대응 매뉴얼 알려줘" 등의 요청을 하면 이 도구를 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '검색할 정책 카테고리 (환불, 결제, 수강, 컴플레인, 일반 등). 전체 검색은 "전체"로 입력'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'search_cs_history',
    description: '과거 유사한 상담 이력을 검색합니다. 이전에 비슷한 문의에 어떻게 대응했는지 찾을 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description: '검색할 키워드 (공백으로 구분된 핵심 단어들)'
        }
      },
      required: ['keywords']
    }
  }
]

// 도구 실행
async function executeTool(toolName, toolInput) {
  switch (toolName) {
    case 'fetch_channel_conversations':
      return await fetchChannelConversations(toolInput.customer_name)
    case 'search_cs_policies':
      return await searchPolicies(toolInput.category)
    case 'search_cs_history':
      return await searchHistory(toolInput.keywords)
    default:
      return { error: `알 수 없는 도구: ${toolName}` }
  }
}

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { messages } = await request.json()

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '메시지가 없습니다' }, { status: 400 })
    }

    const systemPrompt = `당신은 온라인 강의 플랫폼의 전문 CS(고객상담) AI 어시스턴트입니다.

역할:
- 채널톡 대화 내용을 조회하고 분석합니다
- 고객 문의에 대한 최적의 CS 대응 답변을 생성합니다
- 과거 실제 상담 이력을 최우선으로 참고하여 답변합니다

사용 가능한 기능:
1. 채널톡 대화 조회: 특정 소비자/고객의 채널톡 대화 내용을 가져올 수 있습니다
2. 정책 검색: 회사 CS 대응 정책/매뉴얼을 검색할 수 있습니다
3. 이력 검색: 과거 유사한 상담에서 실제로 어떻게 대응했는지 찾을 수 있습니다

⚠️ 핵심 판단 원칙 (매우 중요):
- 정책은 원칙적인 가이드라인일 뿐이며, 실제 상황에서는 애매한 경우가 많습니다
- 예: "1/3 이하 수강시 2/3 환불"이라는 정책이 있어도, 4강짜리 강의에서 1강이 기준인지 2강이 기준인지는 정책만으로 판단할 수 없습니다
- 이런 애매한 경우에는 반드시 과거 상담 이력을 검색하여, 동일하거나 유사한 상황에서 실제로 어떻게 대응했는지를 기준으로 삼으세요
- 과거 이력이 있으면 그 판례를 따르고, 없으면 정책 원칙에 기반하여 답변합니다

대화 내용을 가져온 후 사용자가 대응 방법을 물으면:
1. 먼저 과거 유사 상담 이력을 검색합니다 (가장 중요)
2. 관련 정책도 함께 검색합니다
3. 과거 이력 > 정책 순서로 우선하여 답변을 작성합니다

답변 작성 원칙:
- 존댓말 사용 (~~습니다, ~~드리겠습니다)
- 공감 표현으로 시작
- 구체적인 해결 방안 제시
- 핵심만 전달 (3-5문장)
- 과거 상담 사례가 있으면 반드시 그 판단 기준과 톤을 따르세요
- 과거 사례를 참고했을 경우 "(과거 유사 사례 기반)" 이라고 명시해주세요

채널톡 대화를 보여줄 때는 읽기 쉽게 대화 형식으로 정리해주세요.
이미지가 포함된 경우 이미지 내용을 분석하여 맥락을 파악합니다.`

    // 메시지 포맷 변환 (이미지 지원)
    const apiMessages = messages.map(m => {
      if (m.images && m.images.length > 0) {
        const content = []
        if (m.content) {
          content.push({ type: 'text', text: m.content })
        }
        for (const img of m.images) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data
            }
          })
        }
        return { role: m.role, content }
      }
      return { role: m.role, content: m.content }
    })

    // Tool-use 루프: AI가 도구 호출을 멈출 때까지 반복
    let currentMessages = [...apiMessages]
    let maxIterations = 5

    while (maxIterations > 0) {
      maxIterations--

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages: currentMessages
        })
      })

      const data = await response.json()

      if (!data.content) {
        return NextResponse.json({ error: 'AI 응답 실패' }, { status: 500 })
      }

      // stop_reason이 end_turn이면 최종 응답
      if (data.stop_reason === 'end_turn') {
        const textBlock = data.content.find(b => b.type === 'text')
        return NextResponse.json({
          reply: textBlock?.text || '답변을 생성하지 못했습니다.',
          toolsUsed: currentMessages.length > apiMessages.length
        })
      }

      // stop_reason이 tool_use이면 도구 실행
      if (data.stop_reason === 'tool_use') {
        // AI의 응답을 메시지에 추가
        currentMessages.push({ role: 'assistant', content: data.content })

        // 도구 호출 결과 수집
        const toolResults = []
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(block.name, block.input)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result, null, 2)
            })
          }
        }

        // 도구 결과를 메시지에 추가
        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // 그 외의 경우 (예기치 않은 stop_reason)
      const textBlock = data.content.find(b => b.type === 'text')
      return NextResponse.json({
        reply: textBlock?.text || '답변을 생성하지 못했습니다.'
      })
    }

    // 최대 반복 횟수 초과
    return NextResponse.json({
      reply: '요청을 처리하는 데 시간이 너무 오래 걸립니다. 다시 시도해주세요.'
    })

  } catch (error) {
    console.error('CS AI 오류:', error)
    return NextResponse.json({ error: 'CS AI 처리 중 오류 발생' }, { status: 500 })
  }
}
