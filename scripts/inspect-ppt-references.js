// 일회용 점검 스크립트: ai_references 테이블에서 feature_key='ppt' 레퍼런스들을
// 조회해서 각 PPT의 슬라이드 구조를 추출/요약. 평균값 계산용.
//
// 실행: node scripts/inspect-ppt-references.js
// (본 체크아웃 .env.local의 SUPABASE_SERVICE_ROLE_KEY를 사용)

const fs = require('fs')
const path = require('path')

// 본 체크아웃의 .env.local에서 환경변수 로드 (워크트리에 .env.local 없을 수 있음)
function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '..', '.env.local'),
    'C:\\Users\\Qeen\\Downloads\\lecture-dashboard\\.env.local',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf-8')
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let val = m[2]
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (!(m[1] in process.env)) process.env[m[1]] = val
      }
      console.log(`[env] loaded from ${p}`)
      return
    }
  }
  throw new Error('.env.local을 찾을 수 없음')
}

loadEnv()

const { createClient } = require('@supabase/supabase-js')

// ai_references는 RLS 비활성이라 anon key로도 SELECT 가능 (CLAUDE.md §5-12)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function main() {
  const { data: refs, error } = await supabase
    .from('ai_references')
    .select('id, title, content, tags, meta, enabled, sort_order, created_at')
    .eq('feature_key', 'ppt')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('조회 실패:', error)
    process.exit(1)
  }

  console.log(`\n=== ai_references where feature_key='ppt' (${refs.length}건) ===\n`)

  for (const r of refs) {
    console.log(`─────────────────────────────────────────────────────`)
    console.log(`[${r.id}] ${r.title}  (enabled=${r.enabled}, ${r.content.length.toLocaleString()}자)`)
    console.log(`  생성: ${r.created_at}`)
    console.log(`─────────────────────────────────────────────────────`)

    // 슬라이드 구조 추출 — "## 슬라이드 N" 패턴 기준
    const slideMatches = [...r.content.matchAll(/## 슬라이드 (\d+)\n([\s\S]*?)(?=\n## 슬라이드 \d+|$)/g)]
    console.log(`  슬라이드 수: ${slideMatches.length}장`)

    if (slideMatches.length === 0) {
      console.log(`  (## 슬라이드 N 패턴 없음 — 본문 첫 500자 미리보기)`)
      console.log(r.content.slice(0, 500))
      console.log()
      continue
    }

    // 각 슬라이드의 첫 줄(제목/메인 메시지)을 뽑아서 흐름 파악
    console.log(`\n  슬라이드별 첫 줄 (제목 또는 첫 메시지):`)
    for (const m of slideMatches) {
      const idx = m[1]
      const body = m[2].trim()
      const firstLine = body.split('\n').filter(l => l.trim() && !l.startsWith('[발표자 노트]'))[0] || '(빈 슬라이드)'
      console.log(`    ${idx.padStart(3)}: ${firstLine.slice(0, 60)}`)
    }
    console.log()
  }

  // 전체 통계
  const enabled = refs.filter(r => r.enabled)
  console.log(`\n=== 통계 ===`)
  console.log(`총 ${refs.length}건 / 활성 ${enabled.length}건`)
  if (enabled.length > 0) {
    const slideCounts = enabled.map(r => {
      const m = [...r.content.matchAll(/## 슬라이드 (\d+)/g)]
      return m.length
    })
    console.log(`활성 레퍼런스 슬라이드 수: ${slideCounts.join(', ')}`)
    console.log(`평균: ${(slideCounts.reduce((a, b) => a + b, 0) / slideCounts.length).toFixed(0)}장`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
