import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// 조회수 컬럼 찾기
function findViewsColumn(headers) {
  const patterns = ['조회수', 'views', '조회', 'view', '시청수']
  for (const header of headers) {
    for (const pattern of patterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 전환수 컬럼 찾기
function findConversionsColumn(headers) {
  const patterns = ['전환', 'conversion', '구매', '결제', '신청', '등록', 'purchase']
  for (const header of headers) {
    for (const pattern of patterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 영상 제목 컬럼 찾기
function findTitleColumn(headers) {
  const patterns = ['제목', 'title', '영상', 'video', '콘텐츠', 'content', '채널']
  for (const header of headers) {
    for (const pattern of patterns) {
      if (String(header).toLowerCase().includes(pattern.toLowerCase())) {
        return header
      }
    }
  }
  return null
}

// 숫자 파싱
function parseNumber(value) {
  if (!value) return 0
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  return parseFloat(cleaned) || 0
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 필요합니다.' })
    }

    const logs = ['파일 업로드 완료']

    // 파일 읽기
    const buffer = await file.arrayBuffer()
    logs.push('파일 파싱 중...')

    // Excel/CSV 파싱
    const wb = XLSX.read(buffer)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    logs.push(`레코드 수: ${data.length}`)

    // 컬럼 찾기
    const headers = Object.keys(data[0] || {})
    const viewsCol = findViewsColumn(headers)
    const conversionsCol = findConversionsColumn(headers)
    const titleCol = findTitleColumn(headers)

    logs.push(`조회수 컬럼: ${viewsCol || '(없음)'}`)
    logs.push(`전환수 컬럼: ${conversionsCol || '(없음)'}`)
    logs.push(`제목 컬럼: ${titleCol || '(없음)'}`)

    // 통계 계산
    let totalViews = 0
    let totalConversions = 0
    const videoStats = []

    for (const row of data) {
      const views = viewsCol ? parseNumber(row[viewsCol]) : 0
      const conversions = conversionsCol ? parseNumber(row[conversionsCol]) : 0
      const title = titleCol ? String(row[titleCol] || '').trim() : '(제목 없음)'

      totalViews += views
      totalConversions += conversions

      const conversionRate = views > 0 ? (conversions / views) * 100 : 0

      videoStats.push({
        title,
        views,
        conversions,
        conversionRate: conversionRate.toFixed(4)
      })

      // 원본 데이터에 전환율 추가
      row['전환율(%)'] = conversionRate.toFixed(2)
    }

    // 평균 전환율
    const avgConversionRate = totalViews > 0 ? (totalConversions / totalViews) * 100 : 0

    logs.push(`총 조회수: ${totalViews.toLocaleString()}`)
    logs.push(`총 전환수: ${totalConversions}`)
    logs.push(`평균 전환율: ${avgConversionRate.toFixed(2)}%`)

    // 상위/하위 영상 분석
    const sortedByRate = [...videoStats].sort((a, b) => parseFloat(b.conversionRate) - parseFloat(a.conversionRate))
    const topVideos = sortedByRate.slice(0, 5)
    const bottomVideos = sortedByRate.slice(-5).reverse()

    logs.push('분석 완료')

    // AI 인사이트 생성 (OpenAI API 사용 시)
    let aiInsight = ''
    try {
      if (process.env.OPENAI_API_KEY) {
        const prompt = `유튜브/미디어 데이터 분석 결과입니다:
- 총 영상 수: ${data.length}
- 총 조회수: ${totalViews.toLocaleString()}
- 총 전환수: ${totalConversions}
- 평균 전환율: ${avgConversionRate.toFixed(2)}%

상위 전환율 영상:
${topVideos.map((v, i) => `${i + 1}. ${v.title} (조회수: ${v.views}, 전환율: ${v.conversionRate}%)`).join('\n')}

하위 전환율 영상:
${bottomVideos.map((v, i) => `${i + 1}. ${v.title} (조회수: ${v.views}, 전환율: ${v.conversionRate}%)`).join('\n')}

이 데이터를 바탕으로 다음을 분석해주세요:
1. 전체적인 성과 평가 (2-3문장)
2. 잘 되고 있는 점 (1-2가지)
3. 개선이 필요한 점 (1-2가지)
4. 구체적인 액션 아이템 (2-3가지)

간결하고 실용적으로 작성해주세요.`

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000,
            temperature: 0.7
          })
        })

        if (aiRes.ok) {
          const aiData = await aiRes.json()
          aiInsight = aiData.choices?.[0]?.message?.content || ''
        }
      }
    } catch (aiError) {
      console.error('AI insight error:', aiError)
      // AI 실패해도 기본 분석 결과는 반환
    }

    // AI 인사이트가 없으면 기본 분석 제공
    if (!aiInsight) {
      aiInsight = `📊 기본 분석 결과

🎯 전체 성과
총 ${data.length}개 영상에서 ${totalViews.toLocaleString()} 조회, ${totalConversions}건 전환 발생
평균 전환율 ${avgConversionRate.toFixed(2)}%

✅ 상위 전환율 영상
${topVideos.slice(0, 3).map((v, i) => `${i + 1}. ${v.title} (${v.conversionRate}%)`).join('\n')}

⚠️ 개선 필요 영상
${bottomVideos.slice(0, 3).map((v, i) => `${i + 1}. ${v.title} (${v.conversionRate}%)`).join('\n')}

💡 제안
- 상위 전환 영상의 공통점을 분석하여 다른 영상에 적용
- 조회수 대비 전환율이 낮은 영상 썸네일/CTA 개선 검토`
    }

    // 결과 Excel 생성
    const newWb = XLSX.utils.book_new()

    // 원본 데이터 + 전환율
    const mainWs = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(newWb, mainWs, '전체데이터')

    // 요약 시트
    const summaryData = [
      { 항목: '총 영상 수', 값: data.length },
      { 항목: '총 조회수', 값: totalViews },
      { 항목: '총 전환수', 값: totalConversions },
      { 항목: '평균 전환율(%)', 값: avgConversionRate.toFixed(2) }
    ]
    const summaryWs = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(newWb, summaryWs, '요약')

    // 전환율 순위 시트
    const rankingData = sortedByRate.map((v, i) => ({
      순위: i + 1,
      제목: v.title,
      조회수: v.views,
      전환수: v.conversions,
      '전환율(%)': v.conversionRate
    }))
    const rankingWs = XLSX.utils.json_to_sheet(rankingData)
    XLSX.utils.book_append_sheet(newWb, rankingWs, '전환율순위')

    // Excel 파일을 base64로 변환
    const excelBuffer = XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' })
    const downloadUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`

    return NextResponse.json({
      success: true,
      stats: {
        totalVideos: data.length,
        totalViews,
        totalConversions,
        avgConversionRate
      },
      aiInsight,
      logs,
      downloadUrl
    })

  } catch (error) {
    console.error('Media analyze error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}
