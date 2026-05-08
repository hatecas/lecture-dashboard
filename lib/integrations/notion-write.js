// Markdown → Notion 블록 변환 + 노션 페이지 생성 헬퍼.
//
// 정리봇이 만든 markdown 정리본을 Notion API로 강사미팅 기록 데이터베이스 아래
// 새 페이지로 자동 생성. 인라인 서식(굵게/기울임/링크/코드)·헤더·표·콜아웃·
// 불릿/번호 리스트·인용·구분선 모두 지원.
//
// 한도:
//  - notion.pages.create의 children은 최대 100. 100개 초과 시 분할해서 append.
//  - rich_text의 단일 text.content는 2000자 한도. 넘으면 잘라서 여러 segment로.
//  - 본문이 2000블록 넘으면 후반 잘림 (안전 cap).

import { Client } from '@notionhq/client'

const PER_TEXT_LIMIT = 1900 // 안전마진 (2000 한도)
const MAX_BLOCKS_PER_PAGE = 2000 // 안전 cap
const NOTION_CHILDREN_LIMIT = 100 // notion.pages.create / blocks.children.append 한 번 한도

let _client = null
function getClient() {
  if (_client) return _client
  const key = (process.env.NOTION_API_KEY || '').trim()
  if (!key) throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.')
  _client = new Client({ auth: key, timeoutMs: 30000 })
  return _client
}

// 32자 hex 또는 표준 UUID → 표준 UUID 포맷
export function normalizeNotionId(raw) {
  if (!raw) return null
  const id = String(raw).replace(/-/g, '').toLowerCase()
  if (id.length !== 32 || !/^[0-9a-f]{32}$/.test(id)) return null
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

// URL에서 DB ID 추출 (32hex 또는 UUID 형태)
export function parseNotionDatabaseId(urlOrId) {
  if (!urlOrId) return null
  // 이미 ID 형태면 그대로 정규화
  if (/^[0-9a-f-]{32,36}$/i.test(urlOrId)) {
    return normalizeNotionId(urlOrId)
  }
  // URL: notion.so/<DB_ID>?v=... 또는 notion.so/<workspace>/<DB_ID>?v=...
  const m = urlOrId.match(/[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  return m ? normalizeNotionId(m[0]) : null
}

// 긴 텍스트를 여러 rich_text segment로 분할 (Notion 2000자 한도)
function splitLongText(text, annotations = {}, link = null) {
  const out = []
  let rest = text || ''
  while (rest.length > 0) {
    const piece = rest.slice(0, PER_TEXT_LIMIT)
    rest = rest.slice(PER_TEXT_LIMIT)
    const seg = { type: 'text', text: { content: piece } }
    if (link) seg.text.link = { url: link }
    if (Object.keys(annotations).length) seg.annotations = annotations
    out.push(seg)
  }
  return out
}

// markdown 인라인 → Notion rich_text 배열
// 처리: **bold** / *em*/_em_ / `code` / [text](url)
function parseInline(text) {
  if (!text) return []
  const result = []
  let rest = text
  const RX = /(\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`\n]+?)`|\[([^\]]+)\]\(([^)]+)\))/
  while (rest.length > 0) {
    const m = rest.match(RX)
    if (!m) {
      if (rest) result.push(...splitLongText(rest))
      break
    }
    if (m.index > 0) result.push(...splitLongText(rest.slice(0, m.index)))
    if (m[2] !== undefined) result.push(...splitLongText(m[2], { bold: true }))
    else if (m[3] !== undefined) result.push(...splitLongText(m[3], { italic: true }))
    else if (m[4] !== undefined) result.push(...splitLongText(m[4], { italic: true }))
    else if (m[5] !== undefined) result.push(...splitLongText(m[5], { code: true }))
    else if (m[6] !== undefined) result.push(...splitLongText(m[6], {}, m[7]))
    rest = rest.slice(m.index + m[0].length)
  }
  return result
}

// markdown → Notion 블록 배열
export function markdownToNotionBlocks(md) {
  if (!md || typeof md !== 'string') return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0

  const pushBlock = (block) => {
    if (blocks.length < MAX_BLOCKS_PER_PAGE) blocks.push(block)
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { i++; continue }
    if (trimmed === '---' || trimmed === '***') {
      pushBlock({ object: 'block', type: 'divider', divider: {} })
      i++; continue
    }

    // 헤더 (# ~ ###; 노션은 heading_1~3만 지원, ####+ 는 heading_3로 fallback)
    let m
    if ((m = trimmed.match(/^(#{1,4})\s+(.+)$/))) {
      const level = Math.min(m[1].length, 3)
      const type = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3'
      pushBlock({ object: 'block', type, [type]: { rich_text: parseInline(m[2]) } })
      i++; continue
    }

    // 표: | h1 | h2 | + |---|---|
    if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const headerCells = trimmed.slice(1, -1).split('|').map((s) => s.trim())
      i += 2
      const dataRows = []
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((s) => s.trim())
        dataRows.push(cells)
        i++
      }
      const allRows = [headerCells, ...dataRows]
      const colCount = Math.max(...allRows.map((r) => r.length))
      const tableRows = allRows.map((row) => {
        const cells = []
        for (let c = 0; c < colCount; c++) {
          cells.push(parseInline(row[c] || ''))
        }
        return { object: 'block', type: 'table_row', table_row: { cells } }
      })
      pushBlock({
        object: 'block',
        type: 'table',
        table: {
          table_width: colCount,
          has_column_header: true,
          has_row_header: false,
          children: tableRows,
        },
      })
      continue
    }

    // 불릿
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, '')
      pushBlock({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: parseInline(text) } })
      i++; continue
    }

    // 번호
    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, '')
      pushBlock({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: parseInline(text) } })
      i++; continue
    }

    // 인용
    if (trimmed.startsWith('>')) {
      const buf = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      pushBlock({ object: 'block', type: 'quote', quote: { rich_text: parseInline(buf.join('\n')) } })
      continue
    }

    // 단락 (빈 줄 또는 다른 블록 만날 때까지)
    const buf = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s?|\|.+\|)/.test(lines[i].trim()) &&
      lines[i].trim() !== '---' &&
      lines[i].trim() !== '***'
    ) {
      buf.push(lines[i])
      i++
    }
    pushBlock({ object: 'block', type: 'paragraph', paragraph: { rich_text: parseInline(buf.join('\n')) } })
  }

  return blocks
}

