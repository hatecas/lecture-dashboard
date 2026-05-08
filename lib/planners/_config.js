// 봇별 지침/레퍼런스를 자체 Supabase에서 로드하는 헬퍼.
// 각 planner(ebook.js, boomUp.js 등)가 호출 직전에 사용.
// DB가 비어있으면 호출자가 넘긴 defaults로 폴백.
//
// 부가 기능: ai_references.content 가 노션 URL 한 줄로만 되어 있으면
// 자동으로 노션 페이지를 fetch해서 markdown으로 펼친다.
// 5분 메모리 캐시로 같은 URL 중복 호출 방지.

import { createClient } from '@supabase/supabase-js'
import { isNotionUrl, fetchNotionPageAsMarkdown } from '@/lib/integrations/notion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// 노션 URL → markdown 캐시 (서버 인스턴스 lifetime + 5분 TTL).
// 어드민이 양식 수정 후 5분 안에는 옛날 캐시 사용. 5분 지나면 다음 호출에서 새로 fetch.
const _notionCache = new Map() // url -> { md, ts }
const NOTION_CACHE_TTL_MS = 5 * 60 * 1000

// content가 단순 노션 URL 한 줄(또는 공백 포함)이면 그 URL 반환. 아니면 null.
function extractSoleNotionUrl(content) {
  if (!content || typeof content !== 'string') return null
  const trimmed = content.trim()
  if (!trimmed) return null
  // 한 줄 또는 한 줄 + 트레일링 공백/엔터
  const firstLine = trimmed.split(/\r?\n/)[0].trim()
  // 멀티라인이면 (양식 텍스트 직접 입력) 패스
  const otherLines = trimmed.split(/\r?\n/).slice(1).join('').trim()
  if (otherLines) return null
  // URL인지 + 노션 도메인인지
  if (!/^https?:\/\//i.test(firstLine)) return null
  if (!isNotionUrl(firstLine)) return null
  return firstLine
}

async function fetchNotionRefMd(url) {
  const now = Date.now()
  const cached = _notionCache.get(url)
  if (cached && (now - cached.ts) < NOTION_CACHE_TTL_MS) {
    return cached.md
  }
  if (!process.env.NOTION_API_KEY) {
    return `_(노션 URL 자동 펼침 실패: NOTION_API_KEY 미설정. 원본 URL: ${url})_`
  }
  try {
    const r = await fetchNotionPageAsMarkdown(url, { transcribeAudio: false }) // 레퍼런스는 양식만 보면 되니 audio transcribe 불필요
    const md = r.markdown || ''
    _notionCache.set(url, { md, ts: now })
    return md
  } catch (e) {
    const errMsg = e?.message || String(e)
    console.warn(`[loadPlannerConfig] 노션 URL fetch 실패: ${url} → ${errMsg}`)
    return `_(노션 URL 자동 펼침 실패: ${errMsg}. 원본 URL: ${url})_`
  }
}

// 단일 reference row의 content를 펼쳐진 markdown으로 변환.
// content가 노션 URL이면 fetch, 아니면 그대로.
async function expandReferenceContent(content) {
  const url = extractSoleNotionUrl(content)
  if (!url) return content
  return await fetchNotionRefMd(url)
}

/**
 * @param {string} featureKey - 'ebook' / 'boomUp' / 'summarize' / ...
 * @param {{instructions?: string, references?: string}} defaults - DB가 비어있을 때 사용할 폴백
 * @returns {Promise<{instructions: string, references: string, source: 'db'|'default'}>}
 */
export async function loadPlannerConfig(featureKey, defaults = {}) {
  const fallback = {
    instructions: defaults.instructions || '',
    references: defaults.references || '',
  }

  try {
    const [promptRes, refsRes] = await Promise.all([
      supabase.from('ai_prompts').select('instructions').eq('feature_key', featureKey).maybeSingle(),
      supabase.from('ai_references')
        .select('title, content, tags, meta')
        .eq('feature_key', featureKey)
        .eq('enabled', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    const dbInstructions = (promptRes?.data?.instructions || '').trim()
    const dbRefs = refsRes?.data || []

    const instructions = dbInstructions || fallback.instructions

    let references
    if (dbRefs.length > 0) {
      // 각 reference의 content가 노션 URL이면 자동 fetch (병렬). 일반 텍스트면 그대로.
      const expanded = await Promise.all(dbRefs.map(async (r) => {
        const expandedContent = await expandReferenceContent(r.content || '')
        return `=== ${r.title} ===\n${expandedContent}`
      }))
      references = expanded.join('\n\n')
    } else {
      references = fallback.references
    }

    const source = (dbInstructions || dbRefs.length > 0) ? 'db' : 'default'
    return { instructions, references, source }
  } catch (err) {
    console.error(`[loadPlannerConfig] ${featureKey} 로드 실패, 폴백 사용:`, err.message)
    return { ...fallback, source: 'default' }
  }
}
