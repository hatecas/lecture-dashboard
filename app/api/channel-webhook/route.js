import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 유사 상담 이력 검색 (cs-ai/route.js와 동일 로직)
async function findSimilarHistory(inquiry) {
  try {
    const keywords = inquiry
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5)

    if (keywords.length === 0) return []

    const orFilter = keywords.map(k => `customer_inquiry.ilike.%${k}%`).join(',')

    const { data } = await supabase
      .from('cs_history')
      .select('customer_inquiry, agent_response, category, result')
      .or(orFilter)
      .limit(10)

    if (!data || data.length === 0) return []

    const scored = data.map(item => {
      const text = (item.customer_inquiry + ' ' + item.agent_response).toLowerCase()
      const score = keywords.reduce((s, k) => s + (text.includes(k.toLowerCase()) ? 1 : 0), 0)
      return { ...item, score }
    })

    return scored.sort((a, b) => b.score - a.score).slice(0, 5).map(({ score, ...rest }) => rest)
  } catch {
    return []
  }
}

// 정책 로드
async function loadPolicies() {
  try {
    const { data: policies } = await supabase
      .from('cs_policies')
      .select('title, category, content')
      .order('category')

    if (!policies || policies.length === 0) return ''

    let text = '\n\n===== 우리 회사 CS 정책 =====\n'
    const grouped = {}
    for (const p of policies) {
      if (!grouped[p.category]) grouped[p.category] = []
      grouped[p.category].push(p)
    }
    for (const [cat, items] of Object.entries(grouped)) {
      text += `\n[${cat}]\n`
      for (const item of items) {
        text += `■ ${item.title}\n${item.content}\n\n`
      }
    }
    text += '===== 정책 끝 =====\n'
    return text
  } catch {
    return ''
  }
}

// AI 답변 생성
async function generateAIResponse(customerMessage) {
  const policiesText = await loadPolicies()

  let historyText = ''
  const similar = await findSimilarHistory(customerMessage)
  if (similar.length > 0) {
    historyText = '\n\n===== 과거 유사 상담 사례 =====\n'
    similar.forEach((item, i) => {
      historyText += `\n[사례 ${i + 1}] (${item.category}${item.result ? ' / ' + item.result : ''})\n`
      historyText += `고객: ${item.customer_inquiry}\n`
      historyText += `답변: ${item.agent_response}\n`
    })
    historyText += '\n===== 사례 끝 =====\n\n위 과거 사례들의 톤, 말투, 대응 방식을 참고하여 답변하세요.'
  }

  const systemPrompt = `당신은 온라인 강의 플랫폼의 전문 CS(고객상담) 담당자입니다.
채널톡으로 들어온 실제 고객 문의에 답변합니다.

답변 원칙:
1. 존댓말 사용
2. 공감 표현으로 시작
3. 구체적인 해결 방안 제시
4. 추가 문의 안내로 마무리
5. 핵심만 전달 (3-5문장)
6. 과거 상담 사례가 제공되면 그 톤과 스타일을 따르세요
7. 마크다운이나 특수 포맷 없이 일반 텍스트로 답변하세요${policiesText}${historyText}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: customerMessage }]
    })
  })

  const data = await response.json()
  return data.content?.[0]?.text || null
}

// 채널톡으로 봇 메시지 전송
async function sendChannelMessage(userChatId, message) {
  const accessKey = process.env.CHANNEL_ACCESS_KEY
  const accessSecret = process.env.CHANNEL_ACCESS_SECRET

  if (!accessKey || !accessSecret) {
    console.error('채널톡 API 키가 설정되지 않았습니다')
    return false
  }

  const response = await fetch(`https://api.channel.io/open/v5/user-chats/${userChatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-key': accessKey,
      'x-access-secret': accessSecret
    },
    body: JSON.stringify({
      blocks: [{ type: 'text', value: message }]
    })
  })

  return response.ok
}

// 상담 이력에 자동 저장
async function saveToHistory(customerMessage, aiResponse) {
  try {
    await supabase.from('cs_history').insert({
      category: '채널톡',
      customer_inquiry: customerMessage,
      agent_response: aiResponse,
      tags: '자동응답',
      result: 'AI자동'
    })
  } catch {
    // 저장 실패해도 무시
  }
}

export async function POST(request) {
  try {
    const body = await request.json()

    // 채널톡 웹훅 검증 (토큰 확인)
    const webhookToken = process.env.CHANNEL_WEBHOOK_TOKEN
    const headerToken = request.headers.get('x-signature')

    // 웹훅 토큰 필수 검증
    if (!webhookToken || !headerToken || headerToken !== webhookToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    const { event, type, entity } = body

    // 메시지 이벤트만 처리
    if (type !== 'message' && type !== 'Message') {
      return NextResponse.json({ ok: true })
    }

    // 고객(user)이 보낸 메시지만 처리 (봇/매니저 메시지 무시 → 무한루프 방지)
    if (entity?.personType !== 'user') {
      return NextResponse.json({ ok: true })
    }

    // userChat만 처리 (팀 채팅 무시)
    if (entity?.chatType !== 'userChat') {
      return NextResponse.json({ ok: true })
    }

    const customerMessage = entity?.plainText || ''
    const userChatId = entity?.chatId

    if (!customerMessage || !userChatId) {
      return NextResponse.json({ ok: true })
    }

    // 채널톡 자동응답 모드 확인
    const autoReply = process.env.CHANNEL_AUTO_REPLY === 'true'

    // AI 답변 생성
    const aiResponse = await generateAIResponse(customerMessage)

    if (!aiResponse) {
      console.error('AI 답변 생성 실패')
      return NextResponse.json({ ok: true })
    }

    if (autoReply) {
      // 자동 답변 모드: 채널톡에 바로 전송
      await sendChannelMessage(userChatId, aiResponse)
      await saveToHistory(customerMessage, aiResponse)
    } else {
      // 추천 모드: 내부 노트로 전송 (매니저만 볼 수 있음)
      // 매니저에게 추천 답변을 보여주기 위해 internal message로 전송
      const accessKey = process.env.CHANNEL_ACCESS_KEY
      const accessSecret = process.env.CHANNEL_ACCESS_SECRET

      if (accessKey && accessSecret) {
        await fetch(`https://api.channel.io/open/v5/user-chats/${userChatId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-key': accessKey,
            'x-access-secret': accessSecret
          },
          body: JSON.stringify({
            blocks: [
              { type: 'text', value: `[AI 추천 답변]\n\n${aiResponse}\n\n(이 메시지는 내부 참고용입니다)` }
            ],
            botName: 'CS AI 어시스턴트'
          })
        })
      }

      await saveToHistory(customerMessage, aiResponse)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('채널톡 웹훅 처리 오류:', error)
    // 웹훅은 항상 200 반환 (재시도 방지)
    return NextResponse.json({ ok: true })
  }
}
