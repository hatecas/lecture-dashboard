import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

export async function POST(request) {
  // API 인증 검증
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { url } = await request.json()
    if (!url) return NextResponse.json({ error: 'URL 필요' }, { status: 400 })

    // 유튜브 비디오 ID 추출
    const videoId = extractVideoId(url)
    if (!videoId) return NextResponse.json({ error: '유효한 유튜브 URL이 아닙니다' }, { status: 400 })

    // 1) oEmbed로 채널명 가져오기
    let channelName = ''
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      if (oembedRes.ok) {
        const oembed = await oembedRes.json()
        channelName = oembed.author_name || ''
      }
    } catch (e) {
      // oEmbed 실패 시 무시
    }

    // 2) 유튜브 페이지에서 조회수 파싱
    let views = 0
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
      })
      if (pageRes.ok) {
        const html = await pageRes.text()

        // 방법1: meta itemprop="interactionCount"
        const metaMatch = html.match(/<meta\s+itemprop="interactionCount"\s+content="(\d+)"/)
        if (metaMatch) {
          views = parseInt(metaMatch[1])
        }

        // 방법2: ytInitialData에서 viewCount 파싱
        if (!views) {
          const viewMatch = html.match(/"viewCount":"(\d+)"/)
          if (viewMatch) {
            views = parseInt(viewMatch[1])
          }
        }

        // 방법3: "조회수" 텍스트에서 파싱
        if (!views) {
          const koreanMatch = html.match(/조회수\s*([\d,]+)회/)
          if (koreanMatch) {
            views = parseInt(koreanMatch[1].replace(/,/g, ''))
          }
        }
      }
    } catch (e) {
      // 페이지 파싱 실패 시 무시
    }

    return NextResponse.json({ channelName, views, videoId })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url)
    // youtube.com/watch?v=ID
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v')
    }
    // youtu.be/ID
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1)
    }
    // youtube.com/shorts/ID
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/)
    if (shortsMatch) return shortsMatch[1]
    // youtube.com/embed/ID
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/)
    if (embedMatch) return embedMatch[1]
    // youtube.com/live/ID
    const liveMatch = parsed.pathname.match(/\/live\/([^/?]+)/)
    if (liveMatch) return liveMatch[1]
    return null
  } catch {
    return null
  }
}