/**
 * 강사미팅 기록 데이터베이스 아래 새 페이지 생성.
 * @param {object} args
 * @param {string} args.databaseId - 노션 DB ID (32hex 또는 UUID 형태)
 * @param {string} args.title - 페이지 제목 (예: '[묘묘] 미팅 보고서')
 * @param {string} args.markdown - 본문 markdown
 * @param {object} [args.extraProperties] - 추가 properties (담당PM 등)
 * @returns {Promise<{ pageId: string, url: string, blockCount: number, truncated: boolean }>}
 */
export async function createMeetingReportPage({ databaseId, title, markdown, extraProperties = {} }) {
  const dbId = normalizeNotionId(databaseId) || databaseId
  const client = getClient()

  const allBlocks = markdownToNotionBlocks(markdown)
  const truncated = allBlocks.length >= MAX_BLOCKS_PER_PAGE

  // 1) 페이지 생성 (children 최대 100)
  const firstBatch = allBlocks.slice(0, NOTION_CHILDREN_LIMIT)
  const restBatches = []
  for (let i = NOTION_CHILDREN_LIMIT; i < allBlocks.length; i += NOTION_CHILDREN_LIMIT) {
    restBatches.push(allBlocks.slice(i, i + NOTION_CHILDREN_LIMIT))
  }

  const properties = {
    '이름': {
      title: [{ type: 'text', text: { content: (title || '미팅 보고서').slice(0, 100) } }],
    },
    ...extraProperties,
  }

  let page
  try {
    page = await client.pages.create({
      parent: { database_id: dbId },
      properties,
      children: firstBatch,
    })
  } catch (e) {
    const msg = e?.message || String(e)
    const code = e?.code || ''
    if (code === 'object_not_found' || /Could not find database/i.test(msg)) {
      throw new Error(
        '노션 데이터베이스를 찾을 수 없습니다. ' +
        '데이터베이스가 N잡연구소 정리봇 통합과 연결되어 있는지 확인하세요. ' +
        `(databaseId=${dbId})`
      )
    }
    if (code === 'unauthorized' || /401|403/.test(msg)) {
      throw new Error(
        'Notion 통합에 페이지 생성 권한이 없습니다. ' +
        'notion.so/my-integrations → 콘텐츠 사용 권한 → 콘텐츠 삽입/업데이트 ON 후 재시도.'
      )
    }
    if (code === 'validation_error' && /property/i.test(msg)) {
      throw new Error(
        `데이터베이스 properties 검증 실패: ${msg.slice(0, 200)}. ` +
        '"이름" 컬럼이 title 타입인지 확인하세요.'
      )
    }
    throw new Error(`Notion 페이지 생성 실패: ${msg.slice(0, 300)}`)
  }

  // 2) 100개 초과 블록은 append로 추가
  for (const batch of restBatches) {
    try {
      await client.blocks.children.append({
        block_id: page.id,
        children: batch,
      })
    } catch (e) {
      console.warn('[notion-write] 추가 블록 append 실패(부분 성공):', e?.message)
      break // 일부만 들어가도 페이지는 만들어진 거라 OK
    }
  }

  return {
    pageId: page.id,
    url: page.url,
    blockCount: allBlocks.length,
    truncated,
  }
}
