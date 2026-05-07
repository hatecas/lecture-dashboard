// Notion 페이지 → Markdown 변환 헬퍼.
// 공식 Notion API(@notionhq/client) 사용.
//
// 지원 URL 형태:
//   https://www.notion.so/Page-Title-abc123def4567890abcdef0123456789
//   https://www.notion.so/abc123def4567890abcdef0123456789
//   https://workspace.notion.site/Page-Title-abc123def4567890abcdef0123456789
//   https://workspace.notion.site/abc123def4567890abcdef0123456789?source=copy_link
//   ...등 끝부분에 32자 hex(또는 UUID 하이픈 형태) 포함된 모든 형태
//
// 한도(안전장치):
//  - 재귀 깊이 8
//  - 총 블록 수 5000
//  - 페이지당 가져오는 children 한도 100 (paginated)

import { Client } from '@notionhq/client'

let _client = null
function getClient() {
  if (_client) return _client
  const key = (process.env.NOTION_API_KEY || '').trim()
  if (!key) throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.')
  // 개별 API 호출당 15초 타임아웃 — 네트워크 행 방지
  _client = new Client({ auth: key, timeoutMs: 15000 })
  return _client
}

const NOTION_HOST_RE = /(?:^|\.)notion\.(so|site)$/

export function isNotionUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  try {
    const u = new URL(rawUrl)
    return NOTION_HOST_RE.test(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

// URL → Notion 페이지 UUID. 매치 안 되면 null.
export function parseNotionPageId(rawUrl) {
  if (!rawUrl) return null
  // 1) 32자 hex (하이픈 없음) 또는 표준 UUID 형태를 URL 어디에서든 매치
  const hex32 = rawUrl.match(/[0-9a-f]{32}/i)
  const uuid = rawUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  let raw = uuid ? uuid[0].replace(/-/g, '') : (hex32 ? hex32[0] : null)
  if (!raw || raw.length !== 32) return null
  raw = raw.toLowerCase()
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

// rich_text 배열 → 인라인 markdown
function richTextToMd(rich) {
  if (!Array.isArray(rich)) return ''
  return rich
    .map((rt) => {
      let t = rt.plain_text ?? ''
      const a = rt.annotations || {}
      if (a.code) t = `\`${t}\``
      if (a.strikethrough) t = `~~${t}~~`
      if (a.italic) t = `*${t}*`
      if (a.bold) t = `**${t}**`
      const href = rt.href || rt.text?.link?.url
      if (href) t = `[${t}](${href})`
      return t
    })
    .join('')
}

const MAX_DEPTH = 8
const MAX_BLOCKS = 5000
const TOTAL_TIMEOUT_MS = 5 * 60 * 1000 // 전체 fetch 타임아웃 (5분 — 진행 상황 표시되므로 길게)

// 한 블록의 자식들 재귀 fetch. 부착 형태로 children 필드에 매단다.
// onProgress(state) — 한 페이지 분량(최대 100블록) 끝낼 때마다 호출. UI 실시간 갱신용.
async function fetchBlocksTree(client, blockId, state, depth = 0, onProgress) {
  if (depth > MAX_DEPTH) return []
  if (state.count >= MAX_BLOCKS) return []
  const blocks = []
  let cursor = undefined
  while (true) {
    const res = await client.blocks.children.list({
      block_id: blockId,
      page_size: 100,
      start_cursor: cursor,
    })
    for (const b of res.results) {
      state.count++
      if (state.count > MAX_BLOCKS) {
        state.truncated = true
        return blocks
      }
      if (b.has_children) {
        b._children = await fetchBlocksTree(client, b.id, state, depth + 1, onProgress)
      } else {
        b._children = []
      }
      blocks.push(b)
    }
    if (typeof onProgress === 'function') {
      try { onProgress({ count: state.count, depth }) } catch {}
    }
    if (!res.has_more) break
    cursor = res.next_cursor
  }
  return blocks
}

// 단일 블록 → markdown 문자열. 자식 처리는 호출자에서 별도 라인으로 합침.
function blockSelfToMd(block, indent) {
  const t = block.type
  const data = block[t] || {}
  const text = richTextToMd(data.rich_text)

  switch (t) {
    case 'paragraph':
      return text || ''
    case 'heading_1':
      return `# ${text}`
    case 'heading_2':
      return `## ${text}`
    case 'heading_3':
      return `### ${text}`
    case 'bulleted_list_item':
      return `${indent}- ${text}`
    case 'numbered_list_item':
      return `${indent}1. ${text}`
    case 'to_do':
      return `${indent}- [${data.checked ? 'x' : ' '}] ${text}`
    case 'toggle':
      return `${indent}- ${text}`
    case 'quote':
      return `> ${text}`
    case 'callout': {
      const icon = data.icon?.emoji || '💡'
      return `> ${icon} ${text}`
    }
    case 'code': {
      const lang = data.language || ''
      const code = (data.rich_text || []).map((rt) => rt.plain_text || '').join('')
      return '```' + lang + '\n' + code + '\n```'
    }
    case 'divider':
      return '---'
    case 'image': {
      const url = data.file?.url || data.external?.url || ''
      const cap = richTextToMd(data.caption) || ''
      return cap ? `![${cap}](${url})` : `![](${url})`
    }
    case 'video':
    case 'pdf':
    case 'file': {
      const url = data.file?.url || data.external?.url || ''
      const cap = richTextToMd(data.caption) || `(${t})`
      return url ? `[📎 ${cap}](${url})` : `[${cap}]`
    }
    case 'bookmark':
    case 'link_preview':
    case 'embed': {
      const url = data.url || ''
      const cap = richTextToMd(data.caption) || url
      return url ? `[${cap}](${url})` : ''
    }
    case 'child_page':
      return `📄 **${data.title || '(제목 없음)'}** (하위 페이지)`
    case 'child_database':
      return `📊 **${data.title || '(제목 없음)'}** (하위 데이터베이스)`
    case 'equation':
      return data.expression ? `$${data.expression}$` : ''
    case 'table_of_contents':
      return ''
    case 'breadcrumb':
      return ''
    case 'column_list':
    case 'column':
      return '' // 자식만 펼쳐짐
    case 'synced_block':
      return '' // 자식 펼쳐짐
    case 'table':
      // 자식은 table_row. 호출자에서 따로 처리.
      return null
    case 'table_row': {
      // 호출자에서 통째로 처리. 단독으로는 출력 X
      return null
    }
    case 'unsupported':
      return '_(지원하지 않는 블록 — Notion 단계 외)_'
    default:
      return text || `_(${t})_`
  }
}

// 블록 트리 → markdown 라인 배열
function blocksToMdLines(blocks, depth = 0) {
  const lines = []
  for (const b of blocks) {
    if (b.type === 'table') {
      // table은 children(table_row)을 모아서 마크다운 표로 변환
      const rows = (b._children || []).filter((c) => c.type === 'table_row')
      if (rows.length > 0) {
        const hasHeader = b.table?.has_column_header
        const cellsList = rows.map((r) => {
          const cells = r.table_row?.cells || []
          return cells.map((c) => richTextToMd(c).replace(/\|/g, '\\|').replace(/\n/g, ' '))
        })
        const colCount = Math.max(...cellsList.map((c) => c.length))
        // 빈 셀 패딩
        const padded = cellsList.map((c) => {
          const out = [...c]
          while (out.length < colCount) out.push('')
          return out
        })
        if (hasHeader && padded.length > 0) {
          lines.push('| ' + padded[0].join(' | ') + ' |')
          lines.push('|' + ' --- |'.repeat(colCount))
          for (let i = 1; i < padded.length; i++) lines.push('| ' + padded[i].join(' | ') + ' |')
        } else {
          // 헤더 없으면 첫 행을 데이터로, 가짜 헤더 추가
          lines.push('| ' + Array(colCount).fill('').map((_, i) => `열${i + 1}`).join(' | ') + ' |')
          lines.push('|' + ' --- |'.repeat(colCount))
          for (const row of padded) lines.push('| ' + row.join(' | ') + ' |')
        }
        lines.push('')
      }
      continue
    }

    const indent = '  '.repeat(depth)
    const self = blockSelfToMd(b, indent)
    if (self !== null && self !== '') lines.push(self)

    // 자식 블록 (불릿/넘버/토글/콜아웃은 들여쓰기, 나머진 같은 깊이)
    if (b._children && b._children.length > 0) {
      const indented = ['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle'].includes(b.type)
      const childLines = blocksToMdLines(b._children, indented ? depth + 1 : depth)
      lines.push(...childLines)
    }
  }
  return lines
}

// 페이지 메타에서 제목 추출
async function fetchPageTitle(client, pageId) {
  try {
    const page = await client.pages.retrieve({ page_id: pageId })
    // properties.title 또는 properties.Name (database row인 경우)
    const props = page?.properties || {}
    for (const key of Object.keys(props)) {
      const p = props[key]
      if (p?.type === 'title' && Array.isArray(p.title)) {
        return p.title.map((t) => t.plain_text || '').join('').trim()
      }
    }
    return ''
  } catch {
    return ''
  }
}

// 총 타임아웃 race 헬퍼.
function withTimeout(promise, ms, errMsg) {
  let to
  const timeout = new Promise((_, reject) => {
    to = setTimeout(() => reject(new Error(errMsg)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(to))
}

/**
 * Notion 페이지 URL을 받아서 markdown 본문을 반환.
 * @param {string} url
 * @param {object} [options]
 * @param {(state:{count:number, depth:number}) => void} [options.onProgress]
 *   페이지 100블록씩 가져올 때마다 호출. 진행상황 SSE 푸시용.
 * @returns {Promise<{ markdown: string, pageId: string, title: string, blockCount: number, truncated: boolean }>}
 */
export async function fetchNotionPageAsMarkdown(url, options = {}) {
  const pageId = parseNotionPageId(url)
  if (!pageId) {
    throw new Error('Notion 페이지 ID를 URL에서 추출할 수 없습니다: ' + url)
  }
  const client = getClient()
  const onProgress = options.onProgress

  // 제목 + 본문 병렬 (총 타임아웃 적용)
  const state = { count: 0, truncated: false }
  let title = ''
  let topBlocks = []
  try {
    const work = (async () => {
      const [t, blocks] = await Promise.all([
        fetchPageTitle(client, pageId).catch(() => ''),
        fetchBlocksTree(client, pageId, state, 0, onProgress),
      ])
      return { t, blocks }
    })()
    const result = await withTimeout(
      work,
      TOTAL_TIMEOUT_MS,
      `Notion 페이지가 너무 크거나 응답이 느립니다 (${TOTAL_TIMEOUT_MS / 1000}초 타임아웃). ` +
      '페이지를 더 작게 나누거나, 정리봇이 보지 않아도 되는 하위 페이지는 별도 페이지로 분리해주세요. ' +
      `현재까지 가져온 블록: ${state.count}개`
    )
    title = result.t
    topBlocks = result.blocks
  } catch (e) {
    const code = e?.code || ''
    const msg = e?.message || String(e)
    // 타임아웃 케이스
    if (/타임아웃|timeout/i.test(msg)) {
      throw new Error(msg)
    }
    // 통합 미연결 / 권한 없음
    if (code === 'object_not_found' || /Could not find/i.test(msg)) {
      throw new Error(
        '통합이 이 페이지에 연결되어 있지 않습니다. ' +
        '노션에서 해당 페이지(또는 상위 페이지) 우상단 "···" → "연결" → "N잡연구소 정리봇" 추가 후 다시 시도하세요. ' +
        `(pageId=${pageId})`
      )
    }
    if (code === 'unauthorized' || /401|403/.test(msg)) {
      throw new Error('NOTION_API_KEY가 잘못됐거나 만료됐습니다. 통합 시크릿을 재발급하고 env에 다시 설정하세요.')
    }
    if (code === 'rate_limited' || /429/.test(msg)) {
      throw new Error('Notion API 레이트 리밋. 1~2분 후 다시 시도하세요.')
    }
    throw new Error(`Notion API 오류: ${msg}`)
  }

  const lines = blocksToMdLines(topBlocks, 0)
  let markdown = lines.join('\n')
  if (state.truncated) {
    markdown += `\n\n_(※ 페이지가 너무 길어 ${MAX_BLOCKS}개 블록까지만 가져옴 — 강사 확인 필요)_`
  }
  if (title) {
    markdown = `# ${title}\n\n${markdown}`
  }
  return {
    markdown: markdown.trim(),
    pageId,
    title,
    blockCount: state.count,
    truncated: state.truncated,
  }
}
