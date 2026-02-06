import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

export async function POST(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { sessionData, memos, attachments, analysisType } = await request.json()

    const isDetail = analysisType === 'detail'

    // 상세 분석: 첨부파일 기반
    if (isDetail && attachments && attachments.length > 0) {
      let attachmentSection = '업로드된 자료:\n'
      for (const file of attachments) {
        if (file.content) {
          attachmentSection += `\n--- ${file.name} (${file.type}) ---\n${file.content}\n`
        } else {
          attachmentSection += `\n- ${file.name} (${file.type}, ${file.size ? Math.round(file.size / 1024) + 'KB' : '링크'})\n`
        }
      }

      const memoSection = memos && memos.length > 0 ? `\n\n미팅 메모:\n${memos.map(m => m.content).join('\n')}` : ''

      const prompt = `당신은 온라인 강의 마케팅 및 콘텐츠 분석 전문가입니다.

강사: ${sessionData.instructorName} ${sessionData.sessionName}

다음 업로드된 자료들을 분석해주세요:

${attachmentSection}
${memoSection}

위 자료들을 기반으로 다음을 분석해주세요:
1. 자료의 핵심 내용 요약
2. 강의/마케팅에 활용 가능한 강점
3. 보완이 필요한 부분
4. 구체적인 활용 방안 제안

다음 형식으로 JSON만 응답하세요 (다른 텍스트 없이 JSON만):
{
  "summary": "자료 분석 요약 (2-3문장)",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["보완점1", "보완점2"],
  "recommendations": ["활용방안1", "활용방안2", "활용방안3"],
  "keyInsight": "가장 중요한 인사이트 한 줄"
}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      })

      const data = await response.json()

      if (data.content && data.content[0]) {
        const text = data.content[0].text
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0])
          return NextResponse.json(analysis)
        }
      }

      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 })
    }

    // 기본 분석: 대시보드 데이터 기반
    const dataSection = `강사: ${sessionData.instructorName} ${sessionData.sessionName}
주제: ${sessionData.topic || '미입력'}
매출: ${sessionData.revenue?.toLocaleString()}원
영업이익: ${sessionData.operatingProfit?.toLocaleString()}원
영업이익률: ${sessionData.profitMargin}%
광고비: ${sessionData.adSpend?.toLocaleString()}원
카톡방 DB: ${sessionData.kakaoRoomDB}명
전환비용: ${sessionData.conversionCost?.toLocaleString()}원
최고 동시접속자: ${sessionData.liveViewers}명
전체 결제자: ${sessionData.totalPurchases}명
구매전환율: ${sessionData.purchaseConversionRate ? (sessionData.purchaseConversionRate * 100).toFixed(2) + '%' : '미집계'}`

    const memoSection = memos && memos.length > 0 ? `\n미팅 메모:\n${memos.map(m => m.content).join('\n')}` : ''

    const prompt = `당신은 온라인 강의 마케팅 전문가입니다. 다음 데이터를 분석해주세요:

${dataSection}
${memoSection}

다음 형식으로 JSON만 응답하세요 (다른 텍스트 없이 JSON만):
{
  "summary": "전체 요약 (2-3문장)",
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "recommendations": ["추천1", "추천2", "추천3"],
  "keyInsight": "가장 중요한 인사이트 한 줄"
}`

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
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    })

    const data = await response.json()
    
    if (data.content && data.content[0]) {
      const text = data.content[0].text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0])
        return NextResponse.json(analysis)
      }
    }

    return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 })

  } catch (error) {
    console.error('AI 분석 오류:', error)
    return NextResponse.json({ error: '분석 중 오류 발생' }, { status: 500 })
  }
}