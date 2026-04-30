// 봇별 지침/레퍼런스를 자체 Supabase에서 로드하는 헬퍼.
// 각 planner(ebook.js, boomUp.js 등)가 호출 직전에 사용.
// DB가 비어있으면 호출자가 넘긴 defaults로 폴백.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

/**
 * @param {string} featureKey - 'ebook' / 'boomUp' / ...
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
    const references = dbRefs.length > 0
      ? dbRefs.map(r => `=== ${r.title} ===\n${r.content}`).join('\n\n')
      : fallback.references

    const source = (dbInstructions || dbRefs.length > 0) ? 'db' : 'default'
    return { instructions, references, source }
  } catch (err) {
    console.error(`[loadPlannerConfig] ${featureKey} 로드 실패, 폴백 사용:`, err.message)
    return { ...fallback, source: 'default' }
  }
}
