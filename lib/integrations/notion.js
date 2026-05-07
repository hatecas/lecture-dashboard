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
import { transcribeAudioFromUrl, transcribeAudioFromBuffer } from './transcribe'
import { isGoogleDriveUrl, parseDriveFileId, downloadDriveFile } from './drive'

let _client = null
function getClient() {
  if (_client) return _client
  const key = (process.env.NOTION_API_KEY || '').trim()
  if (!key) throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.')
  // 개별 API 호출당 45초 타임아웃 (큰 데이터베이스/페이지 안전마진).
  // 전체 fetch는 별도로 5분 race로 캡 → 호출 하나가 느려도 무한 대기 X
  _client = new Client({ auth: key, timeoutMs: 45000 })
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

// 32자 hex 또는 표준 UUID → 표준 UUID 포맷
function _toUuid(raw) {
  const id = raw.replace(/-/g, '').toLowerCase()
  if (id.length !== 32) return null
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

// URL → Notion 페이지 UUID. 매치 안 되면 null.
// 우선순위:
//   1) ?p=<id> 쿼리 파라미터 (peek/modal 모드로 보던 페이지 — DB의 한 row)
//   2) URL 경로 끝부분의 32자 hex 또는 표준 UUID
// 예) https://www.notion.so/N-277bb3a1...?p=334bb3a1...&pm=s  →  334bb3a1...  (?p= 우선)
//     https://www.notion.so/Page-Title-abc...                 →  abc...
export function parseNotionPageId(rawUrl) {
  if (!rawUrl) return null
  const peek = rawUrl.match(/[?&]p=([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/)
  if (peek) {
    const id = _toUuid(peek[1])
    if (id) return id
  }
  const uuid = rawUrl.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  if (uuid) {
    const id = _toUuid(uuid[0])
    if (id) return id
  }
  const hex32 = rawUrl.match(/[0-9a-fA-F]{32}/)
  if (hex32) {
    const id = _toUuid(hex32[0])
    if (id) return id
  }
  return null
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
    case 'audio': {
      const url = data.file?.url || data.external?.url || ''
      const cap = richTextToMd(data.caption) || '오디오 파일'
      if (block._transcript) {
        const m = `🎵 **음성 받아쓰기** _(원본: ${cap}${block._transcriptMeta ? `, ${block._transcriptMeta}` : ''})_`
        return `${m}\n\n${block._transcript}`
      }
      if (block._transcriptError) {
        return `🎵 [${cap}](${url}) _(받아쓰기 실패: ${block._transcriptError})_`
      }
      return url
        ? `🎵 [${cap}](${url}) _(노션 첨부 오디오 — 받아쓰기 보류)_`
        : `🎵 ${cap}`
    }
    case 'video':
    case 'pdf': {
      const url = data.file?.url || data.external?.url || ''
      const cap = richTextToMd(data.caption) || `(${t})`
      return url ? `[📎 ${cap}](${url})` : `[${cap}]`
    }
    case 'file': {
      const url = data.file?.url || data.external?.url || ''
      const cap = richTextToMd(data.caption) || data.name || '(file)'
      // 노션이 audio 파일을 file 블록으로 분류한 케이스 — transcribeAudioBlocksInTree가
      // _transcript를 채워뒀다면 audio 블록과 동일하게 렌더링.
      if (block._transcript) {
        const m = `🎵 **음성 받아쓰기** _(원본: ${cap}${block._transcriptMeta ? `, ${block._transcriptMeta}` : ''})_`
        return `${m}\n\n${block._transcript}`
      }
      if (block._transcriptError) {
        return `🎵 [${cap}](${url}) _(받아쓰기 실패: ${block._transcriptError})_`
      }
      return url ? `[📎 ${cap}](${url})` : `[${cap}]`
    }
    case 'bookmark':
    case 'link_preview': {
      const url = data.url || ''
      const cap = richTextToMd(data.caption) || url
      return url ? `[${cap}](${url})` : ''
    }
    case 'embed': {
      const url = data.url || ''
      const cap = richTextToMd(data.caption) || url
      // Drive embed가 audio여서 받아쓰기 성공한 경우 — 받아쓰기 본문 노출
      if (block._transcript) {
        const m = `🎵 **음성 받아쓰기** _(원본: Google Drive 임베드${block._transcriptMeta ? `, ${block._transcriptMeta}` : ''})_`
        return `${m}\n\n${block._transcript}`
      }
      if (block._transcriptError) {
        return `[${cap}](${url}) _(임베드 받아쓰기 실패: ${block._transcriptError})_`
      }
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

// 오디오로 판정되는 파일 확장자 (file 블록 케이스에서 사용)
const AUDIO_EXT_RE = /\.(mp3|m4a|mp4a|wav|aac|ogg|oga|flac|aiff?|opus|wma)(?:\?|$)/i

// 블록이 오디오 (또는 audio 처리해야 할 file/embed)인지 판정.
// 노션 업로드 방식에 따라 같은 파일이 audio 블록 또는 file 블록으로 분류됨.
// Drive 링크를 노션 embed로 붙인 경우는 embed 블록 — type만 보고는 audio인지 알 수 없으므로
// 일단 후보로 삼고, 받아쓰기 시도 시점에 실제 다운로드 결과의 Content-Type으로 판정.
function isAudioLike(block) {
  if (!block) return false
  if (block.type === 'audio') return true
  if (block.type === 'file') {
    const d = block.file || {}
    const url = d.file?.url || d.external?.url || ''
    if (!url) return false
    if (AUDIO_EXT_RE.test(url)) return true
    const name = d.name || ''
    if (name && AUDIO_EXT_RE.test(name)) return true
    return false
  }
  // embed 블록이 Google Drive 링크면 audio일 가능성 (실제 MIME은 다운로드 후 확인)
  if (block.type === 'embed') {
    const url = block.embed?.url || ''
    if (isGoogleDriveUrl(url) && parseDriveFileId(url)) return true
  }
  return false
}

// audio-like 블록의 URL/캡션/이름 추출 (audio/file/embed 통일된 인터페이스)
function getAudioMeta(block) {
  if (block.type === 'audio') {
    const d = block.audio || {}
    return {
      url: d.file?.url || d.external?.url || '',
      caption: (d.caption || []).map((rt) => rt?.plain_text || '').join('').trim(),
      name: '',
      isDrive: false,
    }
  }
  if (block.type === 'file') {
    const d = block.file || {}
    return {
      url: d.file?.url || d.external?.url || '',
      caption: (d.caption || []).map((rt) => rt?.plain_text || '').join('').trim(),
      name: d.name || '',
      isDrive: false,
    }
  }
  if (block.type === 'embed') {
    const d = block.embed || {}
    const url = d.url || ''
    return {
      url,
      caption: (d.caption || []).map((rt) => rt?.plain_text || '').join('').trim(),
      name: '',
      isDrive: isGoogleDriveUrl(url),
    }
  }
  return { url: '', caption: '', name: '', isDrive: false }
}

// 블록 트리 안 audio + audio-like file 블록 수집
function collectAudioBlocks(blocks, out) {
  for (const b of blocks) {
    if (isAudioLike(b)) out.push(b)
    if (b?._children?.length) collectAudioBlocks(b._children, out)
  }
}

// 진단용: 트리 안 모든 블록 타입 + 미디어 후보 블록의 메타 수집
function diagnoseTree(blocks, counts = {}, mediaBlocks = []) {
  for (const b of blocks) {
    if (!b?.type) continue
    counts[b.type] = (counts[b.type] || 0) + 1
    // 오디오일 가능성이 있는 타입: audio / file / video / embed / link_preview / bookmark
    if (['audio', 'file', 'video', 'embed', 'link_preview', 'bookmark', 'pdf'].includes(b.type)) {
      const d = b[b.type] || {}
      const url = d.file?.url || d.external?.url || d.url || ''
      const name = d.name || ''
      const caption = (d.caption || []).map((rt) => rt?.plain_text || '').join('').trim()
      const urlPath = url ? (url.split('?')[0]) : ''
      mediaBlocks.push({
        type: b.type,
        urlEnding: urlPath.slice(-60),
        name: name || '(no name)',
        caption: caption || '(no caption)',
      })
    }
    if (b._children?.length) diagnoseTree(b._children, counts, mediaBlocks)
  }
  return { counts, mediaBlocks }
}

// 트리 안 audio 블록들을 순차적으로 받아쓰기. 결과는 block._transcript / _transcriptError 에 attach.
// onAudioProgress({ name, status, bytes?, durationMs?, charCount?, mode?, error?, index, total }) 호출.
async function transcribeAudioBlocksInTree(rootBlocks, onAudioProgress) {
  const audios = []
  collectAudioBlocks(rootBlocks, audios)
  if (audios.length === 0) {
    console.log('[notion] 트리에서 audio/file(audio확장자) 블록 0개 발견 (받아쓰기 스킵)')
    return { count: 0 }
  }
  const breakdown = audios.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc }, {})
  console.log(`[notion] 트리에서 오디오 블록 ${audios.length}개 발견 — ${JSON.stringify(breakdown)}`)

  let okCount = 0
  for (let i = 0; i < audios.length; i++) {
    const b = audios[i]
    const meta = getAudioMeta(b)
    const url = meta.url
    const name = meta.caption || meta.name || `오디오 ${i + 1}`

    if (!url) {
      b._transcriptError = '오디오 URL을 찾을 수 없습니다.'
      if (onAudioProgress) onAudioProgress({ name, status: 'error', error: b._transcriptError, index: i, total: audios.length })
      continue
    }

    if (!process.env.GEMINI_API_KEY) {
      b._transcriptError = 'GEMINI_API_KEY 미설정 — 받아쓰기 건너뜀'
      if (onAudioProgress) onAudioProgress({ name, status: 'error', error: b._transcriptError, index: i, total: audios.length })
      continue
    }

    if (onAudioProgress) onAudioProgress({ name, status: 'start', index: i, total: audios.length })
    console.log(`[notion] 오디오 받아쓰기 시작 [${i + 1}/${audios.length}]: ${name} (${url.slice(0, 60)}...) ${meta.isDrive ? '[Drive embed]' : ''}`)

    const onStage = (stage, info) => {
      console.log(`[transcribe]   [${i + 1}/${audios.length}] ${stage}${info ? ' ' + JSON.stringify({ ...info, url: undefined }).slice(0, 200) : ''}`)
      if (onAudioProgress) {
        onAudioProgress({
          name,
          status: 'progress',
          stage,
          bytes: info?.sizeBytes,
          mode: info?.mode,
          index: i,
          total: audios.length,
        })
      }
    }

    try {
      let result
      if (meta.isDrive) {
        // Drive embed: 먼저 다운로드해서 audio MIME인지 확인 후 받아쓰기
        onStage('downloading', { url })
        const { buffer, mimeType } = await downloadDriveFile(url)
        if (!mimeType.startsWith('audio/')) {
          throw new Error(`Drive 파일이 audio가 아닙니다 (Content-Type: ${mimeType}). 받아쓰기 스킵.`)
        }
        result = await transcribeAudioFromBuffer(buffer, mimeType, { displayName: name, onStage })
      } else {
        result = await transcribeAudioFromUrl(url, { displayName: name, onStage })
      }
      b._transcript = result.text
      b._transcriptMeta = `${result.mode}, ${result.durationMs >= 1000 ? (result.durationMs / 1000).toFixed(1) + 's' : result.durationMs + 'ms'}, ${result.text.length.toLocaleString()}자`
      okCount++
      console.log(`[notion] 오디오 받아쓰기 완료 [${i + 1}/${audios.length}]: ${name} → ${result.text.length.toLocaleString()}자, ${result.mode}, ${(result.durationMs / 1000).toFixed(1)}s`)
      if (onAudioProgress) onAudioProgress({
        name,
        status: 'done',
        bytes: result.sizeBytes,
        mode: result.mode,
        durationMs: result.durationMs,
        charCount: result.text.length,
        index: i,
        total: audios.length,
      })
    } catch (e) {
      const msg = e?.message || String(e)
      b._transcriptError = msg
      console.warn(`[notion] 오디오 받아쓰기 실패 [${i + 1}/${audios.length}]: ${name} → ${msg}`)
      if (onAudioProgress) onAudioProgress({ name, status: 'error', error: msg, index: i, total: audios.length })
    }
  }
  console.log(`[notion] 오디오 받아쓰기 종료: 총 ${audios.length}개 중 ${okCount}개 성공`)
  return { count: audios.length, ok: okCount }
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
 * @param {(info:{name:string, status:string, ...}) => void} [options.onAudioProgress]
 *   오디오 블록 받아쓰기 진행상황. start/progress/done/error 단계별 호출.
 * @param {boolean} [options.transcribeAudio=true] - 오디오 자동 받아쓰기 ON/OFF
 * @returns {Promise<{ markdown: string, pageId: string, title: string, blockCount: number, truncated: boolean, audioCount: number }>}
 */
export async function fetchNotionPageAsMarkdown(url, options = {}) {
  const pageId = parseNotionPageId(url)
  if (!pageId) {
    throw new Error('Notion 페이지 ID를 URL에서 추출할 수 없습니다: ' + url)
  }
  const client = getClient()
  const onProgress = options.onProgress
  const onAudioProgress = options.onAudioProgress
  const shouldTranscribe = options.transcribeAudio !== false

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
    if (code === 'notionhq_client_request_timeout' || /timed out/i.test(msg)) {
      throw new Error(
        'Notion API가 응답이 없어 타임아웃. 가능한 원인:\n' +
        '· 노션 페이지가 너무 큰 데이터베이스이거나 외부 임베드가 많음 → 페이지를 분할해주세요\n' +
        '· 일시적 Notion 서버 지연 → 1~2분 후 다시 시도\n' +
        `· URL이 데이터베이스 자체를 가리키는 경우 → 데이터베이스 안의 개별 페이지 URL 사용`
      )
    }
    throw new Error(`Notion API 오류: ${msg}`)
  }

  // 진단: 페이지 안에 어떤 블록 타입이 있는지 + 미디어 후보 블록 메타 출력
  try {
    const diag = diagnoseTree(topBlocks)
    console.log(`[notion] 페이지 ${pageId} 블록 타입 분포:`, JSON.stringify(diag.counts))
    if (diag.mediaBlocks.length > 0) {
      console.log(`[notion] 미디어 후보 블록 ${diag.mediaBlocks.length}개:`)
      diag.mediaBlocks.forEach((m, i) => {
        console.log(`  ${i + 1}. type=${m.type}, name="${m.name}", caption="${m.caption}", urlTail="${m.urlEnding}"`)
      })
    } else {
      console.log('[notion] 미디어 후보 블록(audio/file/video/embed/...) 0개 — 페이지 자체에 오디오가 없거나 child_page 안에 있음')
    }
  } catch (e) {
    console.warn('[notion] 진단 실패:', e?.message)
  }

  // 오디오 블록 자동 받아쓰기 (옵션). 페이지 본문 fetch 완료 후 별도 pass.
  let audioCount = 0
  let audioOk = 0
  if (shouldTranscribe) {
    try {
      const r = await transcribeAudioBlocksInTree(topBlocks, onAudioProgress)
      audioCount = r.count || 0
      audioOk = r.ok || 0
    } catch (e) {
      console.warn('[notion] 오디오 받아쓰기 pass 실패(무시):', e?.message)
    }
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
    audioCount,
    audioOk,
  }
}
