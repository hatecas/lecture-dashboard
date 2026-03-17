import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// 기본 권한 (새 계정 디폴트)
const DEFAULT_FEATURES = ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer']

// 모든 기능 목록
const ALL_FEATURES = [
  { key: 'basic-dashboard', label: '기본 대시보드', desc: '대시보드, 상세정보, 랭킹, 대조' },
  { key: 'tools', label: '업무 툴', desc: 'CRM 정리, 카톡 매칭, 유튜브 채팅, 유입경로 매칭' },
  { key: 'resources', label: '시트 통합', desc: 'Google Sheets 통합 뷰' },
  { key: 'cs-ai', label: 'CS AI', desc: 'CS 정책 AI 챗봇' },
  { key: 'lecture-analyzer', label: '무료강의 분석기', desc: '유튜브 무료강의 분석' },
  { key: 'sheet-settings', label: '시트 설정', desc: '구글시트 컬럼 매핑 설정' },
  { key: 'payer-data', label: '결제자 데이터', desc: '결제자 시트 데이터 및 매칭' },
]

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const loginId = searchParams.get('loginId')

    // 특정 유저의 권한 조회 (로그인 시 사용)
    if (action === 'my-permissions' && loginId) {
      // jinwoo는 모든 권한
      if (loginId === 'jinwoo') {
        return Response.json({
          success: true,
          features: ALL_FEATURES.map(f => f.key),
          allFeatures: ALL_FEATURES
        })
      }

      // 해당 유저의 admin id 조회
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('username', loginId)
        .single()

      if (!admin) {
        return Response.json({ success: true, features: DEFAULT_FEATURES, allFeatures: ALL_FEATURES })
      }

      // 권한 조회
      const { data: perms } = await supabase
        .from('user_permissions')
        .select('feature_key, enabled')
        .eq('user_id', admin.id)

      // 권한 레코드가 없으면 디폴트
      if (!perms || perms.length === 0) {
        return Response.json({ success: true, features: DEFAULT_FEATURES, allFeatures: ALL_FEATURES })
      }

      const enabledFeatures = perms.filter(p => p.enabled).map(p => p.feature_key)
      return Response.json({ success: true, features: enabledFeatures, allFeatures: ALL_FEATURES })
    }

    // 관리자: 모든 유저 + 권한 목록 조회
    if (action === 'all-users') {
      const requestLoginId = searchParams.get('requestLoginId')
      if (requestLoginId !== 'jinwoo') {
        return Response.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
      }

      // 모든 관리자 계정 조회
      const { data: admins, error: adminError } = await supabase
        .from('admins')
        .select('id, username, name')
        .order('id')

      if (adminError) {
        return Response.json({ success: false, error: adminError.message }, { status: 500 })
      }

      // 모든 권한 조회
      const { data: allPerms } = await supabase
        .from('user_permissions')
        .select('user_id, feature_key, enabled')

      // 유저별 권한 매핑
      const usersWithPermissions = admins.map(admin => {
        const userPerms = (allPerms || []).filter(p => p.user_id === admin.id)
        let features
        if (admin.username === 'jinwoo') {
          features = ALL_FEATURES.map(f => f.key)
        } else if (userPerms.length === 0) {
          features = [...DEFAULT_FEATURES]
        } else {
          features = userPerms.filter(p => p.enabled).map(p => p.feature_key)
        }
        return {
          ...admin,
          features,
          isSuperAdmin: admin.username === 'jinwoo'
        }
      })

      return Response.json({
        success: true,
        users: usersWithPermissions,
        allFeatures: ALL_FEATURES,
        defaultFeatures: DEFAULT_FEATURES
      })
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { action, requestLoginId, userId, features } = body

    // jinwoo만 권한 수정 가능
    if (requestLoginId !== 'jinwoo') {
      return Response.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
    }

    if (action === 'save-permissions') {
      // jinwoo 자신의 권한은 수정 불가
      const { data: targetAdmin } = await supabase
        .from('admins')
        .select('username')
        .eq('id', userId)
        .single()

      if (targetAdmin?.username === 'jinwoo') {
        return Response.json({ success: false, error: '최고 관리자의 권한은 변경할 수 없습니다.' }, { status: 400 })
      }

      // 기존 권한 삭제 후 새로 삽입
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)

      const rows = ALL_FEATURES.map(f => ({
        user_id: userId,
        feature_key: f.key,
        enabled: features.includes(f.key)
      }))

      const { error: insertError } = await supabase
        .from('user_permissions')
        .insert(rows)

      if (insertError) {
        return Response.json({ success: false, error: insertError.message }, { status: 500 })
      }

      return Response.json({ success: true })
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
