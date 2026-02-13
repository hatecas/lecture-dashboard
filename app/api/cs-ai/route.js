import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

// 유사 상담 이력 검색
async function findSimilarHistory(inquiry) {
  try {
    // 키워드 추출 (2글자 이상 단어)
    const keywords = inquiry
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5) // 상위 5개 키워드

    if (keywords.length === 0) return []

    // 각 키워드로 검색하여 합침
    const orFilter = keywords.map(k => `customer_inquiry.ilike.%${k}%`).join(',')

    const { data } = await supabase
      .from('cs_history')
      .select('customer_inquiry, agent_response, category, result')
      .or(orFilter)
      .limit(10)

    if (!data || data.length === 0) return []

    // 키워드 매칭 수로 관련도 점수 매기기
    const scored = data.map(item => {
      const text = (item.customer_inquiry + ' ' + item.agent_response).toLowerCase()
      const score = keywords.reduce((s, k) => s + (text.includes(k.toLowerCase()) ? 1 : 0), 0)
      return { ...item, score }
    })

    // 점수 높은 순으로 상위 5개
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, ...rest }) => rest)
  } catch {
    return []
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

    // 1. Supabase에서 저장된 CS 정책 로드
    let policiesText = ''
    try {
      const { data: policies } = await supabase
        .from('cs_policies')
        .select('title, category, content')
        .order('category')

      if (policies && policies.length > 0) {
        policiesText = '\n\n===== 우리 회사 CS 정책 =====\n'
        const grouped = {}
        for (const p of policies) {
          if (!grouped[p.category]) grouped[p.category] = []
          grouped[p.category].push(p)
        }
        for (const [cat, items] of Object.entries(grouped)) {
          policiesText += `\n[${cat}]\n`
          for (const item of items) {
            policiesText += `■ ${item.title}\n${item.content}\n\n`
          }
        }
        policiesText += '===== 정책 끝 =====\n'
      }
    } catch {
      // 테이블 없으면 무시
    }

    // 2. 유사 상담 이력 검색 (마지막 user 메시지 기준)
    let historyText = ''
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg?.content) {
      const similar = await findSimilarHistory(lastUserMsg.content)
      if (similar.length > 0) {
        historyText = '\n\n===== 과거 유사 상담 사례 =====\n'
        similar.forEach((item, i) => {
          historyText += `\n[사례 ${i + 1}] (${item.category}${item.result ? ' / ' + item.result : ''})\n`
          historyText += `고객: ${item.customer_inquiry}\n`
          historyText += `답변: ${item.agent_response}\n`
        })
        historyText += '\n===== 사례 끝 =====\n\n위 과거 사례들의 톤, 말투, 대응 방식을 참고하여 답변하세요. 우리 팀이 실제로 했던 답변 스타일을 최대한 따라하세요.'
      }
    }

    const systemPrompt = `당신은 온라인 강의 플랫폼의 전문 CS(고객상담) 담당자입니다.

역할:
- 고객 문의에 대해 친절하고 전문적인 답변을 작성합니다
- 환불, 결제, 수강 관련 문의에 정확하게 대응합니다
- 불만 고객에게는 공감하며 해결책을 제시합니다
- 답변은 실제 CS 담당자가 고객에게 보내는 메시지 형태로 작성합니다

답변 원칙:
1. 존댓말 사용 (~~습니다, ~~드리겠습니다)
2. 공감 표현으로 시작 (불편을 드려 죄송합니다, 문의 감사합니다 등)
3. 구체적인 해결 방안 제시
4. 추가 문의 안내로 마무리
5. 너무 길지 않게 핵심만 전달 (3-5문장)
6. 과거 상담 사례가 제공되면 그 톤과 스타일을 최우선으로 따르세요

이미지가 포함된 경우:
- 이미지 내용을 분석하여 고객 문의 맥락을 파악합니다
- 스크린샷의 오류 메시지, 결제 내역 등을 읽고 답변에 반영합니다

사용자가 고객 문의 내용을 입력하면, 그에 맞는 CS 답변을 작성해주세요.
사용자가 추가 지시(톤 변경, 내용 수정 등)를 하면 그에 맞게 조정하세요.${policiesText}${historyText}`

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: apiMessages
      })
    })

    const data = await response.json()

    if (data.content && data.content[0]) {
      return NextResponse.json({ reply: data.content[0].text })
    }

    return NextResponse.json({ error: 'AI 응답 실패' }, { status: 500 })

  } catch (error) {
    console.error('CS AI 오류:', error)
    return NextResponse.json({ error: 'CS AI 처리 중 오류 발생' }, { status: 500 })
  }
}
