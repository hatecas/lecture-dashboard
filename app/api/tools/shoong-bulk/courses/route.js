import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { getNlabSupabase } from '@/lib/nlabSupabase'

// FreeCourse를 title로 검색하고 각 코스의 신청자 수(ApplyCourse 행수)를 함께 반환
// GET /api/tools/shoong-bulk/courses?keyword=씨오
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const keyword = (searchParams.get('keyword') || '').trim()
  if (!keyword) {
    return NextResponse.json({ error: 'keyword 파라미터가 필요합니다.' }, { status: 400 })
  }

  try {
    const supabase = getNlabSupabase()

    // FreeCourse 후보 검색 (title ILIKE %keyword%)
    const { data: courses, error: coursesError } = await supabase
      .from('FreeCourse')
      .select('id, title')
      .ilike('title', `%${keyword}%`)
      .limit(100)

    if (coursesError) {
      return NextResponse.json({
        error: `FreeCourse 검색 실패: ${coursesError.message}`,
        hint: '컬럼명이 다를 수 있음 (id/title)'
      }, { status: 500 })
    }

    if (!courses || courses.length === 0) {
      return NextResponse.json({ courses: [], total: 0 })
    }

    // 각 코스의 신청자 수 카운트 (head:true + count:'exact'로 데이터 안 가져오고 카운트만)
    const withCounts = await Promise.all(
      courses.map(async (c) => {
        const { count, error } = await supabase
          .from('ApplyCourse')
          .select('id', { count: 'exact', head: true })
          .eq('freeCourseId', c.id)
        return {
          id: c.id,
          title: c.title,
          applicantCount: error ? 0 : (count || 0),
          countError: error?.message || null
        }
      })
    )

    // 신청자 많은 순 정렬
    withCounts.sort((a, b) => b.applicantCount - a.applicantCount)

    return NextResponse.json({
      courses: withCounts,
      total: withCounts.length,
      keyword
    })
  } catch (error) {
    console.error('shoong-bulk/courses error:', error)
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 30
