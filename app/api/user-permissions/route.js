import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth } from '@/lib/apiAuth'

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
  { key: 'project-planner', label: '프로젝트 기획', desc: '강사·주제 기반 멀티 봇 기획안 자동 생성' },
  { key: 'sheet-settings', label: '시트 설정', desc: '구글시트 컬럼 매핑 설정' },
  { key: 'payer-data', label: '결제자 데이터', desc: '결제자 시트 데이터 및 매칭' },
]

export async function GET(request) {
  try {
    // 인증 — 토큰에서 신원을 가져오고 쿼리스트링은 신뢰하지 않는다
    const auth = await verifyApiAuth(request)
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error || '인증이 필요합니다.' }, { status: 401 })
    }
    const callerUsername = auth.user?.username
    const isSuperAdmin = callerUsername === 'jinwoo'

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // 본인 권한 조회 — 토큰 주체 기준 (쿼리의 loginId는 무시)
    if (action === 'my-permissions') {
      if (isSuperAdmin) {
        return Response.json({
          success: true,
          features: ALL_FEATURES.map(f => f.key),
          allFeatures: ALL_FEATURES
        })
      }

      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('username', callerUsername)
        .single()

      if (!admin) {
        return Response.json({ success: true, features: DEFAULT_FEATURES, allFeatures: ALL_FEATURES })
      }

      const { data: perms } = await supabase
        .from('user_permissions')
        .select('feature_key, enabled')
        .eq('user_id', admin.id)

      if (!perms || perms.length === 0) {
        return Response.json({ success: true, features: DEFAULT_FEATURES, allFeatures: ALL_FEATURES })
      }

      const enabledFeatures = perms.filter(p => p.enabled).map(p => p.feature_key)
      return Response.json({ success: true, features: enabledFeatures, allFeatures: ALL_FEATURES })
    }

    // 관리자: 모든 유저 + 권한 목록 조회 — 슈퍼어드민만
    if (action === 'all-users') {
      if (!isSuperAdmin) {
        return Response.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
      }

      const { data: admins, error: adminError } = await supabase
        .from('admins')
        .select('id, username, name')
        .order('id')

      if (adminError) {
        return Response.json({ success: false, error: adminError.message }, { status: 500 })
      }

      const { data: allPerms } = await supabase
        .from('user_permissions')
        .select('user_id, feature_key, enabled')

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
    // 인증 — 권한 변경은 슈퍼어드민(jinwoo) 전용
    const auth = await verifyApiAuth(request)
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error || '인증이 필요합니다.' }, { status: 401 })
    }
    if (auth.user?.username !== 'jinwoo') {
      return Response.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { action, userId, features } = body

    if (action === 'save-permissions') {
      const { data: targetAdmin } = await supabase
        .from('admins')
        .select('username')
        .eq('id', userId)
        .single()

      if (targetAdmin?.username === 'jinwoo') {
        return Response.json({ success: false, error: '최고 관리자의 권한은 변경할 수 없습니다.' }, { status: 400 })
      }

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
