import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// 기본 컬럼 매핑 (테이블이 없거나 설정이 없을 때 폴백)
const DEFAULT_CONFIG = {
  config_name: 'default',
  sheet_id: '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw',
  data_range: 'A:AR',
  header_key: '강사명',
  columns: [
    { key: 'name', label: '강사명', index: 0, type: 'name' },
    { key: 'freeClassDate', label: '무료강의날짜', index: 1, type: 'date' },
    { key: 'revenue', label: '최종매출액', index: 8, type: 'number' },
    { key: 'operatingProfit', label: '영업이익', index: 10, type: 'number' },
    { key: 'profitMargin', label: '영업이익률', index: 11, type: 'percent' },
    { key: 'adSpend', label: '광고비', index: 17, type: 'number' },
    { key: 'gdnConvCost', label: 'GDN전환단가', index: 18, type: 'number' },
    { key: 'metaConvCost', label: '메타전환단가', index: 19, type: 'number' },
    { key: 'kakaoRoomDb', label: '카톡방', index: 28, type: 'number' },
    { key: 'liveViewers', label: '동시접속', index: 29, type: 'number' },
    { key: 'totalPurchases', label: '결제건수', index: 34, type: 'number' },
    { key: 'conversionRate', label: '전환율', index: 43, type: 'percent' }
  ]
}

// GET: 현재 설정 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('sheet_column_config')
      .select('*')
      .eq('config_name', 'default')
      .single()

    if (error || !data) {
      // 테이블이 없거나 데이터가 없으면 기본값 반환
      return NextResponse.json({ config: DEFAULT_CONFIG, isDefault: true })
    }

    return NextResponse.json({ config: data, isDefault: false })
  } catch {
    return NextResponse.json({ config: DEFAULT_CONFIG, isDefault: true })
  }
}

// POST: 설정 저장 (개발자만)
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  // 개발자 권한 확인
  if (auth.user?.username !== 'jinwoo') {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { sheet_id, data_range, header_key, columns } = body

    // 기존 설정이 있는지 확인
    const { data: existing } = await supabase
      .from('sheet_column_config')
      .select('id')
      .eq('config_name', 'default')
      .single()

    let result
    if (existing) {
      // 업데이트
      result = await supabase
        .from('sheet_column_config')
        .update({
          sheet_id,
          data_range,
          header_key,
          columns,
          updated_at: new Date().toISOString()
        })
        .eq('config_name', 'default')
        .select()
        .single()
    } else {
      // 신규 삽입
      result = await supabase
        .from('sheet_column_config')
        .insert({
          config_name: 'default',
          sheet_id,
          data_range,
          header_key,
          columns,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: result.data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
