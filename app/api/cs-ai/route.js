import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

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

고객 문의 유형별 대응:
- 환불 요청: 환불 정책 안내 + 처리 절차 설명
- 결제 오류: 확인 절차 안내 + 대안 제시
- 수강 문의: 강의 정보 제공 + 추천
- 불만/컴플레인: 진심 어린 사과 + 보상/해결책 제시
- 기술 문제: 단계별 해결 방법 안내

사용자가 고객 문의 내용을 입력하면, 그에 맞는 CS 답변을 작성해주세요.
사용자가 추가 지시(톤 변경, 내용 수정 등)를 하면 그에 맞게 조정하세요.`

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
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
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
