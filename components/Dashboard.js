'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

// recharts와 xlsx는 첫 로드를 가볍게 하려고 동적 import.
//   recharts: 차트 보일 때만 로드 (대시보드 구매 추이, 강사 비교 모달)
//   xlsx: CSV/엑셀 업로드 동작 직전에 로드
const PurchaseTimelineChart = dynamic(() => import('./charts/PurchaseTimelineChart'), {
  ssr: false,
  loading: () => <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>차트 로딩 중…</div>,
})
const CompareMetricBarChart = dynamic(() => import('./charts/CompareMetricBarChart'), {
  ssr: false,
  loading: () => <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>차트 로딩 중…</div>,
})
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronDown,
  X,
  Menu,
  LogOut,
  LineChart as LineChartIcon,
  FileText,
  Trophy,
  Scale,
  Wrench,
  FolderOpen,
  Bot,
  GraduationCap,
  Settings,
  CreditCard,
  ShieldCheck,
  Wand2,
  Library,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import HelpTooltip from './HelpTooltip'
// xlsx는 더 이상 정적 import 하지 않음 — 업로드 핸들러 안에서 await import('xlsx')로 lazy load
import { formatKST } from '@/lib/utils/dateUtils'
import { getAuthHeaders, getAuthToken, clearAuthToken } from '@/lib/authClient'
import ErrorLogsTab from './tabs/ErrorLogsTab'

// PPT outline kind별 시각화 메타 — 프로젝트 기획 탭과 생성된 기획안 탭 양쪽에서 공유.
// 변경하려면 한 곳만.
const PPT_KIND_META = {
  hook:        { label: '🪝 후크',       bg: 'rgba(239,68,68,0.18)',   color: '#fca5a5' },
  intro:       { label: '🎬 강사 소개',  bg: 'rgba(148,163,184,0.18)', color: '#cbd5e1' },
  proof:       { label: '💰 성과 증명',  bg: 'rgba(16,185,129,0.18)',  color: '#6ee7b7' },
  journey:     { label: '📖 일대기',     bg: 'rgba(217,70,239,0.18)',  color: '#f0abfc' },
  myth:        { label: '💥 통념 깨기',  bg: 'rgba(249,115,22,0.18)',  color: '#fdba74' },
  info:        { label: '📊 본론',       bg: 'rgba(99,102,241,0.18)',  color: '#a5b4fc' },
  empty:       { label: '🎞️ 빈/이미지',  bg: 'rgba(148,163,184,0.10)', color: '#94a3b8' },
  qna:         { label: '❓ Q&A',        bg: 'rgba(14,165,233,0.18)',  color: '#7dd3fc' },
  testimonial: { label: '💬 후기',       bg: 'rgba(244,114,182,0.18)', color: '#f9a8d4' },
  cta:         { label: '🎯 모집',       bg: 'rgba(168,85,247,0.20)',  color: '#d8b4fe' },
  outro:       { label: '🎤 마무리',     bg: 'rgba(148,163,184,0.18)', color: '#cbd5e1' },
  breath:      { label: '💧 숨고르기',    bg: 'rgba(56,189,248,0.14)',  color: '#7dd3fc' },
}

// 봇별 메타 (생성된 기획안 탭에서 사용)
const PLANNER_TASK_META = {
  summarize:         { label: '강사 자료 정리봇',     icon: '🗂️' },
  ebook:             { label: '무료 전자책 기획안', icon: '📚' },
  boomUp:            { label: '붐업 멘트',            icon: '🎉' },
  alimtalk:          { label: '채널톡 멘트',          icon: '💬' },
  viralQ:            { label: '바이럴 질문',         icon: '❓' },
  ppt:               { label: '강의 PPT outline',   icon: '📋' },
  salesPage:         { label: '무료 상페 카피',       icon: '📄' },
  groupAnnouncement: { label: '단톡방 필독 공지',     icon: '📢' },
}

// PPT plan → 마크다운 (노션/워드/메모장 호환).
// 컴포넌트 외부에 두어 어디서든 호출 가능.
function pptPlanToMarkdown(plan) {
  if (!plan) return ''
  const lines = []
  lines.push(`# ${plan.title || '강의 PPT outline'}`)
  lines.push('')
  lines.push(`총 ${plan.totalSlides || plan.slides?.length || 0}장`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const s of (plan.slides || [])) {
    const kindLabel = PPT_KIND_META[s.kind]?.label || ''
    lines.push(`## 슬라이드 ${s.slideNumber || '?'}${kindLabel ? ` · ${kindLabel}` : ''}`)
    lines.push('')
    if (s.title) {
      lines.push(`### ${s.title}`)
      lines.push('')
    }
    if (Array.isArray(s.bullets) && s.bullets.length) {
      for (const b of s.bullets) lines.push(`- ${b}`)
      lines.push('')
    }
    if (s.speakerNotes) {
      lines.push(`> 🎤 **발표 멘트:** ${s.speakerNotes.replace(/\n/g, ' ')}`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

// 봇별 generic 마크다운 변환 — PPT 외 봇 결과를 노션/문서로 옮기기 위한 fallback.
// 키 깊이 2~3까지 펼침. 깊은 객체는 JSON.
function genericPlanToMarkdown(taskKey, plan) {
  if (!plan) return ''
  const meta = PLANNER_TASK_META[taskKey] || { label: taskKey, icon: '🪄' }
  const lines = []
  lines.push(`# ${meta.icon} ${meta.label}`)
  lines.push('')
  const walk = (obj, depth = 0) => {
    if (obj == null) return
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      lines.push(String(obj))
      lines.push('')
      return
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'string') {
          lines.push(`- ${item}`)
        } else if (item && typeof item === 'object') {
          // 객체 배열은 각 항목을 ### 로
          lines.push('')
          for (const [k, v] of Object.entries(item)) {
            if (typeof v === 'string' || typeof v === 'number') {
              lines.push(`**${k}:** ${v}`)
              lines.push('')
            } else if (Array.isArray(v)) {
              lines.push(`**${k}:**`)
              for (const it of v) lines.push(`- ${typeof it === 'string' ? it : JSON.stringify(it)}`)
              lines.push('')
            }
          }
          lines.push('---')
        }
      }
      lines.push('')
      return
    }
    // object
    for (const [k, v] of Object.entries(obj)) {
      const heading = '#'.repeat(Math.min(depth + 2, 4))
      lines.push(`${heading} ${k}`)
      lines.push('')
      walk(v, depth + 1)
    }
  }
  walk(plan)
  return lines.join('\n')
}

// 안전한 JSON 파싱 — 응답이 JSON 아닐 때(Vercel timeout HTML 등) 친절한 에러로 변환.
// 사용법: const { data, ok, status } = await safeFetchJson(url, options)
async function safeFetchJson(url, options) {
  let res, text, data, parseError
  try {
    res = await fetch(url, options)
  } catch (e) {
    return { ok: false, status: 0, data: { error: `네트워크 오류: ${e?.message || e}` }, isNetworkError: true }
  }
  try {
    text = await res.text()
  } catch (e) {
    text = ''
  }
  try {
    data = text ? JSON.parse(text) : {}
  } catch (e) {
    parseError = e
    // JSON 파싱 실패 — Vercel timeout / HTML 에러 페이지 / 빈 응답 등.
    const isTimeout = res.status === 504 || res.status === 408 ||
                      /timeout|FUNCTION_INVOCATION/i.test(text)
    const isServerErr = res.status >= 500
    let friendlyMsg
    if (isTimeout) {
      friendlyMsg = '서버 처리 시간 초과 (Vercel 한도 300초). 큰 명단은 한 번에 못 보냅니다 — 명단을 더 작은 청크로 나눠서 다시 시도해주세요.'
    } else if (isServerErr) {
      friendlyMsg = `서버 오류 (HTTP ${res.status}). 잠시 후 다시 시도하거나 명단을 줄여서 시도해주세요.`
    } else {
      friendlyMsg = `잘못된 응답 형식 (HTTP ${res.status}). 응답: ${text.slice(0, 100)}`
    }
    data = { error: friendlyMsg, _raw: text.slice(0, 300), _parseError: parseError?.message }
  }
  return { ok: res.ok, status: res.status, data }
}

// 파일명 안전 처리 (Windows/macOS 모두 금지 문자 제거)
function makeSafeFileName(base, fallback = 'plan') {
  const s = (base || fallback).replace(/[\\/:*?"<>|]/g, '_').trim()
  return s.slice(0, 80) || fallback
}

// ===================================================================
// PPT 디자인 톤 — 사용자가 design.md 같은 곳에서 복붙한 톤 MD를 받아
// 색상/폰트를 추출 + kind별 레이아웃에 적용해 디자인된 .pptx 생성.
// ===================================================================

// 기본 톤 — 사용자 디자인 시스템(presentation-design-system.md) 기반.
// Nike-style editorial minimalism: 흰 캔버스 + 검정 잉크, Pretendard 전용, 16:9 고정 그리드.
//
// 폰트는 Pretendard. buildDesignedPptx 후처리로 PPTX의 theme1.xml과 모든 슬라이드의
// 폰트 슬롯 3종(latin/ea/cs)을 Pretendard로 강제 → 받는 사람 PC에 Pretendard 설치만
// 돼있으면 디자인 그대로 보임.
const DEFAULT_DESIGN_TONE_MD = `# N잡연구소 무료강의 디자인 시스템
Editorial warm-tone with strong typographic hierarchy. Cream canvas, terracotta accent,
multi-level type scale (165pt hero numbers → 14pt meta labels) for rhythmic density.
SECTION labels at top-left, page numbers at top-right, refined footer.

## Colors
- Background: #F5F0E8  (cream — 슬라이드 배경)
- Text: #1F1A14        (deep charcoal — 본문/제목)
- Primary: #B85A4A     (terracotta — 강조 단어·라인·CTA)
- Secondary: #6B6056   (warm gray — 부드러운 본문)
- Accent: #948876      (taupe — 메타·캡션)
- Soft: #E8C9C0        (dusty rose — 강조 박스 배경)
- Highlight: #B85A4A   (terracotta — emphasis 단어 인라인)

## Fonts
- Body: Pretendard (한글·본문)
- Display: Georgia (영문·숫자·통계 강조)

## Style
- Hero numbers in 100~165pt for impact (proof/stat slides)
- 6-level type hierarchy in one slide (165 / 30 / 22.5 / 19.5 / 18 / 14pt)
- Inline emphasis: 강조 단어를 큰 폰트+테라코타 색으로 본문에 섞어 표시
- Left-aligned body, hero·stat·quote는 중앙 정렬
- SECTION X — KIND 라벨 좌상단 (서브헤더), NN / TOTAL 페이지 번호 우상단
- Hairline 1px 디바이더로 위·아래 영역 분리
- Sharp corners, no shadows, soft warm minimalism`

// 톤 MD에서 색상/폰트 추출. 정규식 기반 + 키워드 매칭 + fallback.
// 사용자가 어떤 형식의 MD를 줘도 최대한 추출. 못 찾으면 기본값.
function parseToneMd(md) {
  // 기본값 — 사용자 디자인 시스템(Nike-style editorial minimalism) 매칭
  // 폰트는 Pretendard — buildDesignedPptx 후처리로 PPTX의 theme + 슬라이드 XML의
  // 폰트 슬롯 3종(latin/ea/cs)을 모두 Pretendard로 강제하므로 받는 사람 PC에
  // Pretendard 설치만 돼있으면 PowerPoint가 Pretendard로 정확히 표시.
  const DEFAULTS = {
    background: 'F5F0E8', // cream canvas (warm minimalism)
    text: '1F1A14',       // deep charcoal
    primary: 'B85A4A',    // terracotta (강조)
    secondary: '6B6056',  // warm gray
    accent: '948876',     // taupe (메타·캡션)
    soft: 'E8C9C0',       // dusty rose (콜아웃 박스)
    highlight: 'B85A4A',  // terracotta (emphasis 단어 인라인)
    sale: 'D30005',       // 경고
    fontMain: 'Pretendard',     // 한글·본문
    fontDisplay: 'Georgia',     // 영문·숫자·통계 강조
  }
  if (!md || typeof md !== 'string') return { ...DEFAULTS, _detected: {} }

  const result = { ...DEFAULTS }
  const detected = {} // 어떤 키가 MD에서 실제 추출됐는지 (UI 경고용)
  const lower = md.toLowerCase()

  // 키워드별 색상 매칭 — 라벨 옆 hex 추출
  const findColor = (keywords) => {
    for (const kw of keywords) {
      const rx = new RegExp(`${kw}\\s*[:\\-\\|\\(\\)]?\\s*\`?#?([0-9A-Fa-f]{6})\\b`, 'i')
      const m = md.match(rx)
      if (m) return m[1].toUpperCase()
    }
    return null
  }

  // 색상 이름 기반 추론 — MD에 hex가 없고 색상 이름만 있는 경우(예: Meta tone "Cobalt", "Facebook Blue")
  // 디자인 시스템 토큰 참조 형식({colors.primary} 등)만 있을 때 폴백.
  const COLOR_NAMES = {
    cobalt: '0064E0', blue: '1877F2', 'facebook blue': '1877F2',
    indigo: '4F46E5', purple: '8B5CF6', violet: '7C3AED', oculus: '6E48AA',
    red: 'D30005', crimson: 'B91C1C', pink: 'EC4899',
    green: '007D48', emerald: '059669', success: '007D48',
    yellow: 'FBBF24', amber: 'F59E0B', orange: 'F97316',
    black: '111111', ink: '111111', charcoal: '39393B', slate: '64748B', steel: '6B7280', stone: '9E9EA0',
    white: 'FFFFFF', canvas: 'FFFFFF', cloud: 'F5F5F5',
    teal: '0D9488', cyan: '06B6D4',
  }
  const findColorByName = (sectionKeywords) => {
    for (const kw of sectionKeywords) {
      // 해당 키워드를 포함한 한 줄 또는 짧은 구간 추출 (앞뒤 80자)
      const rx = new RegExp(`(.{0,80}${kw}.{0,80})`, 'i')
      const m = md.match(rx)
      if (!m) continue
      const snippet = m[1].toLowerCase()
      // 색상 이름 매칭 (긴 이름부터 — "facebook blue"가 "blue"보다 우선)
      const names = Object.keys(COLOR_NAMES).sort((a, b) => b.length - a.length)
      for (const name of names) {
        if (snippet.includes(name)) return COLOR_NAMES[name]
      }
    }
    return null
  }

  const tryExtract = (key, keywords, nameKeywords) => {
    const hex = findColor(keywords)
    if (hex) { result[key] = hex; detected[key] = 'hex'; return }
    const named = findColorByName(nameKeywords || keywords)
    if (named) { result[key] = named; detected[key] = 'named'; return }
  }

  tryExtract('primary', ['primary', 'main', '메인', '주요', 'terracotta', 'accent'], ['primary', 'main', 'brand', 'cta', 'terracotta'])
  tryExtract('secondary', ['secondary', 'sub', '보조', 'charcoal', 'warm gray'], ['secondary', 'sub'])
  tryExtract('background', ['background', 'bg', '배경', 'canvas', 'cream'], ['background', 'canvas', 'surface', 'cream'])
  tryExtract('text', ['text', 'foreground', 'fg', '글씨', '텍스트', 'ink', 'deep charcoal'], ['text', 'ink', 'foreground', 'charcoal'])
  tryExtract('accent', ['accent', '강조', 'mute', 'taupe'], ['accent', 'taupe'])
  tryExtract('soft', ['soft', 'soft-cloud', 'cloud', 'dusty rose'], ['soft', 'cloud', 'rose'])
  tryExtract('highlight', ['highlight', '하이라이트', '강조색', 'emphasis'], ['highlight', 'emphasis'])
  tryExtract('sale', ['sale', 'warning', 'error', '경고'], ['warning', 'error', 'critical', 'sale'])

  // 폰트 추출 — 한국어 글리프 보유 폰트(본문용 fontMain)와 영문/숫자 강조용 fontDisplay 분리.
  //   영문 전용 폰트(Inter, Roboto, Poppins, Montserrat 등)는 한글 글리프 없어
  //   PowerPoint가 한국어 부분을 시스템 fallback으로 대체 → fontMain에서 제외.
  //   대신 영문·숫자만 표시하는 영역(통계, 페이지 번호 등)은 fontDisplay 활용.
  const knownKoreanFonts = ['Pretendard', 'Noto Sans KR', 'Noto Sans', 'Malgun Gothic', 'Spoqa Han Sans', 'Nanum Gothic']
  for (const f of knownKoreanFonts) {
    if (lower.includes(f.toLowerCase())) { result.fontMain = f; detected.fontMain = 'matched'; break }
  }
  const knownDisplayFonts = ['Georgia', 'Playfair Display', 'Cormorant', 'Inter', 'Roboto', 'Montserrat', 'Poppins', 'Helvetica']
  for (const f of knownDisplayFonts) {
    if (lower.includes(f.toLowerCase())) { result.fontDisplay = f; detected.fontDisplay = 'matched'; break }
  }

  result._detected = detected
  return result
}

// 사용자가 칩에서 직접 입력한 hex 오버라이드를 parsed 톤에 병합.
// overrides의 hex 값 중 6자리 유효한 것만 반영.
function applyToneOverrides(parsed, overrides) {
  if (!parsed) return parsed
  if (!overrides || typeof overrides !== 'object') return parsed
  const out = { ...parsed }
  for (const key of ['primary', 'secondary', 'background', 'text', 'accent', 'soft', 'highlight', 'sale']) {
    const v = overrides[key]
    if (typeof v === 'string' && /^[0-9A-Fa-f]{6}$/.test(v)) {
      out[key] = v.toUpperCase()
    }
  }
  if (typeof overrides.fontMain === 'string' && overrides.fontMain.trim()) {
    out.fontMain = overrides.fontMain.trim()
  }
  if (typeof overrides.fontDisplay === 'string' && overrides.fontDisplay.trim()) {
    out.fontDisplay = overrides.fontDisplay.trim()
  }
  return out
}

// ─────────────────────────────────────────────────────────
// 봇 완료 알림 (Browser Notification API)
// 사용자가 다른 탭/창에 가있을 때 작업 완료 알려줌.
// 권한 없으면 조용히 패스. 페이지가 보이는 상태면 굳이 알림 안 띄움 (이미 사용자가 보고 있으니).
// ─────────────────────────────────────────────────────────
async function requestNotifyPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const r = await Notification.requestPermission()
    return r === 'granted'
  } catch { return false }
}

function notifyBotComplete(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  // 페이지 보이면 알림 안 띄움 (이미 사용자가 화면 보고 있음)
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  try {
    const n = new Notification(title || '🪄 작업 완료', {
      body: body || '봇 작업이 완료되었습니다. 결과를 확인하세요.',
      icon: '/favicon.ico',
      tag: 'lecture-dashboard-bot',  // 같은 tag면 알림 덮어쓰기 (스팸 방지)
      requireInteraction: false,
    })
    n.onclick = () => {
      try { window.focus() } catch {}
      n.close()
    }
    setTimeout(() => { try { n.close() } catch {} }, 12000)
  } catch {}
}

// 어두운 배경인지 — text 색상 자동 보정용
function isDarkColor(hex) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  // 휘도 (luma)
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

// 디자인 적용된 .pptx 생성. plan + tone(parsed) → pptxgenjs 호출.
// 사용자의 presentation-design-system.md 기반 — Nike editorial minimalism, 16:9 1920×1080,
// Pretendard 전용, 좌측 정렬 본문, fixed positional grid.
//
// 핵심 가이드 (인치 단위로 변환 — 13.33×7.5 inch == 1920×1080 px):
//   - 슬라이드 좌측 안전 마진: 80px = 0.55"
//   - 챕터 마커: (0.55, 0.55)
//   - 제목: (0.55, 1.4)
//   - 부제: (0.55, 1.95)
//   - 본문 시작: (0.55, 2.5)
//   - 본문 끝: y ≤ 6.5
//   - 푸터 디바이더: y = 6.55
//   - 슬라이드 번호: 우하단 (12.8, 6.7)
//
// 배경은 풀스크린 fill rect로 강제 적용 (slide.background API 불안정).
async function buildDesignedPptx(plan, parsedTone, safeFileName) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.title = plan.title || '강의 PPT outline'
  pptx.layout = 'LAYOUT_WIDE'  // 16:9, 13.33 x 7.5 inch

  const T = parsedTone
  const SLIDE_W = 13.33
  const SLIDE_H = 7.5
  const MARGIN_X = 0.55   // 좌측 마진 (80px)
  const RIGHT_X = SLIDE_W - MARGIN_X  // 우측 안전 마진
  const CONTENT_W = SLIDE_W - MARGIN_X * 2  // 1760px = 12.23"

  // 색상 보조 — 배경이 어두우면 텍스트는 밝게, 반대도
  const dark = isDarkColor(T.background)
  const onBg = dark ? 'FFFFFF' : T.text
  const onBgMute = dark ? 'BBBBBB' : T.accent   // 보조 텍스트
  const onBgSubtle = dark ? '888888' : '9E9EA0' // 더 약함

  // SECTION 라벨용 kind 영문명 매핑 (Nlab_test 디자인 참고)
  const KIND_SECTION_NAME = {
    hook: 'HOOK', intro: 'INTRO', proof: 'PROOF', journey: 'JOURNEY',
    myth: 'MYTH', info: 'CHAPTER', empty: 'VISUAL', qna: 'Q&A',
    testimonial: 'TESTIMONIAL', cta: 'CTA', outro: 'OUTRO', breath: 'BREATH',
  }

  // 공통 헬퍼: 모든 슬라이드 시작 시 호출
  const drawBackground = (slide) => {
    // 풀스크린 배경 박스 (slide.background보다 안정적)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
      fill: { color: T.background },
      line: { color: T.background, width: 0 },
    })
  }
  // 모든 슬라이드 공통 푸터 (디바이더 + 슬라이드 번호)
  const drawFooter = (slide, slideNum) => {
    // hairline 색상 (1px) — 톤에서 못 가져오면 단순 grey
    slide.addShape(pptx.ShapeType.line, {
      x: MARGIN_X, y: 6.55, w: CONTENT_W, h: 0,
      line: { color: dark ? '333333' : 'E5E5E5', width: 0.5 },
    })
    slide.addText(String(slideNum || '?'), {
      x: SLIDE_W - 0.8, y: 6.7, w: 0.6, h: 0.3,
      fontSize: 10, color: onBgSubtle, fontFace: T.fontMain, align: 'right',
    })
  }
  // 챕터 마커 (좌상단 작은 라벨)
  const drawChapterMarker = (slide, label) => {
    slide.addText(label, {
      x: MARGIN_X, y: 0.45, w: 4, h: 0.3,
      fontSize: 11, color: onBgMute, fontFace: T.fontMain, bold: false,
    })
  }

  // 디자인 시스템의 kind 매핑:
  //   hook       = Chapter Divider (full-bleed ink bg, hero typography)
  //   intro      = Title Slide (좌측 텍스트 + 우측 이미지 placeholder)
  //   proof      = Stat Display (큰 숫자 + 캡션)
  //   journey    = Two Column (좌측 마커 + 우측 본문)
  //   myth       = Title Slide (강한 단일 메시지)
  //   info       = Content Slide (단일 컬럼 — title + body)
  //   empty      = Image + Caption (배경만 + 가운데 캡션)
  //   qna        = Quote Slide variant (Q. + 답변)
  //   testimonial= Quote Slide (테두리 없는 인용 + 3단 본문)
  //   cta        = Stat Display (강조 박스)
  //   outro      = Quote Slide (중앙 한 줄)

  // 공통 디자인 요소 — 모든 슬라이드에 일관 적용
  // 1) 좌측 끝에 얇은 ink 사이드바 (3px) — 디자인 시그니처
  // 2) 상단 hairline 라인 (Y=0.95) — 챕터 마커 아래
  // 3) 푸터 디바이더 + 슬라이드 번호 (drawFooter)
  const drawTopHairline = (slide) => {
    slide.addShape(pptx.ShapeType.line, {
      x: MARGIN_X, y: 0.95, w: CONTENT_W, h: 0,
      line: { color: dark ? '333333' : 'E5E5E5', width: 0.5 },
    })
  }
  const drawLeftSidebar = (slide) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.04, h: SLIDE_H,
      fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
    })
  }

  // === 새 보조 요소 (Nlab_test 디자인 참고) ===
  // 좌상단 SECTION 라벨 — "SECTION X — KIND" 형태로 위계와 위치 표시
  const drawSectionLabel = (slide, kind, sectionNum) => {
    const label = `SECTION ${String(sectionNum).padStart(2, '0')}  ·  ${KIND_SECTION_NAME[kind] || 'CONTENT'}`
    slide.addText(label, {
      x: MARGIN_X, y: 0.40, w: 5.5, h: 0.30,
      fontSize: 10, bold: true, color: T.primary || onBgMute,
      fontFace: T.fontDisplay || T.fontMain,
      charSpacing: 2,
    })
  }
  // 우상단 페이지 번호 — "NN / TOTAL" 큰 인라인 형태 (Georgia 같은 display 폰트)
  const drawPageNumber = (slide, slideNum, totalSlides) => {
    if (!slideNum) return
    slide.addText([
      { text: String(slideNum).padStart(2, '0'), options: { fontSize: 14, bold: true, color: T.text, fontFace: T.fontDisplay || T.fontMain } },
      { text: ` / ${totalSlides || '?'}`, options: { fontSize: 12, color: T.accent || onBgMute, fontFace: T.fontDisplay || T.fontMain } },
    ], {
      x: SLIDE_W - 1.8, y: 0.40, w: 1.6, h: 0.30,
      align: 'right',
    })
  }
  // 슬라이드 우하단 작은 brand 라벨 (Nlab_test 참고)
  const drawBrandFooter = (slide) => {
    slide.addText('N·LAB', {
      x: MARGIN_X, y: 6.85, w: 2.0, h: 0.25,
      fontSize: 9, color: onBgSubtle, fontFace: T.fontDisplay || T.fontMain,
      bold: true, charSpacing: 3,
    })
  }

  // emphasis 인라인 렌더링 — title/bullets 텍스트에서 emphasis 배열의 단어를
  // 큰 폰트(1.4배) + primary 색상으로 강조해 텍스트 묶음으로 분할.
  // 호출: renderWithEmphasis("초기 재료비 100만 원으로 시작", ["100만 원"], { fontSize: 40, ... })
  // → pptxgenjs text 배열 [{text:"초기 재료비 ", options:{...}}, {text:"100만 원", options:{ fontSize:56, color: primary, bold:true }}, {text:"으로 시작", options:{...}}]
  const renderWithEmphasis = (text, emphasisList, baseOptions) => {
    const str = String(text || '')
    const list = Array.isArray(emphasisList) ? emphasisList.filter(e => e && typeof e === 'string' && str.includes(e)) : []
    if (list.length === 0) {
      return [{ text: str, options: baseOptions }]
    }
    // 가장 긴 emphasis부터 매칭(부분 문자열 중복 방지)
    const sorted = [...list].sort((a, b) => b.length - a.length)
    // 토큰화: emphasis 단어를 기준으로 split
    let parts = [{ text: str, em: false }]
    for (const em of sorted) {
      const newParts = []
      for (const p of parts) {
        if (p.em) { newParts.push(p); continue }
        const idx = p.text.indexOf(em)
        if (idx === -1) { newParts.push(p); continue }
        const before = p.text.slice(0, idx)
        const after = p.text.slice(idx + em.length)
        if (before) newParts.push({ text: before, em: false })
        newParts.push({ text: em, em: true })
        if (after) newParts.push({ text: after, em: false })
      }
      parts = newParts
    }
    const baseFontSize = baseOptions.fontSize || 16
    const emFontSize = Math.round(baseFontSize * 1.4)
    return parts.map(p => p.em
      ? { text: p.text, options: { ...baseOptions, fontSize: emFontSize, color: T.primary || T.text, bold: true } }
      : { text: p.text, options: baseOptions }
    )
  }

  const totalSlides = (plan.slides || []).length

  // 슬라이드별로 SECTION 번호를 누적 (kind 변경 시 증가) — Nlab_test 패턴
  let sectionCounter = 0
  let lastKindForSection = null

  for (const s of (plan.slides || [])) {
    const slide = pptx.addSlide()
    const kind = s.kind || 'info'
    const slideNum = s.slideNumber

    // SECTION 번호 부여 — breath/empty 같은 전환 슬라이드는 카운터 증가시키지 않음
    if (kind !== 'breath' && kind !== 'empty' && kind !== lastKindForSection) {
      sectionCounter++
      lastKindForSection = kind
    }

    // 공통 헤더 — 배경 + 사이드바 + 상단 hairline + SECTION 라벨 + 페이지 번호
    const drawCommonHeader = () => {
      drawBackground(slide)
      drawLeftSidebar(slide)
      drawTopHairline(slide)
      drawSectionLabel(slide, kind, sectionCounter)
      drawPageNumber(slide, slideNum, totalSlides)
    }
    // 공통 푸터 — N·LAB 브랜드 + 슬라이드 번호 + 디바이더
    const drawCommonFooter = (numColor) => {
      drawBrandFooter(slide)
      // 슬라이드 번호는 푸터 우하단 (기존 drawFooter와 호환)
      slide.addShape(pptx.ShapeType.line, {
        x: MARGIN_X, y: 6.55, w: CONTENT_W, h: 0,
        line: { color: dark ? '333333' : 'E5E5E5', width: 0.5 },
      })
      slide.addText(String(slideNum || '?'), {
        x: SLIDE_W - 0.8, y: 6.85, w: 0.6, h: 0.25,
        fontSize: 9, color: numColor || onBgSubtle, fontFace: T.fontDisplay || T.fontMain, align: 'right',
      })
    }

    switch (kind) {
      case 'hook': {
        // 메인 타이틀 — emphasis 인라인 강조
        const hookTitleOpts = { fontSize: 56, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, hookTitleOpts), {
          x: MARGIN_X, y: 2.0, w: CONTENT_W, h: 3.0,
          valign: 'top',
        })
        // 강조 라인 (타이틀 아래)
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 5.05, w: 0.8, h: 0.05,
          fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
        })
        // 불릿 (있으면)
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 5.2, w: CONTENT_W, h: 1.3,
            fontSize: 16, color: T.secondary, fontFace: T.fontMain,
            paraSpaceAfter: 4,
          })
        }
        drawCommonFooter()
        break
      }
      case 'intro': {
        drawCommonHeader()
        // 제목 — emphasis 인라인
        const introTitleOpts = { fontSize: 40, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, introTitleOpts), {
          x: MARGIN_X, y: 1.4, w: 7.3, h: 1.0,
        })
        // 짧은 강조선
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 2.4, w: 0.6, h: 0.04,
          fill: { color: T.text }, line: { color: T.text, width: 0 },
        })
        // 본문 좌측
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 2.7, w: 7.3, h: 3.7,
            fontSize: 16, color: onBg, fontFace: T.fontMain,
            paraSpaceAfter: 6, lineSpacing: 26,
          })
        }
        // 우측 강사 사진 placeholder (soft-cloud)
        slide.addShape(pptx.ShapeType.rect, {
          x: 8.5, y: 1.4, w: 4.3, h: 5.0,
          fill: { color: T.soft }, line: { color: T.soft, width: 0 },
        })
        slide.addText('👤', {
          x: 8.5, y: 3.0, w: 4.3, h: 1.0,
          fontSize: 48, color: onBgMute, fontFace: T.fontMain, align: 'center',
        })
        slide.addText('강사 사진', {
          x: 8.5, y: 4.2, w: 4.3, h: 0.4,
          fontSize: 12, color: onBgMute, fontFace: T.fontMain, align: 'center',
        })
        drawCommonFooter()
        break
      }
      case 'proof': {
        // 임팩트 슬라이드 — 큰 숫자(Hero number)와 캡션. Georgia(fontDisplay) 사용해 통계 임팩트 ↑
        drawCommonHeader()
        // 큰 숫자/메시지 — 텍스트 길이에 따라 fontSize 동적 적용 (165pt까지 가능)
        //   짧은 숫자(예: "116억"): 130pt
        //   중간 길이(예: "월 80만원"): 90pt
        //   긴 한글(예: "숏폼+구매대행 월 매출 4,400만원"): 50pt
        //   fit:'shrink'가 박스 초과 시 자동 축소.
        const titleLen = String(s.title || '').length
        const titleFontSize = titleLen <= 6 ? 130 : titleLen <= 10 ? 90 : titleLen <= 16 ? 64 : 48
        // proof는 emphasis가 있으면 그것만 hero로, 없으면 title 전체를 hero로
        const heroBaseOpts = { fontSize: titleFontSize, bold: true, color: T.text, fontFace: T.fontDisplay || T.fontMain }
        const proofRenderText = renderWithEmphasis(s.title || '', s.emphasis, heroBaseOpts)
        // emphasis 강조 시 색을 primary로
        for (const p of proofRenderText) {
          if (p.options && p.options.fontSize > titleFontSize) {
            p.options.color = T.primary || T.text
            p.options.fontFace = T.fontDisplay || T.fontMain
          }
        }
        slide.addText(proofRenderText, {
          x: MARGIN_X, y: 1.7, w: CONTENT_W, h: 2.8,
          align: 'left', charSpacing: -2, valign: 'middle',
          fit: 'shrink', wrap: true,
        })
        // 강조 라인 (제목 아래)
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 4.7, w: 1.5, h: 0.06,
          fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
        })
        // 캡션
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 5.0, w: CONTENT_W, h: 1.3,
            fontSize: 18, color: T.secondary || onBgMute, fontFace: T.fontMain, paraSpaceAfter: 4,
          })
        } else {
          slide.addText('— 강사 누적 성과', {
            x: MARGIN_X, y: 5.0, w: CONTENT_W, h: 0.5,
            fontSize: 16, color: T.accent || onBgMute, fontFace: T.fontMain, italic: true,
          })
        }
        drawCommonFooter()
        break
      }
      case 'journey': {
        drawCommonHeader()
        // 좌측 마커 — 박스 폭 늘리고 폰트 줄임 (긴 한글 제목도 안 넘침)
        const journeyTitleOpts = { fontSize: 26, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, journeyTitleOpts), {
          x: MARGIN_X, y: 1.4, w: 4.5, h: 5.0,
          valign: 'top',
        })
        // 디바이더 라인
        slide.addShape(pptx.ShapeType.line, {
          x: 5.3, y: 1.4, w: 0, h: 5.0,
          line: { color: 'CACACB', width: 0.5 },
        })
        // 우측 본문
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: 5.6, y: 1.4, w: 7.2, h: 5.0,
            fontSize: 15, color: onBg, fontFace: T.fontMain,
            paraSpaceAfter: 6, lineSpacing: 24,
          })
        }
        drawCommonFooter()
        break
      }
      case 'myth': {
        drawCommonHeader()
        const mythTitleOpts = { fontSize: 40, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, mythTitleOpts), {
          x: MARGIN_X, y: 1.4, w: CONTENT_W, h: 1.5,
        })
        // 강조선
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 2.9, w: 0.6, h: 0.04,
          fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
        })
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 3.2, w: CONTENT_W, h: 3.2,
            fontSize: 16, color: T.secondary, fontFace: T.fontMain,
            paraSpaceAfter: 8, lineSpacing: 28,
          })
        }
        drawCommonFooter()
        break
      }
      case 'info': {
        // 본론 — 표준 콘텐츠 슬라이드, emphasis 인라인 강조 활용
        drawCommonHeader()
        const infoTitleOpts = { fontSize: 36, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, infoTitleOpts), {
          x: MARGIN_X, y: 1.4, w: CONTENT_W, h: 1.0,
        })
        // 제목 아래 짧은 강조선
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 2.4, w: 0.6, h: 0.04,
          fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
        })
        if (Array.isArray(s.bullets) && s.bullets.length) {
          // bullets에도 emphasis 적용 — 각 bullet을 individual paragraph로 emphasis 처리
          const bulletParas = []
          for (const b of s.bullets) {
            const parts = renderWithEmphasis(String(b), s.emphasis, { fontSize: 16, color: onBg, fontFace: T.fontMain })
            // 첫 part에 bullet 마커, 마지막 part에 줄바꿈 표시
            if (parts.length) {
              parts[0].options = { ...parts[0].options, bullet: { code: '25CF' } }
            }
            bulletParas.push(...parts, { text: '\n', options: { fontSize: 16 } })
          }
          slide.addText(bulletParas, {
            x: MARGIN_X, y: 2.7, w: CONTENT_W, h: 3.8,
            paraSpaceAfter: 6, lineSpacing: 26,
          })
        }
        drawCommonFooter()
        break
      }
      case 'empty': {
        // 빈/이미지 슬라이드 — soft-cloud 큰 placeholder + 캡션
        drawCommonHeader()
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 1.3, w: CONTENT_W, h: 4.5,
          fill: { color: T.soft }, line: { color: T.soft, width: 0 },
        })
        slide.addText('🖼️', {
          x: MARGIN_X, y: 3.0, w: CONTENT_W, h: 1.0,
          fontSize: 56, color: onBgMute, fontFace: T.fontMain, align: 'center',
        })
        slide.addText('이미지 / 영상 자리', {
          x: MARGIN_X, y: 4.0, w: CONTENT_W, h: 0.5,
          fontSize: 14, color: onBgMute, fontFace: T.fontMain, align: 'center',
        })
        if (s.title) {
          slide.addText(s.title, {
            x: MARGIN_X, y: 5.95, w: CONTENT_W, h: 0.5,
            fontSize: 16, color: onBgMute, fontFace: T.fontMain, italic: true,
          })
        }
        drawCommonFooter()
        break
      }
      case 'qna': {
        drawCommonHeader()
        // 큰 Q. — Georgia(fontDisplay) 사용
        slide.addText('Q.', {
          x: MARGIN_X, y: 1.3, w: 1.0, h: 1.0,
          fontSize: 56, bold: true, color: T.primary || onBg, fontFace: T.fontDisplay || T.fontMain,
        })
        // 질문 텍스트
        slide.addText(s.title || '', {
          x: 1.6, y: 1.4, w: CONTENT_W - 1.1, h: 1.2,
          fontSize: 26, bold: true, color: onBg, fontFace: T.fontMain, valign: 'middle',
        })
        // 디바이더
        slide.addShape(pptx.ShapeType.line, {
          x: MARGIN_X, y: 2.8, w: CONTENT_W, h: 0,
          line: { color: dark ? '333333' : 'E5E5E5', width: 0.5 },
        })
        // 답변
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 3.0, w: CONTENT_W, h: 3.3,
            fontSize: 16, color: onBg, fontFace: T.fontMain,
            paraSpaceAfter: 6, lineSpacing: 26,
          })
        }
        drawCommonFooter()
        break
      }
      case 'testimonial': {
        drawCommonHeader()
        // soft-cloud 콘텐츠 박스 (인용 느낌)
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 1.3, w: CONTENT_W, h: 5.1,
          fill: { color: T.soft }, line: { color: T.soft, width: 0 },
        })
        // 큰 따옴표 장식
        slide.addText('"', {
          x: MARGIN_X + 0.3, y: 1.3, w: 1.0, h: 1.5,
          fontSize: 84, bold: true, color: 'CACACB', fontFace: T.fontMain,
        })
        // 인용 제목
        slide.addText(s.title || '', {
          x: MARGIN_X + 1.2, y: 1.7, w: CONTENT_W - 1.5, h: 1.0,
          fontSize: 22, bold: true, color: T.text, fontFace: T.fontMain,
        })
        // 3단 본문 (상황 → 코칭 → 결과)
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X + 0.5, y: 2.9, w: CONTENT_W - 0.8, h: 3.3,
            fontSize: 14, color: T.text, fontFace: T.fontMain,
            paraSpaceAfter: 8, lineSpacing: 24,
          })
        }
        drawCommonFooter()
        break
      }
      case 'cta': {
        // 모집 슬라이드 — primary 색(테라코타) 풀 너비 박스로 가장 강한 강조
        drawBackground(slide)
        drawLeftSidebar(slide)
        // SECTION/페이지번호는 어두운 박스 위라 흰색으로
        slide.addText(`SECTION ${String(sectionCounter).padStart(2, '0')}  ·  CTA`, {
          x: MARGIN_X, y: 0.40, w: 5.5, h: 0.30,
          fontSize: 10, bold: true, color: T.background,
          fontFace: T.fontDisplay || T.fontMain, charSpacing: 2,
        })
        slide.addText([
          { text: String(slideNum).padStart(2, '0'), options: { fontSize: 14, bold: true, color: T.background, fontFace: T.fontDisplay || T.fontMain } },
          { text: ` / ${totalSlides || '?'}`, options: { fontSize: 12, color: T.background, fontFace: T.fontDisplay || T.fontMain } },
        ], { x: SLIDE_W - 1.8, y: 0.40, w: 1.6, h: 0.30, align: 'right' })
        // 강조 박스 — primary 색
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X, y: 1.0, w: CONTENT_W, h: 5.4,
          fill: { color: T.primary || T.text }, line: { color: T.primary || T.text, width: 0 },
        })
        const ctaTitleOpts = { fontSize: 36, bold: true, color: T.background, fontFace: T.fontMain }
        const ctaRender = renderWithEmphasis(s.title || '', s.emphasis, ctaTitleOpts)
        // emphasis는 background 같은 흰색을 살짝 다른 톤으로 (soft) 강조
        for (const p of ctaRender) {
          if (p.options && p.options.fontSize > 36) {
            p.options.color = T.soft || T.background
            p.options.fontFace = T.fontDisplay || T.fontMain
          }
        }
        slide.addText(ctaRender, {
          x: MARGIN_X + 0.4, y: 1.5, w: CONTENT_W - 0.8, h: 1.5,
        })
        // 흰 라인 강조
        slide.addShape(pptx.ShapeType.rect, {
          x: MARGIN_X + 0.4, y: 3.1, w: 0.8, h: 0.04,
          fill: { color: T.background }, line: { color: T.background, width: 0 },
        })
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CB' } } })), {
            x: MARGIN_X + 0.4, y: 3.3, w: CONTENT_W - 0.8, h: 2.9,
            fontSize: 16, color: T.background, fontFace: T.fontMain,
            paraSpaceAfter: 6, lineSpacing: 26,
          })
        }
        // 우하단 슬라이드 번호 (어두운 박스 위라 흰색)
        slide.addText('N·LAB', {
          x: MARGIN_X, y: 6.85, w: 2.0, h: 0.25,
          fontSize: 9, color: T.background, fontFace: T.fontDisplay || T.fontMain,
          bold: true, charSpacing: 3,
        })
        slide.addText(String(slideNum || '?'), {
          x: SLIDE_W - 0.8, y: 6.85, w: 0.6, h: 0.25,
          fontSize: 9, color: T.background, fontFace: T.fontDisplay || T.fontMain, align: 'right',
        })
        break
      }
      case 'outro': {
        drawCommonHeader()
        slide.addText(s.title || '감사합니다', {
          x: MARGIN_X, y: 2.5, w: CONTENT_W, h: 1.5,
          fontSize: 48, bold: true, color: onBg, fontFace: T.fontMain,
          align: 'center', valign: 'middle',
        })
        slide.addShape(pptx.ShapeType.line, {
          x: SLIDE_W / 2 - 1, y: 4.3, w: 2, h: 0,
          line: { color: T.primary || T.text, width: 0.5 },
        })
        drawCommonFooter()
        break
      }
      case 'breath': {
        // 숨고르기/아이스브레이킹 — soft 배경 + 짧은 한 줄 중앙.
        slide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
          fill: { color: T.soft }, line: { color: T.soft, width: 0 },
        })
        slide.addText(s.title || '💧', {
          x: MARGIN_X, y: 2.8, w: CONTENT_W, h: 1.4,
          fontSize: 44, bold: false, color: T.text, fontFace: T.fontMain,
          align: 'center', valign: 'middle',
        })
        slide.addShape(pptx.ShapeType.line, {
          x: SLIDE_W / 2 - 0.6, y: 4.5, w: 1.2, h: 0,
          line: { color: T.primary || T.text, width: 0.5 },
        })
        slide.addText(String(slideNum || '?'), {
          x: SLIDE_W - 0.8, y: 6.85, w: 0.6, h: 0.25,
          fontSize: 9, color: T.accent || onBgMute, fontFace: T.fontDisplay || T.fontMain, align: 'right',
        })
        break
      }
      default: {
        drawCommonHeader()
        const defTitleOpts = { fontSize: 36, bold: true, color: onBg, fontFace: T.fontMain }
        slide.addText(renderWithEmphasis(s.title || '', s.emphasis, defTitleOpts), {
          x: MARGIN_X, y: 1.4, w: CONTENT_W, h: 1.0,
        })
        if (Array.isArray(s.bullets) && s.bullets.length) {
          slide.addText(s.bullets.map(b => ({ text: String(b), options: { bullet: { code: '25CF' } } })), {
            x: MARGIN_X, y: 2.7, w: CONTENT_W, h: 3.8,
            fontSize: 16, color: onBg, fontFace: T.fontMain,
            paraSpaceAfter: 6, lineSpacing: 26,
          })
        }
        drawCommonFooter()
      }
    }

    // 발표 멘트는 슬라이드 노트로
    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes)
    }
  }

  // ===== PPTX 후처리: 폰트 슬롯 3종(latin/ea/cs) 강제 적용 =====
  //
  // pptxgenjs는 fontFace를 PPTX XML의 <a:latin> typeface에만 넣고, <a:ea>(동아시아)
  // 및 <a:cs>(복합 스크립트)는 비워둠. 그래서 받는 PowerPoint가 빈 슬롯에 대해
  // 기본값(Inter, Calibri 등)을 사용 → 사용자 PC에 Pretendard 있어도 다른 폰트로 표시.
  //
  // 해결: pptxgenjs blob을 JSZip으로 풀어서
  //   1) theme1.xml의 majorFont/minorFont에 ea/cs typeface 강제 추가
  //   2) 모든 slide*.xml의 <a:rPr> 안에 latin이 있으면 ea/cs도 같은 폰트로 추가
  // 그 후 다시 ZIP → 다운로드.
  const blob = await pptx.write({ outputType: 'blob' })
  let finalBlob = blob

  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(blob)
    const fontName = T.fontMain
    const allFontsXml = `<a:latin typeface="${fontName}"/><a:ea typeface="${fontName}"/><a:cs typeface="${fontName}"/>`

    // (1) theme1.xml의 majorFont/minorFont 강제
    //   - 기존 latin/ea/cs만 교체. 기존 <a:font script="..."> 매핑 (수십 개)은 보존.
    //   - 단 'Hang' (한국어) script도 동일 폰트로 명시 (한글 폰트 fallback 강화).
    const themeFile = zip.file('ppt/theme/theme1.xml')
    if (themeFile) {
      let themeXml = await themeFile.async('string')
      const replaceFontGroup = (tag, xml) => {
        const rx = new RegExp(`<a:${tag}>([\\s\\S]*?)<\\/a:${tag}>`, 'g')
        return xml.replace(rx, (_, inner) => {
          // 기존 latin/ea/cs 제거 (우리 것으로 교체) — script 태그는 그대로 보존
          let cleaned = inner
            .replace(/<a:latin[^/]*\/>/g, '')
            .replace(/<a:ea[^/]*\/>/g, '')
            .replace(/<a:cs[^/]*\/>/g, '')
          // 한국어 script(Hang)도 우리 폰트로 명시 (있으면 typeface 교체, 없으면 무시)
          cleaned = cleaned.replace(/<a:font script="Hang"[^/]*\/>/g, `<a:font script="Hang" typeface="${fontName}"/>`)
          return `<a:${tag}>${allFontsXml}${cleaned}</a:${tag}>`
        })
      }
      themeXml = replaceFontGroup('majorFont', themeXml)
      themeXml = replaceFontGroup('minorFont', themeXml)
      zip.file('ppt/theme/theme1.xml', themeXml)
    }

    // (2) 모든 XML의 폰트 슬롯 강제 — 단순/강력 버전:
    //   pptxgenjs가 typeface="Inter"(또는 다른 폰트)를 박아넣는 게 진짜 원인 발견.
    //   "다 있으면 스킵"이 아니라 "있는 typeface 값을 무조건 우리 폰트로 교체"가 정답.
    //
    //   1) <a:latin typeface="X" .../> → <a:latin typeface="{fontName}" .../>
    //   2) <a:ea typeface="X" .../> → <a:ea typeface="{fontName}" .../>
    //   3) <a:cs typeface="X" .../> → <a:cs typeface="{fontName}" .../>
    //   4) self-closing <a:rPr ... /> → <a:rPr ...>{3종}</a:rPr> (폰트 슬롯 자체가 없는 경우)
    //   5) 열고 닫는 <a:rPr>{내용에 latin 없음}</a:rPr> → latin/ea/cs 3종 자식 추가
    const xmlFilePaths = Object.keys(zip.files).filter(p =>
      (p.startsWith('ppt/slides/slide') || p.startsWith('ppt/slideMasters/') || p.startsWith('ppt/slideLayouts/') || p.startsWith('ppt/notesSlides/') || p.startsWith('ppt/notesMasters/')) &&
      p.endsWith('.xml')
    )
    let typefaceReplaced = 0
    for (const path of xmlFilePaths) {
      const file = zip.file(path)
      if (!file) continue
      let xml = await file.async('string')

      // (a) typeface 값만 교체 — 부가 속성(pitchFamily, charset) 보존.
      //   이전엔 부가 속성을 모두 제거한 단순 형태로 통일했으나 PowerPoint가
      //   "복구 시도" 다이얼로그를 띄움. PowerPoint는 OOXML 스키마 검증이 까다로워
      //   pitchFamily/charset 같은 부가 속성이 박혀있는 형태를 더 안정적으로 받음.
      //   fontName=Pretendard로 통일된 상태라 부가 속성 차이가 글리프 렌더링에 미치는
      //   영향은 최소화됨 (같은 폰트 안에서의 charset 차이는 무시 가능).
      xml = xml.replace(/(<a:(?:latin|ea|cs)\s[^>]*?\btypeface=")([^"]*)("[^>]*\/?>)/g, (m, pre, oldFont, post) => {
        if (oldFont === fontName) return m
        typefaceReplaced++
        return `${pre}${fontName}${post}`
      })

      // (a2) typeface 속성 자체가 없는 latin/ea/cs 슬롯에 typeface 추가.
      //   예: <a:latin pitchFamily="34" charset="0"/> — PowerPoint가 빈 typeface에
      //   기본 폰트 채워 시각 차이 발생 방지.
      xml = xml.replace(/<a:(latin|ea|cs)(\s[^>]*?)?\/>/g, (m, tag, attrs) => {
        const a = attrs || ''
        if (/\btypeface=/.test(a)) return m
        typefaceReplaced++
        return `<a:${tag}${a} typeface="${fontName}"/>`
      })

      // (b)(c) 단계 제거 (2026-05-14):
      //   self-closing rPr/defRPr/endParaRPr를 열고닫기로 변환 + latin/ea/cs 자식 추가
      //   하던 후처리가 OOXML schema 순서(solidFill → latin → ea → cs)를 위반해
      //   PowerPoint "프레젠테이션 복구" 다이얼로그 발생.
      //   대안: latin 자식 자체가 없는 rPr은 theme1.xml의 minorFont에 박힌 Pretendard를
      //   상속하므로 추가 처리 불필요. typeface 통일은 (a) 단계와 theme 후처리로 충분.

      zip.file(path, xml)
    }
    console.log(`[buildDesignedPptx] 폰트 강제: ${xmlFilePaths.length}개 XML, typeface 교체=${typefaceReplaced}`)

    // 폰트 임베드는 의도적으로 제거됨 (2026-05-14).
    //   이전엔 PPTX 자체에 Pretendard OTF를 박아 다른 PC에서도 일관 렌더링 시도했으나:
    //   - obfuscation 안 한 raw OTF → ContentType mismatch로 "복구" 다이얼로그
    //   - OOXML obfuscation 적용 → 파일 자체가 열리지 않음 (PowerPoint 호환성)
    //   임베드 폰트 안 박는 대신 typeface="Pretendard"만 강제. 받는 사람 PC에
    //   Pretendard 폰트가 설치되어 있어야 디자인 그대로 보임 (설치 가이드는 별도).
    //   미설치 시엔 PowerPoint가 시스템 fallback 폰트 사용 (디자인은 비슷하게 유지).

    // 디버깅: slide 1~5의 첫 rPr/latin 슬롯을 비교용으로 출력.
    //   사용자가 시각 차이 발견 시 F12 콘솔에서 비교 가능.
    try {
      for (let i = 1; i <= 5; i++) {
        const f = zip.file(`ppt/slides/slide${i}.xml`)
        if (!f) continue
        const x = await f.async('string')
        const latinMatches = (x.match(/<a:latin[^/>]*\/>/g) || []).slice(0, 3)
        const firstText = x.match(/<a:t>([\s\S]*?)<\/a:t>/)
        console.log(`[buildDesignedPptx] slide${i}: 첫 텍스트="${firstText ? firstText[1].slice(0, 30) : ''}", latin 슬롯 샘플:`, latinMatches)
      }
    } catch {}

    finalBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
  } catch (e) {
    // 후처리 실패해도 원본 blob으로 fallback (디자인은 그대로, 폰트만 한글이 시스템 fallback)
    console.warn('[buildDesignedPptx] 폰트 강제 후처리 실패:', e?.message)
    finalBlob = blob
  }

  // 다운로드
  const url = URL.createObjectURL(finalBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName}.pptx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 정리봇 markdown 렌더러 (의존성 없는 경량 구현).
// 지원: ## / ### 헤더, - 불릿, 1. 번호, | ... | 표(GFM), > 인용, --- 구분선,
//       **굵게**, *기울임*, _기울임_, `코드`, 단락.
// JSX 반환. dangerouslySetInnerHTML 사용 안 함 (XSS 안전).
function MarkdownView({ content }) {
  if (!content || typeof content !== 'string') return null

  // 인라인 파싱: **bold**, *em*/_em_, `code`. 분할-병합 방식.
  const renderInline = (text, keyPrefix = 'i') => {
    if (!text) return null
    const tokens = []
    let rest = text
    let i = 0
    const RX = /(\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`\n]+?)`)/
    while (rest.length > 0) {
      const m = rest.match(RX)
      if (!m) { tokens.push(rest); break }
      const idx = m.index
      if (idx > 0) tokens.push(rest.slice(0, idx))
      if (m[2] !== undefined) tokens.push(<strong key={`${keyPrefix}-b-${i++}`} style={{ color: '#fff' }}>{m[2]}</strong>)
      else if (m[3] !== undefined) tokens.push(<em key={`${keyPrefix}-e-${i++}`}>{m[3]}</em>)
      else if (m[4] !== undefined) tokens.push(<em key={`${keyPrefix}-e-${i++}`}>{m[4]}</em>)
      else if (m[5] !== undefined) tokens.push(<code key={`${keyPrefix}-c-${i++}`} style={{ background: 'rgba(99,102,241,0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '12px', color: '#a5b4fc' }}>{m[5]}</code>)
      rest = rest.slice(idx + m[0].length)
    }
    return tokens
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') { i++; continue }
    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'hr' }); i++; continue
    }

    // 헤더
    let m
    if ((m = trimmed.match(/^(#{1,4})\s+(.+)$/))) {
      blocks.push({ type: 'heading', level: m[1].length, text: m[2] })
      i++; continue
    }

    // 표: 헤더 라인 | ... | + 다음 줄이 |---|---| 형태
    if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const headerCells = trimmed.slice(1, -1).split('|').map((s) => s.trim())
      i += 2 // 헤더 + 구분선 건너뜀
      const rows = []
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        const rowCells = lines[i].trim().slice(1, -1).split('|').map((s) => s.trim())
        rows.push(rowCells)
        i++
      }
      blocks.push({ type: 'table', headers: headerCells, rows })
      continue
    }

    // 불릿 리스트
    if (/^[-*]\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items }); continue
    }

    // 번호 리스트
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items }); continue
    }

    // 인용
    if (/^>\s?/.test(trimmed)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: buf.join('\n') }); continue
    }

    // 단락 (빈 줄 또는 다른 블록 만날 때까지)
    const buf = []
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s?|\|.+\|)/.test(lines[i].trim()) && lines[i].trim() !== '---') {
      buf.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: buf.join('\n') })
  }

  return (
    <div className="md-view" style={{ color: '#e2e8f0', fontSize: '13px', lineHeight: 1.7 }}>
      {blocks.map((b, idx) => {
        const k = `b-${idx}`
        if (b.type === 'hr') return <hr key={k} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
        if (b.type === 'heading') {
          const sizes = { 1: '22px', 2: '17px', 3: '15px', 4: '13.5px' }
          const top = b.level === 1 ? '12px' : b.level === 2 ? '18px' : '14px'
          return (
            <div key={k} style={{
              fontSize: sizes[b.level] || '14px',
              fontWeight: 700,
              color: '#fff',
              marginTop: top,
              marginBottom: '8px',
              borderBottom: b.level <= 2 ? '1px solid rgba(99,102,241,0.20)' : 'none',
              paddingBottom: b.level <= 2 ? '4px' : 0,
            }}>{renderInline(b.text, `${k}-h`)}</div>
          )
        }
        if (b.type === 'table') {
          return (
            <div key={k} style={{ overflowX: 'auto', margin: '10px 0' }}>
              <table style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '12.5px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}>
                <thead>
                  <tr>
                    {b.headers.map((h, hi) => (
                      <th key={hi} style={{
                        padding: '8px 12px',
                        background: 'rgba(99,102,241,0.10)',
                        color: '#c7d2fe',
                        fontWeight: 600,
                        textAlign: 'left',
                        borderBottom: '1px solid rgba(99,102,241,0.25)',
                      }}>{renderInline(h, `${k}-th-${hi}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '7px 12px',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          verticalAlign: 'top',
                          color: '#cbd5e1',
                        }}>{renderInline(cell, `${k}-td-${ri}-${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={k} style={{ margin: '6px 0 10px 22px', padding: 0 }}>
              {b.items.map((it, ii) => (
                <li key={ii} style={{ margin: '3px 0', color: '#cbd5e1' }}>{renderInline(it, `${k}-li-${ii}`)}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={k} style={{ margin: '6px 0 10px 22px', padding: 0 }}>
              {b.items.map((it, ii) => (
                <li key={ii} style={{ margin: '3px 0', color: '#cbd5e1' }}>{renderInline(it, `${k}-li-${ii}`)}</li>
              ))}
            </ol>
          )
        }
        if (b.type === 'quote') {
          return (
            <blockquote key={k} style={{
              margin: '10px 0',
              padding: '8px 14px',
              borderLeft: '3px solid rgba(99,102,241,0.45)',
              background: 'rgba(99,102,241,0.06)',
              color: '#cbd5e1',
              fontStyle: 'italic',
              borderRadius: '0 6px 6px 0',
              whiteSpace: 'pre-wrap',
            }}>{renderInline(b.text, `${k}-q`)}</blockquote>
          )
        }
        // paragraph
        return (
          <p key={k} style={{ margin: '6px 0', color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{renderInline(b.text, `${k}-p`)}</p>
        )
      })}
    </div>
  )
}

// 프로젝트 기획 SSE 스트림 reader. 각 이벤트(start / phase / task_start / task_done / done / fatal)를
// onEvent(event, data)로 콜백한다. 비-SSE 응답(JSON 에러)은 res.ok 체크로 호출자가 먼저 거른다.
async function readPlannerSSE(res, onEvent) {
  if (!res.body) throw new Error('스트림 응답이 없습니다.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sepIdx
    // SSE는 빈 줄(\n\n)로 이벤트 구분
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sepIdx)
      buffer = buffer.slice(sepIdx + 2)
      if (!block.trim()) continue
      let event = 'message'
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
        else if (line.startsWith('data:')) dataLines.push(line.slice(5))
      }
      let data = null
      if (dataLines.length > 0) {
        const raw = dataLines.join('\n')
        try { data = JSON.parse(raw) } catch { data = raw }
      }
      try { onEvent(event, data) } catch (e) { console.error('planner SSE handler error:', e) }
    }
  }
}

function SidebarItem({
  icon: Icon,
  label,
  shortLabel,
  active = false,
  loading = false,
  collapsed = false,
  onClick,
  href,
  external = false,
}) {
  const className = `sidebar-item${active ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}`
  const displayLabel = collapsed && shortLabel ? shortLabel : label

  const inner = (
    <>
      <span className="sidebar-item-icon" style={{ position: 'relative' }}>
        {Icon && <Icon size={collapsed ? 20 : 17} strokeWidth={1.85} />}
        {loading && collapsed && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#818cf8',
              animation: 'laPulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </span>
      <span
        style={{
          flex: collapsed ? 'unset' : 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel}
      </span>
      {loading && !collapsed && (
        <span
          className="sidebar-item-badge"
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: '#818cf8',
            animation: 'laPulse 1.5s ease-in-out infinite',
          }}
        />
      )}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={className}
        title={label}
        onClick={onClick}
        style={{ textDecoration: 'none' }}
      >
        {inner}
      </a>
    )
  }
  return (
    <button type="button" className={className} title={label} onClick={onClick}>
      {inner}
    </button>
  )
}

export default function Dashboard({ onLogout, userName, loginId, permissions = {} }) {
  const [sessions, setSessions] = useState([])
  const [instructors, setInstructors] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [currentTab, setCurrentTab] = useState('dashboard')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [memos, setMemos] = useState([])
  const [showMemoModal, setShowMemoModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState('instructor')
  const [newMemo, setNewMemo] = useState('')
  const [youtubeLinks, setYoutubeLinks] = useState([])
  const [purchaseTimeline, setPurchaseTimeline] = useState([])
  const [sheetData, setSheetData] = useState(null)
  const [allSheetData, setAllSheetData] = useState([])
  const [selectedInstructor, setSelectedInstructor] = useState('')
  const [showYoutubeModal, setShowYoutubeModal] = useState(false)
  const autoAnalyzedRef = useRef(new Set())
  const purchaseTimelineCacheRef = useRef(new Map()) // sessionId -> intervals[]
  const [timelineInterval, setTimelineInterval] = useState(10) // 5, 10, 15, 20, 30분
  const [rankingMetric, setRankingMetric] = useState('revenue')
  const [rankingOrder, setRankingOrder] = useState('desc')
  const [compareLeftId, setCompareLeftId] = useState(null)
  const [compareRightId, setCompareRightId] = useState(null)
  const [compareLeftInstructor, setCompareLeftInstructor] = useState('')
  const [compareRightInstructor, setCompareRightInstructor] = useState('')
  const [newYoutube, setNewYoutube] = useState({ channel_name: '', url: '', views: '', conversions: '' })
  const [youtubeFetching, setYoutubeFetching] = useState(false)
  const [newInstructor, setNewInstructor] = useState('')
  const [newSession, setNewSession] = useState({
    instructor_id: '',
    session_name: '',
    topic: '',
    free_class_date: ''
  })

  const [synced, setSynced] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // 개발자 환경 감지 — localhost(127.x / 192.168.x.x 포함) 또는 NODE_ENV=development.
  // 에러 로그 사이드바 메뉴 노출 조건. SSR/CSR 모두 안전하게 useState로 초기화 후 useEffect로 갱신.
  const [isDevEnv, setIsDevEnv] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [showFileModal, setShowFileModal] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [newLink, setNewLink] = useState({ url: '', title: '', description: '' })
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ show: false, current: 0, total: 0, fileName: '' })
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const ebookInputRef = useRef(null) // 전자책(file_role='ebook') 전용 업로드
  // 정리본 레퍼런스 양식은 사이드바 [기획 봇 설정 → 강사 자료 정리봇] 에서 공용으로 관리.
  // 자료 영역에 별도 업로드 버튼 X (이전 referenceInputRef는 제거됨).

  // 툴 관련 상태
  const [currentTool, setCurrentTool] = useState('order-sync') // order-sync, crm, kakao, youtube, shoong
  const [toolFiles1, setToolFiles1] = useState([]) // 여러 파일 지원 (카톡 로그 등)
  const [toolResult, setToolResult] = useState(null)
  const [toolProcessing, setToolProcessing] = useState(false)
  const [toolLog, setToolLog] = useState([])
  const [crmDragging, setCrmDragging] = useState(false)

  // 유튜브 채팅 수집 상태
  const [ytVideoId, setYtVideoId] = useState('')
  const [ytTargetUser, setYtTargetUser] = useState('')
  const [ytSessionName, setYtSessionName] = useState('')
  const [ytSessionId, setYtSessionId] = useState(null)
  const [ytCollecting, setYtCollecting] = useState(false)
  const [ytSessions, setYtSessions] = useState([])
  const [ytMessageCount, setYtMessageCount] = useState(0)
  const [ytViewSession, setYtViewSession] = useState(null) // 채팅 보기용 세션
  const [ytViewMessages, setYtViewMessages] = useState([])
  const pollingRef = useRef(null)
  const viewPollingRef = useRef(null) // 채팅 보기 자동 새로고침용

  // 사용자 기능 권한
  const defaultFeatures = ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer']
  const [userFeatures, setUserFeatures] = useState(permissions.features || defaultFeatures)
  const hasFeature = (key) => loginId === 'jinwoo' || userFeatures.includes(key)

  // 권한 설정 페이지 상태
  const [permUsers, setPermUsers] = useState([])
  const [permAllFeatures, setPermAllFeatures] = useState([])
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving] = useState(null) // 저장 중인 userId
  const [permEditMap, setPermEditMap] = useState({}) // userId -> feature[] 편집 상태
  const [permExpandedUser, setPermExpandedUser] = useState(null) // 펼쳐진 유저 id

  // 리소스 허브 상태
  const [currentResource, setCurrentResource] = useState(null) // 현재 선택된 탭 gid
  const [resourceZoom, setResourceZoom] = useState(75) // 줌 레벨 (%) - 기본 75%로 더 많이 보이게
  const [resourceFullscreen, setResourceFullscreen] = useState(false) // 전체화면 모드
  const [resourceViewMode, setResourceViewMode] = useState('api') // 'iframe' or 'api' - 기본 API 모드 (빠름)
  const [sheetApiData, setSheetApiData] = useState(null) // API로 가져온 시트 데이터
  const [sheetApiLoading, setSheetApiLoading] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(true) // iframe 로딩 상태

  // Google Sheets 설정
  const [savedSheets, setSavedSheets] = useState([]) // 저장된 시트 목록
  const [selectedSheet, setSelectedSheet] = useState(null) // 현재 선택된 시트
  const [showAddSheet, setShowAddSheet] = useState(false) // 시트 추가 모달
  const [addSheetUrl, setAddSheetUrl] = useState('')
  const [addSheetName, setAddSheetName] = useState('')
  const [addSheetLoading, setAddSheetLoading] = useState(false)
  const [sheetTabs, setSheetTabs] = useState([]) // 시트 탭 목록
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('')
  const [showDeleteSheet, setShowDeleteSheet] = useState(false) // 시트 삭제 모달
  const [deleteSheetIds, setDeleteSheetIds] = useState([]) // 삭제 선택된 시트 ID들
  const [deleteSheetLoading, setDeleteSheetLoading] = useState(false)
  const [permissionError, setPermissionError] = useState(null) // 권한 에러 시 서비스 계정 이메일

  // 시트 설정 상태
  const [sheetConfig, setSheetConfig] = useState({
    sheetId: '1cG6wewwrBrNZYI9y_PCAA943Y4qqWAJiWzI1zleDXiw',
    dataRange: 'A:AT',
    headerKeyword: '강사명',
    columnMappings: [
      { fieldKey: 'name', displayName: '강사명', columnIndex: 0, type: '이름' },
      { fieldKey: 'freeClassDate', displayName: '무료강의날짜', columnIndex: 1, type: '날짜' },
      { fieldKey: 'revenue', displayName: '최종매출액', columnIndex: 10, type: '숫자' },
      { fieldKey: 'operatingProfit', displayName: '영업이익', columnIndex: 12, type: '숫자' },
      { fieldKey: 'profitMargin', displayName: '영업이익률', columnIndex: 13, type: '퍼센트' },
      { fieldKey: 'adSpend', displayName: '광고비', columnIndex: 19, type: '숫자' },
      { fieldKey: 'gdnConvCost', displayName: 'GDN전환단가', columnIndex: 20, type: '숫자' },
      { fieldKey: 'metaConvCost', displayName: '메타전환단가', columnIndex: 21, type: '숫자' },
      { fieldKey: 'kakaoRoomDb', displayName: '카톡방', columnIndex: 30, type: '숫자' },
      { fieldKey: 'liveViewers', displayName: '동시접속', columnIndex: 31, type: '숫자' },
      { fieldKey: 'totalPurchases', displayName: '결제건수', columnIndex: 36, type: '숫자' },
      { fieldKey: 'conversionRate', displayName: '전환률', columnIndex: 45, type: '퍼센트' },
      { fieldKey: 'freeClassViewRate', displayName: '무료강의 시청률', columnIndex: 32, type: '퍼센트' }
    ]
  })
  const [sheetConfigLoading, setSheetConfigLoading] = useState(false)
  const [sheetConfigSaving, setSheetConfigSaving] = useState(false)
  const [sheetColumnShift, setSheetColumnShift] = useState({ show: false, fromIndex: '', count: 1 })
  const [sheetPreviewRaw, setSheetPreviewRaw] = useState(null) // 원본 시트 행 데이터
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false)
  const [sheetPreviewHighlight, setSheetPreviewHighlight] = useState(null) // 하이라이트할 열 인덱스
  const [showSessionChart, setShowSessionChart] = useState(false) // 기수별 차트 모달

  // 카톡 매칭 (시트 연동) 상태
  const [kakaoYear, setKakaoYear] = useState('26')
  const [kakaoTabs, setKakaoTabs] = useState([])
  const [kakaoTabsLoading, setKakaoTabsLoading] = useState(false)
  const [kakaoSelectedTab, setKakaoSelectedTab] = useState(null)
  const [kakaoPreview, setKakaoPreview] = useState(null)
  const [kakaoCommitting, setKakaoCommitting] = useState(false)
  const [kakaoCommitResult, setKakaoCommitResult] = useState(null)

  // 슝(Shoong) 알림톡 발송 테스트 상태
  // 템플릿별 변수는 TEMPLATE_VARS에서 정의 (start(1)은 '강사명', start(2)/(3)은 '강사님', start(3)만 '시청자수' 추가)
  const [shoongForm, setShoongForm] = useState({
    sendType: 'at',
    phone: '',
    'channelConfig.senderkey': '',
    'channelConfig.templatecode': 'start(2)',
    'variables.고객명': '',
    'variables.유튜브링크': '',
    'variables.강좌명': '',
    'variables.강사님': '',
    'variables.강사명': '',
    'variables.시청자수': ''
  })
  const [shoongSendMode, setShoongSendMode] = useState('immediate') // 'immediate' | 'reserved'
  const [shoongReservedAt, setShoongReservedAt] = useState('') // datetime-local 값 (YYYY-MM-DDTHH:mm)

  // 슝 페이로드 빌더: 템플릿별 변수만 추리고 예약발송 시 reservedTime 추가
  // 슝 템플릿별 변수 슬롯 (실제 카카오 검수에 등록된 변수 기준)
  // 모든 템플릿이 버튼 라벨로 #{링크명}을 사용함 — 본문엔 안 보이지만 누락 시 "미치환 변수" 에러
  const SHOONG_TEMPLATE_VARS = {
    'start(1)': ['고객명', '유튜브링크', '강좌명', '강사명', '링크명'],
    'start(2)': ['고객명', '유튜브링크', '강좌명', '강사님', '링크명'],
    'start(3)': ['고객명', '시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
  }
  const buildShoongPayload = () => {
    const tplCode = (shoongForm['channelConfig.templatecode'] || 'start(2)').trim()
    const tplVars = SHOONG_TEMPLATE_VARS[tplCode] || []
    // 모든 값 trim — 특히 senderkey/api키 끝 개행/공백이 슝 인증 실패 원인
    const trim = (v) => (typeof v === 'string' ? v.trim() : v)
    const payload = {
      sendType: trim(shoongForm.sendType),
      phone: trim(shoongForm.phone),
      'channelConfig.senderkey': trim(shoongForm['channelConfig.senderkey']),
      'channelConfig.templatecode': tplCode
    }
    for (const v of tplVars) payload[`variables.${v}`] = trim(shoongForm[`variables.${v}`] || '')
    if (shoongSendMode === 'reserved' && shoongReservedAt) {
      payload.reservedTime = new Date(shoongReservedAt).toISOString()
    }
    return payload
  }
  const [shoongApiKey, setShoongApiKey] = useState('') // 브라우저 직접 모드용 (개발자 도구 발급)
  const [shoongSending, setShoongSending] = useState(false)
  const [shoongResult, setShoongResult] = useState(null)
  const [shoongCurlCopied, setShoongCurlCopied] = useState(false)
  const [shoongDefaultsLoaded, setShoongDefaultsLoaded] = useState(false)

  // 슝 대량 발송 상태 (FreeCourse 검색 → 신청자 자동 추출 → 일괄 발송)
  const [shoongBulkKeyword, setShoongBulkKeyword] = useState('')
  const [shoongBulkSearching, setShoongBulkSearching] = useState(false)
  const [shoongBulkCourses, setShoongBulkCourses] = useState([]) // [{id, title, applicantCount}]
  const [shoongBulkSelectedIds, setShoongBulkSelectedIds] = useState([])
  const [shoongBulkVars, setShoongBulkVars] = useState({
    유튜브링크: '',
    강좌명: '',
    강사명: '', // start(1)
    강사님: '', // start(2), start(3)
    링크명: '',
    시청자수: '' // start(3)
  })
  const [shoongBulkTplCode, setShoongBulkTplCode] = useState('start(2)')
  const [shoongBulkSendMode, setShoongBulkSendMode] = useState('immediate')
  const [shoongBulkReservedAt, setShoongBulkReservedAt] = useState('')
  const [shoongBulkSending, setShoongBulkSending] = useState(false)
  const [shoongBulkResult, setShoongBulkResult] = useState(null)
  // 청크 분할 발송 진행 상황 (큰 명단 처리 중 실시간 표시)
  const [shoongBulkProgress, setShoongBulkProgress] = useState(null)
  // { totalChunks, currentChunk, totalRecipients, sent, failed, status: 'running'|'done' }
  // 테스트 모드: ON이면 모든 발송이 testPhone으로만 감 (수만명 신청자한테 가는 사고 방지)
  const [shoongBulkTestMode, setShoongBulkTestMode] = useState(true) // 기본 ON
  const [shoongBulkTestPhone, setShoongBulkTestPhone] = useState('')
  const [shoongBulkTestLimit, setShoongBulkTestLimit] = useState(1)
  // 슝 공식 대량 API (POST /send/bulk) 사용 여부. ON이면 xlsx 한 번 업로드로 N명 발송 (1~2분).
  //   OFF면 기존 청크 분할 단건 호출 (10~15분, fallback).
  //   슝 IP 화이트리스트가 활성화되어 있어 403이 뜨면 OFF로 전환.
  const [shoongUseBulkApi, setShoongUseBulkApi] = useState(true)

  // 슝 섹션 펼침 상태 (테스트/실전/수동 업로드)
  const [shoongSectionOpen, setShoongSectionOpen] = useState({ test: true, bulk: false, manual: false })

  // 슝 수동 업로드(CSV) 상태
  const [shoongManualFileName, setShoongManualFileName] = useState('')
  const [shoongManualRows, setShoongManualRows] = useState([]) // [{ name, phone }]
  const [shoongManualParseError, setShoongManualParseError] = useState('')
  const [shoongManualSending, setShoongManualSending] = useState(false)
  const [shoongManualResult, setShoongManualResult] = useState(null)

  // 🪄 프로젝트 기획 (멀티 봇 오케스트레이터) 상태
  // 강사/기수는 selectedInstructor + selectedSessionId(global)와 공유. 자료도 attachments(global) 재사용.
  const [pp_topic, setPpTopic] = useState('')
  const [pp_additionalContext, setPpAdditionalContext] = useState('')
  const [pp_enabledTasks, setPpEnabledTasks] = useState(['ebook']) // 기본 ebook만 ON
  const [pp_loading, setPpLoading] = useState(false)
  const [pp_results, setPpResults] = useState(null)
  const [pp_error, setPpError] = useState('')
  const [pp_taskRetrying, setPpTaskRetrying] = useState(null) // 개별 재생성 중인 task key
  const [pp_expanded, setPpExpanded] = useState({})
  // 쌍방향 사전 점검 상태
  const [pp_prechecking, setPpPrechecking] = useState(false)
  const [pp_precheckResult, setPpPrecheckResult] = useState(null) // { ready, summary, questions }
  const [pp_modalOpen, setPpModalOpen] = useState(false)
  const [pp_answers, setPpAnswers] = useState({}) // { [questionIndex]: string }
  // 정리봇 (강사 자료 정리본) 상태
  const [pp_summary, setPpSummary] = useState(null) // { id, content_md, version, updated_at, updated_by }
  const [pp_summaryLoading, setPpSummaryLoading] = useState(false)
  const [pp_summaryGenerating, setPpSummaryGenerating] = useState(false)
  const [pp_summaryRevising, setPpSummaryRevising] = useState(false)
  const [pp_summaryFeedback, setPpSummaryFeedback] = useState('')
  // 노션 페이지 자동 생성
  const [pp_notionCreating, setPpNotionCreating] = useState(false)
  const [pp_notionResult, setPpNotionResult] = useState(null) // { url, title, blockCount, ... }
  // 봇 결과 내보내기 상태: { taskKey: 'pptx' | 'notion' | null } 식으로 어느 작업 진행 중인지
  const [pp_exportBusy, setPpExportBusy] = useState({}) // {[taskKey]: 'pptx'|'notion'|null}
  // 봇 결과 노션 페이지 생성 결과: { [taskKey]: { url, title } | null }
  const [pp_planNotionResult, setPpPlanNotionResult] = useState({})
  // 에러 로그 (개발자 전용 — localhost 또는 jinwoo만)
  // errorLogs* state는 components/tabs/ErrorLogsTab.js 안으로 이동됨 (2026-05-14 분리)

  // PPT outline 구조 설정 (사용자가 직접 단계 순서 변경 + ON/OFF).
  // 12개 kind 중 사용할 것만 + 원하는 순서로 배열. localStorage에 사용자별 저장.
  // 기본값: outro 제외, breath 포함 (breath는 분포 신호 — 끝에 두면 LLM이 알아서 사이사이 분산)
  const DEFAULT_PPT_STRUCTURE = ['hook', 'intro', 'proof', 'journey', 'myth', 'info', 'qna', 'testimonial', 'cta', 'breath']
  const [pp_pptStructure, setPpPptStructure] = useState(DEFAULT_PPT_STRUCTURE)
  const [pp_structureModalOpen, setPpStructureModalOpen] = useState(false)
  // 드래그앤드롭 상태 (구조 설정 모달용)
  const [pp_dragIndex, setPpDragIndex] = useState(null)        // 잡은 카드 idx
  const [pp_dragOverIndex, setPpDragOverIndex] = useState(null) // hover 중인 drop target idx
  // PPT 디자인 톤 (기획 생성 시 한 번 묻고 결과에 적용)
  const [pp_designToneMd, setPpDesignToneMd] = useState(DEFAULT_DESIGN_TONE_MD)
  const [pp_designToneOverrides, setPpDesignToneOverrides] = useState({}) // 사용자가 칩에서 직접 입력한 hex/폰트
  const [pp_toneModalOpen, setPpToneModalOpen] = useState(false)
  const [pp_pendingGenerate, setPpPendingGenerate] = useState(null) // 톤 모달에서 진행 시 실행할 함수

  // 마운트 시 localStorage에서 사용자별 구조 복원 (없으면 default 유지)
  useEffect(() => {
    if (typeof window === 'undefined' || !loginId) return
    try {
      const raw = localStorage.getItem(`pp_pptStructure:${loginId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPpPptStructure(parsed)
        }
      }
      // 디자인 톤도 마지막에 사용한 거 복원
      const toneRaw = localStorage.getItem(`pp_designToneMd:${loginId}`)
      if (toneRaw && typeof toneRaw === 'string' && toneRaw.length > 10) {
        setPpDesignToneMd(toneRaw)
      }
      const overridesRaw = localStorage.getItem(`pp_designToneOverrides:${loginId}`)
      if (overridesRaw) {
        const ov = JSON.parse(overridesRaw)
        if (ov && typeof ov === 'object') setPpDesignToneOverrides(ov)
      }
    } catch (e) {
      console.warn('[pptStructure] localStorage 복원 실패:', e?.message)
    }
  }, [loginId])

  // 구조 변경 시 localStorage 저장
  const updatePptStructure = (newOrder) => {
    setPpPptStructure(newOrder)
    if (typeof window !== 'undefined' && loginId) {
      try {
        localStorage.setItem(`pp_pptStructure:${loginId}`, JSON.stringify(newOrder))
      } catch {}
    }
  }

  // 생성된 기획안 자동 저장/조회 (사이드바 '🗃️ 생성된 기획안' 탭)
  const [savedPlans, setSavedPlans] = useState([])
  const [savedPlansLoading, setSavedPlansLoading] = useState(false)
  const [savedPlansFilter, setSavedPlansFilter] = useState({ taskKey: '', instructorName: '' })
  const [savedPlansDirty, setSavedPlansDirty] = useState(false) // 새 결과 저장됨 → 다음 진입 시 새로고침
  const [savedPlanDetail, setSavedPlanDetail] = useState(null) // { id, plan, task_key, ... }
  const [savedPlanDetailLoading, setSavedPlanDetailLoading] = useState(false)
  const [savedPlanDeleting, setSavedPlanDeleting] = useState(null) // 삭제 중인 id
  // 무료 강의 주제 + 추가 컨텍스트 저장 상태
  const [pp_inputsSavedAt, setPpInputsSavedAt] = useState(null) // 마지막 저장 시각 (Date | null)
  const [pp_inputsSaving, setPpInputsSaving] = useState(false)
  const [pp_inputsDirty, setPpInputsDirty] = useState(false) // 저장 후 수정됐는지
  const [pp_summaryError, setPpSummaryError] = useState('')
  const [pp_summaryStartedAt, setPpSummaryStartedAt] = useState(0) // elapsed 표시용
  // SSE 진행상황 — 정리봇 작업 중에만 의미 있음
  const [pp_summaryPhase, setPpSummaryPhase] = useState('') // 'extracting' | 'ai_writing' | 'saving' | 'done'
  const [pp_summaryItems, setPpSummaryItems] = useState([]) // [{ kind, name, status, blocks?, charCount?, durationMs?, error? }]
  const [pp_summaryAiStartedAt, setPpSummaryAiStartedAt] = useState(0) // AI 단계 시작 시각
  // 진행상황 표시용. 현재 실행 중인 run의 task별 상태와 단계.
  // pp_taskStatus: { [taskKey]: { status: 'pending'|'running'|'done'|'error', startedAt?: number, durationMs?: number } }
  const [pp_taskStatus, setPpTaskStatus] = useState({})
  const [pp_runTasks, setPpRunTasks] = useState([]) // 현재 run에서 진행 중인 task key 목록 (idle 시 빈 배열)
  const [pp_phase, setPpPhase] = useState('') // 'starting' | 'ebook_extracting' | 'planning' | 'done'
  const [pp_startedAt, setPpStartedAt] = useState(0)
  const [pp_tick, setPpTick] = useState(0) // 진행 중 elapsed-time 표시를 갱신하기 위한 더미 카운터

  // 👥 계정 관리 (관리자 전용) 상태
  const [am_loading, setAmLoading] = useState(false)
  const [am_accounts, setAmAccounts] = useState([])
  const [am_allFeatures, setAmAllFeatures] = useState([])
  const [am_modal, setAmModal] = useState(null) // null | 'add' | { id, ... } (편집용)
  const [am_draft, setAmDraft] = useState({ name: '', username: '', password: '', features: ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer'] })
  const [am_busy, setAmBusy] = useState(false)
  const [am_revealPwd, setAmRevealPwd] = useState({}) // { [id]: true }
  const [am_message, setAmMessage] = useState('')

  // 🛠️ 기획 봇 설정 (관리자 전용) 상태
  const [pc_loading, setPcLoading] = useState(false)
  const [pc_loaded, setPcLoaded] = useState(false)
  const [pc_prompts, setPcPrompts] = useState([])           // [{feature_key, instructions, ...}]
  const [pc_refs, setPcRefs] = useState([])                 // [{id, feature_key, title, content, ...}]
  const [pc_selectedFeature, setPcSelectedFeature] = useState('ebook')
  const [pc_instructionsDraft, setPcInstructionsDraft] = useState('')
  const [pc_savingInstructions, setPcSavingInstructions] = useState(false)
  const [pc_newRef, setPcNewRef] = useState({ title: '', content: '' })
  const [pc_addingRef, setPcAddingRef] = useState(false)
  const [pc_editingRefId, setPcEditingRefId] = useState(null)
  const [pc_editRefDraft, setPcEditRefDraft] = useState({ title: '', content: '' })
  const [pc_busyRefId, setPcBusyRefId] = useState(null)
  const [pc_message, setPcMessage] = useState('')
  const [pc_extracting, setPcExtracting] = useState(false)  // 새 레퍼런스 폼: 파일에서 텍스트 추출 중

  // 주문 동기화(nlab DB / CSV → 결제자 시트 append) 상태
  const [orderSyncMode, setOrderSyncMode] = useState('supabase') // 'supabase' | 'csv'
  const [orderSyncYear, setOrderSyncYear] = useState('26')
  const [orderSyncTabs, setOrderSyncTabs] = useState([])
  const [orderSyncTabsLoading, setOrderSyncTabsLoading] = useState(false)
  const [orderSyncSelectedTab, setOrderSyncSelectedTab] = useState(null)
  const [orderSyncFile, setOrderSyncFile] = useState(null)
  const [orderSyncInstructors, setOrderSyncInstructors] = useState([])
  const [orderSyncInstructorsLoading, setOrderSyncInstructorsLoading] = useState(false)
  const [orderSyncSelectedInstructor, setOrderSyncSelectedInstructor] = useState('')
  // 조회 기간 (최대 31일). 기본값: 오늘 기준 최근 30일.
  const [orderSyncDateFrom, setOrderSyncDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [orderSyncDateTo, setOrderSyncDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [orderSyncRangeError, setOrderSyncRangeError] = useState('')
  const [orderSyncPreview, setOrderSyncPreview] = useState(null)
  const [orderSyncProcessing, setOrderSyncProcessing] = useState(false)
  const [orderSyncCommitting, setOrderSyncCommitting] = useState(false)
  const [orderSyncCommitResult, setOrderSyncCommitResult] = useState(null)
  const [orderSyncLog, setOrderSyncLog] = useState([])

  // 시트 결제자 데이터 상태
  const [payerSheetYear, setPayerSheetYear] = useState('26')
  const [payerSheetTabs, setPayerSheetTabs] = useState([])
  const [payerSheetLoading, setPayerSheetLoading] = useState(false)
  const [payerSheetSelectedTab, setPayerSheetSelectedTab] = useState(null)
  const [payerSheetData, setPayerSheetData] = useState(null)
  const [payerSheetDataLoading, setPayerSheetDataLoading] = useState(false)
  const [payerSheetSearch, setPayerSheetSearch] = useState('')
  // 신청자 데이터는 더 이상 파일 업로드가 아닌 nlab DB의 FreeCourse/ApplyCourse 직접 조회로 처리.
  const [payerMatchKeyword, setPayerMatchKeyword] = useState('')
  const [payerMatchSearching, setPayerMatchSearching] = useState(false)
  const [payerMatchCourses, setPayerMatchCourses] = useState([])
  const [payerMatchSelectedCourseIds, setPayerMatchSelectedCourseIds] = useState([])
  const [payerMatchProcessing, setPayerMatchProcessing] = useState(false)
  const [payerMatchLog, setPayerMatchLog] = useState([])
  const [payerMatchResult, setPayerMatchResult] = useState(null)
  // 신청자 데이터 입력 모드 — 'db' (DB 검색) | 'manual' (엑셀 업로드)
  const [payerMatchMode, setPayerMatchMode] = useState('db')
  // 엑셀 업로드 모드: 여러 파일을 받아 파일별로 신청자 라벨(유입경로) 분리
  // [{ fileName, label, rows: [{ name, phone, appliedAt }], parseError? }]
  const [payerMatchManualFiles, setPayerMatchManualFiles] = useState([])
  const [payerMatchManualParsing, setPayerMatchManualParsing] = useState(false)
  const [payerTabMappings, setPayerTabMappings] = useState({})
  const [payerEditingTab, setPayerEditingTab] = useState(null)
  const [payerEditInstructor, setPayerEditInstructor] = useState('')
  const [payerEditCohort, setPayerEditCohort] = useState('')

  // CS AI 상태
  const [csMessages, setCsMessages] = useState([])
  const [csInput, setCsInput] = useState('')
  const [csSending, setCsSending] = useState(false)
  const [csImages, setCsImages] = useState([]) // { file, preview, data, mediaType }
  const [csMode, setCsMode] = useState('chat') // 'chat' | 'policy'
  const [csPolicies, setCsPolicies] = useState([])
  const [csPoliciesLoading, setCsPoliciesLoading] = useState(false)
  const [csEditPolicy, setCsEditPolicy] = useState(null) // 편집 중인 정책
  const [csNewPolicy, setCsNewPolicy] = useState({ title: '', category: '환불', content: '' })
  const [csShowAddPolicy, setCsShowAddPolicy] = useState(false)
  const [csHistory, setCsHistory] = useState([])
  const [csHistoryLoading, setCsHistoryLoading] = useState(false)
  const [csHistoryTotal, setCsHistoryTotal] = useState(0)
  const [csHistoryPage, setCsHistoryPage] = useState(1)
  const [csHistorySearch, setCsHistorySearch] = useState('')
  const [csShowAddHistory, setCsShowAddHistory] = useState(false)
  const [csNewHistory, setCsNewHistory] = useState({ category: '일반', customer_inquiry: '', agent_response: '', tags: '', result: '' })
  const [csUploadingHistory, setCsUploadingHistory] = useState(false)
  const [csSyncing, setCsSyncing] = useState(false)
  const [csSyncResult, setCsSyncResult] = useState(null)
  const csEndRef = useRef(null)
  const csFileRef = useRef(null)
  const csHistoryFileRef = useRef(null)

  // 무료강의 분석기 상태
  const [laYoutubeUrl, setLaYoutubeUrl] = useState('')
  const [laVideoTitle, setLaVideoTitle] = useState('')
  const [laVideoDuration, setLaVideoDuration] = useState(null) // 영상 길이(초)
  const [laPrompt, setLaPrompt] = useState(`당신은 온라인 교육업계의 무료강의 분석 전문가입니다. 이 영상은 무료강의(3~6시간 분량)입니다.

다음 항목으로 분류하여 한국어로 정리해 주세요:

1. 강의 핵심 요약 (전체 흐름을 3~5문장으로 요약)
2. 주요 키워드 & 반복 메시지 (강사가 반복적으로 강조한 핵심 키워드/문장)
3. 판매 전환 포인트 (수강 유도, 할인 언급, 긴급성 강조 등 세일즈 멘트)
4. 수강생 반응 유도 구간 (질문 유도, 채팅 참여 유도, 감정 자극 등)
5. 강의 구성 타임라인 (도입-본론-클로징 구조 분석)
6. 개선 제안 (강의 퀄리티 향상을 위한 제안사항)

각 섹션은 bullet point로 간결하게 작성하세요.`)
  const [laProcessing, setLaProcessing] = useState(false)
  const [laProgress, setLaProgress] = useState({ step: '', percent: 0, detail: '' })
  const [laResult, setLaResult] = useState(null) // { analysis }
  const [laError, setLaError] = useState('')
  const [laHistory, setLaHistory] = useState([]) // 분석 히스토리
  const [laViewItem, setLaViewItem] = useState(null) // 히스토리 보기 모달

  // 서버에서 시트 목록 로드
  const loadSavedSheets = async () => {
    try {
      const response = await fetch('/api/saved-sheets', {
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error('Failed to load')
      const result = await response.json()
      const serverSheets = (result.sheets || []).map(s => ({
        id: s.id.toString(),
        name: s.name,
        url: s.url
      }))
      return serverSheets
    } catch {
      return []
    }
  }

  // 시트 설정 로드
  const loadSheetConfig = async () => {
    try {
      const response = await fetch('/api/sheet-config', { headers: getAuthHeaders() })
      if (!response.ok) throw new Error('Failed to load')
      const result = await response.json()
      if (result.config) {
        setSheetConfig({
          sheetId: result.config.sheet_id,
          dataRange: result.config.data_range,
          headerKeyword: result.config.header_key,
          columnMappings: result.config.columns || []
        })
      }
    } catch {}
  }

  // 시트 설정 저장
  const saveSheetConfig = async () => {
    setSheetConfigSaving(true)
    try {
      const response = await fetch('/api/sheet-config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sheetId: sheetConfig.sheetId,
          dataRange: sheetConfig.dataRange,
          headerKeyword: sheetConfig.headerKeyword,
          columnMappings: sheetConfig.columnMappings
        })
      })
      const result = await response.json()
      if (!response.ok) {
        alert(`시트 설정 저장 실패\n\n원인: ${result.error || '알 수 없음'}${result.hint ? '\n힌트: ' + result.hint : ''}`)
        return
      }
      alert('시트 설정이 저장되었습니다.')
    } catch (err) {
      alert(`시트 설정 저장 실패: ${err.message}`)
    } finally {
      setSheetConfigSaving(false)
    }
  }

  // 컬럼 번호를 엑셀 열 문자로 변환
  const columnIndexToLetter = (index) => {
    let letter = ''
    let num = index
    while (num >= 0) {
      letter = String.fromCharCode(65 + (num % 26)) + letter
      num = Math.floor(num / 26) - 1
    }
    return letter
  }

  // 시트 미리보기 데이터 가져오기 (서버 API 경유)
  const fetchSheetPreview = async () => {
    if (!sheetConfig.sheetId || !sheetConfig.dataRange) return
    setSheetPreviewLoading(true)
    try {
      const response = await fetch('/api/sheet-preview', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sheetId: sheetConfig.sheetId, dataRange: sheetConfig.dataRange })
      })
      if (!response.ok) throw new Error('Failed')
      const result = await response.json()
      setSheetPreviewRaw(result.rows || null)
    } catch {
      setSheetPreviewRaw(null)
    } finally {
      setSheetPreviewLoading(false)
    }
  }

  // 시트 탭 목록 가져오기
  const fetchSheetTabs = async (sheetUrl) => {
    setSheetsLoading(true)
    try {
      const response = await fetch('/api/sheets-meta', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ spreadsheetUrl: sheetUrl })
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 403 && data.serviceEmail) {
          setPermissionError(data.serviceEmail)
        } else if (response.status === 429 || (data.error && data.error.includes('quota'))) {
          alert('Google Sheets API 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.')
        } else {
          alert(data.error || '시트 정보를 가져올 수 없습니다.')
        }
        return
      }

      setSheetTabs(data.tabs)
      setSpreadsheetId(data.spreadsheetId)
      setSpreadsheetTitle(data.spreadsheetTitle)

      // 첫 번째 탭 선택
      if (data.tabs.length > 0) {
        setCurrentResource(data.tabs[0].gid)
        if (resourceViewMode === 'api') {
          fetchSheetDataByApi(data.spreadsheetId, data.tabs[0].title)
        }
      }

    } catch (error) {
      console.error('Fetch tabs error:', error)
      alert('시트 정보를 가져오는 중 오류가 발생했습니다.')
    } finally {
      setSheetsLoading(false)
    }
  }

  // 시트 선택 핸들러
  const selectSheet = (sheet) => {
    setSelectedSheet(sheet)
    setSheetTabs([])
    setSheetApiData(null)
    setCurrentResource(null)
    setSpreadsheetId('')
    setSpreadsheetTitle('')
    fetchSheetTabs(sheet.url)
  }

  // 시트 추가
  const addNewSheet = async () => {
    if (!addSheetUrl) return
    const urlMatch = addSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!urlMatch) {
      alert('올바른 Google Sheets URL이 아닙니다.')
      return
    }
    setAddSheetLoading(true)
    try {
      const response = await fetch('/api/sheets-meta', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ spreadsheetUrl: addSheetUrl })
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || '시트 정보를 가져올 수 없습니다.')
        return
      }
      const name = addSheetName.trim() || data.spreadsheetTitle || '새 시트'
      // 서버에 저장
      const saveResponse = await fetch('/api/saved-sheets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, url: addSheetUrl })
      })
      if (!saveResponse.ok) {
        const saveErr = await saveResponse.json()
        alert(saveErr.error || '시트 저장에 실패했습니다.')
        return
      }
      const saveResult = await saveResponse.json()
      const newSheet = { id: saveResult.sheet.id.toString(), name, url: addSheetUrl }
      setSavedSheets(prev => [...prev, newSheet])
      setShowAddSheet(false)
      setAddSheetUrl('')
      setAddSheetName('')
      selectSheet(newSheet)
    } catch (error) {
      alert('시트 정보를 가져오는 중 오류가 발생했습니다.')
    } finally {
      setAddSheetLoading(false)
    }
  }

  // 시트 삭제 (서버)
  const removeSheets = async (sheetIds) => {
    const serverIds = sheetIds.map(id => parseInt(id))
    if (serverIds.length === 0) return

    setDeleteSheetLoading(true)
    try {
      const response = await fetch('/api/saved-sheets', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ids: serverIds })
      })
      if (!response.ok) {
        const err = await response.json()
        alert(err.error || '시트 삭제에 실패했습니다.')
        return
      }
      setSavedSheets(prev => prev.filter(s => !sheetIds.includes(s.id)))
      if (selectedSheet && sheetIds.includes(selectedSheet.id)) {
        setSelectedSheet(null)
        setSheetTabs([])
        setSheetApiData(null)
        setCurrentResource(null)
      }
      setShowDeleteSheet(false)
      setDeleteSheetIds([])
    } catch {
      alert('시트 삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleteSheetLoading(false)
    }
  }

  // API로 시트 데이터 가져오기
  const fetchSheetDataByApi = async (sheetId, sheetName) => {
    setSheetApiLoading(true)
    setSheetApiData(null)
    try {
      const params = new URLSearchParams({
        spreadsheetId: sheetId || spreadsheetId,
        sheetName: sheetName
      })

      const response = await fetch(`/api/sheets-meta?${params}`, {
        headers: getAuthHeaders()
      })

      const data = await response.json()

      if (!response.ok) {
        // API 할당량 초과 체크
        if (response.status === 429 || (data.error && data.error.includes('quota'))) {
          alert('Google Sheets API 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.')
        }
        console.error('Sheet data error:', data.error)
        return
      }

      setSheetApiData(data.values)
    } catch (error) {
      console.error('Fetch sheet data error:', error)
    } finally {
      setSheetApiLoading(false)
    }
  }

  // 현재 선택된 시트 탭 정보
  const selectedSheetTab = sheetTabs.find(t => t.gid === currentResource)

  // 현재 탭의 URL 생성
  const getCurrentTabUrl = () => {
    if (!spreadsheetId || currentResource === null) return ''
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${currentResource}`
  }

  // 현재 탭의 임베드 URL 생성
  const getCurrentEmbedUrl = () => {
    if (!spreadsheetId || currentResource === null) return ''
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlembed?gid=${currentResource}`
  }

  // 구글 시트 URL을 임베드 URL로 변환
  const getEmbedUrl = (url) => {
    // 구글 스프레드시트
    if (url.includes('docs.google.com/spreadsheets')) {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
      const gidMatch = url.match(/gid=(\d+)/)
      if (match) {
        const sheetId = match[1]
        const gid = gidMatch ? gidMatch[1] : '0'
        // htmlembed: 링크 공유만 되어 있으면 작동
        return `https://docs.google.com/spreadsheets/d/${sheetId}/htmlembed?gid=${gid}`
      }
    }
    // 구글 문서
    if (url.includes('docs.google.com/document')) {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
      if (match) {
        return `https://docs.google.com/document/d/${match[1]}/preview`
      }
    }
    // 구글 캘린더 (이미 embed URL인 경우 그대로)
    if (url.includes('calendar.google.com')) {
      return url
    }
    return url
  }

  // 구글 시트 데이터를 API로 가져오기 (공개된 시트만 가능)
  const fetchSheetData = async (url) => {
    setSheetApiLoading(true)
    setSheetApiData(null)
    try {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
      const gidMatch = url.match(/gid=(\d+)/)
      if (!match) throw new Error('Invalid sheet URL')

      const sheetId = match[1]
      const gid = gidMatch ? gidMatch[1] : '0'

      // 공개된 시트의 CSV 데이터 가져오기
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error('시트가 공개되지 않았거나 접근할 수 없습니다.')
      }

      const csvText = await response.text()

      // CSV 파싱
      const rows = []
      let currentRow = []
      let currentCell = ''
      let inQuotes = false

      for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i]
        const nextChar = csvText[i + 1]

        if (inQuotes) {
          if (char === '"' && nextChar === '"') {
            currentCell += '"'
            i++
          } else if (char === '"') {
            inQuotes = false
          } else {
            currentCell += char
          }
        } else {
          if (char === '"') {
            inQuotes = true
          } else if (char === ',') {
            currentRow.push(currentCell)
            currentCell = ''
          } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
            currentRow.push(currentCell)
            if (currentRow.some(cell => cell.trim())) {
              rows.push(currentRow)
            }
            currentRow = []
            currentCell = ''
            if (char === '\r') i++
          } else {
            currentCell += char
          }
        }
      }
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell)
        if (currentRow.some(cell => cell.trim())) {
          rows.push(currentRow)
        }
      }

      setSheetApiData(rows)
    } catch (error) {
      console.error('Sheet fetch error:', error)
      alert('시트 데이터를 가져올 수 없습니다. 시트가 "링크가 있는 모든 사용자"에게 공개되어 있는지 확인하세요.')
    } finally {
      setSheetApiLoading(false)
    }
  }

  // 툴 상태 초기화 함수
  const resetToolState = () => {
    setToolFiles1([])
    setToolResult(null)
    setToolProcessing(false)
    setToolLog([])
    setKakaoSelectedTab(null)
    setKakaoPreview(null)
    setKakaoCommitting(false)
    setKakaoCommitResult(null)
    // 유튜브 채팅 수집 중지
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setYtCollecting(false)
  }

  // 카톡 매칭용 원본 탭 목록 로드 (payer-sheets API 재사용)
  const loadKakaoTabs = async (year) => {
    setKakaoTabsLoading(true)
    try {
      const res = await fetch(`/api/payer-sheets?year=${year}`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setKakaoTabs(data.success ? (data.tabs || []) : [])
    } catch (e) {
      setKakaoTabs([])
    }
    setKakaoTabsLoading(false)
  }

  // 주문 동기화용 탭 목록 로드
  const loadOrderSyncTabs = async (year) => {
    setOrderSyncTabsLoading(true)
    try {
      const res = await fetch(`/api/payer-sheets?year=${year}`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setOrderSyncTabs(data.success ? (data.tabs || []) : [])
    } catch {
      setOrderSyncTabs([])
    }
    setOrderSyncTabsLoading(false)
  }

  // 강사 목록 로드 (nlab DB의 TossCustomer productTitle 파싱).
  // 조회 기간 안에 결제 완료된 강의가 있는 강사만 반환된다 (최대 31일).
  const loadOrderSyncInstructors = async (from, to) => {
    setOrderSyncInstructorsLoading(true)
    setOrderSyncRangeError('')
    const dFrom = from ?? orderSyncDateFrom
    const dTo = to ?? orderSyncDateTo
    try {
      const qs = new URLSearchParams({ from: dFrom, to: dTo }).toString()
      const res = await fetch(`/api/tools/order-sync?${qs}`, {
        method: 'GET',
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.success) {
        setOrderSyncInstructors(data.teachers || [])
      } else {
        setOrderSyncInstructors([])
        setOrderSyncRangeError(data.error || '조회 실패')
      }
    } catch (err) {
      setOrderSyncInstructors([])
      setOrderSyncRangeError(err.message || '네트워크 오류')
    }
    setOrderSyncInstructorsLoading(false)
  }

  const resetOrderSync = () => {
    setOrderSyncFile(null)
    setOrderSyncSelectedInstructor('')
    setOrderSyncPreview(null)
    setOrderSyncCommitResult(null)
    setOrderSyncLog([])
    setOrderSyncProcessing(false)
    setOrderSyncCommitting(false)
  }

  // API 호출용 인증 헤더 생성
  // 인증 토큰 헬퍼는 lib/authClient.js로 통합됨 (위 import 참조).
  // 기존 호출부는 getAuthHeaders() 그대로 사용 가능.

  useEffect(() => {
    // loadInstructors/loadSessions는 같은 endpoint(/api/admin/instructors)를 호출하는 별칭.
    // 둘 다 호출하면 같은 fetch가 2번 나가므로 한 번만 호출.
    loadInstructorsAndSessions()
    loadPayerTabMappings()

    // 모바일 감지
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
      if (window.innerWidth <= 768) {
        setSidebarCollapsed(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 이전 'inflow' 도구가 제거됨 — 잔여 상태값이 있으면 기본 도구로 복귀
  useEffect(() => {
    if (currentTool === 'inflow') setCurrentTool('order-sync')
  }, [currentTool])

  // 프로젝트 기획/정리봇 진행 중일 때만 elapsed-time 표시를 250ms마다 갱신.
  useEffect(() => {
    if (!pp_loading && !pp_taskRetrying && !pp_summaryGenerating && !pp_summaryRevising) return
    const id = setInterval(() => setPpTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [pp_loading, pp_taskRetrying, pp_summaryGenerating, pp_summaryRevising])

  // 강사·기수 변경 시 저장된 주제·컨텍스트 자동 로드 (없으면 빈 값)
  useEffect(() => {
    if (!selectedSessionId || currentTab !== 'project-planner') {
      setPpTopic('')
      setPpAdditionalContext('')
      setPpInputsSavedAt(null)
      setPpInputsDirty(false)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/tools/project-planner/inputs?sessionId=${selectedSessionId}`, {
          headers: { ...getAuthHeaders() },
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const inputs = data.inputs || {}
        setPpTopic(inputs.topic || '')
        setPpAdditionalContext(inputs.additional_context || '')
        setPpInputsSavedAt(inputs.updated_at ? new Date(inputs.updated_at) : null)
        setPpInputsDirty(false)
      } catch (e) {
        console.warn('[planner-inputs] 로드 실패:', e?.message)
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedSessionId, currentTab])

  // pp_topic / pp_additionalContext 변경되면 dirty 마킹 (사용자가 입력 중)
  useEffect(() => {
    if (pp_inputsSavedAt !== null) setPpInputsDirty(true)
    // 처음 로드 시점에는 dirty=false (초기 로드 useEffect에서 false로 명시 세팅)
  }, [pp_topic, pp_additionalContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 저장 제거 — 빠른 강사 전환 시 자동저장이 엉뚱한 기수에 덮어쓰는 사고를 막기 위해
  //   2026-05 디바운스 자동저장 useEffect를 제거. 명시적 💾 저장 버튼만 사용.
  //   미저장 변경이 있을 때 브라우저 닫기/새로고침/탭 전환 시 경고를 띄워 데이터 보호.
  useEffect(() => {
    if (!pp_inputsDirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = '' // 크롬: 빈 문자열이어도 표준 확인 다이얼로그가 뜸
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pp_inputsDirty])

  // 개발자 환경 감지 (mount 시 한 번). hostname이 localhost/127.x/사설IP면 dev.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = window.location.hostname
    const dev = h === 'localhost' || h === '127.0.0.1' ||
                /^192\.168\./.test(h) || /^10\./.test(h) ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)
    setIsDevEnv(dev)
  }, [])

  // 에러 로그 자동 로드 useEffect는 components/tabs/ErrorLogsTab.js 안으로 이동됨

  // 생성된 기획안 탭 진입 시 목록 자동 로드. 필터 변경 시도 자동 재조회.
  // savedPlansDirty가 true이면 (새 기획안 저장 직후) 강제 재조회.
  useEffect(() => {
    if (currentTab !== 'saved-plans') return
    let cancelled = false
    setSavedPlansLoading(true)
    const params = new URLSearchParams()
    if (savedPlansFilter.taskKey) params.set('taskKey', savedPlansFilter.taskKey)
    if (savedPlansFilter.instructorName) params.set('instructorName', savedPlansFilter.instructorName)
    fetch(`/api/tools/project-planner/saved-plans?${params.toString()}`, {
      headers: { ...getAuthHeaders() },
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (Array.isArray(data?.plans)) setSavedPlans(data.plans)
        setSavedPlansDirty(false)
      })
      .catch(e => console.warn('[saved-plans] 로드 실패:', e?.message))
      .finally(() => { if (!cancelled) setSavedPlansLoading(false) })
    return () => { cancelled = true }
  }, [currentTab, savedPlansFilter.taskKey, savedPlansFilter.instructorName, savedPlansDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  // 강사·기수 변경 시 정리봇 정리본 자동 로드 (있으면 표시, 없으면 null)
  useEffect(() => {
    if (!selectedSessionId || currentTab !== 'project-planner') {
      setPpSummary(null)
      return
    }
    let cancelled = false
    const run = async () => {
      setPpSummaryLoading(true)
      setPpSummaryError('')
      try {
        const res = await fetch(`/api/tools/project-planner/summary?sessionId=${selectedSessionId}`, {
          headers: { ...getAuthHeaders() },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setPpSummary(data.summary || null)
      } catch (e) {
        if (!cancelled) {
          console.warn('[summary] 로드 실패:', e?.message)
          setPpSummary(null)
        }
      } finally {
        if (!cancelled) setPpSummaryLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedSessionId, currentTab])

  // 슝 툴 진입 시 서버 .env 기본값(SHOONG_API_KEY, SHOONG_SENDER_KEY) 로드해서 폼/curl 자동 채움
  useEffect(() => {
    if (currentTool !== 'shoong' || shoongDefaultsLoaded) return
    const token = getAuthToken()
    if (!token) return
    fetch('/api/tools/shoong-send/defaults', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        if (data.apiKey) setShoongApiKey(prev => prev || data.apiKey)
        if (data.senderKey) {
          setShoongForm(prev => ({
            ...prev,
            'channelConfig.senderkey': prev['channelConfig.senderkey'] || data.senderKey
          }))
        }
        setShoongDefaultsLoaded(true)
      })
      .catch(() => {})
  }, [currentTool, shoongDefaultsLoaded])

  // 유튜브 채팅 수집 중 페이지 이탈 방지
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (ytCollecting) {
        e.preventDefault()
        e.returnValue = '채팅 수집이 진행 중입니다. 페이지를 떠나면 수집이 중단됩니다.'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [ytCollecting])

  // 시트 통합 탭 진입 시 저장된 시트 목록 로드
  useEffect(() => {
    if (currentTab === 'resources' && savedSheets.length === 0) {
      loadSavedSheets().then(sheets => setSavedSheets(sheets))
    }
    if (currentTab === 'sheet-settings') {
      loadSheetConfig()
      fetchSheetPreview()
    }
    if (currentTab === 'payer-data' && payerSheetTabs.length === 0) {
      loadPayerSheetTabs(payerSheetYear)
    }
    if (currentTab === 'tools' && currentTool === 'kakao' && kakaoTabs.length === 0) {
      loadKakaoTabs(kakaoYear)
    }
    if (currentTab === 'tools' && currentTool === 'order-sync') {
      if (orderSyncTabs.length === 0) loadOrderSyncTabs(orderSyncYear)
      if (orderSyncInstructors.length === 0) loadOrderSyncInstructors()
    }
    if (currentTab === 'account-management' && loginId === 'jinwoo' && am_accounts.length === 0) {
      setAmLoading(true)
      fetch('/api/admin/accounts', { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setAmAccounts(data.accounts || [])
            setAmAllFeatures(data.allFeatures || [])
          }
        })
        .catch(() => {})
        .finally(() => setAmLoading(false))
    }
    if (currentTab === 'planner-config' && loginId === 'jinwoo' && !pc_loaded) {
      setPcLoading(true)
      fetch('/api/admin/planner-config', { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setPcPrompts(data.prompts || [])
            setPcRefs(data.references || [])
            setPcLoaded(true)
            // 선택된 기능의 지침을 textarea에 동기화
            const cur = (data.prompts || []).find(p => p.feature_key === pc_selectedFeature)
            setPcInstructionsDraft(cur?.instructions || '')
          }
        })
        .catch(() => {})
        .finally(() => setPcLoading(false))
    }
  }, [currentTab, currentTool])

  // 로그아웃 핸들러 (수집 중 확인)
  const handleLogoutWithConfirm = () => {
    if (ytCollecting) {
      if (window.confirm('⚠️ 유튜브 채팅 수집이 진행 중입니다.\n\n로그아웃하면 현재 브라우저에서의 수집이 중단됩니다.\n(수집된 데이터는 저장되어 있습니다)\n\n정말 로그아웃하시겠습니까?')) {
        // 폴링 중지
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        onLogout()
      }
    } else {
      onLogout()
    }
  }

  useEffect(() => {
    // 데이터 로드 완료 후 한번만 동기화 (instructors가 로드되면)
    if (instructors.length > 0 && !synced) {
      setSynced(true)
      syncFromSheet()
    }
  }, [instructors])

  useEffect(() => {
    if (selectedSessionId) {
      loadMemos()
      loadYoutubeLinks()
      loadPurchaseTimeline()
      const session = sessions.find(s => s.id === selectedSessionId)
      if (session) {
        loadSheetData(session.instructors?.name, session.session_name).then(data => {
          if (data) setSheetData(data)
          else setSheetData(null)
        })
      }
    }
  }, [selectedSessionId, sessions])

  // 강사/기수 변경 시 첨부파일 로드 (기수 매칭 우선, 없으면 강사 공통도 포함)
  useEffect(() => {
    if (selectedInstructor && instructors.length > 0) {
      loadAttachments()
    }
  }, [selectedInstructor, instructors, selectedSessionId])

  // 전체 시트 데이터 로드 (랭킹/대조용)
  // sessions 객체 참조가 바뀔 때마다 재호출되어 /api/sheets가 폭주하는 문제가 있어
  // sessions가 처음 채워졌는지 여부(length>0)로 단순화.
  useEffect(() => {
    if (sessions.length > 0) {
      loadAllSheetData()
    }
  }, [sessions.length > 0])

  const loadAllSheetData = async () => {
    try {
      const response = await fetch('/api/sheets', {
        headers: getAuthHeaders()
      })
      const result = await response.json()
      if (result.data) setAllSheetData(result.data)
    } catch (e) {
      console.error('전체 시트 데이터 로드 실패:', e)
    }
  }

  // 서버 라우트(/api/admin/instructors GET, service_role)로 instructors+sessions 한 번에 로드.
  // anon 키 SELECT가 RLS에 가려지는 케이스를 회피.
  const loadInstructorsAndSessions = async () => {
    try {
      const res = await fetch('/api/admin/instructors', { headers: getAuthHeaders(), cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        console.error('[loadInstructorsAndSessions] server error:', data)
        return
      }
      const instructorsData = data.instructors || []
      const sessionsData = data.sessions || []
      setInstructors(instructorsData)
      if (sessionsData.length > 0) {
        setSessions(sessionsData)
        // 최초 진입 시 첫 강사·기수 자동 선택
        const sortedInstructorNames = [...new Set(sessionsData.map(s => s.instructors?.name))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))
        const firstInstructor = sortedInstructorNames[0] || ''
        const getNum = (name) => { const m = name?.match(/(\d+)/); return m ? parseInt(m[1]) : 0 }
        setSelectedInstructor(prev => {
          if (prev) return prev
          const firstSession = sessionsData
            .filter(s => s.instructors?.name === firstInstructor)
            .sort((a, b) => getNum(a.session_name) - getNum(b.session_name))[0]
          if (firstSession) setSelectedSessionId(firstSession.id)
          return firstInstructor
        })
      }
    } catch (e) {
      console.error('[loadInstructorsAndSessions] network error:', e)
    } finally {
      setLoading(false)
    }
  }

  // 기존 호출 호환용 — 둘 다 같은 endpoint를 호출하도록.
  const loadInstructors = loadInstructorsAndSessions
  const loadSessions = loadInstructorsAndSessions

  const loadSheetData = async (instructorName, sessionName) => {
    const name = `${instructorName} ${sessionName}`
    try {
      const response = await fetch(`/api/sheets?name=${encodeURIComponent(name)}`, {
        headers: getAuthHeaders()
      })
      const data = await response.json()
      // 시트에 등록 안 된 신규 '준비중' 케이스: { data: null, notFound: true } → null 반환
      if (data?.notFound || data?.error) return null
      return data
    } catch (error) {
      console.error('시트 데이터 로드 실패:', error)
    }
    return null
  }

  const syncFromSheet = async () => {
    try {
      const response = await fetch('/api/sheets', {
        headers: getAuthHeaders()
      })
      const { data } = await response.json()
      if (!data) return

      // 최신 데이터 가져오기
      const { data: freshInstructors } = await supabase.from('instructors').select('*')
      const { data: freshSessions } = await supabase.from('sessions').select('*, instructors (name)')

      for (const item of data) {
        // 이름에서 연속 공백을 하나로 정규화
        const normalizedName = item.name.replace(/\s+/g, ' ').trim()
        const parts = normalizedName.split(' ')
        if (parts.length < 2) continue

        const instructorName = parts.slice(0, -1).join(' ')
        const sessionName = parts[parts.length - 1]

        // 강사 중복 체크 (공백 정규화하여 비교)
        let instructor = freshInstructors.find(i => i.name.trim() === instructorName)
        if (!instructor) {
          const { data: newInst } = await supabase
            .from('instructors')
            .insert({ name: instructorName })
            .select()
            .single()
          if (newInst) {
            instructor = newInst
            freshInstructors.push(newInst)
          } else continue
        }

        // 기수 중복 체크 (공백 정규화하여 비교)
        const exists = freshSessions.find(
          s => s.instructor_id === instructor.id && s.session_name?.trim() === sessionName
        )
        if (!exists) {
          const { data: newSess } = await supabase.from('sessions').insert({
            instructor_id: instructor.id,
            session_name: sessionName,
            topic: '',
            free_class_date: item.freeClassDate || null
          }).select('*, instructors (name)').single()
          if (newSess) freshSessions.push(newSess)
        }
      }

      // 중복 기수 제거
      const { data: allSessions } = await supabase.from('sessions').select('*')
      if (allSessions) {
        const seen = new Map()
        for (const s of allSessions) {
          const key = `${s.instructor_id}_${s.session_name?.trim()}`
          if (seen.has(key)) {
            await supabase.from('sessions').delete().eq('id', s.id)
          } else {
            seen.set(key, s.id)
          }
        }
      }

      // ⚠️ 과거에 "시트에 없는 강사/기수 자동 삭제" 로직이 여기 있었음.
      // 프로젝트 기획에서 신규 강사를 시트보다 먼저 등록하는 워크플로와 충돌:
      // 사용자가 추가한 신규 강사("테스트", "나혜선" 등 준비중 단계의 강사)가
      // syncFromSheet 돌 때마다 silently 삭제됨 → 새로고침하면 사라지는 증상.
      //
      // 정책 변경: 시트는 "추가 source"로만 사용. 삭제는 사용자가 명시적으로
      // 수행 (사이드바 → 강사/기수 삭제 모달).
      // 여기선 시트에 새로 생긴 강사·기수만 INSERT하고 끝.

      await loadInstructors()
      await loadSessions()
    } catch (error) {
      console.error('시트 동기화 실패:', error)
    }
  }

  const loadMemos = async () => {
    const { data } = await supabase.from('memos').select('*').eq('session_id', selectedSessionId).order('created_at', { ascending: false })
    if (data) setMemos(data)
  }

  const loadYoutubeLinks = async () => {
    const { data } = await supabase.from('youtube_links').select('*').eq('session_id', selectedSessionId)
    if (data) setYoutubeLinks(data)
  }

  const loadPurchaseTimeline = async () => {
    // nlab Supabase의 TossCustomer를 직접 조회 (시트/purchase_timeline 캐시 우회).
    const session = sessions.find(s => s.id === selectedSessionId)
    if (!session || !session.free_class_date || !session.instructors?.name) {
      setPurchaseTimeline([])
      return
    }

    // 캐시 히트 시 즉시 반영하고 종료 (API 재호출만 스킵, setState는 항상 함)
    const cached = purchaseTimelineCacheRef.current.get(selectedSessionId)
    if (cached) {
      setPurchaseTimeline(cached)
      return
    }

    // 분석 시작 전 빈 배열로 초기화해 이전 세션 차트가 잠깐 남아 보이는 현상 제거
    setPurchaseTimeline([])

    try {
      const response = await fetch('/api/sales-analysis', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          instructor: session.instructors.name,
          freeClassDate: session.free_class_date,
        })
      })
      const result = await response.json()
      const sessionIdAtRequestTime = selectedSessionId
      if (result.success && Array.isArray(result.intervals)) {
        // 구버전 캐시 스키마와 호환: { hour, purchases }만 차트가 사용함
        const intervals = result.intervals.map(r => ({ hour: r.hour, purchases: r.purchases }))
        purchaseTimelineCacheRef.current.set(sessionIdAtRequestTime, intervals)
        // 응답 도착 시 사용자가 다른 세션으로 이미 이동했으면 적용하지 않음 (race 방지)
        if (sessionIdAtRequestTime === selectedSessionId) {
          setPurchaseTimeline(intervals)
        }
      } else if (sessionIdAtRequestTime === selectedSessionId) {
        setPurchaseTimeline([])
      }
    } catch (e) {
      // 실패 시 빈 차트로 표시 (시트 폴백 제거: nlab DB가 단일 출처)
      setPurchaseTimeline([])
    }
  }

  const addInstructor = async () => {
    if (!newInstructor.trim()) return
    const name = newInstructor.trim()

    // anon 키 직접 INSERT는 RLS에 silently 막힐 수 있음 → service_role 서버 라우트 경유로 전환.
    let created = null
    let placeholder = null
    try {
      const res = await fetch('/api/admin/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'create-instructor', name }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        console.error('[addInstructor] server error:', data)
        alert('강사 추가 실패: ' + (data.error || `HTTP ${res.status}`))
        return
      }
      created = data.instructor
      placeholder = data.placeholderSession
      if (data._diagnostic && !data._diagnostic.usingServiceRole) {
        console.warn('[addInstructor] 서버가 anon 키로 폴백 중. SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요.')
      }
    } catch (e) {
      console.error('[addInstructor] network error:', e)
      alert('강사 추가 중 네트워크 오류: ' + (e?.message || e))
      return
    }

    if (!created || !created.id) {
      alert('강사가 등록됐는지 확인할 수 없습니다. 잠시 후 페이지를 새로고침해 확인해주세요.')
      return
    }

    // 즉시 로컬 state에 반영 → 드롭다운에 즉시 노출
    setInstructors(prev => {
      if (prev.some(i => i.name === created.name)) return prev
      return [...prev, created].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    })
    if (placeholder?.id) {
      setSessions(prev => [...prev, { ...placeholder, instructors: { name: created.name } }])
    }

    setNewInstructor('')
    setShowAddModal(false)

    // 백그라운드 동기화 (실패해도 무시)
    loadInstructors().catch(() => {})
    loadSessions().catch(() => {})

    // 자동 선택
    setSelectedInstructor(name)
    if (placeholder?.id) setSelectedSessionId(placeholder.id)
  }

  // 결제자 탭 매핑 서버 함수들
  const loadPayerTabMappings = async () => {
    try {
      const response = await fetch('/api/payer-tab-mappings', { headers: getAuthHeaders() })
      const result = await response.json()
      if (result.success) {
        setPayerTabMappings(result.mappings || {})
      }
    } catch (e) {
      console.error('탭 매핑 로드 실패:', e)
    }
  }

  const savePayerTabMapping = async (year, tabRaw, instructor, cohort) => {
    try {
      await fetch('/api/payer-tab-mappings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ year, tabRaw, instructor, cohort })
      })
      // 로컬 상태 즉시 반영
      setPayerTabMappings(prev => ({ ...prev, [`${year}_${tabRaw}`]: { instructor, cohort } }))
    } catch (e) {
      console.error('탭 매핑 저장 실패:', e)
    }
  }

  const deletePayerTabMapping = async (year, tabRaw) => {
    try {
      await fetch('/api/payer-tab-mappings', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ year, tabRaw })
      })
      setPayerTabMappings(prev => {
        const next = { ...prev }
        delete next[`${year}_${tabRaw}`]
        return next
      })
    } catch (e) {
      console.error('탭 매핑 삭제 실패:', e)
    }
  }

  // 시트 결제자 데이터 함수들
  const loadPayerSheetTabs = async (year) => {
    setPayerSheetLoading(true)
    setPayerSheetData(null)
    setPayerSheetSelectedTab(null)
    try {
      const response = await fetch(`/api/payer-sheets?year=${year}`, {
        headers: getAuthHeaders()
      })
      const result = await response.json()
      if (result.success) {
        setPayerSheetTabs(result.tabs)
      } else {
        setPayerSheetTabs([])
      }
    } catch (e) {
      setPayerSheetTabs([])
    }
    setPayerSheetLoading(false)
  }

  const loadPayerSheetData = async (tab) => {
    setPayerSheetDataLoading(true)
    setPayerSheetSelectedTab(tab)
    try {
      const response = await fetch('/api/payer-sheets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ year: payerSheetYear, tabName: tab.raw })
      })
      const result = await response.json()
      if (result.success) {
        setPayerSheetData(result)
      } else {
        setPayerSheetData(null)
      }
    } catch (e) {
      setPayerSheetData(null)
    }
    setPayerSheetDataLoading(false)
  }

  // 첨부파일 관련 함수들 (강사별)
  const getSelectedInstructorId = () => {
    const instructor = instructors.find(i => i.name === selectedInstructor)
    return instructor?.id
  }

  const loadAttachments = async () => {
    const instructorId = getSelectedInstructorId()
    if (!instructorId) return
    try {
      const sessionParam = selectedSessionId ? `&session_id=${selectedSessionId}` : ''
      const response = await fetch(`/api/files?instructor_id=${instructorId}${sessionParam}&t=${Date.now()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      })
      const result = await response.json()
      setAttachments(result.files || [])
    } catch (e) {
      console.error('첨부파일 로드 실패:', e)
      setAttachments([])
    }
  }

  // 파일 한도. 클라이언트와 서버(/api/files/sign-upload) 둘 다 동일.
  // 200MB. Supabase Storage 버킷의 file_size_limit도 200MB 이상으로 설정되어 있어야 함.
  const MAX_FILE_BYTES = 200 * 1024 * 1024
  // 작은 파일은 서버 라우트로, 큰 파일은 sign-upload + 직접 업로드.
  // Vercel 함수 본문 한도(약 4.5MB) 회피용.
  const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024

  const uploadFiles = async (files, role = 'material') => {
    if (!files || files.length === 0) return
    const instructorId = getSelectedInstructorId()
    if (!instructorId) return

    const fileArray = Array.from(files)

    // 압축 파일 필터링 (ZIP, RAR, 7Z 등)
    const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz']
    const archiveFiles = fileArray.filter(f => archiveExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    let validFiles = fileArray.filter(f => !archiveExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))

    if (archiveFiles.length > 0) {
      alert(`압축 파일(${archiveFiles.map(f => f.name).join(', ')})은 AI 분석을 지원하지 않아 업로드가 불가능합니다.`)
    }

    // 200MB 초과 파일 차단
    const tooBig = validFiles.filter(f => f.size > MAX_FILE_BYTES)
    if (tooBig.length > 0) {
      alert(`다음 파일은 200MB를 초과해 업로드할 수 없습니다:\n${tooBig.map(f => `· ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join('\n')}`)
      validFiles = validFiles.filter(f => f.size <= MAX_FILE_BYTES)
    }

    if (validFiles.length === 0) return

    setFileUploading(true)
    setUploadProgress({ show: true, current: 0, total: validFiles.length, fileName: '' })

    let successCount = 0
    let failCount = 0
    const PARALLEL_LIMIT = 5

    // 작은 파일: 기존 흐름 (formData로 서버에 파일 전송)
    const uploadSmall = async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('instructor_id', instructorId)
      if (selectedSessionId) formData.append('session_id', selectedSessionId)
      formData.append('file_type', 'file')
      formData.append('file_role', role)
      try {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getAuthToken()}` },
          body: formData,
        })
        const result = await response.json()
        return result.success === true
      } catch {
        return false
      }
    }

    // 큰 파일: sign-upload로 토큰 발급 → Supabase 직접 업로드 → 메타만 서버에 기록
    const uploadLarge = async (file) => {
      try {
        // 1) sign-upload
        const signRes = await fetch('/api/files/sign-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            instructor_id: instructorId,
            file_name: file.name,
            file_size: file.size,
          }),
        })
        const signData = await signRes.json()
        if (!signRes.ok || !signData.success) {
          console.warn('[upload] sign-upload 실패:', signData.error)
          return false
        }

        // 2) Supabase Storage 직접 업로드 (signed URL 사용)
        // signed URL은 풀 URL이라서 그대로 PUT 가능
        const putRes = await fetch(signData.signed_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'false',
          },
          body: file,
        })
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => '')
          console.warn('[upload] Supabase PUT 실패:', putRes.status, errText.slice(0, 200))
          return false
        }

        // 3) 메타데이터 기록 (storage_path만 보냄)
        const metaForm = new FormData()
        metaForm.append('instructor_id', instructorId)
        if (selectedSessionId) metaForm.append('session_id', selectedSessionId)
        metaForm.append('file_role', role)
        metaForm.append('storage_path', signData.storage_path)
        metaForm.append('file_name', file.name)
        metaForm.append('file_size', String(file.size))
        metaForm.append('mime_type', file.type || '')
        const metaRes = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getAuthToken()}` },
          body: metaForm,
        })
        const metaData = await metaRes.json()
        return metaData.success === true
      } catch (e) {
        console.warn('[upload] uploadLarge 예외:', e?.message)
        return false
      }
    }

    const uploadSingleFile = async (file) => {
      return file.size > DIRECT_UPLOAD_THRESHOLD ? uploadLarge(file) : uploadSmall(file)
    }

    // 병렬 업로드 (5개씩)
    for (let i = 0; i < validFiles.length; i += PARALLEL_LIMIT) {
      const batch = validFiles.slice(i, i + PARALLEL_LIMIT)
      const batchNames = batch.map(f => f.name).join(', ')
      setUploadProgress({ show: true, current: Math.min(i + PARALLEL_LIMIT, validFiles.length), total: validFiles.length, fileName: batchNames })

      const results = await Promise.all(batch.map(uploadSingleFile))
      results.forEach(success => {
        if (success) successCount++
        else failCount++
      })
    }

    setFileUploading(false)
    setUploadProgress({ show: false, current: 0, total: 0, fileName: '' })
    loadAttachments()

    if (failCount === 0) {
      alert(`✅ ${successCount}개 파일 업로드 완료!`)
    } else if (successCount === 0) {
      alert(`❌ 업로드 실패 (${failCount}개)`)
    } else {
      alert(`⚠️ ${successCount}개 성공, ${failCount}개 실패`)
    }
  }

  const handleFileUpload = async (e) => {
    await uploadFiles(e.target.files, 'material')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const handleEbookUpload = async (e) => {
    await uploadFiles(e.target.files, 'ebook')
    if (ebookInputRef.current) ebookInputRef.current.value = ''
  }

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = e.dataTransfer.items
    const files = []

    // 폴더/파일 모두 처리
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          if (entry.isDirectory) {
            // 폴더인 경우 내부 파일들 가져오기
            const folderFiles = await readDirectory(entry)
            files.push(...folderFiles)
          } else {
            files.push(item.getAsFile())
          }
        } else {
          files.push(item.getAsFile())
        }
      }
    }

    if (files.length > 0) {
      await uploadFiles(files)
    }
  }

  // 폴더 내 파일 재귀적으로 읽기
  const readDirectory = (directory) => {
    return new Promise((resolve) => {
      const reader = directory.createReader()
      const files = []

      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files)
          } else {
            for (const entry of entries) {
              if (entry.isFile) {
                const file = await new Promise((res) => entry.file(res))
                files.push(file)
              } else if (entry.isDirectory) {
                const subFiles = await readDirectory(entry)
                files.push(...subFiles)
              }
            }
            readEntries()
          }
        })
      }
      readEntries()
    })
  }

  const handleLinkSave = async () => {
    if (!newLink.url) return
    const instructorId = getSelectedInstructorId()
    if (!instructorId) return
    setFileUploading(true)

    const formData = new FormData()
    formData.append('instructor_id', instructorId)
    if (selectedSessionId) formData.append('session_id', selectedSessionId)
    formData.append('file_type', 'link')
    formData.append('link_url', newLink.url)
    formData.append('link_title', newLink.title)
    formData.append('description', newLink.description)

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
        body: formData
      })
      const result = await response.json()
      if (result.success) {
        setNewLink({ url: '', title: '', description: '' })
        setShowFileModal(false)
        loadAttachments()
      } else {
        alert('링크 저장 실패: ' + result.error)
      }
    } catch (e) {
      alert('링크 저장 실패')
    }
    setFileUploading(false)
  }

  const deleteAttachment = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const response = await fetch(`/api/files?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) loadAttachments()
    } catch (e) {
      alert('삭제 실패')
    }
  }

  const deleteAllAttachments = async () => {
    const instructorId = getSelectedInstructorId()
    if (!instructorId) return
    if (!confirm(`${selectedInstructor} 강사의 모든 파일(${attachments.length}개)을 삭제하시겠습니까?`)) return
    try {
      const response = await fetch(`/api/files?instructor_id=${instructorId}&delete_all=true`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) {
        loadAttachments()
        alert('전체 삭제 완료')
      }
    } catch (e) {
      alert('삭제 실패')
    }
  }

  const getFileIcon = (type) => {
    switch(type) {
      case 'image': return '🖼️'
      case 'pdf': return '📄'
      case 'spreadsheet': return '📊'
      case 'video': return '🎬'
      case 'audio': return '🎵'
      case 'text': return '📝'
      case 'document': return '📃'
      case 'link': return '🔗'
      case 'archive': return '🗜️'
      case 'presentation': return '📽️'
      default: return '📁'
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const addSession = async () => {
    if (!newSession.instructor_id || !newSession.session_name) return

    // 시트에 데이터가 있으면 free_class_date 자동 채움. 없어도 진행 (준비중 상태로 DB에 저장).
    const instructor = instructors.find(i => i.id === newSession.instructor_id)
    let freeClassDate = null
    try {
      const sheetCheck = await loadSheetData(instructor?.name, newSession.session_name)
      if (sheetCheck) freeClassDate = sheetCheck.freeClassDate || null
    } catch (_) {}

    // service_role 서버 라우트 경유 (anon 키 RLS 우회)
    let created = null
    try {
      const res = await fetch('/api/admin/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'create-session',
          instructor_id: newSession.instructor_id,
          session_name: newSession.session_name.trim(),
          topic: newSession.topic || '',
          free_class_date: freeClassDate,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert('기수 추가 실패: ' + (data.error || `HTTP ${res.status}`))
        return
      }
      created = data.session
    } catch (e) {
      alert('기수 추가 중 네트워크 오류: ' + (e?.message || e))
      return
    }

    if (!created?.id) {
      alert('기수가 등록됐는지 확인할 수 없습니다.')
      return
    }

    // 즉시 로컬 sessions state에 반영
    const instName = instructor?.name || created.instructors?.name || ''
    setSessions(prev => [...prev, { ...created, instructors: { name: instName } }])

    setNewSession({ instructor_id: '', session_name: '', topic: '' })
    setShowAddModal(false)
    loadSessions().catch(() => {})
    setSelectedSessionId(created.id)
  }

  const deleteInstructor = async (id) => {
    if (!confirm('이 강사를 삭제하시겠습니까? 관련 기수도 모두 삭제됩니다.')) return
    await supabase.from('sessions').delete().eq('instructor_id', id)
    await supabase.from('instructors').delete().eq('id', id)
    loadInstructors()
    loadSessions()
  }

  const deleteSession = async (id) => {
    if (!confirm('이 기수를 삭제하시겠습니까?')) return
    await supabase.from('sessions').delete().eq('id', id)
    loadSessions()
  }

  const deleteYoutube = async (id) => {
    if (!confirm('이 유튜브 링크를 삭제하시겠습니까?')) return
    await supabase.from('youtube_links').delete().eq('id', id)
    loadYoutubeLinks()
  }

  const fetchYoutubeInfo = async (url) => {
    if (!url || youtubeFetching) return
    // 기본적인 유튜브 URL 검증
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return
    setYoutubeFetching(true)
    try {
      const res = await fetch('/api/youtube-info', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ url })
      })
      const data = await res.json()
      if (!data.error) {
        setNewYoutube(prev => ({
          ...prev,
          channel_name: data.channelName || prev.channel_name,
          views: data.views ? String(data.views) : prev.views
        }))
      }
    } catch (e) {
      // 실패해도 무시 - 수동 입력 가능
    }
    setYoutubeFetching(false)
  }

  const saveYoutube = async () => {
    if (!newYoutube.url) return alert('유튜브 URL을 입력하세요')
    const { error } = await supabase.from('youtube_links').insert({
      session_id: selectedSessionId,
      channel_name: newYoutube.channel_name,
      url: newYoutube.url,
      views: parseInt(newYoutube.views) || 0,
      conversions: parseInt(newYoutube.conversions) || 0
    })
    if (!error) {
      setNewYoutube({ channel_name: '', url: '', views: '', conversions: '' })
      setShowYoutubeModal(false)
      loadYoutubeLinks()
    }
  }

  const saveMemo = async () => {
    if (!newMemo.trim()) return
    const { error } = await supabase.from('memos').insert({
      session_id: selectedSessionId,
      content: newMemo,
      memo_type: 'text',
      memo_date: new Date().toISOString().split('T')[0]
    })
    if (!error) {
      setNewMemo('')
      setShowMemoModal(false)
      loadMemos()
    }
  }

  const runAiAnalysis = async (tab = 'dashboard') => {
    setAnalyzing(true)
    const session = currentSession
    try {
      // 상세 분석일 때 첨부파일 내용 가져오기
      let fileContents = []
      if (tab === 'detail' && attachments.length > 0) {
        for (const file of attachments) {
          if (['text', 'document'].includes(file.file_type) ||
              file.file_name?.match(/\.(txt|md|json|xml|yaml|yml|log)$/i)) {
            try {
              const textResponse = await fetch(file.file_url)
              const text = await textResponse.text()
              fileContents.push({
                name: file.file_name,
                type: file.file_type,
                content: text.slice(0, 5000) // 최대 5000자
              })
            } catch (e) {
              fileContents.push({
                name: file.file_name,
                type: file.file_type,
                content: '[파일 내용을 읽을 수 없음]'
              })
            }
          } else {
            fileContents.push({
              name: file.file_name,
              type: file.file_type,
              size: file.file_size,
              url: file.file_url,
              content: null
            })
          }
        }
      }

      // 상세정보 분석은 강사 정보만, 대시보드 분석은 기수 정보 포함
      const sessionData = tab === 'detail'
        ? { instructorName: selectedInstructor, sessionName: '' }
        : {
            instructorName: session.instructors?.name,
            sessionName: session.session_name,
            topic: session.topic,
            revenue: sheetData?.revenue || session.revenue,
            operatingProfit: sheetData?.operatingProfit || session.operating_profit,
            profitMargin: sheetData?.profitMargin ?? session.profit_margin,
            adSpend: sheetData?.adSpend || session.ad_spend,
            kakaoRoomDB: sheetData?.kakaoRoomDb || session.kakao_room_db,
            conversionCost: sheetData?.conversionCost || session.conversion_cost,
            liveViewers: sheetData?.liveViewers || session.live_viewers,
            totalPurchases: sheetData?.totalPurchases || session.total_purchases,
            purchaseConversionRate: sheetData?.purchaseConversionRate || null
          }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sessionData,
          memos: tab === 'detail' ? [] : memos,
          attachments: fileContents,
          analysisType: tab
        })
      })
      const data = await response.json()
      if (data.error) alert('AI 분석 실패: ' + data.error)
      else setAiAnalysis(data)
    } catch (error) {
      console.error('AI 분석 오류:', error)
      alert('AI 분석 중 오류가 발생했습니다.')
    }
    setAnalyzing(false)
  }

  const getIntervalLabel = (minuteValue, interval = timelineInterval) => {
    // 선택된 간격 단위 레이블 생성
    const endMin = minuteValue + interval
    return `${minuteValue}~${endMin}`
  }

  // 5분 단위 데이터를 선택된 간격으로 그룹화
  const getGroupedTimelineData = () => {
    if (purchaseTimeline.length === 0) return []

    // 5분 단위 데이터를 선택된 간격으로 묶기
    const grouped = []
    const intervalCount = 180 / timelineInterval // 180분을 간격으로 나눈 개수

    for (let i = 0; i < intervalCount; i++) {
      const startMin = i * timelineInterval
      const endMin = (i + 1) * timelineInterval

      // 해당 범위에 속하는 5분 단위 데이터들의 구매건수 합산
      let purchases = 0
      for (let j = startMin; j < endMin; j += 5) {
        const item = purchaseTimeline.find(p => p.hour === j)
        if (item) purchases += item.purchases
      }

      grouped.push({
        hour: startMin,
        purchases
      })
    }

    return grouped
  }

  const getSessionNumber = (sessionName) => {
    const match = sessionName?.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  const currentSession = sessions.find(s => s.id === selectedSessionId) || {}
  const purchaseConversionRate = currentSession.live_viewers > 0
    ? ((currentSession.total_purchases / currentSession.live_viewers) * 100).toFixed(2)
    : 0

  const formatNumber = (num) => {
    if (!num) return '0'
    return num.toLocaleString()
  }

  const formatMoney = (num) => {
    if (!num) return '0'
    if (num >= 100000000) return (num / 100000000).toFixed(2) + '억원'
    return Math.round(num / 10000).toLocaleString() + '만원'
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'var(--accent-grad)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)',
          animation: 'laPulse 1.5s ease-in-out infinite',
        }}>
          <LayoutDashboard size={18} color="#fff" strokeWidth={2.2} />
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.02em' }}>데이터 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'transparent', position: 'relative', zIndex: 1 }}>
      {/* 모바일 오버레이 */}
      {isMobile && mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 998
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: isMobile ? '244px' : (sidebarCollapsed ? '76px' : '236px'),
        background: 'rgba(13, 14, 20, 0.72)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.22s ease, left 0.22s ease',
        ...(isMobile ? {
          position: 'fixed',
          top: 0,
          left: mobileMenuOpen ? 0 : '-280px',
          height: '100vh',
          zIndex: 999,
          boxShadow: mobileMenuOpen ? 'var(--shadow-lg)' : 'none',
        } : {
          position: 'sticky',
          top: 0,
          height: '100vh',
        }),
      }}>
        {/* Logo + collapse */}
        <div style={{
          padding: sidebarCollapsed && !isMobile ? '18px 12px 14px' : '18px 16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
          gap: '8px',
          minHeight: '68px',
        }}>
          {sidebarCollapsed && !isMobile ? (
            <button
              onClick={() => { setCurrentTab('dashboard'); if(isMobile) setMobileMenuOpen(false) }}
              title="대시보드로 이동"
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                border: 'none',
                borderRadius: '10px',
                background: 'var(--accent-grad)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}
            >
              <LayoutDashboard size={18} color="#fff" strokeWidth={2.2} />
            </button>
          ) : (
            <button
              onClick={() => { setCurrentTab('dashboard'); if(isMobile) setMobileMenuOpen(false) }}
              title="대시보드로 이동"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minWidth: 0,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '34px', height: '34px',
                borderRadius: '9px',
                background: 'var(--accent-grad)',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(99,102,241,0.28), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}>
                <LayoutDashboard size={17} color="#fff" strokeWidth={2.2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>강의 통합 관리</div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>N잡연구소</div>
              </div>
            </button>
          )}
          {!isMobile && !sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              title="사이드바 닫기"
              style={{
                flexShrink: 0,
                width: '28px', height: '28px',
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <ChevronLeft size={14} />
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              title="닫기"
              style={{
                flexShrink: 0,
                width: '32px', height: '32px',
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Collapsed expand button */}
        {!isMobile && sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="사이드바 열기"
            style={{
              margin: '8px auto 4px',
              width: '32px', height: '28px',
              padding: 0,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}

        {/* Nav */}
        <nav style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '6px 0 16px',
        }}>
          {hasFeature('basic-dashboard') && (
            <>
              {!(sidebarCollapsed && !isMobile) && <div className="sidebar-section-label">메인</div>}
              <SidebarItem icon={LineChartIcon} label="대시보드"
                active={currentTab === 'dashboard'}
                collapsed={sidebarCollapsed && !isMobile}
                onClick={() => { setCurrentTab('dashboard'); if(isMobile) setMobileMenuOpen(false) }} />
              <SidebarItem icon={Trophy} label="랭킹"
                active={currentTab === 'ranking'}
                collapsed={sidebarCollapsed && !isMobile}
                onClick={() => { setCurrentTab('ranking'); if(isMobile) setMobileMenuOpen(false) }} />
              <SidebarItem icon={Scale} label="대조"
                active={currentTab === 'compare'}
                collapsed={sidebarCollapsed && !isMobile}
                onClick={() => { setCurrentTab('compare'); resetToolState(); if(isMobile) setMobileMenuOpen(false) }} />
            </>
          )}

          {(hasFeature('tools') || hasFeature('resources') || hasFeature('cs-ai') || hasFeature('lecture-analyzer')) && (
            <>
              {!(sidebarCollapsed && !isMobile) && <div className="sidebar-section-label">업무 도구</div>}
              {hasFeature('tools') && (
                <SidebarItem icon={Wrench} label="툴"
                  active={currentTab === 'tools'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('tools'); resetToolState(); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {hasFeature('resources') && (
                <SidebarItem icon={FolderOpen} label="시트 통합" shortLabel="시트"
                  active={currentTab === 'resources'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('resources'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {hasFeature('cs-ai') && (
                <SidebarItem icon={Bot} label="CS AI"
                  active={currentTab === 'cs-ai'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('cs-ai'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {hasFeature('lecture-analyzer') && (
                <SidebarItem icon={GraduationCap} label="무료강의 분석기" shortLabel="강의분석"
                  active={currentTab === 'lecture-analyzer'}
                  loading={laProcessing}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={async () => {
                    setCurrentTab('lecture-analyzer');
                    if(isMobile) setMobileMenuOpen(false);
                    try {
                      const res = await fetch('/api/lecture-history', {
                        method: 'POST',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'list' })
                      })
                      const data = await res.json()
                      if (data.success) setLaHistory(data.items)
                    } catch {}
                  }} />
              )}
              {hasFeature('project-planner') && (
                <SidebarItem icon={Wand2} label="프로젝트 기획" shortLabel="기획"
                  active={currentTab === 'project-planner'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('project-planner'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {hasFeature('project-planner') && (
                <SidebarItem icon={FolderOpen} label="생성된 기획안" shortLabel="기획안"
                  active={currentTab === 'saved-plans'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('saved-plans'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
            </>
          )}

          {(hasFeature('sheet-settings') || hasFeature('payer-data') || loginId === 'jinwoo') && (
            <>
              {!(sidebarCollapsed && !isMobile) && <div className="sidebar-section-label">관리자</div>}
              {hasFeature('sheet-settings') && (
                <SidebarItem icon={Settings} label="시트 설정" shortLabel="시트설정"
                  active={currentTab === 'sheet-settings'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('sheet-settings'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {hasFeature('payer-data') && (
                <SidebarItem icon={CreditCard} label="결제자 데이터" shortLabel="결제자"
                  active={currentTab === 'payer-data'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('payer-data'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
              {loginId === 'jinwoo' && (
                <>
                  <SidebarItem icon={Library} label="기획 봇 설정" shortLabel="봇설정"
                    active={currentTab === 'planner-config'}
                    collapsed={sidebarCollapsed && !isMobile}
                    onClick={() => { setCurrentTab('planner-config'); if(isMobile) setMobileMenuOpen(false) }} />
                  <SidebarItem icon={ShieldCheck} label="계정 관리" shortLabel="계정"
                    active={currentTab === 'account-management'}
                    collapsed={sidebarCollapsed && !isMobile}
                    onClick={() => { setCurrentTab('account-management'); if(isMobile) setMobileMenuOpen(false) }} />
                </>
              )}
              {/* 🐞 에러 로그 — localhost 또는 jinwoo만 노출 (개발자/슈퍼관리자 디버깅용) */}
              {(isDevEnv || loginId === 'jinwoo') && (
                <SidebarItem icon={AlertCircle} label={`에러 로그${isDevEnv ? ' (DEV)' : ''}`} shortLabel="에러"
                  active={currentTab === 'error-logs'}
                  collapsed={sidebarCollapsed && !isMobile}
                  onClick={() => { setCurrentTab('error-logs'); if(isMobile) setMobileMenuOpen(false) }} />
              )}
            </>
          )}
        </nav>
      </aside>

      {/* 메인 컨텐츠 */}
      <div style={{ flex: 1, overflow: 'auto', width: '100%', position: 'relative' }}>
        {/* 강의 분석 중 플로팅 진행 바 (다른 탭에서 보임) */}
        {laProcessing && currentTab !== 'lecture-analyzer' && (
          <div
            onClick={() => setCurrentTab('lecture-analyzer')}
            style={{
              position: 'sticky',
              top: isMobile ? '49px' : '0',
              zIndex: 99,
              background: 'rgba(99,102,241,0.15)',
              backdropFilter: 'blur(12px)',
              borderBottom: '1px solid rgba(99,102,241,0.3)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#818cf8',
              animation: 'laPulse 1.5s ease-in-out infinite',
              flexShrink: 0
            }} />
            <span style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '600' }}>
              🎓 강의 분석 중
            </span>
            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                width: `${laProgress.percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                borderRadius: '2px',
                transition: 'width 0.5s ease'
              }} />
            </div>
            <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>{laProgress.percent}%</span>
            <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>클릭하여 확인</span>
          </div>
        )}

        {/* 🪄 프로젝트 기획 진행 중 — 하단 고정 진행 바 (다른 탭으로 이동해도 표시).
            클릭 시 project-planner 탭으로 복귀해서 이어볼 수 있게.
            void pp_tick: useEffect interval로 elapsed가 매 250ms 갱신되게 */}
        {(pp_loading || !!pp_taskRetrying) && currentTab !== 'project-planner' && (() => {
          void pp_tick
          const totalTasks = pp_runTasks.length
          const completedCount = pp_runTasks.filter(t => {
            const s = pp_taskStatus[t]?.status
            return s === 'done' || s === 'error'
          }).length
          const elapsed = pp_startedAt ? Math.round((Date.now() - pp_startedAt) / 1000) : 0
          // 단계별 의미를 살린 progress %
          let progressPercent = 0
          if (pp_phase === 'starting') progressPercent = 3
          else if (pp_phase === 'ebook_extracting') progressPercent = 8
          else if (pp_phase === 'planning' || pp_phase === 'done') {
            const ratio = totalTasks > 0 ? completedCount / totalTasks : 0
            progressPercent = Math.round(10 + ratio * 90)
          }
          if (pp_phase === 'done') progressPercent = 100
          const phaseLabel =
            pp_phase === 'ebook_extracting' ? '전자책 추출 중' :
            pp_phase === 'planning' ? '기획 생성 중' :
            pp_phase === 'done' ? '마무리 중' : '준비 중'
          return (
            <div
              onClick={() => setCurrentTab('project-planner')}
              style={{
                position: 'fixed',
                left: 0, right: 0, bottom: 0,
                zIndex: 99,
                background: 'rgba(168,85,247,0.18)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                borderTop: '1px solid rgba(168,85,247,0.40)',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.40)',
              }}
              title="클릭하여 프로젝트 기획 탭으로 돌아가기">
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#d8b4fe',
                animation: 'laPulse 1.5s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '13px', color: '#e9d5ff', fontWeight: 700, flexShrink: 0 }}>
                🪄 기획 생성 중
              </span>
              <span style={{ fontSize: '11.5px', color: '#c4b5fd', fontWeight: 500, flexShrink: 0 }}>
                · {phaseLabel} ({completedCount}/{totalTasks})
              </span>
              <div style={{ flex: 1, height: '5px', background: 'rgba(255,255,255,0.10)', borderRadius: '3px', overflow: 'hidden', minWidth: '80px' }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #a855f7, #ec4899)',
                  borderRadius: '3px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: '12px', color: '#c4b5fd', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {progressPercent}%
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {elapsed}s
              </span>
              <span style={{ fontSize: '11px', color: '#86efac', fontWeight: 600, flexShrink: 0 }}>
                ← 클릭해서 돌아가기
              </span>
            </div>
          )
        })()}

        {/* 모바일 헤더 */}
        {isMobile && (
          <div style={{
            position: 'sticky',
            top: 0,
            background: 'rgba(11, 12, 16, 0.85)',
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            zIndex: 100,
            gap: '10px',
          }}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              title="메뉴"
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Menu size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '24px', height: '24px',
                borderRadius: '7px',
                background: 'var(--accent-grad)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(99,102,241,0.30)',
              }}>
                <LayoutDashboard size={13} color="#fff" strokeWidth={2.4} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>강의 관리</span>
            </div>
            <button onClick={handleLogoutWithConfirm} title="로그아웃" style={{
              width: '36px', height: '36px',
              padding: 0,
              background: 'var(--danger-soft)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px',
              color: '#f87171',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <LogOut size={16} />
            </button>
          </div>
        )}

        {/* Top bar — desktop */}
        {!isMobile && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 28px',
            background: 'rgba(11, 12, 16, 0.55)',
            backdropFilter: 'blur(12px) saturate(140%)',
            WebkitBackdropFilter: 'blur(12px) saturate(140%)',
            borderBottom: '1px solid var(--border)',
          }}>
            {userName && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 12px 7px 7px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
              }}>
                <div style={{
                  width: '26px', height: '26px',
                  borderRadius: '50%',
                  background: 'var(--accent-grad)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
                }}>
                  {String(userName).trim().charAt(0).toUpperCase() || 'U'}
                </div>
                <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                  {userName}
                </span>
              </div>
            )}
            <button
              onClick={handleLogoutWithConfirm}
              title="로그아웃"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--danger-soft)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
                e.currentTarget.style.color = '#fca5a5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <LogOut size={14} />
              로그아웃
            </button>
          </div>
        )}
        <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* 드롭다운 - 대시보드 탭에서만 표시 */}
          {currentTab === 'dashboard' && <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 강사 선택 */}
            <select
              value={selectedInstructor}
              onChange={(e) => {
                setSelectedInstructor(e.target.value)
                const filtered = sessions.filter(s => s.instructors?.name === e.target.value)
                  .sort((a, b) => getSessionNumber(a.session_name) - getSessionNumber(b.session_name))
                if (filtered.length > 0) {
                  setSelectedSessionId(filtered[0].id)
                  setAiAnalysis(null)
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '14px',
                padding: '14px 20px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                minWidth: '200px',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath fill=%27%2394a3b8%27 d=%27M6 8L1 3h10z%27/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center'
              }}
            >
              {[...new Set(sessions.map(s => s.instructors?.name))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')).map(name => (
                <option key={name} value={name} style={{ background: '#1e1e2e', color: '#fff' }}>{name}</option>
              ))}
            </select>

            {/* 기수 선택 - 상세정보 탭에서는 숨김 */}
            {currentTab !== 'detail' && (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => {
                  setSelectedSessionId(e.target.value)
                  setAiAnalysis(null)
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '14px',
                  padding: '14px 20px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  minWidth: '200px',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath fill=%27%2394a3b8%27 d=%27M6 8L1 3h10z%27/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 16px center'
                }}
              >
                {sessions.filter(s => s.instructors?.name === selectedInstructor)
                  .sort((a, b) => getSessionNumber(a.session_name) - getSessionNumber(b.session_name))
                  .map(session => (
                  <option key={session.id} value={session.id} style={{ background: '#1e1e2e', color: '#fff' }}>
                    {session.session_name} {session.free_class_date ? `(${session.free_class_date})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>}

          {/* 대시보드 탭 */}
          {currentTab === 'dashboard' && (
            <>
              {/* 지표 카드 - 글래스모피즘 + 그라데이션 테두리 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>핵심 지표</span>
                  <HelpTooltip text={"선택한 강사/기수의 핵심 성과지표입니다.\n시트 동기화 데이터 또는 직접 입력한 데이터를 표시합니다."} />
                </div>
                <button
                  onClick={() => setShowSessionChart(true)}
                  style={{ padding: '7px 14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(99,102,241,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                >📊 기수별 차트</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: isMobile ? '12px' : '16px', marginBottom: '24px' }}>
                <div style={{ borderRadius: '16px', padding: '1px', background: 'linear-gradient(135deg, rgba(96,165,250,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(167,139,250,0.4) 100%)', transition: 'all 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '15px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>매출</div>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#60a5fa' }}>
                      {sheetData?.revenue ? formatMoney(sheetData.revenue) : (currentSession.revenue > 0 ? formatMoney(currentSession.revenue) : '진행중')}
                    </div>
                  </div>
                </div>
                <div style={{ borderRadius: '16px', padding: '1px', background: 'linear-gradient(135deg, rgba(52,211,153,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(96,165,250,0.4) 100%)', transition: 'all 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '15px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>구매전환율</div>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#34d399' }}>
                      {sheetData?.purchaseConversionRate ? `${sheetData.purchaseConversionRate.toFixed(2)}%` : `${purchaseConversionRate}%`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>시청자 {sheetData?.liveViewers ? formatNumber(sheetData.liveViewers) : formatNumber(currentSession.live_viewers)}명 → 결제 {sheetData?.totalPurchases ? formatNumber(sheetData.totalPurchases) : currentSession.total_purchases}명</div>
                  </div>
                </div>
                <div style={{ borderRadius: '16px', padding: '1px', background: 'linear-gradient(135deg, rgba(251,191,36,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(52,211,153,0.4) 100%)', transition: 'all 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '15px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>카톡방 DB</div>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#fbbf24' }}>
                      {sheetData?.kakaoRoomDb ? formatNumber(sheetData.kakaoRoomDb) : formatNumber(currentSession.kakao_room_db)}명
                    </div>
                  </div>
                </div>
                <div style={{ borderRadius: '16px', padding: '1px', background: 'linear-gradient(135deg, rgba(167,139,250,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(251,191,36,0.4) 100%)', transition: 'all 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '15px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>광고 전환비용</div>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#a78bfa' }}>
                      {sheetData?.conversionCost ? formatNumber(sheetData.conversionCost) : formatNumber(currentSession.conversion_cost)}원
                    </div>
                  </div>
                </div>
                <div style={{ borderRadius: '16px', padding: '1px', background: 'linear-gradient(135deg, rgba(244,114,182,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(96,165,250,0.4) 100%)', transition: 'all 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '15px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>무료강의 시청률</div>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#f472b6' }}>
                      {sheetData?.freeClassViewRate != null ? `${sheetData.freeClassViewRate}%` : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2단 레이아웃 - 글래스모피즘 */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>⏰ 무료특강 후 시간별 구매 추이 <HelpTooltip text={"무료특강 종료 후 시간대별 구매 건수를\n차트로 보여줍니다.\n우측 드롭다운으로 시간 간격(5~30분)을\n조절할 수 있습니다."} /></span>
                    <select
                      value={timelineInterval}
                      onChange={(e) => setTimelineInterval(parseInt(e.target.value))}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        color: '#fff',
                        fontSize: '13px',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 viewBox=%270 0 12 12%27%3E%3Cpath fill=%27%2394a3b8%27 d=%27M6 8L1 3h10z%27/%3E%3C/svg%3E")',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        paddingRight: '28px'
                      }}
                    >
                      <option value={5} style={{ background: '#1e1e2e' }}>5분</option>
                      <option value={10} style={{ background: '#1e1e2e' }}>10분</option>
                      <option value={15} style={{ background: '#1e1e2e' }}>15분</option>
                      <option value={20} style={{ background: '#1e1e2e' }}>20분</option>
                      <option value={30} style={{ background: '#1e1e2e' }}>30분</option>
                    </select>
                  </div>
                  {purchaseTimeline.length > 0 ? (() => {
                    const groupedData = getGroupedTimelineData()
                    const total = groupedData.reduce((sum, p) => sum + p.purchases, 0)
                    return <PurchaseTimelineChart groupedData={groupedData} getIntervalLabel={getIntervalLabel} total={total} />
                  })() : (
                    <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      아직 판매 데이터가 없습니다
                    </div>
                  )}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>💵 영업이익 현황 <HelpTooltip text={"매출에서 광고비, 강사료 등 비용을\n차감한 최종 영업이익과 이익률입니다.\n프로그레스 바로 수익성을 한눈에\n확인할 수 있습니다."} /></div>
                  {(sheetData?.revenue || currentSession.revenue > 0) ? (() => {
                    const profit = sheetData?.operatingProfit || currentSession.operating_profit || 0
                    const margin = sheetData?.profitMargin ?? currentSession.profit_margin ?? 0
                    const isPositive = profit >= 0
                    return (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                          <div style={{ background: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '12px', padding: '20px', textAlign: 'center', border: `1px solid ${isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                            <div style={{ fontSize: '13px', color: isPositive ? '#10b981' : '#f87171', marginBottom: '8px' }}>최종 영업이익</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: isPositive ? '#10b981' : '#f87171' }}>{formatMoney(profit)}</div>
                          </div>
                          <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: '12px', padding: '20px', textAlign: 'center', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <div style={{ fontSize: '13px', color: '#818cf8', marginBottom: '8px' }}>영업이익률</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#818cf8' }}>{margin}%</div>
                          </div>
                        </div>
                        <div style={{ height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(Math.max(margin, 0), 100)}%`, height: '100%', background: isPositive ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600' }}>
                            {margin > 5 ? `이익 ${margin}%` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })() : (
                    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>정산 데이터 없음</div>
                  )}
                </div>
              </div>


              {/* 광고 성과 - 글래스모피즘 */}
              {sheetData ? (() => {
                const roas = sheetData.adSpend > 0 ? (sheetData.revenue / sheetData.adSpend).toFixed(1) : '-'
                const revenuePerPurchase = sheetData.totalPurchases > 0 ? Math.round(sheetData.revenue / sheetData.totalPurchases) : 0
                return (
                  <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '24px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '8px' }}>📈 광고 성과 <HelpTooltip text={"ROAS, GDN/메타 전환단가, 총 광고비 등\n광고 효율을 한눈에 파악할 수 있습니다.\nROAS = 매출 ÷ 광고비 (높을수록 좋음)\n전환단가 = 광고비 ÷ 결제건수 (낮을수록 좋음)"} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#60a5fa', marginBottom: '6px', fontWeight: '500' }}>ROAS (광고수익률)</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{roas}배</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>매출 ÷ 광고비</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#38bdf8', marginBottom: '6px', fontWeight: '500' }}>GDN 전환단가</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#38bdf8' }}>{sheetData.gdnConvCost ? formatNumber(Math.round(sheetData.gdnConvCost)) + '원' : '-'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>구글 광고</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#818cf8', marginBottom: '6px', fontWeight: '500' }}>메타 전환단가</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#818cf8' }}>{sheetData.metaConvCost ? formatNumber(Math.round(sheetData.metaConvCost)) + '원' : '-'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>페이스북 / 인스타</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#f472b6', marginBottom: '6px', fontWeight: '500' }}>총 광고비</div>
                        <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatMoney(sheetData.adSpend)}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#fbbf24', marginBottom: '6px', fontWeight: '500' }}>동시접속 / 결제건수</div>
                        <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatNumber(sheetData.liveViewers)}명 / {formatNumber(sheetData.totalPurchases)}건</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '6px', fontWeight: '500' }}>인당 매출 (객단가)</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{formatMoney(revenuePerPurchase)}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>매출 ÷ 결제건수</div>
                      </div>
                    </div>
                  </div>
                )
              })() : null}

              {/* 유튜브 성과 */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>📺 유튜브 출연 성과 <HelpTooltip text={"유튜브 채널 출연 영상의 조회수와\n전환(구매) 건수를 관리합니다.\n+ 추가 버튼으로 유튜브 링크를 등록하면\n조회수를 자동으로 가져옵니다."} /></div>
                  <button onClick={() => setShowYoutubeModal(true)} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '8px', padding: '8px 14px', color: '#fb7185', fontSize: '13px', cursor: 'pointer' }}>+ 추가</button>
                </div>
                {youtubeLinks.length > 0 ? (
                  <div>
                    {youtubeLinks.map((yt, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: yt.url ? 'pointer' : 'default' }} onClick={() => yt.url && window.open(yt.url, '_blank')}>
                          <div style={{ width: '40px', height: '40px', background: 'rgba(244,63,94,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f43f5e' }}>▶</div>
                          <div>
                            <div style={{ fontWeight: '500', fontSize: '14px' }}>{yt.channel_name}</div>
                            {yt.url && <div style={{ fontSize: '11px', color: '#6366f1' }}>클릭하여 열기</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', textAlign: 'center', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '18px', fontWeight: '700' }}>{Math.round(yt.views / 1000)}K</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>조회수</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>{yt.conversions}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>전환</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deleteYoutube(yt.id); }} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>삭제</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>등록된 유튜브 링크가 없습니다</div>
                )}
              </div>

              {/* AI 분석 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                <button onClick={() => runAiAnalysis('dashboard')} disabled={analyzing} style={{ background: analyzing ? '#4c4c6d' : 'linear-gradient(135deg, #ec4899, #f43f5e)', border: 'none', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: analyzing ? 'wait' : 'pointer' }}>
                  {analyzing ? '✨ AI 분석 중...' : '✨ AI 분석 실행'}
                </button>
                <HelpTooltip text={"현재 기수의 모든 지표를 AI가 분석하여\n강점, 개선점, 추천 액션을 제공합니다.\n시트 데이터가 연동된 상태에서\n더 정확한 분석이 가능합니다."} />
              </div>

              {aiAnalysis && (
                <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', borderRadius: '16px', padding: '24px', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>✨ AI 분석 결과</div>
                  <p style={{ color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.6 }}>{aiAnalysis.summary}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ color: '#10b981', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>💪 강점</div>
                      {aiAnalysis.strengths.map((s, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {s}</div>))}
                    </div>
                    <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>⚠️ 개선점</div>
                      {aiAnalysis.weaknesses.map((w, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {w}</div>))}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ color: '#818cf8', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>📋 추천 액션</div>
                    {aiAnalysis.recommendations.map((r, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {r}</div>))}
                  </div>
                  <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(236,72,153,0.15)', borderRadius: '10px', borderLeft: '3px solid #ec4899' }}>
                    <span style={{ color: '#f472b6', fontWeight: '600' }}>💡 핵심 인사이트:</span>
                    <span style={{ color: '#e2e8f0', marginLeft: '8px' }}>{aiAnalysis.keyInsight}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 랭킹 탭 */}
          {currentTab === 'ranking' && (() => {
            const METRICS = [
              { key: 'revenue', label: '총 매출', format: v => formatMoney(v), color: '#10b981' },
              { key: 'operatingProfit', label: '영업이익', format: v => formatMoney(v), color: '#10b981' },
              { key: 'profitMargin', label: '영업이익률', format: v => v + '%', color: '#818cf8' },
              { key: 'adSpend', label: '광고비', format: v => formatMoney(v), color: '#f59e0b' },
              { key: 'roas', label: 'ROAS', format: v => v + '배', color: '#f59e0b' },
              { key: 'kakaoRoomDb', label: '카톡방 DB', format: v => formatNumber(v) + '명', color: '#38bdf8' },
              { key: 'liveViewers', label: '동시접속', format: v => formatNumber(v) + '명', color: '#38bdf8' },
              { key: 'totalPurchases', label: '결제건수', format: v => formatNumber(v) + '건', color: '#ec4899' },
              { key: 'conversionRate', label: '구매전환율', format: v => v + '%', color: '#ec4899' },
              { key: 'conversionCost', label: '전환비용', format: v => formatNumber(v) + '원', color: '#f87171' },
              { key: 'gdnConvCost', label: 'GDN 전환단가', format: v => formatNumber(Math.round(v)) + '원', color: '#38bdf8' },
              { key: 'metaConvCost', label: '메타 전환단가', format: v => formatNumber(Math.round(v)) + '원', color: '#818cf8' },
            ]
            const currentMetric = METRICS.find(m => m.key === rankingMetric) || METRICS[0]
            const ranked = allSheetData
              .map(d => ({
                ...d,
                roas: d.adSpend > 0 ? parseFloat((d.revenue / d.adSpend).toFixed(1)) : 0,
                conversionRate: d.purchaseConversionRate ? parseFloat(d.purchaseConversionRate.toFixed(2)) : 0
              }))
              .filter(d => {
                const val = d[rankingMetric]
                return val !== undefined && val !== null && val !== 0
              })
              .sort((a, b) => rankingOrder === 'desc' ? b[rankingMetric] - a[rankingMetric] : a[rankingMetric] - b[rankingMetric])
            const maxVal = ranked.length > 0 ? Math.max(...ranked.map(d => Math.abs(d[rankingMetric]))) : 1

            return (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>🏆 랭킹 <HelpTooltip text={"모든 기수의 성과를 지표별로 비교합니다.\n원하는 지표 버튼을 클릭하고\n오름차순/내림차순을 선택하세요.\n시트 동기화된 데이터 기준으로 표시됩니다."} /></h2>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {METRICS.map(m => (
                      <button key={m.key} onClick={() => setRankingMetric(m.key)} style={{ padding: '8px 16px', background: rankingMetric === m.key ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)', border: rankingMetric === m.key ? 'none' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: rankingMetric === m.key ? '600' : '400' }}>{m.label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setRankingOrder('desc')} style={{ padding: '8px 16px', background: rankingOrder === 'desc' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (rankingOrder === 'desc' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'), borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>내림차순 ↓</button>
                    <button onClick={() => setRankingOrder('asc')} style={{ padding: '8px 16px', background: rankingOrder === 'asc' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (rankingOrder === 'asc' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'), borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>오름차순 ↑</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ranked.map((item, i) => {
                    const barWidth = maxVal > 0 ? (Math.abs(item[rankingMetric]) / maxVal) * 100 : 0
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
                    return (
                      <div key={item.name} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px 20px', border: i < 3 ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '16px', fontWeight: '700', color: i < 3 ? '#fff' : '#94a3b8', minWidth: '30px' }}>{medal || `${i + 1}`}</span>
                            <span style={{ fontSize: '15px', fontWeight: '600' }}>{item.name}</span>
                          </div>
                          <span style={{ fontSize: '18px', fontWeight: '700', color: currentMetric.color }}>{currentMetric.format(item[rankingMetric])}</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${currentMetric.color}, ${currentMetric.color}88)`, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                  {ranked.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>데이터가 없습니다. 시트 동기화를 먼저 진행해주세요.</div>
                  )}
                </div>
              </>
            )
          })()}

          {/* 대조 탭 */}
          {currentTab === 'compare' && (() => {
            const leftData = allSheetData.find(d => d.name === compareLeftId)
            const rightData = allSheetData.find(d => d.name === compareRightId)

            // allSheetData에서 강사명 추출 (name은 "강사명 기수명" 형식)
            const getInstructorFromName = (name) => {
              const parts = name.split(' ')
              return parts.slice(0, -1).join(' ')
            }
            const getSessionFromName = (name) => {
              const parts = name.split(' ')
              return parts[parts.length - 1]
            }

            // 강사 목록 (ㄱㄴㄷ순 정렬)
            const compareInstructors = [...new Set(allSheetData.map(d => getInstructorFromName(d.name)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))

            // 선택된 강사의 기수 목록
            const getSessionsForInstructor = (instructor) => {
              return allSheetData
                .filter(d => getInstructorFromName(d.name) === instructor)
                .map(d => ({ name: d.name, session: getSessionFromName(d.name) }))
                .sort((a, b) => {
                  const numA = parseInt(a.session.match(/\d+/)?.[0]) || 0
                  const numB = parseInt(b.session.match(/\d+/)?.[0]) || 0
                  return numA - numB
                })
            }

            const leftSessions = getSessionsForInstructor(compareLeftInstructor)
            const rightSessions = getSessionsForInstructor(compareRightInstructor)

            const COMPARE_ITEMS = [
              { label: '총 매출', key: 'revenue', format: v => formatMoney(v), higherBetter: true },
              { label: '영업이익', key: 'operatingProfit', format: v => formatMoney(v), higherBetter: true },
              { label: '영업이익률', key: 'profitMargin', format: v => v + '%', higherBetter: true },
              { label: '광고비', key: 'adSpend', format: v => formatMoney(v), higherBetter: false },
              { label: 'ROAS', key: 'roas', format: v => v + '배', higherBetter: true, calc: d => d.adSpend > 0 ? (d.revenue / d.adSpend).toFixed(1) : '-' },
              { label: '카톡방 DB', key: 'kakaoRoomDb', format: v => formatNumber(v) + '명', higherBetter: true },
              { label: '동시접속', key: 'liveViewers', format: v => formatNumber(v) + '명', higherBetter: true },
              { label: '결제건수', key: 'totalPurchases', format: v => formatNumber(v) + '건', higherBetter: true },
              { label: '구매전환율', key: 'conversionRate', format: v => Number(v).toFixed(2) + '%', higherBetter: true, calc: d => d.purchaseConversionRate },
              { label: '전환비용', key: 'conversionCost', format: v => formatNumber(v) + '원', higherBetter: false },
              { label: 'GDN 전환단가', key: 'gdnConvCost', format: v => formatNumber(Math.round(v)) + '원', higherBetter: false },
              { label: '메타 전환단가', key: 'metaConvCost', format: v => formatNumber(Math.round(v)) + '원', higherBetter: false },
              { label: '인당 매출', key: 'revenuePerPurchase', format: v => formatMoney(v), higherBetter: true, calc: d => d.totalPurchases > 0 ? Math.round(d.revenue / d.totalPurchases) : 0 },
              { label: '무료강의 시청률', key: 'freeClassViewRate', format: v => Number(v).toFixed(2) + '%', higherBetter: true },
            ]

            const selectStyle = {
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              flex: 1,
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath fill=%27%2394a3b8%27 d=%27M6 8L1 3h10z%27/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center'
            }

            return (
              <>
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>⚖️ 대조 <HelpTooltip text={"두 기수의 성과를 나란히 비교합니다.\n좌/우측에서 각각 강사와 기수를 선택하면\n13개 지표를 한눈에 비교할 수 있습니다.\n초록색이 더 좋은 쪽을 의미합니다."} /></h2>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
                  {/* 좌측 선택 */}
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    <select
                      value={compareLeftInstructor}
                      onChange={(e) => {
                        setCompareLeftInstructor(e.target.value)
                        setCompareLeftId(null)
                        // 첫 번째 기수 자동 선택
                        const sessions = getSessionsForInstructor(e.target.value)
                        if (sessions.length > 0) setCompareLeftId(sessions[0].name)
                      }}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#1e1e2e' }}>강사 선택</option>
                      {compareInstructors.map(name => (
                        <option key={name} value={name} style={{ background: '#1e1e2e' }}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={compareLeftId || ''}
                      onChange={(e) => setCompareLeftId(e.target.value)}
                      style={selectStyle}
                      disabled={!compareLeftInstructor}
                    >
                      <option value="" style={{ background: '#1e1e2e' }}>기수 선택</option>
                      {leftSessions.map(s => (
                        <option key={s.name} value={s.name} style={{ background: '#1e1e2e' }}>{s.session}</option>
                      ))}
                    </select>
                  </div>

                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#6366f1' }}>VS</span>

                  {/* 우측 선택 */}
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    <select
                      value={compareRightInstructor}
                      onChange={(e) => {
                        setCompareRightInstructor(e.target.value)
                        setCompareRightId(null)
                        // 첫 번째 기수 자동 선택
                        const sessions = getSessionsForInstructor(e.target.value)
                        if (sessions.length > 0) setCompareRightId(sessions[0].name)
                      }}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#1e1e2e' }}>강사 선택</option>
                      {compareInstructors.map(name => (
                        <option key={name} value={name} style={{ background: '#1e1e2e' }}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={compareRightId || ''}
                      onChange={(e) => setCompareRightId(e.target.value)}
                      style={selectStyle}
                      disabled={!compareRightInstructor}
                    >
                      <option value="" style={{ background: '#1e1e2e' }}>기수 선택</option>
                      {rightSessions.map(s => (
                        <option key={s.name} value={s.name} style={{ background: '#1e1e2e' }}>{s.session}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {leftData && rightData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* 헤더 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', gap: '12px', padding: '12px 20px', marginBottom: '4px' }}>
                      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: '700', color: '#6366f1' }}>{leftData.name}</div>
                      <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>항목</div>
                      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: '700', color: '#ec4899' }}>{rightData.name}</div>
                    </div>
                    {COMPARE_ITEMS.map(item => {
                      const lv = item.calc ? item.calc(leftData) : leftData[item.key]
                      const rv = item.calc ? item.calc(rightData) : rightData[item.key]
                      const lNum = parseFloat(lv) || 0
                      const rNum = parseFloat(rv) || 0
                      let leftWin = item.higherBetter ? lNum > rNum : lNum < rNum
                      let rightWin = item.higherBetter ? rNum > lNum : rNum < lNum
                      if (lNum === rNum) { leftWin = false; rightWin = false }
                      return (
                        <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', gap: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '14px 20px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'center', fontSize: '17px', fontWeight: '700', color: leftWin ? '#10b981' : '#94a3b8' }}>
                            {leftWin && <span style={{ fontSize: '12px', marginRight: '4px' }}>▲</span>}
                            {item.format(lv)}
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{item.label}</div>
                          <div style={{ textAlign: 'center', fontSize: '17px', fontWeight: '700', color: rightWin ? '#10b981' : '#94a3b8' }}>
                            {rightWin && <span style={{ fontSize: '12px', marginRight: '4px' }}>▲</span>}
                            {item.format(rv)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚖️</div>
                    <p style={{ fontSize: '15px' }}>양쪽 강사/기수를 선택하면 비교 데이터가 표시됩니다</p>
                  </div>
                )}
              </>
            )
          })()}

          {/* 툴 탭 */}
          {currentTab === 'tools' && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>🛠️ 업무 툴 <HelpTooltip text={"데이터 처리 자동화 도구 모음입니다.\n각 도구 버튼을 클릭하여 사용하세요.\nExcel/CSV 파일을 업로드하면\n자동으로 매칭/정리가 진행됩니다."} /></h2>

              {/* 툴 서브탭 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                  { id: 'order-sync', icon: '📦', label: '주문 동기화' },
                  { id: 'crm', icon: '📋', label: 'CRM 정리' },
                  { id: 'kakao', icon: '💬', label: '카톡 매칭' },
                  { id: 'youtube', icon: '📡', label: '유튜브 채팅 로그 수집' },
                  { id: 'shoong', icon: '💌', label: '슝 알림톡 발송' }
                ].filter(tool => !tool.requiresPermission || permissions[tool.requiresPermission]).map(tool => (
                  <button
                    key={tool.id}
                    onClick={async () => {
                      setCurrentTool(tool.id)
                      resetToolState()
                      if (tool.id === 'order-sync') {
                        resetOrderSync()
                        if (orderSyncTabs.length === 0) loadOrderSyncTabs(orderSyncYear)
                        if (orderSyncInstructors.length === 0) loadOrderSyncInstructors()
                      }
                      if (tool.id === 'youtube') {
                        try {
                          const res = await fetch('/api/tools/youtube-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'list' })
                          })
                          const data = await res.json()
                          if (data.success) setYtSessions(data.sessions)
                        } catch {}
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      background: currentTool === tool.id ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                      border: currentTool === tool.id ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{tool.icon}</span>
                    {tool.label}
                  </button>
                ))}
              </div>

              {/* CRM 정리 툴 */}
              {currentTool === 'crm' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>📋 CRM 데이터 정리 <HelpTooltip text={"CRM 데이터에서 중복을 자동 제거하고\n연락처 형식(010-XXXX-XXXX)을\n통일합니다.\n여러 파일을 한번에 업로드할 수 있으며\n정리된 결과를 Excel로 다운로드합니다."} /></h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>CRM 데이터의 중복을 제거하고 연락처 형식을 통일합니다.</p>
                  </div>

                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!crmDragging) setCrmDragging(true) }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCrmDragging(true) }}
                    onDragLeave={(e) => {
                      e.preventDefault(); e.stopPropagation()
                      if (e.currentTarget.contains(e.relatedTarget)) return
                      setCrmDragging(false)
                    }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation()
                      setCrmDragging(false)
                      const dropped = Array.from(e.dataTransfer.files || [])
                      const allowed = dropped.filter(f => /\.(xlsx|xls|csv)$/i.test(f.name))
                      if (allowed.length === 0) {
                        alert('Excel 또는 CSV 파일만 업로드 가능합니다.')
                        return
                      }
                      setToolFiles1(prev => [...prev, ...allowed])
                    }}
                    style={{
                      padding: '20px',
                      background: crmDragging ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.1)',
                      borderRadius: '12px',
                      border: crmDragging ? '2px dashed #6366f1' : '2px dashed rgba(99,102,241,0.3)',
                      textAlign: 'center',
                      marginBottom: '20px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{crmDragging ? '📥' : '📊'}</div>
                    <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                      {crmDragging ? '여기에 파일을 놓으세요' : 'CRM 데이터'}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>파일을 드래그하거나 버튼으로 선택 (Excel/CSV, 여러개 가능)</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      multiple
                      onChange={(e) => setToolFiles1(Array.from(e.target.files))}
                      style={{ display: 'none' }}
                      id="crm-file"
                    />
                    <label
                      htmlFor="crm-file"
                      style={{
                        display: 'inline-block',
                        padding: '8px 16px',
                        background: 'rgba(99,102,241,0.3)',
                        borderRadius: '8px',
                        color: '#a5b4fc',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      파일 선택
                    </label>
                    {toolFiles1.length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981', maxHeight: '80px', overflow: 'auto' }}>
                        {toolFiles1.map((f, i) => <div key={i}>✓ {f.name}</div>)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      if (toolFiles1.length === 0) {
                        alert('파일을 선택해주세요.')
                        return
                      }
                      setToolProcessing(true)
                      setToolLog(['처리 시작...'])

                      try {
                        const logs = [`${toolFiles1.length}개 파일 업로드됨`]
                        let allData = []
                        const allHeaderSet = new Set()

                        const normalizePhone = (phone) => {
                          if (!phone) return ''
                          const cleaned = String(phone).replace(/[^0-9]/g, '')
                          if (cleaned.length === 11 && cleaned.startsWith('010'))
                            return cleaned.slice(0,3)+'-'+cleaned.slice(3,7)+'-'+cleaned.slice(7)
                          if (cleaned.length === 10 && cleaned.startsWith('10'))
                            return '0'+cleaned.slice(0,2)+'-'+cleaned.slice(2,6)+'-'+cleaned.slice(6)
                          if (cleaned.length >= 9 && cleaned.length <= 10) {
                            if (cleaned.startsWith('02')) {
                              return cleaned.length === 9
                                ? '02-'+cleaned.slice(2,5)+'-'+cleaned.slice(5)
                                : '02-'+cleaned.slice(2,6)+'-'+cleaned.slice(6)
                            } else {
                              return cleaned.length === 10
                                ? cleaned.slice(0,3)+'-'+cleaned.slice(3,6)+'-'+cleaned.slice(6)
                                : cleaned.slice(0,3)+'-'+cleaned.slice(3,7)+'-'+cleaned.slice(7)
                            }
                          }
                          return cleaned
                        }

                        const phonePatterns = ['연락처','전화번호','전화','phone','핸드폰','휴대폰','휴대전화','연락번호','mobile','cell']
                        const findPhoneCol = (headers) => {
                          for (const h of headers)
                            for (const p of phonePatterns)
                              if (String(h).toLowerCase().includes(p.toLowerCase())) return h
                          return null
                        }

                        const XLSX = await import('xlsx')
                        for (const file of toolFiles1) {
                          const buffer = await file.arrayBuffer()
                          const wb = XLSX.read(buffer)
                          const sheet = wb.Sheets[wb.SheetNames[0]]
                          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
                          const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
                          if (rawRows.length > 0)
                            for (const h of rawRows[0]) if (h) allHeaderSet.add(String(h))
                          allData = allData.concat(data)
                          logs.push(`파일 "${file.name}": ${data.length}건`)
                        }

                        const originalCount = allData.length
                        logs.push(`총 원본 레코드 수: ${originalCount}`)

                        const headers = allHeaderSet.size > 0 ? Array.from(allHeaderSet) : Object.keys(allData[0] || {})
                        let phoneCol = findPhoneCol(headers)
                        if (!phoneCol && headers.length >= 4) {
                          phoneCol = headers[3]
                          logs.push(`전화번호 컬럼 자동 감지 실패 → D열(${phoneCol})을 연락처로 사용`)
                        } else {
                          logs.push(`전화번호 컬럼: ${phoneCol || '(자동 감지 실패)'}`)
                        }

                        const seen = new Set()
                        const cleanedData = []
                        let duplicatesRemoved = 0
                        let phoneFormatted = 0
                        let emptyPhoneRemoved = 0

                        for (const row of allData) {
                          if (phoneCol) {
                            const phoneVal = row[phoneCol]
                            if (phoneVal === undefined || phoneVal === null || String(phoneVal).trim() === '') {
                              emptyPhoneRemoved++
                              continue
                            }
                          }
                          if (phoneCol && row[phoneCol]) {
                            const original = row[phoneCol]
                            const normalized = normalizePhone(row[phoneCol])
                            row[phoneCol] = normalized
                            if (original !== normalized) phoneFormatted++
                            const key = normalized.replace(/-/g, '')
                            if (seen.has(key)) { duplicatesRemoved++; continue }
                            seen.add(key)
                          }
                          for (const key of Object.keys(row))
                            if (typeof row[key] === 'string') row[key] = row[key].trim()
                          cleanedData.push(row)
                        }

                        logs.push(`연락처 공백 제거: ${emptyPhoneRemoved}건`)
                        logs.push(`중복 제거: ${duplicatesRemoved}건`)
                        logs.push(`전화번호 형식 변경: ${phoneFormatted}건`)
                        logs.push(`정리 후 레코드 수: ${cleanedData.length}`)

                        const newWb = XLSX.utils.book_new()
                        const newWs = XLSX.utils.json_to_sheet(cleanedData)
                        XLSX.utils.book_append_sheet(newWb, newWs, '정리된데이터')
                        const excelArray = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' })
                        const blob = new Blob([excelArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                        const downloadUrl = URL.createObjectURL(blob)

                        setToolResult({
                          success: true,
                          originalCount,
                          cleanedCount: cleanedData.length,
                          duplicatesRemoved,
                          phoneFormatted,
                          downloadUrl
                        })
                        setToolLog(logs)
                      } catch (err) {
                        setToolLog(['오류: ' + err.message])
                      }
                      setToolProcessing(false)
                    }}
                    disabled={toolProcessing || toolFiles1.length === 0}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: toolProcessing ? '#4c4c6d' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: toolProcessing ? 'wait' : 'pointer'
                    }}
                  >
                    {toolProcessing ? '처리 중...' : '🧹 정리 시작'}
                  </button>

                  {/* 로그 출력 */}
                  {toolLog.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                      maxHeight: '150px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      {toolLog.map((log, i) => (
                        <div key={i} style={{ color: log.startsWith('오류') ? '#f87171' : '#94a3b8', marginBottom: '4px' }}>{log}</div>
                      ))}
                    </div>
                  )}

                  {/* 결과 */}
                  {toolResult && toolResult.success && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>{toolResult.originalCount}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>원본 레코드</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#f87171' }}>{toolResult.duplicatesRemoved}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>중복 제거</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{toolResult.cleanedCount}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>정리 후</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => {
                            const link = document.createElement('a')
                            link.href = toolResult.downloadUrl
                            link.download = 'cleaned_crm.xlsx'
                            link.click()
                          }}
                          style={{
                            flex: 1,
                            padding: '10px 20px',
                            background: 'rgba(16,185,129,0.2)',
                            border: '1px solid rgba(16,185,129,0.4)',
                            borderRadius: '8px',
                            color: '#10b981',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          📥 정리된 데이터 다운로드
                        </button>
                        <button
                          onClick={resetToolState}
                          style={{
                            padding: '10px 20px',
                            background: 'rgba(99,102,241,0.2)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: '8px',
                            color: '#a5b4fc',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          🔄 초기화
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 카톡 매칭 툴 (시트 직접 기입) */}
              {currentTool === 'kakao' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>💬 카카오톡 입장자 매칭 <HelpTooltip text={"카톡 오픈채팅 입장 로그(TXT)를 업로드하고\n결제자 시트의 원본 탭을 선택하면\n시트의 이름 컬럼을 기준으로 매칭합니다.\n\n매칭 미리보기 후 확정을 누르면\n매칭된 행의 입장여부 컬럼(없으면 K열)에\n자동으로 'O'를 기입합니다.\n\n동명이인은 안전을 위해 시트에 쓰지 않고\n별도로 표시됩니다."} /></h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>카톡 입장 로그와 결제자 시트를 매칭하여, 매칭된 사람의 K열(입장여부)에 O를 기입합니다.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* 카톡 로그 파일 */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(250,204,21,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(250,204,21,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>카톡 입장 로그</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>오픈채팅 입장 내역 (TXT, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".txt"
                        multiple
                        onChange={(e) => setToolFiles1(Array.from(e.target.files))}
                        style={{ display: 'none' }}
                        id="kakao-file1"
                      />
                      <label
                        htmlFor="kakao-file1"
                        style={{
                          display: 'inline-block',
                          padding: '8px 16px',
                          background: 'rgba(250,204,21,0.3)',
                          borderRadius: '8px',
                          color: '#fcd34d',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        파일 선택
                      </label>
                      {toolFiles1.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981', maxHeight: '80px', overflow: 'auto' }}>
                          {toolFiles1.map((f, i) => <div key={i}>✓ {f.name}</div>)}
                        </div>
                      )}
                    </div>

                    {/* 결제자 시트 탭 선택 */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(168,85,247,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>결제자 시트 (원본 탭)</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>매칭 결과를 시트의 K열에 기입합니다</p>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
                        <select
                          value={kakaoYear}
                          onChange={(e) => {
                            setKakaoYear(e.target.value)
                            setKakaoSelectedTab(null)
                            setKakaoPreview(null)
                            setKakaoCommitResult(null)
                            loadKakaoTabs(e.target.value)
                          }}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(168,85,247,0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px'
                          }}
                        >
                          <option value="26">2026년</option>
                          <option value="25">2025년</option>
                        </select>
                        <button
                          onClick={() => loadKakaoTabs(kakaoYear)}
                          disabled={kakaoTabsLoading}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(168,85,247,0.3)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#c4b5fd',
                            fontSize: '13px',
                            cursor: kakaoTabsLoading ? 'wait' : 'pointer'
                          }}
                        >
                          {kakaoTabsLoading ? '불러오는 중...' : '🔄 새로고침'}
                        </button>
                      </div>

                      {kakaoTabs.length > 0 && (
                        <select
                          value={kakaoSelectedTab?.raw || ''}
                          onChange={(e) => {
                            const tab = kakaoTabs.find(t => t.raw === e.target.value) || null
                            setKakaoSelectedTab(tab)
                            setKakaoPreview(null)
                            setKakaoCommitResult(null)
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(168,85,247,0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px'
                          }}
                        >
                          <option value="">— 탭을 선택하세요 ({kakaoTabs.length}개) —</option>
                          {kakaoTabs.map(t => (
                            <option key={t.raw} value={t.raw}>
                              {t.displayDate} · {t.instructor} {t.cohort} ({t.raw})
                            </option>
                          ))}
                        </select>
                      )}
                      {kakaoSelectedTab && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981' }}>
                          ✓ {kakaoSelectedTab.raw}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (toolFiles1.length === 0) {
                        alert('카톡 로그 파일을 선택해주세요.')
                        return
                      }
                      if (!kakaoSelectedTab) {
                        alert('결제자 시트의 원본 탭을 선택해주세요.')
                        return
                      }
                      setToolProcessing(true)
                      setKakaoPreview(null)
                      setKakaoCommitResult(null)
                      setToolLog(['매칭 미리보기 시작...'])

                      const formData = new FormData()
                      toolFiles1.forEach(f => formData.append('kakaoLogs', f))
                      formData.append('year', kakaoYear)
                      formData.append('tabName', kakaoSelectedTab.raw)

                      try {
                        const token = getAuthToken()
                        const res = await fetch('/api/tools/kakao-match-sheet', {
                          method: 'POST',
                          headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                          body: formData
                        })
                        const data = await res.json()
                        if (data.success) {
                          setKakaoPreview(data)
                          setToolLog(data.logs || ['미리보기 완료'])
                        } else {
                          setToolLog(['오류: ' + (data.error || '알 수 없는 오류')])
                        }
                      } catch (err) {
                        setToolLog(['오류: ' + err.message])
                      }
                      setToolProcessing(false)
                    }}
                    disabled={toolProcessing || toolFiles1.length === 0 || !kakaoSelectedTab}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: toolProcessing ? '#4c4c6d' : 'linear-gradient(135deg, #facc15, #f59e0b)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#000',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: toolProcessing ? 'wait' : 'pointer'
                    }}
                  >
                    {toolProcessing ? '처리 중...' : '🔍 매칭 미리보기'}
                  </button>

                  {/* 로그 출력 */}
                  {toolLog.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                      maxHeight: '150px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      {toolLog.map((log, i) => (
                        <div key={i} style={{ color: log.startsWith('오류') ? '#f87171' : '#94a3b8', marginBottom: '4px' }}>{log}</div>
                      ))}
                    </div>
                  )}

                  {/* 미리보기 결과 */}
                  {kakaoPreview && kakaoPreview.success && !kakaoCommitResult && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
                      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#cbd5e1' }}>
                        대상 시트: <b>{kakaoPreview.tabName}</b> · 입장여부 컬럼: <b>{kakaoPreview.entryColLetter}</b>
                        {kakaoPreview.entryColHeader ? ` ("${kakaoPreview.entryColHeader}")` : ' (헤더 없음, K열 사용)'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(16,185,129,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#10b981' }}>{kakaoPreview.matched.length}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>기입 대상</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(148,163,184,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#cbd5e1' }}>{kakaoPreview.skipped.length}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>건너뜀(이미 값)</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(251,191,36,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#fbbf24' }}>{kakaoPreview.ambiguous.length}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>동명이인</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(248,113,113,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#f87171' }}>{kakaoPreview.unmatched.length}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>미매칭</div>
                        </div>
                      </div>

                      {/* 동명이인 알림 */}
                      {kakaoPreview.ambiguous.length > 0 && (
                        <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.3)' }}>
                          <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: '600', marginBottom: '6px' }}>
                            ⚠️ 동명이인 {kakaoPreview.ambiguous.length}명은 시트에 기입하지 않습니다 (수동 확인 필요)
                          </div>
                          <div style={{ fontSize: '12px', color: '#cbd5e1', maxHeight: '120px', overflow: 'auto' }}>
                            {kakaoPreview.ambiguous.map((a, i) => (
                              <div key={i} style={{ marginBottom: '4px' }}>
                                · {a.kakaoName} → 시트 행 {a.candidates.map(c => c.sheetRow).join(', ')}번에 동일 이름
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 미매칭 명단 */}
                      {kakaoPreview.unmatched.length > 0 && (
                        <details style={{ marginBottom: '12px', fontSize: '12px', color: '#94a3b8' }}>
                          <summary style={{ cursor: 'pointer', color: '#f87171' }}>
                            미매칭 {kakaoPreview.unmatched.length}명 펼쳐보기
                          </summary>
                          <div style={{ marginTop: '6px', maxHeight: '120px', overflow: 'auto', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                            {kakaoPreview.unmatched.map((u, i) => (
                              <span key={i} style={{ marginRight: '8px' }}>{u.kakaoName}</span>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 건너뜀 명단 */}
                      {kakaoPreview.skipped.length > 0 && (
                        <details style={{ marginBottom: '12px', fontSize: '12px', color: '#94a3b8' }}>
                          <summary style={{ cursor: 'pointer', color: '#cbd5e1' }}>
                            이미 값이 있어 건너뛴 {kakaoPreview.skipped.length}명
                          </summary>
                          <div style={{ marginTop: '6px', maxHeight: '120px', overflow: 'auto', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                            {kakaoPreview.skipped.map((s, i) => (
                              <div key={i}>· {s.sheetName} (행 {s.sheetRow}, 현재값: "{s.currentEntry}")</div>
                            ))}
                          </div>
                        </details>
                      )}

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={async () => {
                            if (kakaoPreview.matched.length === 0) {
                              alert('기입할 행이 없습니다.')
                              return
                            }
                            if (!confirm(`${kakaoPreview.matched.length}개 행의 ${kakaoPreview.entryColLetter}열에 'O'를 기입합니다. 계속할까요?`)) return

                            setKakaoCommitting(true)
                            try {
                              const res = await fetch('/api/tools/kakao-match-sheet', {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({
                                  year: kakaoPreview.year,
                                  tabName: kakaoPreview.tabName,
                                  entryColIndex: kakaoPreview.entryColIndex,
                                  rows: kakaoPreview.matched.map(m => m.sheetRow)
                                })
                              })
                              const data = await res.json()
                              if (data.success) {
                                setKakaoCommitResult(data)
                                setToolLog(prev => [...prev, `✅ 시트 ${data.colLetter}열에 ${data.updatedCells}개 셀 기입 완료`])
                              } else {
                                setToolLog(prev => [...prev, '오류: ' + (data.error || '기입 실패')])
                              }
                            } catch (err) {
                              setToolLog(prev => [...prev, '오류: ' + err.message])
                            }
                            setKakaoCommitting(false)
                          }}
                          disabled={kakaoCommitting || kakaoPreview.matched.length === 0}
                          style={{
                            flex: 1,
                            padding: '12px 20px',
                            background: kakaoCommitting ? '#4c4c6d' : 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: (kakaoCommitting || kakaoPreview.matched.length === 0) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {kakaoCommitting ? '기입 중...' : `✏️ 시트에 'O' 기입 (${kakaoPreview.matched.length}건)`}
                        </button>
                        <button
                          onClick={resetToolState}
                          style={{
                            padding: '12px 20px',
                            background: 'rgba(99,102,241,0.2)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: '8px',
                            color: '#a5b4fc',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          🔄 초기화
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 기입 완료 결과 */}
                  {kakaoCommitResult && kakaoCommitResult.success && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(16,185,129,0.15)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.4)' }}>
                      <div style={{ fontSize: '14px', color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>
                        ✅ 기입 완료
                      </div>
                      <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '12px' }}>
                        시트 <b>{kakaoPreview?.tabName}</b>의 <b>{kakaoCommitResult.colLetter}열</b>에 <b>{kakaoCommitResult.updatedCells}</b>개 셀이 'O'로 업데이트되었습니다.
                      </div>
                      <button
                        onClick={resetToolState}
                        style={{
                          padding: '10px 20px',
                          background: 'rgba(99,102,241,0.2)',
                          border: '1px solid rgba(99,102,241,0.4)',
                          borderRadius: '8px',
                          color: '#a5b4fc',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 초기화
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 주문 자동 동기화 툴 */}
              {currentTool === 'order-sync' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📦 주문 내역 → 결제자 시트 동기화
                      <HelpTooltip text={"두 가지 방식 지원:\n\n[자동 - nlab DB 직접 연동] (권장)\n강사를 드롭다운에서 선택만 하면\nnlab 운영 DB(Supabase)에서 토스 결제 내역을\n바로 가져와 결제자 시트에 추가합니다.\n\n[수동 - CSV 업로드]\nnlab.kr 어드민에서 전체 주문 내역 CSV를\n직접 받아 업로드하는 기존 방식.\n\n둘 다 자동으로 환불 건을 제외하고\n시트에 이미 있는 전화번호와 비교해\n신규 주문만 추가합니다."} />
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>강사 선택만으로 nlab DB의 결제 내역을 결제자 시트에 자동 동기화합니다. (CSV 업로드 모드도 지원)</p>
                  </div>

                  {/* 모드 토글 */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    {[
                      { id: 'supabase', label: '🤖 자동 (nlab DB)', desc: '강사 선택만으로 즉시 동기화' },
                      { id: 'csv', label: '📁 수동 (CSV 업로드)', desc: 'nlab 어드민 CSV 직접 업로드' }
                    ].map(m => {
                      const active = orderSyncMode === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setOrderSyncMode(m.id)
                            setOrderSyncPreview(null)
                            setOrderSyncCommitResult(null)
                            setOrderSyncLog([])
                          }}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            background: active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            color: active ? '#fff' : '#94a3b8',
                            fontSize: '13px',
                            fontWeight: active ? '600' : '500',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: '600' }}>{m.label}</div>
                          <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>{m.desc}</div>
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* 좌측: 모드별 입력 */}
                    {orderSyncMode === 'supabase' ? (
                      <div style={{
                        padding: '20px',
                        background: 'rgba(99,102,241,0.1)',
                        borderRadius: '12px',
                        border: '2px dashed rgba(99,102,241,0.3)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
                        <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>강사 선택</p>
                        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>조회 기간 내 결제가 있는 강사만 (최대 31일)</p>

                        {/* 날짜 입력 행 */}
                        <div style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '10px',
                          flexWrap: 'wrap'
                        }}>
                          <input
                            type="date"
                            value={orderSyncDateFrom}
                            onChange={(e) => setOrderSyncDateFrom(e.target.value)}
                            style={{
                              padding: '9px 12px',
                              background: 'rgba(0,0,0,0.35)',
                              border: '1px solid rgba(99,102,241,0.4)',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '13px',
                              colorScheme: 'dark',
                              minWidth: '140px'
                            }}
                          />
                          <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500' }}>~</span>
                          <input
                            type="date"
                            value={orderSyncDateTo}
                            onChange={(e) => setOrderSyncDateTo(e.target.value)}
                            style={{
                              padding: '9px 12px',
                              background: 'rgba(0,0,0,0.35)',
                              border: '1px solid rgba(99,102,241,0.4)',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '13px',
                              colorScheme: 'dark',
                              minWidth: '140px'
                            }}
                          />
                        </div>

                        {/* 빠른 기간 프리셋 + 조회 */}
                        <div style={{
                          display: 'flex',
                          gap: '6px',
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: '10px',
                          flexWrap: 'wrap'
                        }}>
                          {[
                            { label: '📅 오늘', days: 30, primary: true },
                            { label: '7일', days: 7 },
                            { label: '14일', days: 14 },
                            { label: '30일', days: 30 }
                          ].map(p => (
                            <button
                              key={p.label}
                              onClick={() => {
                                const to = new Date()
                                const from = new Date()
                                from.setDate(from.getDate() - p.days)
                                const fromStr = from.toISOString().slice(0, 10)
                                const toStr = to.toISOString().slice(0, 10)
                                setOrderSyncDateFrom(fromStr)
                                setOrderSyncDateTo(toStr)
                                setOrderSyncSelectedInstructor('')
                                setOrderSyncPreview(null)
                                setOrderSyncCommitResult(null)
                                loadOrderSyncInstructors(fromStr, toStr)
                              }}
                              disabled={orderSyncInstructorsLoading}
                              style={{
                                padding: p.primary ? '7px 14px' : '6px 10px',
                                background: p.primary
                                  ? 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))'
                                  : 'rgba(99,102,241,0.15)',
                                border: p.primary
                                  ? '1px solid rgba(139,92,246,0.6)'
                                  : '1px solid rgba(99,102,241,0.3)',
                                borderRadius: '8px',
                                color: p.primary ? '#fff' : '#c7d2fe',
                                fontSize: '12px',
                                fontWeight: p.primary ? '600' : '500',
                                cursor: orderSyncInstructorsLoading ? 'wait' : 'pointer'
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setOrderSyncSelectedInstructor('')
                              setOrderSyncPreview(null)
                              setOrderSyncCommitResult(null)
                              loadOrderSyncInstructors()
                            }}
                            disabled={orderSyncInstructorsLoading}
                            style={{
                              padding: '7px 16px',
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: orderSyncInstructorsLoading ? 'wait' : 'pointer',
                              marginLeft: '4px'
                            }}
                          >
                            {orderSyncInstructorsLoading ? '조회 중...' : '🔍 조회'}
                          </button>
                        </div>
                        {orderSyncRangeError && (
                          <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '8px' }}>
                            ⚠️ {orderSyncRangeError}
                          </div>
                        )}

                        <select
                          value={orderSyncSelectedInstructor}
                          onChange={(e) => {
                            setOrderSyncSelectedInstructor(e.target.value)
                            setOrderSyncPreview(null)
                            setOrderSyncCommitResult(null)
                          }}
                          disabled={orderSyncInstructors.length === 0}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px',
                            cursor: orderSyncInstructors.length === 0 ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <option value="">
                            {orderSyncInstructors.length === 0
                              ? '— 먼저 조회 버튼을 눌러주세요 —'
                              : `— 강사를 선택하세요 (${orderSyncInstructors.length}명) —`}
                          </option>
                          {orderSyncInstructors.map(t => (
                            <option key={t.name} value={t.name}>
                              {t.name} · {t.orderCount}건{t.courseCount > 1 ? ` (${t.courseCount}강의)` : ''}
                            </option>
                          ))}
                        </select>
                        {orderSyncSelectedInstructor && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981' }}>
                            ✓ 강사: {orderSyncSelectedInstructor}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        padding: '20px',
                        background: 'rgba(34,197,94,0.1)',
                        borderRadius: '12px',
                        border: '2px dashed rgba(34,197,94,0.3)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📥</div>
                        <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>주문 CSV 파일</p>
                        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>nlab.kr 전체 주문 내역 CSV (1개)</p>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(e) => {
                            setOrderSyncFile(e.target.files?.[0] || null)
                            setOrderSyncPreview(null)
                            setOrderSyncCommitResult(null)
                          }}
                          style={{ display: 'none' }}
                          id="order-sync-file"
                        />
                        <label
                          htmlFor="order-sync-file"
                          style={{
                            display: 'inline-block',
                            padding: '8px 16px',
                            background: 'rgba(34,197,94,0.3)',
                            borderRadius: '8px',
                            color: '#86efac',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          파일 선택
                        </label>
                        {orderSyncFile && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981' }}>
                            ✓ {orderSyncFile.name} ({(orderSyncFile.size / 1024).toFixed(1)}KB)
                          </div>
                        )}
                      </div>
                    )}

                    {/* 결제자 시트 탭 선택 */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(168,85,247,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>결제자 시트 (대상 탭)</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>신규 주문이 추가될 강사 탭</p>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
                        <select
                          value={orderSyncYear}
                          onChange={(e) => {
                            setOrderSyncYear(e.target.value)
                            setOrderSyncSelectedTab(null)
                            setOrderSyncPreview(null)
                            setOrderSyncCommitResult(null)
                            loadOrderSyncTabs(e.target.value)
                          }}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(168,85,247,0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px'
                          }}
                        >
                          <option value="26">2026년</option>
                          <option value="25">2025년</option>
                        </select>
                        <button
                          onClick={() => loadOrderSyncTabs(orderSyncYear)}
                          disabled={orderSyncTabsLoading}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(168,85,247,0.3)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#c4b5fd',
                            fontSize: '13px',
                            cursor: orderSyncTabsLoading ? 'wait' : 'pointer'
                          }}
                        >
                          {orderSyncTabsLoading ? '불러오는 중...' : '🔄 새로고침'}
                        </button>
                      </div>

                      {orderSyncTabs.length > 0 && (
                        <select
                          value={orderSyncSelectedTab?.raw || ''}
                          onChange={(e) => {
                            const tab = orderSyncTabs.find(t => t.raw === e.target.value) || null
                            setOrderSyncSelectedTab(tab)
                            setOrderSyncPreview(null)
                            setOrderSyncCommitResult(null)
                          }}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(168,85,247,0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px'
                          }}
                        >
                          <option value="">— 탭을 선택하세요 ({orderSyncTabs.length}개) —</option>
                          {orderSyncTabs.map(t => {
                            const mapping = payerTabMappings[`${orderSyncYear}_${t.raw}`]
                            const label = mapping ? `${t.displayDate} · ${mapping.instructor} ${mapping.cohort || t.cohort}` : `${t.displayDate} · ${t.instructor} ${t.cohort}`
                            return <option key={t.raw} value={t.raw}>{label}</option>
                          })}
                        </select>
                      )}

                      {orderSyncSelectedTab && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981' }}>
                          ✓ {orderSyncSelectedTab.raw}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 미리보기 버튼 */}
                  {(() => {
                    const sourceReady = orderSyncMode === 'supabase'
                      ? !!orderSyncSelectedInstructor
                      : !!orderSyncFile
                    const tabReady = !!orderSyncSelectedTab
                    const ready = sourceReady && tabReady
                    return (
                      <button
                        onClick={async () => {
                          if (orderSyncMode === 'supabase' && !orderSyncSelectedInstructor) {
                            alert('강사를 선택해주세요.'); return
                          }
                          if (orderSyncMode === 'csv' && !orderSyncFile) {
                            alert('CSV 파일을 선택해주세요.'); return
                          }
                          if (!orderSyncSelectedTab) { alert('결제자 시트 탭을 선택해주세요.'); return }
                          setOrderSyncProcessing(true)
                          setOrderSyncLog(orderSyncMode === 'supabase'
                            ? [`nlab DB에서 강사 "${orderSyncSelectedInstructor}" 결제 내역 조회 중...`]
                            : ['CSV 분석 + 시트 비교 중...'])
                          setOrderSyncCommitResult(null)

                          try {
                            const token = getAuthToken()
                            let res
                            if (orderSyncMode === 'supabase') {
                              res = await fetch('/api/tools/order-sync', {
                                method: 'POST',
                                headers: {
                                  'Authorization': token ? `Bearer ${token}` : '',
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                  instructor: orderSyncSelectedInstructor,
                                  year: orderSyncYear,
                                  tabName: orderSyncSelectedTab.raw,
                                  from: orderSyncDateFrom,
                                  to: orderSyncDateTo
                                })
                              })
                            } else {
                              const formData = new FormData()
                              formData.append('orderFile', orderSyncFile)
                              formData.append('year', orderSyncYear)
                              formData.append('tabName', orderSyncSelectedTab.raw)
                              res = await fetch('/api/tools/order-sync', {
                                method: 'POST',
                                headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                                body: formData
                              })
                            }
                            const data = await res.json()
                            if (data.success) {
                              setOrderSyncPreview(data)
                              setOrderSyncLog(data.logs || ['미리보기 완료'])
                            } else {
                              setOrderSyncPreview(null)
                              setOrderSyncLog(['오류: ' + (data.error || '알 수 없음')])
                            }
                          } catch (err) {
                            setOrderSyncLog(['오류: ' + err.message])
                          }
                          setOrderSyncProcessing(false)
                        }}
                        disabled={orderSyncProcessing || !ready}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: orderSyncProcessing ? '#4c4c6d' : !ready ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          border: 'none',
                          borderRadius: '10px',
                          color: !ready ? '#64748b' : '#fff',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: orderSyncProcessing ? 'wait' : !ready ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {orderSyncProcessing
                          ? '미리보기 생성 중...'
                          : orderSyncMode === 'supabase'
                            ? '🤖 nlab DB에서 가져오기'
                            : '🔍 미리보기'}
                      </button>
                    )
                  })()}

                  {/* 로그 */}
                  {orderSyncLog.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                      maxHeight: '160px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      {orderSyncLog.map((log, i) => (
                        <div key={i} style={{ color: log.startsWith('오류') ? '#f87171' : '#94a3b8', marginBottom: '4px' }}>{log}</div>
                      ))}
                    </div>
                  )}

                  {/* 미리보기 결과 */}
                  {orderSyncPreview && orderSyncPreview.success && !orderSyncCommitResult && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.3)' }}>
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                        대상 시트: <b style={{ color: '#cbd5e1' }}>{orderSyncPreview.tabName}</b>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {[
                          { label: '신규 추가', value: orderSyncPreview.stats.newCount, color: '#10b981' },
                          { label: '시트 중복', value: orderSyncPreview.stats.duplicates, color: '#fbbf24' },
                          { label: '환불 제외', value: orderSyncPreview.stats.refunded, color: '#f87171' },
                          { label: '연락처 누락 (포함)', value: orderSyncPreview.stats.invalid, color: '#cbd5e1' }
                        ].map((stat, i) => (
                          <div key={i} style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* 신규 행 미리보기 (최대 10건) */}
                      {orderSyncPreview.newOrders.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                            추가될 신규 주문 (상위 10건 미리보기)
                          </div>
                          <div style={{ maxHeight: '240px', overflow: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                              <thead style={{ position: 'sticky', top: 0, background: 'rgba(15,23,42,0.95)' }}>
                                <tr>
                                  {['이름', '전화', '상품명', '결제금액', '상태'].map(h => (
                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {orderSyncPreview.newOrders.slice(0, 10).map((o, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{o.name}</td>
                                    <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{o.phone}</td>
                                    <td style={{ padding: '6px 8px', color: '#cbd5e1', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.product}</td>
                                    <td style={{ padding: '6px 8px', color: '#a5b4fc' }}>{o.amount}</td>
                                    <td style={{ padding: '6px 8px', color: '#10b981' }}>{o.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {orderSyncPreview.newOrders.length > 10 && (
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                              + {orderSyncPreview.newOrders.length - 10}건 더…
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={async () => {
                            if (!orderSyncPreview.previewRows || orderSyncPreview.previewRows.length === 0) {
                              alert('추가할 신규 행이 없습니다.')
                              return
                            }
                            if (!confirm(`결제자 시트에 ${orderSyncPreview.previewRows.length}건의 신규 주문을 추가합니다. 진행할까요?`)) return
                            setOrderSyncCommitting(true)
                            try {
                              const res = await fetch('/api/tools/order-sync', {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({
                                  year: orderSyncYear,
                                  tabName: orderSyncPreview.tabName,
                                  rows: orderSyncPreview.previewRows
                                })
                              })
                              const data = await res.json()
                              if (data.success) {
                                setOrderSyncCommitResult(data)
                                setOrderSyncLog(prev => [...prev, `✅ ${data.appendedRows}건 추가됨 (${data.updatedRange})`])
                              } else {
                                alert('적용 실패: ' + (data.error || '알 수 없음'))
                              }
                            } catch (err) {
                              alert('네트워크 오류: ' + err.message)
                            }
                            setOrderSyncCommitting(false)
                          }}
                          disabled={orderSyncCommitting || orderSyncPreview.stats.newCount === 0}
                          style={{
                            flex: 1,
                            padding: '12px',
                            background: orderSyncCommitting ? '#4c4c6d' : orderSyncPreview.stats.newCount === 0 ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none',
                            borderRadius: '8px',
                            color: orderSyncPreview.stats.newCount === 0 ? '#64748b' : '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: orderSyncCommitting ? 'wait' : orderSyncPreview.stats.newCount === 0 ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {orderSyncCommitting ? '추가 중...' : `✓ 시트에 ${orderSyncPreview.stats.newCount}건 추가`}
                        </button>
                        <button
                          onClick={resetOrderSync}
                          style={{
                            padding: '12px 20px',
                            background: 'rgba(99,102,241,0.2)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: '8px',
                            color: '#a5b4fc',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          🔄 초기화
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 적용 결과 */}
                  {orderSyncCommitResult && orderSyncCommitResult.success && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(16,185,129,0.15)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.4)' }}>
                      <div style={{ fontSize: '14px', color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>
                        ✅ 시트 동기화 완료
                      </div>
                      <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '12px' }}>
                        <b>{orderSyncPreview?.tabName}</b> 탭에 <b>{orderSyncCommitResult.appendedRows}</b>건 추가됨 ({orderSyncCommitResult.updatedRange})
                      </div>
                      <button
                        onClick={resetOrderSync}
                        style={{
                          padding: '10px 20px',
                          background: 'rgba(99,102,241,0.2)',
                          border: '1px solid rgba(99,102,241,0.4)',
                          borderRadius: '8px',
                          color: '#a5b4fc',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 새 파일 동기화
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 유튜브 채팅 수집 툴 */}
              {currentTool === 'youtube' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>📡 유튜브 라이브 채팅 수집기 <HelpTooltip text={"유튜브 라이브 방송의 채팅을\n실시간으로 수집합니다.\n비디오 ID를 입력하고 수집을 시작하세요.\n특정 사용자만 필터링하거나\n세션별로 저장/다운로드할 수 있습니다."} /></h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>유튜브 라이브 채팅을 실시간으로 수집하고 저장합니다.</p>
                  </div>

                  {/* 새 수집 시작 */}
                  <div style={{ marginBottom: '24px', padding: '20px', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: '#fca5a5' }}>🚀 새 수집 시작</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>비디오 ID *</label>
                        <input
                          type="text"
                          value={ytVideoId}
                          onChange={(e) => setYtVideoId(e.target.value)}
                          placeholder="예: dQw4w9WgXcQ"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>세션 이름 (선택)</label>
                        <input
                          type="text"
                          value={ytSessionName}
                          onChange={(e) => setYtSessionName(e.target.value)}
                          placeholder="예: 1월 라이브"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>특정 유저만 수집 (선택)</label>
                      <input
                        type="text"
                        value={ytTargetUser}
                        onChange={(e) => setYtTargetUser(e.target.value)}
                        placeholder="예: 말차굿 (빈칸이면 전체 수집)"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px'
                        }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (!ytVideoId.trim()) {
                          alert('비디오 ID를 입력하세요.')
                          return
                        }
                        setToolProcessing(true)
                        setToolLog(['수집 시작 중...'])
                        try {
                          const res = await fetch('/api/tools/youtube-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'start',
                              videoId: ytVideoId.trim(),
                              targetUser: ytTargetUser.trim() || null,
                              sessionName: ytSessionName.trim() || null
                            })
                          })
                          const data = await res.json()
                          if (data.success) {
                            setYtSessionId(data.session.id)
                            setYtCollecting(true)
                            setYtMessageCount(0)
                            setToolLog(prev => [...prev, '✅ 수집 시작됨!', `세션: ${data.session.session_name}`, '📡 첫 번째 폴링 중...'])

                            // 폴링 함수
                            const doPoll = async () => {
                              try {
                                const pollRes = await fetch('/api/tools/youtube-chat', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'poll', sessionId: data.session.id })
                                })
                                const pollData = await pollRes.json()
                                if (pollData.success) {
                                  if (pollData.stopped) {
                                    clearInterval(pollingRef.current)
                                    pollingRef.current = null
                                    setYtCollecting(false)
                                    setToolLog(prev => [...prev, pollData.message || '수집 종료'])
                                  } else {
                                    setYtMessageCount(pollData.totalMessages)
                                    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                                    if (pollData.logs?.length > 0) {
                                      setToolLog(prev => [...prev, `📡 [${now}] 새 메시지 ${pollData.newMessages}개 수집`, ...pollData.logs])
                                    } else {
                                      setToolLog(prev => [...prev, `📡 [${now}] 폴링 완료 (새 메시지 없음) - 총 ${pollData.totalMessages}개`])
                                    }
                                  }
                                } else if (pollData.quotaExceeded) {
                                  clearInterval(pollingRef.current)
                                  pollingRef.current = null
                                  setYtCollecting(false)
                                  setToolLog(prev => [...prev, '❌ 할당량 초과!'])
                                  alert('⚠️ YouTube API 할당량이 초과되었습니다!\n\n수집이 자동으로 중지됩니다.\n(지금까지 수집된 데이터는 저장되어 있습니다)')
                                }
                              } catch (e) {
                                console.error('Poll error:', e)
                                setToolLog(prev => [...prev, `⚠️ 폴링 오류: ${e.message}`])
                              }
                            }

                            // 즉시 첫 폴링 실행
                            doPoll()

                            // 이후 60초 간격으로 폴링
                            pollingRef.current = setInterval(doPoll, 60000)
                          } else {
                            setToolLog(prev => [...prev, '❌ ' + data.error])
                          }
                        } catch (e) {
                          setToolLog(prev => [...prev, '❌ 오류: ' + e.message])
                        }
                        setToolProcessing(false)
                      }}
                      disabled={toolProcessing || ytCollecting}
                      style={{
                        padding: '12px 24px',
                        background: toolProcessing || ytCollecting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: toolProcessing || ytCollecting ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {toolProcessing ? '처리 중...' : ytCollecting ? '수집 중...' : '🚀 수집 시작'}
                    </button>
                  </div>

                  {/* 수집 중 상태 */}
                  {ytCollecting && ytSessionId && (
                    <div style={{ marginBottom: '24px', padding: '20px', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                          <span style={{ color: '#10b981', fontWeight: '600' }}>수집 중 (60초 간격 폴링)</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '700' }}>{ytMessageCount}개</div>
                          <div style={{ color: '#94a3b8', fontSize: '11px' }}>수집된 채팅</div>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (pollingRef.current) {
                            clearInterval(pollingRef.current)
                            pollingRef.current = null
                          }
                          await fetch('/api/tools/youtube-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'stop', sessionId: ytSessionId })
                          })
                          setYtCollecting(false)
                          setToolLog(prev => [...prev, '⏹️ 수집 중지됨'])
                          // 세션 목록 새로고침
                          const listRes = await fetch('/api/tools/youtube-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'list' })
                          })
                          const listData = await listRes.json()
                          if (listData.success) setYtSessions(listData.sessions)
                        }}
                        style={{
                          padding: '10px 20px',
                          background: 'rgba(239,68,68,0.2)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          borderRadius: '8px',
                          color: '#fca5a5',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        ⏹️ 수집 중지
                      </button>
                    </div>
                  )}

                  {/* 로그 */}
                  {toolLog.length > 0 && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      {toolLog.slice(-50).map((log, i) => (
                        <div key={i} style={{ color: log.startsWith('❌') ? '#f87171' : log.startsWith('✅') ? '#10b981' : '#94a3b8', marginBottom: '4px' }}>{log}</div>
                      ))}
                    </div>
                  )}

                  {/* 저장된 세션 목록 */}
                  <div style={{ padding: '20px', background: 'rgba(99,102,241,0.1)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#a5b4fc' }}>📁 저장된 세션</h4>
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/tools/youtube-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'list' })
                          })
                          const data = await res.json()
                          if (data.success) setYtSessions(data.sessions)
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(99,102,241,0.2)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: '6px',
                          color: '#a5b4fc',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 새로고침
                      </button>
                    </div>

                    {ytSessions.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px' }}>저장된 세션이 없습니다.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflow: 'auto' }}>
                        {ytSessions.map(session => (
                          <div key={session.id} style={{
                            padding: '12px 16px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px'
                          }}>
                            <div
                              style={{ cursor: 'pointer', flex: 1 }}
                              onClick={async () => {
                                // 세션 클릭 시 즉시 모달 열기 (로딩 상태로)
                                setYtViewSession(session)
                                setYtViewMessages([])

                                // DB에서 메시지 먼저 빠르게 가져오기
                                const res = await fetch('/api/tools/youtube-chat', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'messages', sessionId: session.id, limit: 200 })
                                })
                                const data = await res.json()
                                if (data.success) {
                                  setYtViewSession(data.session)
                                  setYtViewMessages(data.messages)
                                }

                                // 수집 중인 세션이면 백그라운드에서 poll + 자동 새로고침
                                if (session.status === 'collecting') {
                                  // 첫 poll은 백그라운드로 (모달 로딩 안 막음)
                                  fetch('/api/tools/youtube-chat', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'poll', sessionId: session.id })
                                  }).then(() => {
                                    // 모달이 이미 닫혔으면 무시
                                    if (!viewPollingRef.current) return
                                    fetch('/api/tools/youtube-chat', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'messages', sessionId: session.id, limit: 200 })
                                    }).then(r => r.json()).then(d => {
                                      if (d.success && viewPollingRef.current) {
                                        setYtViewSession(d.session)
                                        setYtViewMessages(d.messages)
                                      }
                                    })
                                  }).catch(() => {})

                                  viewPollingRef.current = setInterval(async () => {
                                    if (!viewPollingRef.current) return
                                    try {
                                      await fetch('/api/tools/youtube-chat', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'poll', sessionId: session.id })
                                      })
                                      if (!viewPollingRef.current) return
                                      const r = await fetch('/api/tools/youtube-chat', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'messages', sessionId: session.id, limit: 200 })
                                      })
                                      const d = await r.json()
                                      if (d.success && viewPollingRef.current) {
                                        if (d.session.status !== 'collecting') {
                                          clearInterval(viewPollingRef.current)
                                          viewPollingRef.current = null
                                        }
                                        setYtViewSession(d.session)
                                        setYtViewMessages(d.messages)
                                      }
                                    } catch {}
                                  }, 10000)
                                }
                              }}
                            >
                              <div style={{ fontWeight: '600', color: '#a5b4fc', fontSize: '14px', marginBottom: '4px', textDecoration: 'underline' }}>
                                {session.session_name || session.video_title || session.video_id}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                {session.message_count}개 메시지 · {session.status === 'collecting' ? '🟢 수집 중' : session.status === 'stopped' ? '⏹️ 중지됨' : session.status === 'ended' ? '🔴 종료됨' : session.status}
                                {session.target_user && ` · 필터: ${session.target_user}`}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {/* 수집 중인 세션이면 정지 버튼 표시 */}
                              {session.status === 'collecting' && (
                                <button
                                  onClick={async () => {
                                    await fetch('/api/tools/youtube-chat', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'stop', sessionId: session.id })
                                    })
                                    // 세션 목록 새로고침
                                    const listRes = await fetch('/api/tools/youtube-chat', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'list' })
                                    })
                                    const listData = await listRes.json()
                                    if (listData.success) setYtSessions(listData.sessions)
                                    // 채팅 보기 모달 자동 새로고침 중지
                                    if (viewPollingRef.current) {
                                      clearInterval(viewPollingRef.current)
                                      viewPollingRef.current = null
                                    }
                                    // 내가 폴링 중이던 세션이면 폴링도 중지
                                    if (ytSessionId === session.id) {
                                      if (pollingRef.current) {
                                        clearInterval(pollingRef.current)
                                        pollingRef.current = null
                                      }
                                      setYtCollecting(false)
                                      setToolLog(prev => [...prev, '⏹️ 수집 중지됨 (다른 사용자 또는 본인)'])
                                    }
                                  }}
                                  style={{
                                    padding: '6px 10px',
                                    background: 'rgba(250,204,21,0.2)',
                                    border: '1px solid rgba(250,204,21,0.3)',
                                    borderRadius: '6px',
                                    color: '#fcd34d',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  ⏹️ 정지
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  const res = await fetch('/api/tools/youtube-chat', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'download', sessionId: session.id })
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    const link = document.createElement('a')
                                    link.href = data.downloadUrl
                                    link.download = data.filename
                                    link.click()
                                  } else {
                                    alert(data.error)
                                  }
                                }}
                                style={{
                                  padding: '6px 10px',
                                  background: 'rgba(16,185,129,0.2)',
                                  border: '1px solid rgba(16,185,129,0.3)',
                                  borderRadius: '6px',
                                  color: '#10b981',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                📥
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('이 세션을 삭제하시겠습니까?')) return
                                  await fetch('/api/tools/youtube-chat', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'delete', sessionId: session.id })
                                  })
                                  setYtSessions(prev => prev.filter(s => s.id !== session.id))
                                }}
                                style={{
                                  padding: '6px 10px',
                                  background: 'rgba(239,68,68,0.2)',
                                  border: '1px solid rgba(239,68,68,0.3)',
                                  borderRadius: '6px',
                                  color: '#f87171',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 💌 슝(Shoong) 알림톡 발송 — 테스트 / 실전 / 수동 업로드 3섹션 */}
              {currentTool === 'shoong' && (() => {
                const TEST_TPL_VARS = {
                  'start(1)': ['고객명', '유튜브링크', '강좌명', '강사명', '링크명'],
                  'start(2)': ['고객명', '유튜브링크', '강좌명', '강사님', '링크명'],
                  'start(3)': ['고객명', '시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
                }
                const BULK_TPL = {
                  'start(1)': ['유튜브링크', '강좌명', '강사명', '링크명'],
                  'start(2)': ['유튜브링크', '강좌명', '강사님', '링크명'],
                  'start(3)': ['시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
                }
                const PHONE_HEADER_HINTS = ['휴대폰', '휴대전화', '연락처', '전화번호', '폰번호', '핸드폰', 'phone', 'mobile', 'tel', 'hp']
                const NAME_HEADER_HINTS = ['이름', '성명', '고객명', '회원명', '수신자', 'name']
                const detectHeader = (headers, hints) => {
                  for (const h of headers) {
                    const lower = String(h || '').toLowerCase().trim()
                    if (!lower) continue
                    if (hints.some(hint => lower.includes(hint.toLowerCase()))) return h
                  }
                  return null
                }
                const handleManualFile = async (file) => {
                  if (!file) return
                  setShoongManualParseError('')
                  setShoongManualRows([])
                  setShoongManualFileName(file.name)
                  try {
                    const XLSX = await import('xlsx')
                    // DB카트는 .xls 확장자지만 실제 내용은 HTML 테이블.
                    // 파일명에 "디비카트/디비 카트/dbcart" 들어있을 때만 HTML 파싱으로 분기,
                    // 그 외엔 기존 binary xlsx/csv 파싱 그대로 유지.
                    const isDbCart = /디비\s*카트|dbcart|db카트/i.test(file.name)
                    let wb
                    if (isDbCart) {
                      const text = await file.text()
                      wb = XLSX.read(text, { type: 'string' })
                    } else {
                      const buffer = await file.arrayBuffer()
                      wb = XLSX.read(buffer, { type: 'array', codepage: 949 })
                    }
                    const sheet = wb.Sheets[wb.SheetNames[0]]
                    if (!sheet) throw new Error('시트가 비어있습니다.')
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
                    if (rows.length === 0) {
                      setShoongManualParseError('파일에 데이터가 없습니다.')
                      return
                    }
                    const headers = Object.keys(rows[0])
                    const phoneKey = detectHeader(headers, PHONE_HEADER_HINTS)
                    const nameKey = detectHeader(headers, NAME_HEADER_HINTS)
                    if (!phoneKey) {
                      setShoongManualParseError(`전화번호 컬럼을 찾을 수 없습니다. (감지된 헤더: ${headers.join(', ')})`)
                      return
                    }
                    const parsed = rows
                      .map(row => ({
                        name: nameKey ? String(row[nameKey] || '').trim() : '',
                        phone: String(row[phoneKey] || '').trim()
                      }))
                      .filter(r => r.phone)
                    if (parsed.length === 0) {
                      setShoongManualParseError('파싱 후 유효한 행이 없습니다.')
                      return
                    }
                    setShoongManualRows(parsed)
                  } catch (err) {
                    setShoongManualParseError(`파일 파싱 실패: ${err.message}`)
                  }
                }
                const toLocalInputValue = (date) => {
                  const pad = (n) => String(n).padStart(2, '0')
                  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
                }

                const SectionHeader = ({ id, icon, title, subtitle, badge }) => {
                  const open = shoongSectionOpen[id]
                  return (
                    <button
                      type="button"
                      onClick={() => setShoongSectionOpen(s => ({ ...s, [id]: !s[id] }))}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 18px',
                        background: open ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (open ? 'rgba(99,102,241,0.30)' : 'var(--border)'),
                        borderBottom: open ? '1px solid rgba(99,102,241,0.30)' : '1px solid var(--border)',
                        borderRadius: open ? '12px 12px 0 0' : '12px',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>{icon}</span>
                      <span style={{ flex: 1, fontSize: '15px', fontWeight: 600 }}>{title}</span>
                      {badge && (
                        <span style={{
                          padding: '3px 10px',
                          background: 'rgba(99,102,241,0.20)',
                          color: '#c7d2fe',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}>{badge}</span>
                      )}
                      {subtitle && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{subtitle}</span>}
                      <ChevronDown
                        size={16}
                        style={{
                          color: 'var(--text-muted)',
                          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </button>
                  )
                }
                const sectionBodyStyle = {
                  padding: '18px',
                  border: '1px solid rgba(99,102,241,0.30)',
                  borderTop: 'none',
                  borderRadius: '0 0 12px 12px',
                  background: 'rgba(255,255,255,0.02)',
                }

                const testTplCode = shoongForm['channelConfig.templatecode'] || 'start(2)'
                const testTplVars = TEST_TPL_VARS[testTplCode] || []

                const bulkTplVars = BULK_TPL[shoongBulkTplCode] || []
                const now = new Date()
                const minLead = new Date(now.getTime() + 5 * 60 * 1000)
                const reservedDate = shoongBulkReservedAt ? new Date(shoongBulkReservedAt) : null
                const leadMinutes = reservedDate ? Math.round((reservedDate.getTime() - now.getTime()) / 60000) : null
                const tooSoon = reservedDate && leadMinutes < 1 && leadMinutes >= 0
                const inPast = reservedDate && leadMinutes < 0
                const presets = [
                  { label: '+10분', mins: 10 },
                  { label: '+30분', mins: 30 },
                  { label: '+1시간', mins: 60 },
                  { label: '내일 오전 9시', custom: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0); return d } },
                  { label: '내일 오후 6시', custom: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(18,0,0,0); return d } }
                ]

                return (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        💌 슝(Shoong) 알림톡 발송
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.55 }}>
                        API 키·발신프로필키는 서버 환경변수로 자동 설정됩니다. 발송 전 반드시 <b>본인 번호로 테스트</b>하세요.
                      </p>
                    </div>

                    {/* ============ 1. 테스트 발송 ============ */}
                    <div style={{ marginBottom: '12px' }}>
                      <SectionHeader id="test" icon="🧪" title="테스트 발송" subtitle="본인 번호로 즉시 1건" />
                      {shoongSectionOpen.test && (
                        <div style={sectionBodyStyle}>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                📱 수신자 전화번호
                                <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '11px' }}>· 하이픈 없이</span>
                              </label>
                              <input
                                type="text"
                                value={shoongForm.phone || ''}
                                onChange={(e) => setShoongForm(f => ({ ...f, phone: e.target.value }))}
                                placeholder="01012345678"
                                style={{
                                  width: '100%',
                                  padding: '10px 12px',
                                  background: 'rgba(0,0,0,0.35)',
                                  border: '1px solid rgba(99,102,241,0.3)',
                                  borderRadius: '8px',
                                  color: '#fff',
                                  fontSize: '13px',
                                  fontFamily: 'monospace',
                                  boxSizing: 'border-box'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                📋 템플릿
                              </label>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {Object.keys(TEST_TPL_VARS).map(t => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setShoongForm(f => ({ ...f, 'channelConfig.templatecode': t }))}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      background: testTplCode === t ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.04)',
                                      border: `1px solid ${testTplCode === t ? 'rgba(99,102,241,0.55)' : 'var(--border)'}`,
                                      borderRadius: '7px',
                                      color: testTplCode === t ? '#fff' : '#94a3b8',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >{t}</button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* 변수 입력 */}
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                            {testTplVars.map(v => (
                              <div key={v}>
                                <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 500 }}>
                                  변수: {v}
                                  {v === '링크명' && <span style={{ color: '#fbbf24', marginLeft: '6px', fontSize: '10px' }}>· ⚠️ URL 양식 (https://...)</span>}
                                  {testTplCode === 'start(1)' && v === '강사명' && <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '10px' }}>· start(1)은 '강사명'</span>}
                                </label>
                                <input
                                  type="text"
                                  value={shoongForm[`variables.${v}`] || ''}
                                  onChange={(e) => setShoongForm(f => ({ ...f, [`variables.${v}`]: e.target.value }))}
                                  placeholder={
                                    v === '유튜브링크' ? 'https://youtu.be/...' :
                                    v === '링크명' ? 'https://... (버튼 클릭 시 이동할 URL)' :
                                    v === '강좌명' ? '예: AI활용 컨텐츠 부업' :
                                    v === '시청자수' ? '예: 320' :
                                    v === '강사명' || v === '강사님' ? '예: 씨오' :
                                    '홍길동'
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px 11px',
                                    background: 'rgba(0,0,0,0.35)',
                                    border: '1px solid rgba(99,102,241,0.3)',
                                    borderRadius: '7px',
                                    color: '#fff',
                                    fontSize: '12px',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            disabled={shoongSending}
                            onClick={async () => {
                              setShoongSending(true)
                              setShoongResult(null)
                              try {
                                // 테스트 발송은 항상 즉시 — reservedTime 없음
                                const prevMode = shoongSendMode
                                if (prevMode !== 'immediate') setShoongSendMode('immediate')
                                const tpl = (shoongForm['channelConfig.templatecode'] || 'start(2)').trim()
                                const tplVarsLocal = TEST_TPL_VARS[tpl] || []
                                const payload = {
                                  sendType: 'at',
                                  phone: (shoongForm.phone || '').trim(),
                                  'channelConfig.senderkey': (shoongForm['channelConfig.senderkey'] || '').trim(),
                                  'channelConfig.templatecode': tpl
                                }
                                for (const v of tplVarsLocal) payload[`variables.${v}`] = (shoongForm[`variables.${v}`] || '').trim()
                                const res = await fetch('/api/tools/shoong-send', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${getAuthToken() || ''}`
                                  },
                                  body: JSON.stringify(payload)
                                })
                                const data = await res.json()
                                setShoongResult({ httpStatus: res.status, ...data })
                              } catch (e) {
                                setShoongResult({ error: e.message })
                              } finally {
                                setShoongSending(false)
                              }
                            }}
                            style={{
                              padding: '12px 22px',
                              background: shoongSending ? 'rgba(99,102,241,0.20)' : 'var(--accent-grad)',
                              border: 'none',
                              borderRadius: '10px',
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: 700,
                              cursor: shoongSending ? 'wait' : 'pointer',
                              boxShadow: shoongSending ? 'none' : '0 8px 18px rgba(99,102,241,0.30)',
                            }}
                          >
                            {shoongSending ? '발송 중…' : '🚀 발송'}
                          </button>

                          {/* 결과 */}
                          {shoongResult && (
                            <div style={{
                              marginTop: '14px',
                              padding: '14px 16px',
                              background: shoongResult.ok || shoongResult.success ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                              border: `1px solid ${shoongResult.ok || shoongResult.success ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
                              borderRadius: '10px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: shoongResult.ok || shoongResult.success ? '#10b981' : '#ef4444' }}>
                                  {shoongResult.ok || shoongResult.success ? '✅ 성공' : '❌ 실패'}
                                </span>
                                {shoongResult.httpStatus && (
                                  <span style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(0,0,0,0.30)', borderRadius: '4px', color: '#fff', fontFamily: 'monospace' }}>
                                    HTTP {shoongResult.httpStatus}
                                  </span>
                                )}
                              </div>
                              {shoongResult.error && (
                                <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '6px' }}>에러: {shoongResult.error}</div>
                              )}
                              {shoongResult.response && (
                                <pre style={{ fontSize: '11px', color: '#cbd5e1', background: 'rgba(0,0,0,0.40)', padding: '10px', borderRadius: '6px', overflow: 'auto', maxHeight: '260px', margin: 0 }}>
                                  {JSON.stringify(shoongResult.response, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ============ 2. 실전 발송 ============ */}
                    <div style={{ marginBottom: '12px' }}>
                      <SectionHeader
                        id="bulk"
                        icon="📢"
                        title="실전 발송"
                        subtitle="DB 검색 → 신청자 전원"
                        badge={shoongBulkSelectedIds.length > 0 ? `${shoongBulkSelectedIds.length}개 선택` : null}
                      />
                      {shoongSectionOpen.bulk && (
                        <div style={sectionBodyStyle}>
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '14px', lineHeight: 1.55 }}>
                            FreeCourse를 검색해 선택 → 해당 강의 신청자들의 <b>이름·전화번호</b>는 nlab DB에서 자동으로 채워 일괄 발송합니다. 변수 4~5개만 직접 입력하세요.
                          </p>

                          {/* 1. 검색 */}
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                              🔍 강의 검색 (FreeCourse.title)
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                value={shoongBulkKeyword}
                                onChange={(e) => setShoongBulkKeyword(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key !== 'Enter') return
                                  if (!shoongBulkKeyword.trim()) return
                                  setShoongBulkSearching(true)
                                  try {
                                    const token = getAuthToken() || ''
                                    const res = await fetch(`/api/tools/shoong-bulk/courses?keyword=${encodeURIComponent(shoongBulkKeyword.trim())}`, {
                                      headers: { 'Authorization': `Bearer ${token}` }
                                    })
                                    const data = await res.json()
                                    if (!res.ok) {
                                      alert(data.error || '검색 실패')
                                      setShoongBulkCourses([])
                                    } else {
                                      setShoongBulkCourses(data.courses || [])
                                      setShoongBulkSelectedIds([])
                                    }
                                  } catch (err) {
                                    alert(err.message)
                                  } finally {
                                    setShoongBulkSearching(false)
                                  }
                                }}
                                placeholder='예: 씨오 (Enter로 검색)'
                                style={{
                                  flex: 1, padding: '10px 12px',
                                  background: 'rgba(0,0,0,0.35)',
                                  border: '1px solid rgba(139,92,246,0.4)',
                                  borderRadius: '8px', color: '#fff', fontSize: '13px'
                                }}
                              />
                              <button
                                type="button"
                                disabled={shoongBulkSearching || !shoongBulkKeyword.trim()}
                                onClick={async () => {
                                  setShoongBulkSearching(true)
                                  try {
                                    const token = getAuthToken() || ''
                                    const res = await fetch(`/api/tools/shoong-bulk/courses?keyword=${encodeURIComponent(shoongBulkKeyword.trim())}`, {
                                      headers: { 'Authorization': `Bearer ${token}` }
                                    })
                                    const data = await res.json()
                                    if (!res.ok) {
                                      alert(data.error || '검색 실패')
                                      setShoongBulkCourses([])
                                    } else {
                                      setShoongBulkCourses(data.courses || [])
                                      setShoongBulkSelectedIds([])
                                    }
                                  } catch (err) {
                                    alert(err.message)
                                  } finally {
                                    setShoongBulkSearching(false)
                                  }
                                }}
                                style={{
                                  padding: '10px 18px',
                                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                  border: 'none', borderRadius: '8px',
                                  color: '#fff', fontSize: '13px', fontWeight: 600,
                                  cursor: shoongBulkSearching ? 'not-allowed' : 'pointer',
                                  opacity: shoongBulkSearching ? 0.6 : 1
                                }}
                              >
                                {shoongBulkSearching ? '검색 중...' : '검색'}
                              </button>
                            </div>
                          </div>

                          {/* 2. 결과 리스트 */}
                          {shoongBulkCourses.length > 0 && (() => {
                            const selectedCount = shoongBulkSelectedIds.length
                            const totalApplicants = shoongBulkCourses
                              .filter(c => shoongBulkSelectedIds.includes(c.id))
                              .reduce((sum, c) => sum + (c.applicantCount || 0), 0)
                            const allSelected = shoongBulkCourses.length > 0 && shoongBulkSelectedIds.length === shoongBulkCourses.length
                            return (
                              <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.25)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setShoongBulkSelectedIds(shoongBulkCourses.map(c => c.id))}
                                    disabled={allSelected}
                                    style={{
                                      flex: 1, padding: '8px 12px',
                                      background: allSelected ? 'rgba(139,92,246,0.10)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                      border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px',
                                      color: allSelected ? '#64748b' : '#fff',
                                      fontSize: '12px', fontWeight: 600,
                                      cursor: allSelected ? 'not-allowed' : 'pointer',
                                      opacity: allSelected ? 0.5 : 1
                                    }}
                                  >
                                    ✅ 전체 선택 ({shoongBulkCourses.length}개)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShoongBulkSelectedIds([])}
                                    disabled={selectedCount === 0}
                                    style={{
                                      flex: 1, padding: '8px 12px',
                                      background: selectedCount === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                                      border: `1px solid ${selectedCount === 0 ? 'var(--border)' : 'rgba(239,68,68,0.4)'}`,
                                      borderRadius: '8px',
                                      color: selectedCount === 0 ? '#64748b' : '#fca5a5',
                                      fontSize: '12px', fontWeight: 600,
                                      cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                                      opacity: selectedCount === 0 ? 0.5 : 1
                                    }}
                                  >
                                    ❌ 전체 해제
                                  </button>
                                </div>
                                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                                  검색 결과: <b style={{ color: '#fff' }}>{shoongBulkCourses.length}개 강의</b> ·
                                  선택 <b style={{ color: '#a78bfa' }}>{selectedCount}개</b> ·
                                  예상 수신자 <b style={{ color: '#34d399' }}>{totalApplicants.toLocaleString()}명</b>
                                  <span style={{ color: '#64748b', marginLeft: '6px' }}>(중복 번호는 발송 시 1회만)</span>
                                </div>
                                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {shoongBulkCourses.map(c => {
                                    const checked = shoongBulkSelectedIds.includes(c.id)
                                    return (
                                      <label
                                        key={c.id}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: '10px',
                                          padding: '8px 10px',
                                          background: checked ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                                          border: `1px solid ${checked ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                                          borderRadius: '7px', cursor: 'pointer', fontSize: '12px'
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            setShoongBulkSelectedIds(prev =>
                                              prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                                            )
                                          }}
                                          style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                                        />
                                        <span style={{ flex: 1, color: '#e2e8f0', wordBreak: 'break-all' }}>{c.title}</span>
                                        <span style={{ color: '#34d399', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>
                                          {(c.applicantCount || 0).toLocaleString()}명
                                        </span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}

                          {shoongBulkCourses.length === 0 && shoongBulkKeyword && !shoongBulkSearching && (
                            <div style={{ marginBottom: '16px', padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: 'rgba(0,0,0,0.20)', borderRadius: '8px' }}>
                              검색 결과가 없습니다. (Enter 또는 검색 버튼으로 조회)
                            </div>
                          )}

                          {/* 3. 변수 + 발송 (선택된 강의가 있을 때만) */}
                          {shoongBulkSelectedIds.length > 0 && (
                            <>
                              <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                  📋 템플릿 코드
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {Object.keys(BULK_TPL).map(t => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => setShoongBulkTplCode(t)}
                                      style={{
                                        padding: '6px 14px',
                                        background: shoongBulkTplCode === t ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${shoongBulkTplCode === t ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                                        borderRadius: '7px',
                                        color: shoongBulkTplCode === t ? '#fff' : '#94a3b8',
                                        fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                                      }}
                                    >{t}</button>
                                  ))}
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                {bulkTplVars.map(v => (
                                  <div key={v}>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 500 }}>
                                      변수: {v}
                                      {v === '링크명' && <span style={{ color: '#fbbf24', marginLeft: '6px', fontSize: '10px' }}>· ⚠️ URL 양식 (https://...)</span>}
                                    </label>
                                    <input
                                      type="text"
                                      value={shoongBulkVars[v] || ''}
                                      onChange={(e) => setShoongBulkVars(s => ({ ...s, [v]: e.target.value }))}
                                      placeholder={
                                        v === '유튜브링크' ? 'https://youtu.be/...'
                                        : v === '링크명' ? 'https://... (버튼 클릭 시 이동할 URL)'
                                        : v === '강좌명' ? '예: AI활용 컨텐츠 부업'
                                        : v === '시청자수' ? '예: 320'
                                        : '예: 씨오'
                                      }
                                      style={{
                                        width: '100%', padding: '8px 11px',
                                        background: 'rgba(0,0,0,0.35)',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                        borderRadius: '7px', color: '#fff', fontSize: '12px', boxSizing: 'border-box'
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* 즉시/예약 토글 */}
                              <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                  ⏰ 발송 시간
                                </label>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {['immediate', 'reserved'].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setShoongBulkSendMode(m)
                                        if (m === 'reserved' && !shoongBulkReservedAt) {
                                          setShoongBulkReservedAt(toLocalInputValue(minLead))
                                        }
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        background: shoongBulkSendMode === m ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${shoongBulkSendMode === m ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                                        borderRadius: '7px',
                                        color: shoongBulkSendMode === m ? '#fff' : '#94a3b8',
                                        fontSize: '12px', cursor: 'pointer'
                                      }}
                                    >{m === 'immediate' ? '즉시' : '예약'}</button>
                                  ))}
                                  {shoongBulkSendMode === 'reserved' && (
                                    <input
                                      type="datetime-local"
                                      value={shoongBulkReservedAt}
                                      onChange={(e) => setShoongBulkReservedAt(e.target.value)}
                                      min={toLocalInputValue(now)}
                                      style={{
                                        padding: '8px 12px',
                                        background: 'rgba(0,0,0,0.4)',
                                        border: `1px solid ${tooSoon ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.4)'}`,
                                        borderRadius: '8px', color: '#fff', fontSize: '13px', marginLeft: '8px',
                                        colorScheme: 'dark',
                                        fontFamily: 'monospace',
                                        minWidth: '200px'
                                      }}
                                    />
                                  )}
                                </div>
                                {shoongBulkSendMode === 'reserved' && (
                                  <>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                      {presets.map(p => (
                                        <button
                                          key={p.label}
                                          type="button"
                                          onClick={() => {
                                            const d = p.custom ? p.custom() : new Date(Date.now() + p.mins * 60 * 1000)
                                            setShoongBulkReservedAt(toLocalInputValue(d))
                                          }}
                                          style={{
                                            padding: '5px 10px',
                                            background: 'rgba(99,102,241,0.12)',
                                            border: '1px solid rgba(99,102,241,0.3)',
                                            borderRadius: '6px',
                                            color: '#c7d2fe',
                                            fontSize: '11px',
                                            cursor: 'pointer'
                                          }}
                                        >{p.label}</button>
                                      ))}
                                    </div>
                                    {reservedDate && (
                                      <div style={{
                                        marginTop: '8px',
                                        padding: '8px 12px',
                                        background: inPast ? 'rgba(239,68,68,0.10)' : tooSoon ? 'rgba(251,191,36,0.10)' : 'rgba(16,185,129,0.10)',
                                        border: `1px solid ${inPast ? 'rgba(239,68,68,0.3)' : tooSoon ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.3)'}`,
                                        borderRadius: '7px',
                                        fontSize: '11px',
                                        color: inPast ? '#f87171' : tooSoon ? '#fbbf24' : '#34d399',
                                        lineHeight: 1.5
                                      }}>
                                        {inPast
                                          ? `⚠️ 과거 시각입니다 (${Math.abs(leadMinutes)}분 전). 즉시 발송 처리됩니다.`
                                          : tooSoon
                                            ? `⚠️ 1분 미만 임박 — 즉시 발송 처리될 수 있습니다.`
                                            : `✅ 현재 시각 기준 ${leadMinutes >= 60 ? `${Math.floor(leadMinutes/60)}시간 ${leadMinutes%60}분` : `${leadMinutes}분`} 후 예약 발송`
                                        }
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* 테스트 모드 */}
                              <div style={{
                                marginBottom: '14px', padding: '14px',
                                background: shoongBulkTestMode ? 'rgba(251,191,36,0.10)' : 'rgba(239,68,68,0.10)',
                                border: `2px solid ${shoongBulkTestMode ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.45)'}`,
                                borderRadius: '10px'
                              }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: shoongBulkTestMode ? '10px' : 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={shoongBulkTestMode}
                                    onChange={(e) => setShoongBulkTestMode(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#fbbf24', cursor: 'pointer' }}
                                  />
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: shoongBulkTestMode ? '#fbbf24' : '#f87171' }}>
                                    {shoongBulkTestMode
                                      ? '🧪 테스트 모드 ON — 내 번호로만 발송 (실제 신청자 X)'
                                      : '⚠️ 테스트 모드 OFF — 실제 신청자 전원에게 발송됩니다!'}
                                  </span>
                                </label>
                                {shoongBulkTestMode && (
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '8px', paddingLeft: '28px' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', color: '#fcd34d', marginBottom: '4px' }}>
                                        내 번호 (모든 발송이 여기로 감)
                                      </label>
                                      <input
                                        type="text"
                                        value={shoongBulkTestPhone}
                                        onChange={(e) => setShoongBulkTestPhone(e.target.value)}
                                        placeholder='01012345678 (하이픈 없이)'
                                        style={{
                                          width: '100%', padding: '8px 11px',
                                          background: 'rgba(0,0,0,0.4)',
                                          border: '1px solid rgba(251,191,36,0.4)',
                                          borderRadius: '7px', color: '#fff', fontSize: '12px',
                                          fontFamily: 'monospace', boxSizing: 'border-box'
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', color: '#fcd34d', marginBottom: '4px' }}>
                                        발송 횟수 (1~5)
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        max={5}
                                        value={shoongBulkTestLimit}
                                        onChange={(e) => setShoongBulkTestLimit(parseInt(e.target.value, 10) || 1)}
                                        style={{
                                          width: '100%', padding: '8px 11px',
                                          background: 'rgba(0,0,0,0.4)',
                                          border: '1px solid rgba(251,191,36,0.4)',
                                          borderRadius: '7px', color: '#fff', fontSize: '12px', boxSizing: 'border-box'
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 슝 대량 API 토글 */}
                              <div style={{
                                marginBottom: '14px', padding: '12px 14px',
                                background: shoongUseBulkApi ? 'rgba(139,92,246,0.10)' : 'rgba(100,116,139,0.10)',
                                border: `1px solid ${shoongUseBulkApi ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                                borderRadius: '10px'
                              }}>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={shoongUseBulkApi}
                                    onChange={(e) => setShoongUseBulkApi(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer', marginTop: '2px' }}
                                  />
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: shoongUseBulkApi ? '#a78bfa' : '#94a3b8' }}>
                                      🚀 슝 공식 대량 API 사용 ({shoongUseBulkApi ? 'ON' : 'OFF'})
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.5 }}>
                                      {shoongUseBulkApi
                                        ? 'xlsx 한 번 업로드로 N명 일괄 발송. 2만 건 기준 1~2분. 슝 어드민 발송이력 → 대량 탭에 분류됨.'
                                        : '단건 API 호출 N번 (청크 분할). 2만 건 기준 10~15분. 대량 API에서 403/오류 발생 시 fallback용.'}
                                    </div>
                                    {shoongUseBulkApi && (
                                      <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '4px' }}>
                                        ⚠️ 슝 IP 화이트리스트가 활성화되어 있으면 403 발생 가능. 그땐 OFF로 전환.
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>

                              {/* 발송 버튼 */}
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={shoongBulkSending}
                                  onClick={async () => {
                                    setShoongBulkSending(true)
                                    setShoongBulkResult(null)
                                    try {
                                      const token = getAuthToken() || ''
                                      const tplVarsForSend = BULK_TPL[shoongBulkTplCode] || []
                                      const variables = {}
                                      for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                      const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({
                                          courseIds: shoongBulkSelectedIds,
                                          templatecode: shoongBulkTplCode,
                                          variables,
                                          dryRun: true
                                        })
                                      })
                                      setShoongBulkResult({ ...data, _httpStatus: status, _dryRun: true })
                                    } catch (err) {
                                      setShoongBulkResult({ error: err.message })
                                    } finally {
                                      setShoongBulkSending(false)
                                    }
                                  }}
                                  style={{
                                    padding: '10px 18px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    color: '#cbd5e1', fontSize: '13px', fontWeight: 600,
                                    cursor: shoongBulkSending ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  👀 미리보기 (발송 X, 수신자 수만 확인)
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    shoongBulkSending ||
                                    (shoongBulkSendMode === 'reserved' && !shoongBulkReservedAt) ||
                                    (shoongBulkTestMode && !shoongBulkTestPhone.trim())
                                  }
                                  onClick={async () => {
                                    const totalEst = shoongBulkCourses
                                      .filter(c => shoongBulkSelectedIds.includes(c.id))
                                      .reduce((sum, c) => sum + (c.applicantCount || 0), 0)

                                    if (shoongBulkTestMode) {
                                      if (!confirm(`🧪 테스트 발송\n\n내 번호: ${shoongBulkTestPhone}\n발송 횟수: ${shoongBulkTestLimit}건\n\n진행할까요?`)) return
                                    } else {
                                      const c1 = confirm(`⚠️ 실전 발송 — 테스트 모드 OFF\n\n선택된 강의: ${shoongBulkSelectedIds.length}개\n예상 수신자: 최대 ${totalEst.toLocaleString()}명\n\n실제 신청자 전원에게 알림톡이 발송됩니다.\n\n계속할까요?`)
                                      if (!c1) return
                                      const typed = prompt(`정말로 ${totalEst.toLocaleString()}명에게 발송하려면 아래에 정확히 "발송"이라고 입력하세요.`)
                                      if (typed !== '발송') {
                                        alert('취소되었습니다.')
                                        return
                                      }
                                    }

                                    setShoongBulkSending(true)
                                    setShoongBulkResult(null)
                                    setShoongBulkProgress(null)
                                    try {
                                      const token = getAuthToken() || ''
                                      const tplVarsForSend = BULK_TPL[shoongBulkTplCode] || []
                                      const variables = {}
                                      for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                      const baseBody = {
                                        courseIds: shoongBulkSelectedIds,
                                        templatecode: shoongBulkTplCode,
                                        variables
                                      }
                                      if (shoongBulkSendMode === 'reserved' && shoongBulkReservedAt) {
                                        baseBody.reservedTime = new Date(shoongBulkReservedAt).toISOString()
                                      }
                                      if (shoongBulkTestMode) {
                                        baseBody.testPhone = shoongBulkTestPhone.trim()
                                        baseBody.testLimit = shoongBulkTestLimit
                                        // 테스트 모드는 어차피 1~5건만 발송 → 청크 불필요
                                        const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                          body: JSON.stringify(baseBody)
                                        })
                                        setShoongBulkResult({ ...data, _httpStatus: status })
                                        return
                                      }

                                      // ===== 실전 발송 — 슝 공식 대량 API (기본 경로) =====
                                      //   xlsx 한 번 업로드로 N명 발송. 슝 백엔드가 비동기 처리.
                                      //   shoongUseBulkApi가 OFF이거나 대량 API 실패 시 청크 분할로 fallback.
                                      if (shoongUseBulkApi) {
                                        setShoongBulkProgress({
                                          status: 'running',
                                          currentChunk: 1,
                                          totalChunks: 1,
                                          totalRecipients: 0,
                                          sent: 0,
                                          failed: 0,
                                          stage: '슝 대량 발송 요청 중...',
                                        })
                                        const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                          body: JSON.stringify({ ...baseBody, useBulkApi: true })
                                        })
                                        if (status >= 400 || data.error) {
                                          setShoongBulkProgress(null)
                                          setShoongBulkResult({
                                            error: data.error || `슝 대량 API 실패 (HTTP ${status})`,
                                            stage: data.stage,
                                            response: data.response,
                                            hint: status === 403
                                              ? 'IP 화이트리스트 차단 가능성. 슝 어드민 → 개발자 도구 → IP 화이트리스트 확인 또는 비활성. 아래 "대량 API 사용" 끄고 다시 발송하면 기존 단건 청크 방식으로 fallback.'
                                              : '문제 지속 시 "대량 API 사용" 끄고 청크 분할 방식으로 fallback 가능.',
                                            _httpStatus: status,
                                          })
                                        } else {
                                          setShoongBulkProgress({
                                            status: 'done',
                                            currentChunk: 1,
                                            totalChunks: 1,
                                            totalRecipients: data.recipientCount || 0,
                                            sent: 0,
                                            failed: 0,
                                            pending: data.pending || data.recipientCount || 0,
                                          })
                                          setShoongBulkResult({ ...data, _httpStatus: status })
                                        }
                                        return
                                      }

                                      // ===== 실전 발송 — 청크 분할 루프 (fallback) =====
                                      //   1) 첫 호출: chunkOffset=0, chunkSize=CHUNK_SIZE → 서버가 첫 청크 발송 + totalRecipients 반환
                                      //   2) 총 청크 수 계산 → 2번째부터 N번째까지 순차 호출
                                      //   3) 각 청크 결과를 누적 + 진행률 state 갱신
                                      //   서버 동시성 20 + Vercel 300초 한도 → 1500명/청크 안전
                                      //   (1500명 × 1초 / 20 동시 ≈ 75초 < 300초)
                                      //   2만명 발송 시 13~14청크로 줄어 총 시간 약 10~12분
                                      const CHUNK_SIZE = 1500
                                      let totalRecipients = 0
                                      let totalChunks = 1
                                      let totalSent = 0, totalFailed = 0, totalSkipped = { noUser: 0, invalidPhone: 0, duplicate: 0 }
                                      const allErrors = []
                                      let firstChunkData = null

                                      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                        const chunkOffset = chunkIndex * CHUNK_SIZE
                                        setShoongBulkProgress({
                                          status: 'running',
                                          currentChunk: chunkIndex + 1,
                                          totalChunks,
                                          totalRecipients,
                                          sent: totalSent,
                                          failed: totalFailed,
                                        })
                                        const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                          body: JSON.stringify({ ...baseBody, chunkOffset, chunkSize: CHUNK_SIZE })
                                        })
                                        if (status >= 400 || data.error) {
                                          setShoongBulkResult({
                                            error: data.error || `청크 ${chunkIndex + 1}/${totalChunks} 실패 (HTTP ${status})`,
                                            partialResult: {
                                              completedChunks: chunkIndex,
                                              totalChunks,
                                              sent: totalSent,
                                              failed: totalFailed,
                                              errors: allErrors.slice(0, 50),
                                            },
                                          })
                                          break
                                        }
                                        if (chunkIndex === 0) {
                                          firstChunkData = data
                                          totalRecipients = data.totalRecipients || data.recipientCount || 0
                                          totalChunks = Math.max(1, Math.ceil(totalRecipients / CHUNK_SIZE))
                                          totalSkipped = data.skipped || totalSkipped
                                        }
                                        totalSent += data.sent || 0
                                        totalFailed += data.failed || 0
                                        if (Array.isArray(data.errors)) allErrors.push(...data.errors)
                                      }

                                      setShoongBulkProgress({
                                        status: 'done',
                                        currentChunk: totalChunks,
                                        totalChunks,
                                        totalRecipients,
                                        sent: totalSent,
                                        failed: totalFailed,
                                      })
                                      setShoongBulkResult({
                                        via: 'vercel-server-bulk-chunked',
                                        mode: 'db',
                                        totalApplies: firstChunkData?.totalApplies || 0,
                                        recipientCount: totalRecipients,
                                        sent: totalSent,
                                        failed: totalFailed,
                                        skipped: totalSkipped,
                                        errors: allErrors.slice(0, 50),
                                        chunkInfo: { totalChunks, chunkSize: CHUNK_SIZE },
                                      })
                                    } catch (err) {
                                      setShoongBulkResult({ error: err.message })
                                    } finally {
                                      setShoongBulkSending(false)
                                    }
                                  }}
                                  style={{
                                    padding: '10px 18px',
                                    background: shoongBulkTestMode
                                      ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                                      : 'linear-gradient(135deg, #ef4444, #ec4899)',
                                    border: 'none', borderRadius: '8px',
                                    color: '#fff', fontSize: '13px', fontWeight: 700,
                                    cursor: shoongBulkSending ? 'not-allowed' : 'pointer',
                                    opacity: shoongBulkSending ? 0.6 : 1
                                  }}
                                >
                                  {shoongBulkSending
                                    ? '발송 중...'
                                    : shoongBulkTestMode
                                      ? `🧪 테스트 발송 (내 번호 ${shoongBulkTestLimit}건)`
                                      : `🚀 ${shoongBulkSendMode === 'reserved' ? '예약' : '즉시'} 실전 발송`}
                                </button>
                              </div>
                            </>
                          )}

                          {/* 청크 발송 진행 패널 — 큰 명단 발송 중 실시간 진행률 */}
                          {shoongBulkProgress && (
                            <div style={{
                              marginTop: '16px', padding: '12px 14px',
                              background: shoongBulkProgress.status === 'done' ? 'rgba(16,185,129,0.10)' : 'rgba(99,102,241,0.10)',
                              border: `1px solid ${shoongBulkProgress.status === 'done' ? 'rgba(16,185,129,0.30)' : 'rgba(99,102,241,0.30)'}`,
                              borderRadius: '10px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                                  {shoongBulkProgress.status === 'done' ? '✅ 발송 완료' : '📤 청크 발송 중'}
                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginLeft: '8px' }}>
                                    청크 {shoongBulkProgress.currentChunk} / {shoongBulkProgress.totalChunks}
                                  </span>
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                  성공 {shoongBulkProgress.sent?.toLocaleString() || 0} · 실패 {shoongBulkProgress.failed?.toLocaleString() || 0} · 총 {shoongBulkProgress.totalRecipients?.toLocaleString() || 0}
                                </div>
                              </div>
                              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${shoongBulkProgress.totalChunks > 0 ? Math.round((shoongBulkProgress.currentChunk / shoongBulkProgress.totalChunks) * 100) : 0}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                                  transition: 'width 0.4s ease',
                                }} />
                              </div>
                              {shoongBulkProgress.status === 'running' && (
                                <div style={{ marginTop: '6px', fontSize: '10.5px', color: '#94a3b8' }}>
                                  💡 청크당 500명씩 분할 발송 중. 화면 닫지 마세요 — 다 끝나면 알림 결과 표시됩니다.
                                </div>
                              )}
                            </div>
                          )}

                          {/* 결과 패널 */}
                          {shoongBulkResult && (
                            <div style={{
                              marginTop: '16px', padding: '14px',
                              background: shoongBulkResult.error ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)',
                              border: `1px solid ${shoongBulkResult.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                              borderRadius: '10px'
                            }}>
                              {shoongBulkResult.error ? (
                                <div style={{ color: '#f87171', fontSize: '13px' }}>❌ {shoongBulkResult.error}</div>
                              ) : shoongBulkResult._dryRun ? (
                                <div style={{ fontSize: '13px', color: '#34d399', lineHeight: 1.7 }}>
                                  👀 <b>미리보기</b><br/>
                                  • 신청 행 총: <b>{shoongBulkResult.totalApplies?.toLocaleString()}건</b><br/>
                                  • 발송 대상(중복/무효 제거 후): <b style={{ color: '#fff' }}>{shoongBulkResult.recipientCount?.toLocaleString()}명</b><br/>
                                  • 제외: 사용자 없음 {shoongBulkResult.skipped?.noUser || 0}, 무효 번호 {shoongBulkResult.skipped?.invalidPhone || 0}, 중복 {shoongBulkResult.skipped?.duplicate || 0}
                                </div>
                              ) : (
                                <div style={{ fontSize: '13px', color: '#34d399', lineHeight: 1.7 }}>
                                  ✅ <b>발송 완료</b>
                                  {shoongBulkResult.testMode && (
                                    <span style={{ marginLeft: '6px', padding: '2px 8px', background: 'rgba(251,191,36,0.2)', color: '#fbbf24', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>🧪 테스트 모드</span>
                                  )}<br/>
                                  {shoongBulkResult.testMode && (
                                    <>• 테스트 번호 <b style={{ color: '#fbbf24' }}>{shoongBulkResult.testMode.testPhone}</b>로 {shoongBulkResult.testMode.limit}건 발송 (실제 신청자 {shoongBulkResult.testMode.realRecipientCount?.toLocaleString()}명은 발송 안 됨)<br/></>
                                  )}
                                  • 대상: <b style={{ color: '#fff' }}>{shoongBulkResult.recipientCount?.toLocaleString()}명</b> ·
                                  성공 <b style={{ color: '#34d399' }}>{shoongBulkResult.sent}</b> ·
                                  실패 <b style={{ color: '#f87171' }}>{shoongBulkResult.failed}</b>
                                  {shoongBulkResult.reservedTime && <><br/>• 예약 시간: <b>{shoongBulkResult.reservedTime}</b></>}

                                  {/* 실패 목록 + 재발송 — testMode가 아니고 실패가 있을 때만 */}
                                  {!shoongBulkResult.testMode && shoongBulkResult.errors?.length > 0 && (() => {
                                    // 원인별 그룹핑
                                    const byReason = {}
                                    for (const e of shoongBulkResult.errors) {
                                      const key = e.error
                                        ? `네트워크: ${e.error.slice(0, 60)}`
                                        : `HTTP ${e.status || '?'}: ${(e.response?.message || e.response?.code || e.response?.raw || '슝 응답 오류').toString().slice(0, 60)}`
                                      if (!byReason[key]) byReason[key] = []
                                      byReason[key].push(e)
                                    }
                                    const reasons = Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)
                                    // 재발송 가능한 실패자: 전화번호가 있는 케이스만 (수동 모드 recipients로 재호출)
                                    const retryable = shoongBulkResult.errors.filter(e => e.phone)
                                    return (
                                      <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(248,113,113,0.25)' }}>
                                        <div style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 700, marginBottom: '8px' }}>
                                          ❌ 실패 {shoongBulkResult.errors.length}건 — 원인별
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#fbbf24', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          {reasons.map(([reason, items]) => (
                                            <div key={reason}>• <b style={{ color: '#fca5a5' }}>{items.length}건</b> — {reason}</div>
                                          ))}
                                        </div>
                                        <details style={{ marginBottom: '10px' }}>
                                          <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '11px' }}>실패자 상세 ({shoongBulkResult.errors.length}건)</summary>
                                          <div style={{ maxHeight: '220px', overflow: 'auto', marginTop: '6px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                                            <table style={{ width: '100%', fontSize: '11px', color: '#cbd5e1', borderCollapse: 'collapse' }}>
                                              <thead style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
                                                <tr>
                                                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>이름</th>
                                                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>전화번호</th>
                                                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>실패 원인</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {shoongBulkResult.errors.map((e, i) => (
                                                  <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '5px 8px' }}>{e.name || '-'}</td>
                                                    <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{e.phone || '-'}</td>
                                                    <td style={{ padding: '5px 8px', color: '#fca5a5' }}>
                                                      {e.error || `HTTP ${e.status}: ${(e.response?.message || e.response?.code || e.response?.raw || '').toString().slice(0, 80)}`}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </details>
                                        {retryable.length > 0 && (
                                          <button
                                            onClick={async () => {
                                              if (!confirm(`실패한 ${retryable.length}명에게 재발송하시겠습니까?\n(같은 템플릿/변수로 전화번호만 다시 전송)`)) return
                                              try {
                                                setShoongBulkSending(true)
                                                setShoongBulkResult(null)
                                                const tplVarsForSend = SHOONG_TEMPLATE_VARS[shoongBulkTplCode] || []
                                                const variables = {}
                                                for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                                const recipients = retryable.map(e => ({ name: e.name || '고객', phone: e.phone }))
                                                const token = getAuthToken() || ''
                                                const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                  body: JSON.stringify({
                                                    recipients,
                                                    templatecode: shoongBulkTplCode,
                                                    variables,
                                                  }),
                                                })
                                                setShoongBulkResult({ ...data, _httpStatus: status, _isRetry: true })
                                              } catch (err) {
                                                setShoongBulkResult({ error: `재발송 실패: ${err.message}` })
                                              } finally {
                                                setShoongBulkSending(false)
                                              }
                                            }}
                                            disabled={shoongBulkSending}
                                            style={{
                                              padding: '8px 14px',
                                              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                              border: 'none',
                                              borderRadius: '7px',
                                              color: '#fff',
                                              fontSize: '12px',
                                              fontWeight: 700,
                                              cursor: shoongBulkSending ? 'not-allowed' : 'pointer',
                                              opacity: shoongBulkSending ? 0.6 : 1,
                                            }}
                                          >
                                            🔄 실패자 {retryable.length}명만 재발송
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })()}

                                  {shoongBulkResult._isRetry && (
                                    <div style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(245,158,11,0.15)', borderRadius: '4px', fontSize: '11px', color: '#fbbf24', display: 'inline-block' }}>
                                      🔄 재발송 결과
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ============ 3. 수동 업로드 발송 (CSV) ============ */}
                    <div style={{ marginBottom: '12px' }}>
                      <SectionHeader
                        id="manual"
                        icon="📁"
                        title="수동 업로드 발송"
                        subtitle="CSV 파일 → 일괄"
                        badge={shoongManualRows.length > 0 ? `${shoongManualRows.length}행` : null}
                      />
                      {shoongSectionOpen.manual && (
                        <div style={sectionBodyStyle}>
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '14px', lineHeight: 1.55 }}>
                            DB카트 등 외부에서 받은 CSV 파일을 업로드하면 <b>이름·전화번호 컬럼을 자동 감지</b>해 발송 명단으로 사용합니다. 변수와 발송 옵션은 위 <b>실전 발송</b> 섹션과 공유합니다.
                          </p>

                          {/* 파일 업로드 */}
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '10px',
                              padding: '20px',
                              background: 'rgba(99,102,241,0.06)',
                              border: '2px dashed rgba(99,102,241,0.35)',
                              borderRadius: '10px',
                              color: '#c7d2fe',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}>
                              <input
                                type="file"
                                accept=".csv,.tsv,.xlsx,.xls"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleManualFile(f)
                                  e.target.value = ''
                                }}
                              />
                              📁 CSV / 엑셀 파일 선택
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>(.csv, .tsv, .xlsx)</span>
                            </label>
                            {shoongManualFileName && (
                              <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
                                선택된 파일: <b style={{ color: '#fff' }}>{shoongManualFileName}</b>
                              </div>
                            )}
                            {shoongManualParseError && (
                              <div style={{
                                marginTop: '8px',
                                padding: '10px 12px',
                                background: 'rgba(239,68,68,0.10)',
                                border: '1px solid rgba(239,68,68,0.30)',
                                borderRadius: '8px',
                                color: '#fca5a5',
                                fontSize: '12px',
                              }}>⚠️ {shoongManualParseError}</div>
                            )}
                          </div>

                          {/* 파싱 결과 미리보기 */}
                          {shoongManualRows.length > 0 && (
                            <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(0,0,0,0.20)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                              <div style={{ marginBottom: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                                파싱된 행: <b style={{ color: '#fff' }}>{shoongManualRows.length}개</b>
                                <span style={{ color: '#64748b', marginLeft: '6px' }}>(전화번호 정규화/중복 제거는 발송 시 자동)</span>
                              </div>
                              <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                                {shoongManualRows.slice(0, 10).map((r, i) => (
                                  <div key={i} style={{ padding: '4px 0', borderBottom: i < Math.min(9, shoongManualRows.length - 1) ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                                    <span style={{ color: '#94a3b8', marginRight: '12px' }}>{i + 1}.</span>
                                    <span style={{ color: '#fff' }}>{r.name || '(이름 없음)'}</span>
                                    <span style={{ color: '#64748b', margin: '0 8px' }}>·</span>
                                    <span>{r.phone}</span>
                                  </div>
                                ))}
                                {shoongManualRows.length > 10 && (
                                  <div style={{ padding: '6px 0', color: '#64748b', fontSize: '11px' }}>
                                    … 외 {shoongManualRows.length - 10}행
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setShoongManualRows([])
                                  setShoongManualFileName('')
                                  setShoongManualParseError('')
                                  setShoongManualResult(null)
                                }}
                                style={{
                                  marginTop: '8px',
                                  padding: '5px 10px',
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  borderRadius: '6px',
                                  color: '#94a3b8',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                }}
                              >🗑️ 명단 비우기</button>
                            </div>
                          )}

                          {shoongManualRows.length > 0 && (
                            <>
                              <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                  📋 템플릿 코드 <span style={{ color: '#64748b', fontSize: '11px' }}>· 실전 발송과 공유</span>
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {Object.keys(BULK_TPL).map(t => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => setShoongBulkTplCode(t)}
                                      style={{
                                        padding: '6px 14px',
                                        background: shoongBulkTplCode === t ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${shoongBulkTplCode === t ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                                        borderRadius: '7px',
                                        color: shoongBulkTplCode === t ? '#fff' : '#94a3b8',
                                        fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                                      }}
                                    >{t}</button>
                                  ))}
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                {bulkTplVars.map(v => (
                                  <div key={v}>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 500 }}>
                                      변수: {v}
                                      {v === '링크명' && <span style={{ color: '#fbbf24', marginLeft: '6px', fontSize: '10px' }}>· ⚠️ URL 양식</span>}
                                    </label>
                                    <input
                                      type="text"
                                      value={shoongBulkVars[v] || ''}
                                      onChange={(e) => setShoongBulkVars(s => ({ ...s, [v]: e.target.value }))}
                                      placeholder={
                                        v === '유튜브링크' ? 'https://youtu.be/...'
                                        : v === '링크명' ? 'https://...'
                                        : v === '강좌명' ? '예: AI활용 컨텐츠 부업'
                                        : v === '시청자수' ? '예: 320'
                                        : '예: 씨오'
                                      }
                                      style={{
                                        width: '100%', padding: '8px 11px',
                                        background: 'rgba(0,0,0,0.35)',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                        borderRadius: '7px', color: '#fff', fontSize: '12px', boxSizing: 'border-box'
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* 즉시/예약 (실전과 동일 — 동일 상태) */}
                              <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                                  ⏰ 발송 시간
                                </label>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {['immediate', 'reserved'].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setShoongBulkSendMode(m)
                                        if (m === 'reserved' && !shoongBulkReservedAt) {
                                          setShoongBulkReservedAt(toLocalInputValue(minLead))
                                        }
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        background: shoongBulkSendMode === m ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${shoongBulkSendMode === m ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                                        borderRadius: '7px',
                                        color: shoongBulkSendMode === m ? '#fff' : '#94a3b8',
                                        fontSize: '12px', cursor: 'pointer'
                                      }}
                                    >{m === 'immediate' ? '즉시' : '예약'}</button>
                                  ))}
                                  {shoongBulkSendMode === 'reserved' && (
                                    <input
                                      type="datetime-local"
                                      value={shoongBulkReservedAt}
                                      onChange={(e) => setShoongBulkReservedAt(e.target.value)}
                                      min={toLocalInputValue(now)}
                                      style={{
                                        padding: '8px 12px',
                                        background: 'rgba(0,0,0,0.4)',
                                        border: `1px solid ${tooSoon ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.4)'}`,
                                        borderRadius: '8px', color: '#fff', fontSize: '13px', marginLeft: '8px',
                                        colorScheme: 'dark', fontFamily: 'monospace', minWidth: '200px'
                                      }}
                                    />
                                  )}
                                </div>
                              </div>

                              {/* 테스트 모드 (공유) */}
                              <div style={{
                                marginBottom: '14px', padding: '14px',
                                background: shoongBulkTestMode ? 'rgba(251,191,36,0.10)' : 'rgba(239,68,68,0.10)',
                                border: `2px solid ${shoongBulkTestMode ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.45)'}`,
                                borderRadius: '10px'
                              }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: shoongBulkTestMode ? '10px' : 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={shoongBulkTestMode}
                                    onChange={(e) => setShoongBulkTestMode(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#fbbf24', cursor: 'pointer' }}
                                  />
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: shoongBulkTestMode ? '#fbbf24' : '#f87171' }}>
                                    {shoongBulkTestMode
                                      ? '🧪 테스트 모드 ON — 내 번호로만 발송'
                                      : '⚠️ 테스트 모드 OFF — CSV 명단 전원에게 발송!'}
                                  </span>
                                </label>
                                {shoongBulkTestMode && (
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '8px', paddingLeft: '28px' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', color: '#fcd34d', marginBottom: '4px' }}>내 번호</label>
                                      <input
                                        type="text"
                                        value={shoongBulkTestPhone}
                                        onChange={(e) => setShoongBulkTestPhone(e.target.value)}
                                        placeholder='01012345678'
                                        style={{
                                          width: '100%', padding: '8px 11px',
                                          background: 'rgba(0,0,0,0.4)',
                                          border: '1px solid rgba(251,191,36,0.4)',
                                          borderRadius: '7px', color: '#fff', fontSize: '12px',
                                          fontFamily: 'monospace', boxSizing: 'border-box'
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', color: '#fcd34d', marginBottom: '4px' }}>발송 횟수 (1~5)</label>
                                      <input
                                        type="number"
                                        min={1} max={5}
                                        value={shoongBulkTestLimit}
                                        onChange={(e) => setShoongBulkTestLimit(parseInt(e.target.value, 10) || 1)}
                                        style={{
                                          width: '100%', padding: '8px 11px',
                                          background: 'rgba(0,0,0,0.4)',
                                          border: '1px solid rgba(251,191,36,0.4)',
                                          borderRadius: '7px', color: '#fff', fontSize: '12px', boxSizing: 'border-box'
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 슝 대량 API 토글 */}
                              <div style={{
                                marginBottom: '14px', padding: '12px 14px',
                                background: shoongUseBulkApi ? 'rgba(139,92,246,0.10)' : 'rgba(100,116,139,0.10)',
                                border: `1px solid ${shoongUseBulkApi ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                                borderRadius: '10px'
                              }}>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={shoongUseBulkApi}
                                    onChange={(e) => setShoongUseBulkApi(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer', marginTop: '2px' }}
                                  />
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: shoongUseBulkApi ? '#a78bfa' : '#94a3b8' }}>
                                      🚀 슝 공식 대량 API 사용 ({shoongUseBulkApi ? 'ON' : 'OFF'})
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.5 }}>
                                      {shoongUseBulkApi
                                        ? 'xlsx 한 번 업로드로 N명 일괄 발송. 2만 건 기준 1~2분. 슝 어드민 발송이력 → 대량 탭에 분류됨.'
                                        : '단건 API 호출 N번 (청크 분할). 2만 건 기준 10~15분. 대량 API에서 403/오류 발생 시 fallback용.'}
                                    </div>
                                    {shoongUseBulkApi && (
                                      <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '4px' }}>
                                        ⚠️ 슝 IP 화이트리스트가 활성화되어 있으면 403 발생 가능. 그땐 OFF로 전환.
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>

                              {/* 발송 버튼 */}
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={shoongManualSending}
                                  onClick={async () => {
                                    setShoongManualSending(true)
                                    setShoongManualResult(null)
                                    try {
                                      const token = getAuthToken() || ''
                                      const tplVarsForSend = BULK_TPL[shoongBulkTplCode] || []
                                      const variables = {}
                                      for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                      const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({
                                          recipients: shoongManualRows,
                                          templatecode: shoongBulkTplCode,
                                          variables,
                                          dryRun: true
                                        })
                                      })
                                      setShoongManualResult({ ...data, _httpStatus: status, _dryRun: true })
                                    } catch (err) {
                                      setShoongManualResult({ error: err.message })
                                    } finally {
                                      setShoongManualSending(false)
                                    }
                                  }}
                                  style={{
                                    padding: '10px 18px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    color: '#cbd5e1', fontSize: '13px', fontWeight: 600,
                                    cursor: shoongManualSending ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  👀 미리보기 (발송 X)
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    shoongManualSending ||
                                    (shoongBulkSendMode === 'reserved' && !shoongBulkReservedAt) ||
                                    (shoongBulkTestMode && !shoongBulkTestPhone.trim())
                                  }
                                  onClick={async () => {
                                    if (shoongBulkTestMode) {
                                      if (!confirm(`🧪 테스트 발송\n\n내 번호: ${shoongBulkTestPhone}\n발송 횟수: ${shoongBulkTestLimit}건\n\n진행할까요?`)) return
                                    } else {
                                      const c1 = confirm(`⚠️ 실전 발송 — 테스트 모드 OFF\n\nCSV 명단: ${shoongManualRows.length}명\n\n전원에게 알림톡이 발송됩니다.\n\n계속할까요?`)
                                      if (!c1) return
                                      const typed = prompt(`정말로 ${shoongManualRows.length}명에게 발송하려면 아래에 정확히 "발송"이라고 입력하세요.`)
                                      if (typed !== '발송') {
                                        alert('취소되었습니다.')
                                        return
                                      }
                                    }
                                    setShoongManualSending(true)
                                    setShoongManualResult(null)
                                    try {
                                      const token = getAuthToken() || ''
                                      const tplVarsForSend = BULK_TPL[shoongBulkTplCode] || []
                                      const variables = {}
                                      for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                      const body = {
                                        recipients: shoongManualRows,
                                        templatecode: shoongBulkTplCode,
                                        variables
                                      }
                                      if (shoongBulkSendMode === 'reserved' && shoongBulkReservedAt) {
                                        body.reservedTime = new Date(shoongBulkReservedAt).toISOString()
                                      }
                                      if (shoongBulkTestMode) {
                                        body.testPhone = shoongBulkTestPhone.trim()
                                        body.testLimit = shoongBulkTestLimit
                                      }
                                      // 슝 공식 대량 API 사용 (토글 ON 시)
                                      if (shoongUseBulkApi && !shoongBulkTestMode) {
                                        body.useBulkApi = true
                                      }
                                      const { data, status } = await safeFetchJson('/api/tools/shoong-bulk/send', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify(body)
                                      })
                                      setShoongManualResult({ ...data, _httpStatus: status })
                                    } catch (err) {
                                      setShoongManualResult({ error: err.message })
                                    } finally {
                                      setShoongManualSending(false)
                                    }
                                  }}
                                  style={{
                                    padding: '10px 18px',
                                    background: shoongBulkTestMode
                                      ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                                      : 'linear-gradient(135deg, #ef4444, #ec4899)',
                                    border: 'none', borderRadius: '8px',
                                    color: '#fff', fontSize: '13px', fontWeight: 700,
                                    cursor: shoongManualSending ? 'not-allowed' : 'pointer',
                                    opacity: shoongManualSending ? 0.6 : 1
                                  }}
                                >
                                  {shoongManualSending
                                    ? '발송 중...'
                                    : shoongBulkTestMode
                                      ? `🧪 테스트 발송 (내 번호 ${shoongBulkTestLimit}건)`
                                      : `🚀 ${shoongBulkSendMode === 'reserved' ? '예약' : '즉시'} 실전 발송 (${shoongManualRows.length}명)`}
                                </button>
                              </div>
                            </>
                          )}

                          {shoongManualResult && (
                            <div style={{
                              marginTop: '16px', padding: '14px',
                              background: shoongManualResult.error ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)',
                              border: `1px solid ${shoongManualResult.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                              borderRadius: '10px'
                            }}>
                              {shoongManualResult.error ? (
                                <div style={{ color: '#f87171', fontSize: '13px' }}>❌ {shoongManualResult.error}</div>
                              ) : shoongManualResult._dryRun ? (
                                <div style={{ fontSize: '13px', color: '#34d399', lineHeight: 1.7 }}>
                                  👀 <b>미리보기</b><br/>
                                  • CSV 행: <b>{shoongManualResult.totalApplies?.toLocaleString()}건</b><br/>
                                  • 발송 대상(중복/무효 제거 후): <b style={{ color: '#fff' }}>{shoongManualResult.recipientCount?.toLocaleString()}명</b><br/>
                                  • 제외: 무효 번호 {shoongManualResult.skipped?.invalidPhone || 0}, 중복 {shoongManualResult.skipped?.duplicate || 0}, 빈 행 {shoongManualResult.skipped?.noUser || 0}
                                </div>
                              ) : (
                                <div style={{ fontSize: '13px', color: '#34d399', lineHeight: 1.7 }}>
                                  ✅ <b>발송 완료</b>
                                  {shoongManualResult.testMode && (
                                    <span style={{ marginLeft: '6px', padding: '2px 8px', background: 'rgba(251,191,36,0.2)', color: '#fbbf24', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>🧪 테스트 모드</span>
                                  )}<br/>
                                  • 대상: <b style={{ color: '#fff' }}>{shoongManualResult.recipientCount?.toLocaleString()}명</b> ·
                                  성공 <b style={{ color: '#34d399' }}>{shoongManualResult.sent}</b> ·
                                  실패 <b style={{ color: '#f87171' }}>{shoongManualResult.failed}</b>
                                  {shoongManualResult.reservedTime && <><br/>• 예약 시간: <b>{shoongManualResult.reservedTime}</b></>}
                                  {shoongManualResult.errors?.length > 0 && (
                                    <details style={{ marginTop: '8px' }}>
                                      <summary style={{ cursor: 'pointer', color: '#fbbf24' }}>실패 샘플 ({shoongManualResult.errors.length}건)</summary>
                                      <pre style={{ fontSize: '11px', color: '#fca5a5', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: '6px 0 0 0' }}>{JSON.stringify(shoongManualResult.errors, null, 2)}</pre>
                                    </details>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 도움말 */}
                    <details style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '14px' }}>
                      <summary style={{ cursor: 'pointer', padding: '6px 0' }}>📖 결과 해석 가이드</summary>
                      <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.20)', borderRadius: '8px', lineHeight: 1.7 }}>
                        <div><b>HTTP 200 / success:true</b> → 발송 성공. 수신자에게 알림톡 도착.</div>
                        <div><b>HTTP 400</b> → 파라미터 오류 (필드 값 확인).</div>
                        <div><b>HTTP 401</b> → API 키 인증 실패 (서버 .env 확인).</div>
                        <div><b>HTTP 403</b> → IP 차단. 슝 어드민의 허용 IP 확인.</div>
                        <div><b>HTTP 404</b> → 템플릿 코드(<code>templatecode</code>)가 슝에 없음.</div>
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.10)', color: '#94a3b8' }}>
                          💡 발송은 모두 Vercel 서버 → 슝 API로 진행됩니다. 사용자 PC 위치(회사/집)와 무관하게 동일 결과.
                        </div>
                      </div>
                    </details>
                  </div>
                )
              })()}
            </div>
          )}

          {/* 시트 통합 탭 */}
          {currentTab === 'resources' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>📁 시트 통합 <HelpTooltip text={"구글 스프레드시트를 연동하여\n대시보드에서 바로 확인할 수 있습니다.\n+ 시트 추가로 URL을 등록하고\n탭을 클릭하여 데이터를 확인하세요.\n임베드/테이블 두 가지 뷰 모드를 지원합니다."} /></h2>
                {savedSheets.length > 0 && (
                  <button
                    onClick={() => { setShowDeleteSheet(true); setDeleteSheetIds([]) }}
                    style={{
                      padding: '8px 16px',
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: '8px',
                      color: '#f87171',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    🗑️ 시트 삭제
                  </button>
                )}
              </div>

              {/* 시트 선택 버튼들 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {savedSheets.map(sheet => (
                  <button
                    key={sheet.id}
                    onClick={() => selectSheet(sheet)}
                    style={{
                      padding: '14px 24px',
                      background: selectedSheet?.id === sheet.id ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                      border: selectedSheet?.id === sheet.id ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: '160px'
                    }}
                  >
                    📊 {sheet.name}
                  </button>
                ))}
                <button
                  onClick={() => setShowAddSheet(true)}
                  style={{
                    padding: '14px 24px',
                    background: 'transparent',
                    border: '2px dashed rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    minWidth: '160px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  + 시트 추가
                </button>
              </div>

              {/* 시트 추가 모달 */}
              {showAddSheet && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.6)', zIndex: 10000,
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={() => { setShowAddSheet(false); setAddSheetUrl(''); setAddSheetName('') }}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: '#1e293b', borderRadius: '16px', padding: '30px',
                    width: '480px', maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '20px' }}>시트 추가</h3>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>Google Sheets URL</label>
                      <input
                        value={addSheetUrl}
                        onChange={e => setAddSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        style={{
                          width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                          color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>시트 이름 (비워두면 자동 감지)</label>
                      <input
                        value={addSheetName}
                        onChange={e => setAddSheetName(e.target.value)}
                        placeholder="예: 주간 보고 시트"
                        style={{
                          width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                          color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setShowAddSheet(false); setAddSheetUrl(''); setAddSheetName('') }}
                        style={{
                          padding: '10px 20px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                          color: '#94a3b8', fontSize: '14px', cursor: 'pointer'
                        }}
                      >
                        취소
                      </button>
                      <button
                        onClick={addNewSheet}
                        disabled={!addSheetUrl || addSheetLoading}
                        style={{
                          padding: '10px 20px',
                          background: addSheetUrl && !addSheetLoading ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.3)',
                          border: 'none', borderRadius: '8px',
                          color: '#fff', fontSize: '14px', fontWeight: '600',
                          cursor: addSheetUrl && !addSheetLoading ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {addSheetLoading ? '확인 중...' : '추가'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 시트 삭제 모달 */}
              {showDeleteSheet && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.6)', zIndex: 10000,
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={() => { setShowDeleteSheet(false); setDeleteSheetIds([]) }}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: '#1e293b', borderRadius: '16px', padding: '30px',
                    width: '480px', maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>시트 삭제</h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>삭제할 시트를 선택하세요.</p>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
                      {savedSheets.length === 0 ? (
                        <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>삭제할 수 있는 시트가 없습니다.</p>
                      ) : (
                        savedSheets.map(sheet => (
                          <label
                            key={sheet.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '12px 16px', marginBottom: '8px',
                              background: deleteSheetIds.includes(sheet.id) ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                              border: deleteSheetIds.includes(sheet.id) ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={deleteSheetIds.includes(sheet.id)}
                              onChange={() => {
                                setDeleteSheetIds(prev =>
                                  prev.includes(sheet.id) ? prev.filter(id => id !== sheet.id) : [...prev, sheet.id]
                                )
                              }}
                              style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>📊 {sheet.name}</div>
                              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}>{sheet.url}</div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setShowDeleteSheet(false); setDeleteSheetIds([]) }}
                        style={{
                          padding: '10px 20px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                          color: '#94a3b8', fontSize: '14px', cursor: 'pointer'
                        }}
                      >
                        취소
                      </button>
                      <button
                        onClick={() => removeSheets(deleteSheetIds)}
                        disabled={deleteSheetIds.length === 0 || deleteSheetLoading}
                        style={{
                          padding: '10px 20px',
                          background: deleteSheetIds.length > 0 && !deleteSheetLoading ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.2)',
                          border: 'none', borderRadius: '8px',
                          color: '#fff', fontSize: '14px', fontWeight: '600',
                          cursor: deleteSheetIds.length > 0 && !deleteSheetLoading ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {deleteSheetLoading ? '삭제 중...' : `삭제 (${deleteSheetIds.length})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {permissionError && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.6)', zIndex: 10000,
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={() => setPermissionError(null)}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: '#1e293b', borderRadius: '16px', padding: '30px',
                    width: '520px', maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f87171', marginBottom: '12px' }}>스프레드시트 접근 권한 없음</h3>
                    <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' }}>
                      이 스프레드시트가 &quot;제한됨&quot;으로 설정되어 있습니다.<br />
                      아래 이메일을 복사하여 스프레드시트 공유 설정에서 <strong style={{ color: '#fff' }}>뷰어</strong> 권한을 부여해주세요.
                    </p>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px', padding: '14px 16px', marginBottom: '16px'
                    }}>
                      <span style={{ color: '#e2e8f0', fontSize: '13px', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                        {permissionError}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(permissionError)
                          alert('복사되었습니다!')
                        }}
                        style={{
                          padding: '6px 14px', background: 'rgba(99,102,241,0.8)',
                          border: 'none', borderRadius: '6px', color: '#fff',
                          fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        복사
                      </button>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '12px', lineHeight: '1.5', marginBottom: '20px' }}>
                      구글 스프레드시트 → 공유 버튼 → 위 이메일 추가 → 뷰어 선택 → 전송
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setPermissionError(null)}
                        style={{
                          padding: '10px 24px', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                          color: '#94a3b8', fontSize: '14px', cursor: 'pointer'
                        }}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 선택된 시트가 없으면 안내 */}
              {!selectedSheet ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                  <p>위에서 시트를 선택해주세요.</p>
                </div>
              ) : (
              <>
              {/* 시트 탭 버튼들 */}
              {sheetTabs.length > 0 ? (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto', padding: '4px 0' }}>
                  {sheetTabs.map(tab => (
                    <button
                      key={tab.gid}
                      onClick={() => {
                        setCurrentResource(tab.gid)
                        setSheetApiData(null)
                        setIframeLoading(true)
                        if (resourceViewMode === 'api') {
                          fetchSheetDataByApi(spreadsheetId, tab.title)
                        }
                      }}
                      style={{
                        padding: '8px 14px',
                        background: currentResource === tab.gid ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                        border: currentResource === tab.gid ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ marginBottom: '16px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', textAlign: 'center' }}>
                  {sheetsLoading ? (
                    <p style={{ color: '#a5b4fc' }}>📊 시트 탭 불러오는 중...</p>
                  ) : (
                    <p style={{ color: '#64748b' }}>시트 탭을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
                  )}
                </div>
              )}

              {/* 컨트롤 바 */}
              {sheetTabs.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* 뷰 모드 토글 */}
                  <HelpTooltip text={"임베드: 구글 시트 원본을 그대로 표시\n(스타일 유지, 로딩 느림)\n\n테이블: API로 데이터만 가져와 표시\n(빠른 로딩, 정렬 가능)"} size={13} />
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
                    <button
                      onClick={() => setResourceViewMode('iframe')}
                      style={{
                        padding: '6px 12px',
                        background: resourceViewMode === 'iframe' ? 'rgba(99,102,241,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: resourceViewMode === 'iframe' ? '#a5b4fc' : '#64748b',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📄 임베드
                    </button>
                    <button
                      onClick={() => {
                        setResourceViewMode('api')
                        if (selectedSheetTab && !sheetApiData) {
                          fetchSheetDataByApi(spreadsheetId, selectedSheetTab.title)
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: resourceViewMode === 'api' ? 'rgba(99,102,241,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: resourceViewMode === 'api' ? '#a5b4fc' : '#64748b',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📊 테이블 (빠름)
                    </button>
                  </div>

                  {/* 줌 컨트롤 (임베드 모드에서만) */}
                  {resourceViewMode === 'iframe' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 8px' }}>
                      <button
                        onClick={() => setResourceZoom(Math.max(40, resourceZoom - 10))}
                        style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#a5b4fc', fontSize: '14px', cursor: 'pointer' }}
                      >
                        −
                      </button>
                      <span style={{ color: '#94a3b8', fontSize: '12px', minWidth: '45px', textAlign: 'center' }}>{resourceZoom}%</span>
                      <button
                        onClick={() => setResourceZoom(Math.min(120, resourceZoom + 10))}
                        style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#a5b4fc', fontSize: '14px', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* 전체화면 버튼 */}
                  <button
                    onClick={() => setResourceFullscreen(true)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ⛶ 전체화면
                  </button>

                  {/* 새로고침 버튼 */}
                  <button
                    onClick={() => {
                      if (resourceViewMode === 'api' && selectedSheetTab) {
                        fetchSheetDataByApi(spreadsheetId, selectedSheetTab.title)
                      } else {
                        setIframeLoading(true)
                      }
                    }}
                    disabled={sheetApiLoading}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '12px',
                      cursor: sheetApiLoading ? 'not-allowed' : 'pointer',
                      opacity: sheetApiLoading ? 0.5 : 1
                    }}
                  >
                    {sheetApiLoading ? '⏳ 로딩...' : '🔄 새로고침'}
                  </button>

                  {/* 새 탭에서 열기 */}
                  {getCurrentTabUrl() && (
                    <a
                      href={getCurrentTabUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(16,185,129,0.15)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: '8px',
                        color: '#34d399',
                        fontSize: '12px',
                        textDecoration: 'none',
                        marginLeft: 'auto'
                      }}
                    >
                      🔗 새 탭에서 열기
                    </a>
                  )}
                </div>
              )}

              {/* 시트 표시 영역 */}
              {sheetTabs.length > 0 && currentResource !== null ? (
                <div style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                  height: 'calc(100vh - 280px)',
                  minHeight: '500px',
                  position: 'relative'
                }}>
                  {resourceViewMode === 'iframe' ? (
                    // 임베드 모드 (줌 지원)
                    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff' }}>
                      {/* 로딩 인디케이터 */}
                      {iframeLoading && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          background: '#fff',
                          zIndex: 10
                        }}>
                          <div style={{ textAlign: 'center', color: '#64748b' }}>
                            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
                            <p style={{ fontSize: '14px' }}>시트를 불러오는 중...</p>
                            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>잠시만 기다려주세요</p>
                          </div>
                        </div>
                      )}
                      {getCurrentEmbedUrl() && (
                        <iframe
                          src={getCurrentEmbedUrl()}
                          onLoad={() => setIframeLoading(false)}
                          style={{
                            width: `${10000 / resourceZoom}%`,
                            height: `${10000 / resourceZoom}%`,
                            border: 'none',
                            transform: `scale(${resourceZoom / 100})`,
                            transformOrigin: 'top left',
                            opacity: iframeLoading ? 0 : 1,
                            transition: 'opacity 0.3s ease'
                          }}
                          title={selectedSheetTab?.title || '시트'}
                        />
                      )}
                    </div>
                  ) : (
                    // API 테이블 모드 - 밝은 배경 스타일
                    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#ffffff', borderRadius: '8px' }}>
                      {sheetApiLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                            <p>데이터를 불러오는 중...</p>
                          </div>
                        </div>
                      ) : sheetApiData ? (
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px', background: '#fff' }}>
                          <thead>
                            {/* 첫 번째 행 - 테이블 제목 (sticky) */}
                            {sheetApiData.length > 0 && (
                              <tr>
                                {sheetApiData[0].map((cell, i) => (
                                  <th key={i} style={{
                                    padding: '12px 14px',
                                    background: '#1e3a5f',
                                    borderBottom: 'none',
                                    borderRight: '1px solid rgba(255,255,255,0.2)',
                                    textAlign: 'left',
                                    fontWeight: '700',
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 3
                                  }}>
                                    {cell}
                                  </th>
                                ))}
                              </tr>
                            )}
                            {/* 두 번째 행 - 컬럼 헤더 (스크롤) */}
                            {sheetApiData.length > 1 && (
                              <tr>
                                {sheetApiData[1].map((cell, i) => (
                                  <th key={i} style={{
                                    padding: '10px 14px',
                                    background: '#f0f4f8',
                                    borderBottom: '2px solid #3b82f6',
                                    borderRight: '1px solid #e2e8f0',
                                    textAlign: 'left',
                                    fontWeight: '600',
                                    color: '#1e293b',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {cell}
                                  </th>
                                ))}
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {sheetApiData.slice(2).map((row, rowIdx) => (
                              <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                {row.map((cell, cellIdx) => (
                                  <td key={cellIdx} style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid #e2e8f0',
                                    borderRight: '1px solid #f1f5f9',
                                    color: '#334155',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                            <p>테이블 모드로 보려면 시트가 공개되어 있어야 합니다.</p>
                            <p style={{ fontSize: '12px', marginTop: '8px' }}>시트 설정 → 공유 → &quot;링크가 있는 모든 사용자&quot;</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                  <p>시트 탭을 선택해주세요.</p>
                </div>
              )}
              </>
              )}
            </div>
          )}

          {/* CS AI 탭 */}
          {currentTab === 'cs-ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)' }}>
              {/* 헤더 */}
              <div style={{ marginBottom: '16px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🤖 CS 대응 AI
                    <HelpTooltip text={"고객 문의 내용을 입력하면\nAI가 채널톡 대화 조회, 정책 검색,\n상담 이력 검색을 자동으로 수행하여\n전문적인 CS 답변을 생성합니다.\n\n예시:\n• '김철수 채널톡 가져와'\n• '환불 요청 어떻게 대응해?'\n• '결제 오류 문의 답변 만들어줘'"} />
                  </h2>
                  <button
                    onClick={() => {
                      if (csSyncing) return
                      setCsSyncing(true)
                      setCsSyncResult(null)
                      fetch('/api/cs-history/sync', {
                        method: 'POST',
                        headers: getAuthHeaders()
                      })
                        .then(res => res.json())
                        .then(data => {
                          setCsSyncResult(data.error ? `실패: ${data.error}` : data.message)
                          setCsSyncing(false)
                          setTimeout(() => setCsSyncResult(null), 5000)
                        })
                        .catch(() => {
                          setCsSyncResult('동기화 중 오류 발생')
                          setCsSyncing(false)
                          setTimeout(() => setCsSyncResult(null), 5000)
                        })
                    }}
                    disabled={csSyncing}
                    style={{
                      padding: '8px 16px',
                      background: csSyncing ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.1)',
                      border: `1px solid ${csSyncing ? 'rgba(99,102,241,0.3)' : 'rgba(16,185,129,0.25)'}`,
                      borderRadius: '10px',
                      color: csSyncing ? '#a5b4fc' : '#34d399',
                      fontSize: '13px',
                      cursor: csSyncing ? 'not-allowed' : 'pointer',
                      fontWeight: '500',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >{csSyncing ? '⏳ 동기화 중...' : '🔄 채널톡 이력 동기화'}</button>
                </div>
                {csSyncResult && (
                  <div style={{
                    marginTop: '8px', padding: '8px 14px', borderRadius: '8px',
                    background: csSyncResult.startsWith('실패') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    border: `1px solid ${csSyncResult.startsWith('실패') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    color: csSyncResult.startsWith('실패') ? '#f87171' : '#34d399',
                    fontSize: '13px'
                  }}>{csSyncResult}</div>
                )}
              </div>

              <>
                  {/* 채팅 영역 */}
                  <div style={{
                    flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: '16px',
                    display: 'flex', flexDirection: 'column', gap: '16px'
                  }}>
                    {csMessages.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: '16px' }}>
                        <div style={{ fontSize: '64px' }}>🤖</div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '18px', fontWeight: '600', color: '#94a3b8', marginBottom: '8px' }}>CS 대응 AI</p>
                          <p style={{ fontSize: '14px', lineHeight: '1.6' }}>고객 문의 내용을 입력하면<br/>전문적인 CS 답변을 생성해드립니다</p>
                          <p style={{ fontSize: '12px', color: '#475569', marginTop: '8px' }}>이미지도 첨부할 수 있습니다 (스크린샷, 결제내역 등)</p>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                          {['환불 요청 고객 대응', '결제 오류 문의', '강의 불만 컴플레인', '수강 방법 문의'].map(example => (
                            <button key={example} onClick={() => setCsInput(example)} style={{
                              padding: '8px 16px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                              borderRadius: '20px', color: '#a5b4fc', fontSize: '13px', cursor: 'pointer'
                            }}>{example}</button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      csMessages.map((msg, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '10px' }}>
                          {msg.role === 'assistant' && (
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0
                            }}>🤖</div>
                          )}
                          <div style={{
                            maxWidth: '75%', padding: '14px 18px',
                            borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.08)',
                            border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0', fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                          }}>
                            {/* 이미지 미리보기 */}
                            {msg.images && msg.images.length > 0 && (
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: msg.content ? '10px' : 0 }}>
                                {msg.images.map((img, i) => (
                                  <img key={i} src={img.preview} alt="" style={{
                                    maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', objectFit: 'cover'
                                  }} />
                                ))}
                              </div>
                            )}
                            {msg.role === 'assistant' && msg.toolsUsed && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '4px 10px', borderRadius: '6px', marginBottom: '10px',
                                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                                fontSize: '11px', color: '#34d399'
                              }}>⚡ 채널톡/정책/이력 자동 조회 완료</div>
                            )}
                            {msg.content}
                            {msg.role === 'assistant' && (
                              <button onClick={() => { navigator.clipboard.writeText(msg.content) }} style={{
                                display: 'block', marginTop: '10px', padding: '4px 10px',
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '6px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer'
                              }}>📋 복사</button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {csSending && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0
                        }}>🤖</div>
                        <div style={{
                          padding: '14px 18px', borderRadius: '18px 18px 18px 4px',
                          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#94a3b8', fontSize: '14px'
                        }}>답변 생성 중...</div>
                      </div>
                    )}
                    <div ref={csEndRef} />
                  </div>

                  {/* 이미지 미리보기 */}
                  {csImages.length > 0 && (
                    <div style={{
                      display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)', borderRadius: '12px 12px 0 0',
                      border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none'
                    }}>
                      {csImages.map((img, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={img.preview} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                          <button onClick={() => {
                            URL.revokeObjectURL(img.preview)
                            setCsImages(prev => prev.filter((_, idx) => idx !== i))
                          }} style={{
                            position: 'absolute', top: '-6px', right: '-6px',
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: '#ef4444', border: 'none', color: '#fff',
                            fontSize: '12px', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', lineHeight: 1
                          }}>x</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 입력 영역 */}
                  <div style={{
                    display: 'flex', gap: '10px', flexShrink: 0,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: csImages.length > 0 ? '0 0 16px 16px' : '16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderTop: csImages.length > 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.08)',
                    padding: '12px'
                  }}>
                    <input
                      type="file"
                      ref={csFileRef}
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        for (const file of files) {
                          const reader = new FileReader()
                          reader.onload = (ev) => {
                            const base64 = ev.target.result.split(',')[1]
                            setCsImages(prev => [...prev, {
                              file,
                              preview: URL.createObjectURL(file),
                              data: base64,
                              mediaType: file.type
                            }])
                          }
                          reader.readAsDataURL(file)
                        }
                        e.target.value = ''
                      }}
                    />
                    <button onClick={() => csFileRef.current?.click()} title="이미지 첨부" style={{
                      padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>🖼️</button>
                    <textarea
                      value={csInput}
                      onChange={(e) => setCsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if ((csInput.trim() || csImages.length > 0) && !csSending) {
                            const userMsg = {
                              role: 'user',
                              content: csInput.trim(),
                              images: csImages.map(img => ({ preview: img.preview, data: img.data, mediaType: img.mediaType }))
                            }
                            const newMessages = [...csMessages, userMsg]
                            setCsMessages(newMessages)
                            setCsInput('')
                            setCsImages([])
                            setCsSending(true)
                            setTimeout(() => csEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                            fetch('/api/cs-ai', {
                              method: 'POST',
                              headers: getAuthHeaders(),
                              body: JSON.stringify({ messages: newMessages.map(m => ({
                                role: m.role, content: m.content,
                                images: m.images?.filter(img => img.data).map(img => ({ data: img.data, mediaType: img.mediaType }))
                              }))})
                            })
                              .then(res => res.json())
                              .then(data => {
                                setCsMessages(prev => [...prev, { role: 'assistant', content: data.reply || '답변 생성에 실패했습니다.', toolsUsed: data.toolsUsed }])
                                setCsSending(false)
                                setTimeout(() => csEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                              })
                              .catch(() => {
                                setCsMessages(prev => [...prev, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }])
                                setCsSending(false)
                              })
                          }
                        }
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items
                        if (!items) return
                        for (const item of items) {
                          if (item.type.startsWith('image/')) {
                            e.preventDefault()
                            const file = item.getAsFile()
                            const reader = new FileReader()
                            reader.onload = (ev) => {
                              const base64 = ev.target.result.split(',')[1]
                              setCsImages(prev => [...prev, {
                                file,
                                preview: URL.createObjectURL(file),
                                data: base64,
                                mediaType: file.type
                              }])
                            }
                            reader.readAsDataURL(file)
                          }
                        }
                      }}
                      placeholder="고객 문의 내용을 입력하세요... (Enter 전송 / 이미지 붙여넣기 가능)"
                      style={{
                        flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0',
                        fontSize: '14px', resize: 'none', minHeight: '48px', maxHeight: '120px',
                        outline: 'none', fontFamily: 'inherit', lineHeight: '1.5'
                      }}
                      rows={1}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        onClick={() => {
                          if ((csInput.trim() || csImages.length > 0) && !csSending) {
                            const userMsg = {
                              role: 'user',
                              content: csInput.trim(),
                              images: csImages.map(img => ({ preview: img.preview, data: img.data, mediaType: img.mediaType }))
                            }
                            const newMessages = [...csMessages, userMsg]
                            setCsMessages(newMessages)
                            setCsInput('')
                            setCsImages([])
                            setCsSending(true)
                            setTimeout(() => csEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                            fetch('/api/cs-ai', {
                              method: 'POST',
                              headers: getAuthHeaders(),
                              body: JSON.stringify({ messages: newMessages.map(m => ({
                                role: m.role, content: m.content,
                                images: m.images?.filter(img => img.data).map(img => ({ data: img.data, mediaType: img.mediaType }))
                              }))})
                            })
                              .then(res => res.json())
                              .then(data => {
                                setCsMessages(prev => [...prev, { role: 'assistant', content: data.reply || '답변 생성에 실패했습니다.', toolsUsed: data.toolsUsed }])
                                setCsSending(false)
                                setTimeout(() => csEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                              })
                              .catch(() => {
                                setCsMessages(prev => [...prev, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }])
                                setCsSending(false)
                              })
                          }
                        }}
                        disabled={(!csInput.trim() && csImages.length === 0) || csSending}
                        style={{
                          padding: '12px 20px',
                          background: (csInput.trim() || csImages.length > 0) && !csSending ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(99,102,241,0.2)',
                          border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '600',
                          cursor: (csInput.trim() || csImages.length > 0) && !csSending ? 'pointer' : 'not-allowed',
                          opacity: (csInput.trim() || csImages.length > 0) && !csSending ? 1 : 0.5, whiteSpace: 'nowrap'
                        }}
                      >{csSending ? '⏳' : '전송'}</button>
                      {csMessages.length > 0 && (
                        <button onClick={() => { setCsMessages([]); setCsInput(''); setCsImages([]) }} style={{
                          padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: '10px', color: '#f87171', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
                        }}>초기화</button>
                      )}
                    </div>
                  </div>
                </>
            </div>
          )}

          {/* 리소스 전체화면 모달 */}
          {resourceFullscreen && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#0a0a12',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* 모달 헤더 */}
              <div style={{
                padding: '12px 20px',
                background: 'rgba(30,30,50,0.9)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>📊</span>
                  <span style={{ color: '#fff', fontWeight: '600' }}>
                    {selectedSheetTab?.title || ''}
                  </span>

                  {/* 뷰 모드 토글 */}
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px', marginLeft: '20px' }}>
                    <button
                      onClick={() => setResourceViewMode('iframe')}
                      style={{
                        padding: '4px 10px',
                        background: resourceViewMode === 'iframe' ? 'rgba(99,102,241,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: resourceViewMode === 'iframe' ? '#a5b4fc' : '#64748b',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      임베드
                    </button>
                    <button
                      onClick={() => {
                        setResourceViewMode('api')
                        if (selectedSheetTab && !sheetApiData) {
                          fetchSheetDataByApi(spreadsheetId, selectedSheetTab.title)
                        }
                      }}
                      style={{
                        padding: '4px 10px',
                        background: resourceViewMode === 'api' ? 'rgba(99,102,241,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: resourceViewMode === 'api' ? '#a5b4fc' : '#64748b',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      테이블
                    </button>
                  </div>

                  {/* 줌 컨트롤 */}
                  {resourceViewMode === 'iframe' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button onClick={() => setResourceZoom(Math.max(40, resourceZoom - 10))} style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#a5b4fc', cursor: 'pointer' }}>−</button>
                      <span style={{ color: '#94a3b8', fontSize: '11px', minWidth: '40px', textAlign: 'center' }}>{resourceZoom}%</span>
                      <button onClick={() => setResourceZoom(Math.min(120, resourceZoom + 10))} style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#a5b4fc', cursor: 'pointer' }}>+</button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={getCurrentTabUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(16,185,129,0.2)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: '6px',
                      color: '#34d399',
                      fontSize: '12px',
                      textDecoration: 'none'
                    }}
                  >
                    🔗 새 탭
                  </a>
                  <button
                    onClick={() => setResourceFullscreen(false)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(239,68,68,0.2)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: '6px',
                      color: '#f87171',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ 닫기
                  </button>
                </div>
              </div>

              {/* 모달 컨텐츠 */}
              <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
                {resourceViewMode === 'iframe' ? (
                  <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff' }}>
                    {spreadsheetId && currentResource !== null && (
                      <iframe
                        src={getCurrentEmbedUrl()}
                        style={{
                          width: `${10000 / resourceZoom}%`,
                          height: `${10000 / resourceZoom}%`,
                          border: 'none',
                          transform: `scale(${resourceZoom / 100})`,
                          transformOrigin: 'top left'
                        }}
                        title={selectedSheetTab?.title || ''}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '20px', height: '100%', overflow: 'auto', background: '#f8fafc' }}>
                    {sheetApiLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                          <p>데이터를 불러오는 중...</p>
                        </div>
                      </div>
                    ) : sheetApiData ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <thead>
                          {/* 첫 번째 행 - 테이블 제목 (sticky) */}
                          {sheetApiData.length > 0 && (
                            <tr>
                              {sheetApiData[0].map((cell, i) => (
                                <th key={i} style={{
                                  padding: '14px 16px',
                                  background: '#1e3a5f',
                                  borderBottom: '1px solid #ccc',
                                  borderRight: '1px solid rgba(255,255,255,0.2)',
                                  textAlign: 'left',
                                  fontWeight: '700',
                                  color: '#fff',
                                  whiteSpace: 'nowrap',
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: 2
                                }}>
                                  {cell}
                                </th>
                              ))}
                            </tr>
                          )}
                          {/* 두 번째 행 - 컬럼 헤더 */}
                          {sheetApiData.length > 1 && (
                            <tr>
                              {sheetApiData[1].map((cell, i) => (
                                <th key={i} style={{
                                  padding: '12px 16px',
                                  background: '#f0f4f8',
                                  borderBottom: '2px solid #3b82f6',
                                  borderRight: '1px solid #e2e8f0',
                                  textAlign: 'left',
                                  fontWeight: '600',
                                  color: '#1e293b',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {cell}
                                </th>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {sheetApiData.slice(2).map((row, rowIdx) => (
                            <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} style={{
                                  padding: '12px 16px',
                                  borderBottom: '1px solid #e2e8f0',
                                  borderRight: '1px solid #f1f5f9',
                                  color: '#334155',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                        <p>테이블 모드로 보려면 시트가 공개되어 있어야 합니다.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 무료강의 분석기 탭 */}
          {currentTab === 'lecture-analyzer' && (
            <div style={{ padding: isMobile ? '16px' : '32px', maxWidth: '900px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🎓 무료강의 분석기
                <HelpTooltip text={"무료강의 영상(3~6시간)을 Gemini AI로 분석합니다.\n\n• YouTube URL 입력\n• 자막 자동 추출 → Gemini 분석\n• API Key는 서버 환경변수로 관리 (입력 불필요)"} />
              </h2>
              <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '28px', lineHeight: 1.6 }}>
                YouTube 영상 링크를 입력하면 Gemini AI가 자동으로 분석합니다.
              </p>

              {/* Step 1: YouTube URL 입력 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>Step 1</span>
                  <span style={{ fontSize: '15px', fontWeight: '600' }}>YouTube 링크 입력</span>
                </div>

                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>YouTube URL</label>
                <input
                  type="text"
                  value={laYoutubeUrl}
                  onChange={(e) => {
                    setLaYoutubeUrl(e.target.value)
                    setLaVideoTitle('')
                    setLaVideoDuration(null)
                  }}
                  placeholder="https://www.youtube.com/watch?v=... 또는 https://youtu.be/..."
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  YouTube 자막을 자동 추출하여 Gemini가 분석합니다.
                </p>
                {laVideoTitle && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '600' }}>{laVideoTitle}</div>
                    {laVideoDuration && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        영상 길이: {Math.floor(laVideoDuration / 3600) > 0 ? `${Math.floor(laVideoDuration / 3600)}시간 ` : ''}{Math.floor((laVideoDuration % 3600) / 60)}분
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: 분석 프롬프트 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>Step 2</span>
                  <span style={{ fontSize: '15px', fontWeight: '600' }}>분석 프롬프트</span>
                </div>
                <textarea
                  value={laPrompt}
                  onChange={(e) => setLaPrompt(e.target.value)}
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    resize: 'vertical'
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  AI에게 전달할 분석 명령입니다. 필요에 따라 수정하세요.
                </p>
              </div>

              {/* 실행 버튼 */}
              <button
                onClick={async () => {
                  if (!laYoutubeUrl) { setLaError('YouTube URL을 입력해주세요.'); return }

                  setLaError('')
                  setLaProcessing(true)
                  setLaResult(null)
                  setLaProgress({ step: '영상 정보 확인 중...', percent: 3, detail: 'YouTube 영상 정보를 가져오는 중...' })

                  try {
                    // 영상 정보 가져오기 (제목, 길이)
                    let videoTitle = laVideoTitle
                    let videoDuration = laVideoDuration
                    try {
                      const infoRes = await fetch('/api/youtube-info', {
                        method: 'POST',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: laYoutubeUrl })
                      })
                      if (infoRes.ok) {
                        const infoData = await infoRes.json()
                        if (infoData.title) {
                          videoTitle = infoData.title
                          setLaVideoTitle(infoData.title)
                        }
                        if (infoData.duration) {
                          videoDuration = infoData.duration
                          setLaVideoDuration(infoData.duration)
                        }
                      }
                    } catch {}

                    // 예상 소요시간 계산
                    let timeEstimate = ''
                    if (videoDuration) {
                      const hours = videoDuration / 3600
                      if (hours >= 5) timeEstimate = '영상이 5시간 이상으로, 분석에 10분 이상 소요될 수 있습니다.'
                      else if (hours >= 3) timeEstimate = '영상이 3시간 이상으로, 분석에 5~10분 소요될 수 있습니다.'
                      else if (hours >= 1) timeEstimate = '영상이 1시간 이상으로, 분석에 3~5분 소요될 수 있습니다.'
                      else timeEstimate = '분석에 1~3분 소요될 수 있습니다.'
                    }

                    setLaProgress({ step: '준비 중...', percent: 5, detail: timeEstimate || 'Gemini 분석을 시작합니다.' })

                    const formData = new FormData()
                    formData.append('prompt', laPrompt)
                    formData.append('inputMode', 'youtube')
                    formData.append('youtubeUrl', laYoutubeUrl)

                    setLaProgress({ step: '서버 전송 중...', percent: 10, detail: timeEstimate ? `YouTube URL을 서버에 전달합니다... (${timeEstimate})` : 'YouTube URL을 서버에 전달합니다...' })

                    const token = getAuthToken()
                    const response = await fetch('/api/lecture-analyze-gemini', {
                      method: 'POST',
                      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                      body: formData
                    })

                    if (!response.ok) {
                      const errData = await response.json()
                      throw new Error(errData.error || '분석 실패')
                    }

                    const reader = response.body.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''
                    let finalAnalysis = null

                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) break

                      buffer += decoder.decode(value, { stream: true })
                      const lines = buffer.split('\n')
                      buffer = lines.pop() || ''

                      for (const line of lines) {
                        if (line.startsWith('data: ')) {
                          try {
                            const data = JSON.parse(line.slice(6))
                            if (data.type === 'progress') {
                              const detail = timeEstimate && data.percent < 90 ? `${data.detail || ''} ${data.detail ? '·' : ''} ${timeEstimate}`.trim() : (data.detail || '')
                              setLaProgress({ step: data.step, percent: data.percent, detail })
                            } else if (data.type === 'result') {
                              finalAnalysis = data.analysis
                              setLaResult({ analysis: data.analysis })
                              setLaProgress({ step: '완료', percent: 100, detail: '분석이 완료되었습니다!' })
                            } else if (data.type === 'error') {
                              throw new Error(data.message)
                            }
                          } catch (parseErr) {
                            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
                          }
                        }
                      }
                    }

                    // 분석 완료 후 DB에 저장
                    if (finalAnalysis) {
                      try {
                        await fetch('/api/lecture-history', {
                          method: 'POST',
                          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'save',
                            youtubeUrl: laYoutubeUrl,
                            videoTitle: videoTitle || laYoutubeUrl,
                            videoDuration: videoDuration || null,
                            analysis: finalAnalysis,
                            prompt: laPrompt
                          })
                        })
                        // 히스토리 새로고침
                        const listRes = await fetch('/api/lecture-history', {
                          method: 'POST',
                          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'list' })
                        })
                        const listData = await listRes.json()
                        if (listData.success) setLaHistory(listData.items)
                      } catch {}
                    }
                  } catch (err) {
                    setLaError(err.message || '분석 중 오류가 발생했습니다.')
                    setLaProgress({ step: '', percent: 0, detail: '' })
                  } finally {
                    setLaProcessing(false)
                  }
                }}
                disabled={laProcessing}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: laProcessing ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  border: 'none',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: laProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '20px'
                }}
              >
                {laProcessing ? '⏳ 분석 진행 중...' : '🚀 Gemini로 분석 시작'}
              </button>

              {/* 에러 메시지 */}
              {laError && (
                <div style={{
                  padding: '14px 18px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: '12px',
                  color: '#f87171',
                  fontSize: '14px',
                  marginBottom: '20px',
                  whiteSpace: 'pre-wrap'
                }}>
                  {laError}
                </div>
              )}

              {/* 진행 상황 */}
              {laProcessing && laProgress.step && (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', animation: 'laPulse 1.5s ease-in-out infinite'
                    }}>
                      {laProgress.percent < 30 ? '📡' : laProgress.percent < 60 ? '⚙️' : laProgress.percent < 90 ? '🤖' : '✅'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#a5b4fc' }}>{laProgress.step}</span>
                        <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>{laProgress.percent}%</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{
                      width: `${laProgress.percent}%`,
                      height: '100%',
                      background: laProgress.percent >= 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #6366f1, #818cf8)',
                      borderRadius: '5px',
                      transition: 'width 0.5s ease',
                      backgroundSize: '200% 100%',
                      animation: laProgress.percent < 100 ? 'laShimmer 2s linear infinite' : 'none'
                    }} />
                  </div>
                  {laProgress.detail && (
                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>{laProgress.detail}</p>
                  )}
                  {laVideoDuration && laVideoDuration >= 3600 && laProgress.percent < 90 && (
                    <div style={{
                      marginTop: '10px', padding: '8px 12px',
                      background: 'rgba(250,204,21,0.08)', borderRadius: '8px', border: '1px solid rgba(250,204,21,0.15)',
                      fontSize: '12px', color: '#fcd34d', display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      ⏱️ {Math.floor(laVideoDuration / 3600)}시간 이상 영상은 분석에 {laVideoDuration >= 18000 ? '10분 이상' : laVideoDuration >= 10800 ? '5~10분' : '3~5분'} 소요될 수 있습니다.
                    </div>
                  )}
                </div>
              )}

              {/* 분석 결과 */}
              {laResult && (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📊 AI 분석 결과
                      <span style={{ fontSize: '11px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '6px' }}>Gemini</span>
                    </h3>
                    <button
                      onClick={() => {
                        const text = `--- AI 분석 결과 (Gemini) ---\n\n${laResult.analysis}`
                        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `무료강의_분석_${new Date().toISOString().slice(0, 10)}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      style={{
                        padding: '8px 14px',
                        background: 'rgba(16,185,129,0.1)',
                        border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: '8px',
                        color: '#34d399',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      📥 다운로드
                    </button>
                  </div>
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    fontSize: '14px',
                    color: '#e2e8f0',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {laResult.analysis}
                  </div>
                </div>
              )}

              {/* 분석 히스토리 (저장된 세션) */}
              <div style={{
                marginTop: '28px',
                padding: '20px',
                background: 'rgba(99,102,241,0.08)',
                borderRadius: '16px',
                border: '1px solid rgba(99,102,241,0.15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📁 분석 히스토리
                  </h4>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/lecture-history', {
                          method: 'POST',
                          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'list' })
                        })
                        const data = await res.json()
                        if (data.success) setLaHistory(data.items)
                      } catch {}
                    }}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(99,102,241,0.2)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: '6px',
                      color: '#a5b4fc',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 새로고침
                  </button>
                </div>

                {laHistory.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px' }}>저장된 분석 기록이 없습니다.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflow: 'auto' }}>
                    {laHistory.map(item => (
                      <div key={item.id} style={{
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}>
                        <div
                          style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/lecture-history', {
                                method: 'POST',
                                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'get', id: item.id })
                              })
                              const data = await res.json()
                              if (data.success) setLaViewItem(data.item)
                            } catch {}
                          }}
                        >
                          <div style={{ fontWeight: '600', color: '#a5b4fc', fontSize: '14px', marginBottom: '4px', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.video_title || item.youtube_url}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>{formatKST(item.created_at, 'full')}</span>
                            {item.video_duration && (
                              <span>· {Math.floor(item.video_duration / 3600) > 0 ? `${Math.floor(item.video_duration / 3600)}시간 ` : ''}{Math.floor((item.video_duration % 3600) / 60)}분</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/lecture-history', {
                                  method: 'POST',
                                  headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'get', id: item.id })
                                })
                                const data = await res.json()
                                if (data.success) setLaViewItem(data.item)
                              } catch {}
                            }}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(99,102,241,0.2)',
                              border: '1px solid rgba(99,102,241,0.3)',
                              borderRadius: '6px',
                              color: '#a5b4fc',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            👁️ 보기
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/lecture-history', {
                                  method: 'POST',
                                  headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'get', id: item.id })
                                })
                                const data = await res.json()
                                if (data.success) {
                                  const fullItem = data.item
                                  const text = `--- 무료강의 분석 결과 ---\n영상: ${fullItem.video_title || ''}\nURL: ${fullItem.youtube_url || ''}\n분석일: ${formatKST(fullItem.created_at, 'full')}\n\n${fullItem.analysis}`
                                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `강의분석_${(fullItem.video_title || 'result').slice(0, 30)}_${new Date(fullItem.created_at).toISOString().slice(0, 10)}.txt`
                                  a.click()
                                  URL.revokeObjectURL(url)
                                }
                              } catch {}
                            }}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(16,185,129,0.2)',
                              border: '1px solid rgba(16,185,129,0.3)',
                              borderRadius: '6px',
                              color: '#10b981',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            📥
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('이 분석 기록을 삭제하시겠습니까?')) return
                              try {
                                await fetch('/api/lecture-history', {
                                  method: 'POST',
                                  headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'delete', id: item.id })
                                })
                                setLaHistory(prev => prev.filter(h => h.id !== item.id))
                              } catch {}
                            }}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(239,68,68,0.2)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: '6px',
                              color: '#f87171',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🪄 프로젝트 기획 탭 (멀티 봇 오케스트레이터) */}
          {currentTab === 'project-planner' && (() => {
            const PLANNER_META = {
              ebook:             { label: '무료 전자책 기획안',     icon: '📚', desc: '썸네일 카피 + 제목 + 도입 후크 + 본문 4섹션 + CTA', enabled: true },
              boomUp:            { label: '붐업 멘트 (스타일별)',    icon: '🎉', desc: '단톡방/라이브 시작 직전 분위기 띄우는 멘트 3종',     enabled: true },
              alimtalk:          { label: '채널톡 멘트',              icon: '💬', desc: '인입/후속/리마인드 시나리오 3종 (알림톡은 템플릿 별도)',  enabled: true },
              viralQ:            { label: '바이럴 질문',            icon: '❓', desc: '단톡방 참여 유도 질문 10개',                       enabled: true },
              ppt:               { label: '강의 PPT outline',       icon: '📋', desc: '슬라이드별 outline + 발표 멘트 초안',             enabled: true },
              salesPage:         { label: '무료 상페 카피',          icon: '📄', desc: '무료강의 상세페이지 섹션별 카피',                  enabled: true },
              groupAnnouncement: { label: '단톡방 입장시 필독 공지',  icon: '📢', desc: '신규 입장자가 처음 보는 공지 (N잡 표준 양식)',     enabled: true },
            }

            // 강사/기수는 전역 selectedInstructor + selectedSessionId 사용. 자료는 attachments 재사용.
            const currentSession = sessions.find(s => s.id === selectedSessionId) || null
            const sessionsForInstructor = sessions
              .filter(s => s.instructors?.name === selectedInstructor)
              .sort((a, b) => getSessionNumber(a.session_name) - getSessionNumber(b.session_name))
            // 신규 강사도 포함되도록 instructors 테이블에서 직접 가져옴 (sessions 기반이면 기수 있는 강사만 노출됨)
            const instructorNames = [...new Set(instructors.map(i => i.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
            const ready = !!selectedInstructor && !!selectedSessionId
            const instructorObj = instructors.find(i => i.name === selectedInstructor)

            // ▼ "준비중" 판단: 매출표 시트(allSheetData)의 이름에 강사가 등장하는지로 판단.
            // 시트 row.name 형식 예: "김탄생 1기", "청담언니 루시 1기".
            // → 정규식 (.+?)\s+\d+\s*기 로 강사명 부분만 추출.
            const sheetInstructorSet = new Set()
            const sheetFullNameSet = new Set()
            ;(allSheetData || []).forEach(d => {
              const raw = (d?.name || '').trim()
              if (!raw) return
              sheetFullNameSet.add(raw)
              const m = raw.match(/^(.+?)\s+\d+\s*기/)
              sheetInstructorSet.add(m ? m[1].trim() : raw)
            })
            // 시트가 아직 로드되지 않은 상태에서는 모든 강사를 '준비중'으로 잘못 표기하는 깜빡임 방지 →
            // sheetReady가 false면 배지 보류 (false 반환).
            const sheetReady = sheetInstructorSet.size > 0
            const isInstructorPreparing = (name) => {
              if (!sheetReady || !name) return false
              // 'session_name=준비중'과 일관성: 그냥 시트에 없으면 true
              return !sheetInstructorSet.has(name)
            }
            const isSessionPreparing = (instName, sessName) => {
              if (!instName || !sessName) return false
              // 자리표시 준비중 기수는 항상 (준비중)
              if (sessName === '준비중') return true
              if (!sheetReady) return false
              return !sheetFullNameSet.has(`${instName} ${sessName}`)
            }

            const toggleTask = (key) => {
              if (!PLANNER_META[key]?.enabled) return
              setPpEnabledTasks(prev =>
                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
              )
            }

            const buildAttachmentSummary = () => {
              if (!attachments || attachments.length === 0) return ''
              const lines = attachments.map((a) => {
                // 전자책 본문은 서버에서 별도 추출해 ebookContents로 따로 전달됨 → 여기선 메타만 표시
                const role = a.file_role === 'ebook' ? '[전자책]' : (a.session_id ? '[기수전용]' : '[강사공통]')
                if (a.file_type === 'link') {
                  return `- ${role} ${a.file_name} → ${a.file_url}${a.description ? ' :: ' + a.description : ''}`
                }
                return `- ${role} ${a.file_name} (${a.file_type}${a.file_size ? `, ${Math.round(a.file_size / 1024)}KB` : ''})${a.description ? ' :: ' + a.description : ''}`
              })
              return '\n\n[첨부 자료 목록]\n' + lines.join('\n')
            }

            const runPlanner = async (overrideTasks = null, extraContext = '') => {
              const tasks = overrideTasks || pp_enabledTasks
              if (!ready) {
                setPpError('강사와 기수를 먼저 선택하세요.')
                return
              }
              if (!pp_topic.trim() || tasks.length === 0) {
                setPpError('주제와 최소 1개 항목이 필요합니다.')
                return
              }
              // 전자책이 필요한 task 사전 검증 (현재는 'ebook')
              if (tasks.includes('ebook')) {
                const ebookCount = attachments.filter(a => a.file_role === 'ebook').length
                if (ebookCount === 0) {
                  alert('📚 무료 전자책 기획안을 만들려면 강사가 제공한 전자책 파일이 필요합니다.\n\n자료 영역의 [📚 전자책] 버튼으로 PDF나 텍스트 파일을 먼저 업로드해주세요.')
                  return
                }
              }
              setPpError('')
              setPpStartedAt(Date.now())
              setPpPhase('starting')
              setPpRunTasks(tasks)
              // 새 run의 task들을 pending으로 초기화. 재생성이면 그 task만 갱신.
              setPpTaskStatus(prev => {
                const next = overrideTasks ? { ...prev } : {}
                for (const t of tasks) next[t] = { status: 'pending' }
                return next
              })
              if (overrideTasks) {
                setPpTaskRetrying(overrideTasks[0])
              } else {
                setPpLoading(true)
                setPpResults({}) // 결과 영역 초기화 → 스트림으로 채워질 예정
                setPpExpanded({})
              }

              let firstSuccess = null
              try {
                const fullContext = (
                  pp_additionalContext.trim() +
                  (extraContext && extraContext.trim() ? '\n\n' + extraContext.trim() : '') +
                  buildAttachmentSummary()
                ).trim()
                const res = await fetch('/api/tools/project-planner', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({
                    instructor: selectedInstructor,
                    sessionName: currentSession?.session_name || '',
                    sessionId: selectedSessionId, // 서버가 전자책 첨부 조회에 사용
                    topic: pp_topic,
                    additionalContext: fullContext,
                    enabledTasks: tasks,
                    // 봇별 옵션 — PPT 봇이 사용자 지정 구조 순서를 받음
                    taskOptions: {
                      ppt: { structureOrder: pp_pptStructure },
                    },
                  })
                })
                if (!res.ok) {
                  // 스트림 시작 전 에러는 일반 JSON
                  const data = await res.json().catch(() => ({}))
                  setPpError(data.error || `요청 실패 (HTTP ${res.status})`)
                  return
                }

                await readPlannerSSE(res, (event, data) => {
                  if (event === 'start') {
                    setPpPhase('starting')
                  } else if (event === 'phase') {
                    setPpPhase(data?.phase || '')
                  } else if (event === 'task_start') {
                    if (!data?.task) return
                    setPpTaskStatus(prev => ({
                      ...prev,
                      [data.task]: { status: 'running', startedAt: Date.now() },
                    }))
                  } else if (event === 'task_done') {
                    if (!data?.task || !data?.result) return
                    const r = data.result
                    setPpTaskStatus(prev => ({
                      ...prev,
                      [data.task]: {
                        status: r.ok ? 'done' : 'error',
                        durationMs: r.durationMs,
                      },
                    }))
                    setPpResults(prev => ({
                      ...(prev || {}),
                      [data.task]: { task: data.task, ...r },
                    }))
                    // 배치 생성에서 첫 성공 항목만 자동 펼침. 재생성에서는 사용자 펼침 상태 유지.
                    if (!overrideTasks && r.ok && !firstSuccess) {
                      firstSuccess = data.task
                      setPpExpanded(prev => ({ ...prev, [data.task]: true }))
                    }
                    // ★ 성공 결과 자동 저장 (계정별, 사이드바 '🗃️ 생성된 기획안' 탭에서 조회 가능)
                    if (r.ok && r.plan) {
                      fetch('/api/tools/project-planner/saved-plans', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({
                          taskKey: data.task,
                          sessionId: selectedSessionId,
                          instructorName: selectedInstructor,
                          sessionName: currentSession?.session_name || null,
                          topic: pp_topic,
                          plan: r.plan,
                          usage: r.usage,
                          model: r.model,
                        }),
                      }).then(res => res.json()).then(saved => {
                        if (saved?.success) {
                          // 다음에 조회 탭 열 때 새로고침되도록 dirty 마킹
                          setSavedPlansDirty(true)
                        } else {
                          console.warn('[saved-plans] 저장 실패:', saved?.error)
                        }
                      }).catch(e => {
                        console.warn('[saved-plans] 저장 네트워크 오류:', e?.message)
                      })
                    }
                  } else if (event === 'done') {
                    setPpPhase('done')
                    // 사용자가 다른 탭/창에 가있으면 브라우저 알림 띄움
                    notifyBotComplete(
                      '🪄 기획 생성 완료',
                      firstSuccess
                        ? `${selectedInstructor || ''} 강사 — 결과를 확인하세요.`
                        : '봇 작업이 끝났습니다.'
                    )
                  } else if (event === 'fatal') {
                    setPpError(data?.message || '서버 스트림 오류')
                  }
                })
              } catch (e) {
                setPpError('네트워크 오류: ' + e.message)
              } finally {
                setPpLoading(false)
                setPpTaskRetrying(null)
                setPpRunTasks([])
                setPpPhase('')
              }
            }

            // 톤 모달 → 사전 점검 → 모달 또는 본 생성
            //
            // 흐름:
            //   1. PPT outline이 체크돼있으면 톤 입력 모달부터 띄움
            //      (사용자가 design.md 톤을 복붙하거나 기본 톤 그대로 진행)
            //   2. 톤 확인 후 기존 precheck 흐름으로 진입
            //   3. 톤은 localStorage 저장 + 생성된 기획안 메타에도 저장
            //
            // PPT 체크 안 했으면 톤 모달 스킵.
            const proceedAfterTone = async () => {
              setPpError('')
              setPpPrechecking(true)
              try {
                const fullContext = (pp_additionalContext.trim() + buildAttachmentSummary()).trim()
                const res = await fetch('/api/tools/project-planner/precheck', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({
                    instructor: selectedInstructor,
                    sessionName: currentSession?.session_name || '',
                    sessionId: selectedSessionId,
                    topic: pp_topic,
                    additionalContext: fullContext,
                    enabledTasks: pp_enabledTasks,
                  }),
                })
                if (res.ok) {
                  const data = await res.json()
                  if (data.success && data.ready === false && Array.isArray(data.questions) && data.questions.length > 0) {
                    setPpPrecheckResult(data)
                    setPpAnswers({})
                    setPpModalOpen(true)
                    return
                  }
                } else {
                  console.warn('[precheck] HTTP', res.status)
                }
              } catch (e) {
                console.warn('[precheck] 네트워크 오류:', e?.message)
              } finally {
                setPpPrechecking(false)
              }
              await runPlanner()
            }

            const handleGenerate = async () => {
              if (!ready) { setPpError('강사와 기수를 먼저 선택하세요.'); return }
              if (!pp_topic.trim() || pp_enabledTasks.length === 0) {
                setPpError('주제와 최소 1개 항목이 필요합니다.')
                return
              }
              // 봇 작업이 1분 이상 걸리므로 완료 시 브라우저 알림 띄움.
              // 사용자가 다른 탭/창에 가있을 때 알려주려면 권한 필요. 클릭 직후 요청.
              requestNotifyPermission()
              // 전자책 사전 검증은 precheck 전에도 한 번 더 (서버 round-trip 절약)
              if (pp_enabledTasks.includes('ebook')) {
                const ebookCount = attachments.filter(a => a.file_role === 'ebook').length
                if (ebookCount === 0) {
                  alert('📚 무료 전자책 기획안을 만들려면 강사가 제공한 전자책 파일이 필요합니다.\n\n자료 영역의 [📚 전자책] 버튼으로 PDF나 텍스트 파일을 먼저 업로드해주세요.')
                  return
                }
              }

              // PPT 체크돼있으면 디자인 톤 입력 모달 먼저. 그 후 proceedAfterTone 실행.
              if (pp_enabledTasks.includes('ppt')) {
                setPpPendingGenerate(() => proceedAfterTone)
                setPpToneModalOpen(true)
                return
              }

              await proceedAfterTone()
            }

            // 톤 모달 → "이 톤으로 진행" 클릭 시 호출
            const confirmToneAndProceed = () => {
              // localStorage에 저장 (다음에 같은 톤 자동 복원)
              if (typeof window !== 'undefined' && loginId) {
                try {
                  localStorage.setItem(`pp_designToneMd:${loginId}`, pp_designToneMd)
                } catch {}
              }
              setPpToneModalOpen(false)
              if (typeof pp_pendingGenerate === 'function') {
                pp_pendingGenerate()
                setPpPendingGenerate(null)
              }
            }

            // 톤 모달 → "취소" 클릭 시
            const cancelToneAndAbort = () => {
              setPpToneModalOpen(false)
              setPpPendingGenerate(null)
            }

            const handleModalContinue = async () => {
              const qs = pp_precheckResult?.questions || []
              const answeredLines = qs
                .map((q, i) => {
                  const a = (pp_answers[i] || '').trim()
                  return a ? `Q. ${q}\nA. ${a}` : null
                })
                .filter(Boolean)
              setPpModalOpen(false)
              const extra = answeredLines.length > 0
                ? `[강사 보충 답변]\n${answeredLines.join('\n\n')}`
                : ''
              await runPlanner(null, extra)
            }

            const handleModalSkip = async () => {
              setPpModalOpen(false)
              await runPlanner()
            }

            const handleRegenerate = async (taskKey) => { await runPlanner([taskKey]) }

            // 봇별 결과 카드 렌더러. 새 봇 추가 시 분기 추가.
            // 공통 박스 스타일 헬퍼.
            const _label = { fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600, marginBottom: '4px' }
            const _accent = { fontSize: '11px', color: '#a5b4fc', fontWeight: 600, marginBottom: '6px' }
            const _box = { padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px' }
            const _boxAccent = { padding: '12px 14px', background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px' }

            const renderPlanContent = (taskKey, plan) => {
              if (taskKey === 'ebook') {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={_boxAccent}>
                      <div style={_accent}>썸네일 카피 (세로형)</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{plan.thumbnailCopy}</div>
                    </div>
                    <div>
                      <div style={_label}>전자책 제목</div>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>{plan.title}</div>
                    </div>
                    <div>
                      <div style={_label}>도입 후크</div>
                      <div style={{ fontSize: '15px', fontStyle: 'italic', color: '#cbd5e1' }}>{plan.introHook}</div>
                    </div>
                    <div>
                      <div style={_label}>문제 도입 단락</div>
                      <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{plan.problemFraming}</div>
                    </div>
                    {Array.isArray(plan.sections) && plan.sections.map((s, i) => (
                      <div key={i} style={_box}>
                        <div style={_accent}>섹션 {i + 1}</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{s.heading}</div>
                        <div style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{s.body}</div>
                      </div>
                    ))}
                    <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 600, marginBottom: '4px' }}>CTA</div>
                      <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{plan.cta}</div>
                    </div>
                  </div>
                )
              }

              if (taskKey === 'boomUp' && Array.isArray(plan?.messages)) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plan.messages.map((m, i) => (
                      <div key={i} style={_box}>
                        <div style={_accent}>{m.style || `스타일 ${i + 1}`}</div>
                        <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      </div>
                    ))}
                  </div>
                )
              }

              if (taskKey === 'alimtalk') {
                const ft = plan?.fullText || ''
                const placeholders = Array.isArray(plan?.placeholders) ? plan.placeholders : []
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={_boxAccent}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={_accent}>💬 채널톡 멘트 — 본문 (그대로 복붙)</div>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(ft).then(() => {
                              alert('본문이 클립보드에 복사됐습니다.')
                            }).catch(() => alert('복사 실패. 수동으로 선택해주세요.'))
                          }}
                          style={{ padding: '5px 11px', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '7px', color: '#c7d2fe', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                          📋 복사
                        </button>
                      </div>
                      <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '8px 0' }}>{ft}</div>
                    </div>
                    {placeholders.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: '8px', fontSize: '12px', color: '#fbbf24' }}>
                        ⚠️ 다음 자리표시자는 운영팀이 직접 채워야 합니다: {placeholders.map(p => <code key={p} style={{ background: 'rgba(0,0,0,0.30)', padding: '1px 6px', borderRadius: '4px', marginRight: '5px' }}>{p}</code>)}
                      </div>
                    )}
                  </div>
                )
              }

              if (taskKey === 'viralQ' && Array.isArray(plan?.questions)) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {plan.questions.map((q, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 700, minWidth: '20px' }}>Q{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          {q.category && <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '2px' }}>{q.category}</div>}
                          <div style={{ fontSize: '13.5px', color: '#fff', lineHeight: 1.6 }}>{q.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }

              if (taskKey === 'ppt') {
                // 공통 메타 사용 (Dashboard.js 파일 최상단 PPT_KIND_META)
                const KIND_LABEL = PPT_KIND_META

                // ===== 결과 추출 헬퍼 =====
                const toMarkdown = () => pptPlanToMarkdown(plan)
                const safeFileName = makeSafeFileName(plan.title, 'ppt-outline')

                // 2) 마크다운 복사
                const copyMarkdown = async () => {
                  try {
                    await navigator.clipboard.writeText(toMarkdown())
                    alert('마크다운으로 복사 완료. 노션/워드/메모장에 그대로 붙여넣으면 형식 살아남.')
                  } catch (e) {
                    alert('복사 실패. 수동으로 선택 복사해주세요.\n' + (e?.message || ''))
                  }
                }

                // 3) .md 파일 다운로드
                const downloadMarkdown = () => {
                  const blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${safeFileName}.md`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                }

                // 4) .pptx 파일 다운로드 — 디자인 톤 적용된 PowerPoint 파일 생성.
                //    pp_designToneMd 또는 기본 톤 사용. kind별 레이아웃 + 색상 자동 적용.
                //    강사는 받자마자 거의 그대로 사용 가능. 일러스트만 더하면 끝.
                const exportBusyKind = pp_exportBusy[taskKey] || null
                const downloadPptx = async () => {
                  setPpExportBusy(prev => ({ ...prev, [taskKey]: 'pptx' }))
                  try {
                    const parsed = parseToneMd(pp_designToneMd || DEFAULT_DESIGN_TONE_MD)
                    // 사용자가 모달 칩에서 직접 입력한 hex 오버라이드 적용
                    const finalTone = applyToneOverrides(parsed, pp_designToneOverrides)
                    await buildDesignedPptx(plan, finalTone, safeFileName)
                  } catch (e) {
                    alert('.pptx 생성 실패: ' + (e?.message || e))
                  } finally {
                    setPpExportBusy(prev => ({ ...prev, [taskKey]: null }))
                  }
                }

                // 5) 노션에 페이지 만들기 — 마크다운을 노션 API로 새 페이지 생성.
                //    /api/integrations/notion/create-plan-page (정리본용 라우트와 별도, generic)
                //    PPT outline 250장 = 노션 블록 1000+개 = API 100개씩 다회 호출 → 1~3분 정상.
                const createNotionPlanPage = async () => {
                  setPpExportBusy(prev => ({ ...prev, [taskKey]: 'notion' }))
                  try {
                    const pageTitle = `[${selectedInstructor || '미상'}${currentSession?.session_name ? ' ' + currentSession.session_name : ''}] 강의 PPT outline`
                    const res = await fetch('/api/integrations/notion/create-plan-page', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                      body: JSON.stringify({
                        title: pageTitle,
                        markdown: toMarkdown(),
                      }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || `HTTP ${res.status}`)
                    }
                    setPpPlanNotionResult(prev => ({
                      ...prev,
                      [taskKey]: { url: data.url, title: pageTitle },
                    }))
                  } catch (e) {
                    alert('노션 페이지 생성 실패: ' + (e?.message || e))
                  } finally {
                    setPpExportBusy(prev => ({ ...prev, [taskKey]: null }))
                  }
                }
                const notionResultForTask = pp_planNotionResult[taskKey] || null
                // 종류별 카운트 (총합 옆에 분포 표시)
                const kindCounts = {}
                if (Array.isArray(plan.slides)) {
                  for (const s of plan.slides) {
                    const k = s.kind || 'info'
                    kindCounts[k] = (kindCounts[k] || 0) + 1
                  }
                }
                const distroEntries = Object.entries(kindCounts).filter(([k]) => KIND_LABEL[k])
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={_boxAccent}>
                      <div style={_accent}>강의 제목 · 총 {plan.totalSlides || (plan.slides?.length ?? 0)}장</div>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff', marginBottom: distroEntries.length ? '8px' : 0 }}>{plan.title}</div>
                      {distroEntries.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {distroEntries.map(([k, n]) => (
                            <span key={k} style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '999px', background: KIND_LABEL[k].bg, color: KIND_LABEL[k].color, fontWeight: 600 }}>
                              {KIND_LABEL[k].label} {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ===== 결과 추출 버튼 영역 (마크다운 복사 / .md / .pptx / 노션) ===== */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '6px',
                      padding: '12px',
                      background: 'rgba(99,102,241,0.06)',
                      border: '1px solid rgba(99,102,241,0.20)',
                      borderRadius: '10px',
                    }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', alignSelf: 'center', marginRight: '4px' }}>📤 내보내기:</div>
                      <button onClick={copyMarkdown}
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '7px', color: '#e2e8f0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        title="노션/워드/메모장에 그대로 붙여넣으면 형식이 살아남습니다">
                        📋 마크다운 복사
                      </button>
                      <button onClick={downloadMarkdown}
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '7px', color: '#e2e8f0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        title=".md 파일로 다운로드 — 어디서든 열 수 있는 텍스트 형식">
                        📄 .md 다운로드
                      </button>
                      <button onClick={downloadPptx} disabled={exportBusyKind === 'pptx'}
                        style={{
                          padding: '7px 12px',
                          background: exportBusyKind === 'pptx' ? 'rgba(99,102,241,0.20)' : 'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(168,85,247,0.30))',
                          border: '1px solid rgba(99,102,241,0.45)', borderRadius: '7px',
                          color: '#fff', fontSize: '12px', fontWeight: 700,
                          cursor: exportBusyKind === 'pptx' ? 'wait' : 'pointer',
                        }}
                        title="실제 PowerPoint 파일(.pptx) 생성 — 슬라이드별 제목·불릿·발표자 노트 포함">
                        {exportBusyKind === 'pptx' ? '⏳ .pptx 생성 중…' : '🎨 디자인 적용 .pptx'}
                      </button>
                      <button onClick={createNotionPlanPage} disabled={exportBusyKind === 'notion'}
                        style={{
                          padding: '7px 12px',
                          background: exportBusyKind === 'notion' ? 'rgba(16,185,129,0.20)' : 'linear-gradient(135deg, #10b981, #14b8a6)',
                          border: 'none', borderRadius: '7px',
                          color: '#fff', fontSize: '12px', fontWeight: 700,
                          cursor: exportBusyKind === 'notion' ? 'wait' : 'pointer',
                        }}
                        title="강사미팅 기록 노션 DB에 새 페이지로 push">
                        {exportBusyKind === 'notion' ? '⏳ 노션 push 중… (1~3분 정상)' : '📋 노션에 페이지 만들기'}
                      </button>
                      {notionResultForTask?.url && (
                        <a href={notionResultForTask.url} target="_blank" rel="noopener noreferrer"
                          style={{ alignSelf: 'center', fontSize: '11px', color: '#86efac', textDecoration: 'underline', marginLeft: '4px' }}>
                          ✅ 노션 페이지 열기 →
                        </a>
                      )}
                    </div>
                    {/* 노션 push 중일 때 안내 — 사용자가 렉 걸린 줄 오해하지 않게 */}
                    {exportBusyKind === 'notion' && (
                      <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.20)', borderRadius: '8px', fontSize: '11.5px', color: '#86efac', lineHeight: 1.5 }}>
                        💡 PPT outline 250장 = 노션 블록 1000+ 개. 노션 API 한 번에 100개 한도라 13~15번 나눠 보냅니다. <b>1~3분 정도 정상 소요</b> — 페이지는 만들어지는 중이에요.
                      </div>
                    )}

                    {Array.isArray(plan.slides) && plan.slides.map((s, i) => {
                      const kindMeta = KIND_LABEL[s.kind] || null
                      return (
                        <div key={i} style={_box}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <div style={_accent}>슬라이드 {s.slideNumber || i + 1}</div>
                            {kindMeta && (
                              <span style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '999px', background: kindMeta.bg, color: kindMeta.color, fontWeight: 600 }}>
                                {kindMeta.label}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#fff', marginBottom: '6px', marginTop: '4px' }}>{s.title}</div>
                          {Array.isArray(s.bullets) && s.bullets.length > 0 && (
                            <ul style={{ margin: '4px 0 8px 18px', padding: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.65 }}>
                              {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                            </ul>
                          )}
                          {s.speakerNotes && (
                            <div style={{ marginTop: '6px', padding: '8px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', borderLeft: '2px solid rgba(99,102,241,0.5)' }}>
                              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '2px' }}>🎤 발표 멘트</div>
                              <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{s.speakerNotes}</div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              }

              if (taskKey === 'salesPage') {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={_boxAccent}>
                      <div style={_accent}>히어로 카피</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>{plan.headline}</div>
                      <div style={{ fontSize: '14px', color: '#cbd5e1', fontStyle: 'italic' }}>{plan.subheadline}</div>
                    </div>
                    {Array.isArray(plan.painPoints) && plan.painPoints.length > 0 && (
                      <div style={_box}>
                        <div style={_accent}>Pain — 수강생이 겪는 문제</div>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.7 }}>
                          {plan.painPoints.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {plan.promise && (
                      <div style={_box}>
                        <div style={_accent}>Promise — 약속</div>
                        <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{plan.promise}</div>
                      </div>
                    )}
                    {plan.proof && (
                      <div style={_box}>
                        <div style={_accent}>Proof — 신뢰 근거</div>
                        <div style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{plan.proof}</div>
                      </div>
                    )}
                    {Array.isArray(plan.curriculumPreview) && plan.curriculumPreview.length > 0 && (
                      <div style={_box}>
                        <div style={_accent}>커리큘럼 미리보기</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                          {plan.curriculumPreview.map((c, i) => (
                            <div key={i} style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>
                              <b style={{ color: '#a5b4fc', marginRight: '6px' }}>{c.session}</b>
                              <span style={{ color: '#fff', fontWeight: 600 }}>{c.title}</span>
                              {c.preview && <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>{c.preview}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {plan.cta && (
                      <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 600, marginBottom: '4px' }}>CTA</div>
                        <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{plan.cta}</div>
                      </div>
                    )}
                  </div>
                )
              }

              if (taskKey === 'groupAnnouncement') {
                // 신규 단일 입장시 필독 공지 — fullText 한 덩어리 + 메타 (instructorName/hooks 등)
                const ft = plan?.fullText || ''
                const placeholders = Array.isArray(plan?.placeholders) ? plan.placeholders : []
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* 메인: 단톡방에 그대로 붙여넣을 본문 */}
                    <div style={_boxAccent}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={_accent}>📢 단톡방 입장시 필독 — 본문 (그대로 복붙)</div>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(ft).then(() => {
                              alert('본문이 클립보드에 복사됐습니다.')
                            }).catch(() => alert('복사 실패. 수동으로 선택해주세요.'))
                          }}
                          style={{ padding: '5px 11px', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '7px', color: '#c7d2fe', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                          📋 복사
                        </button>
                      </div>
                      <div style={{ fontSize: '13px', color: '#fff', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '8px 0' }}>{ft}</div>
                    </div>

                    {/* 채워지지 않은 자리표시자 안내 */}
                    {placeholders.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: '8px', fontSize: '12px', color: '#fbbf24' }}>
                        ⚠️ 다음 자리표시자는 운영팀이 직접 채워야 합니다: {placeholders.map(p => <code key={p} style={{ background: 'rgba(0,0,0,0.30)', padding: '1px 6px', borderRadius: '4px', marginRight: '5px' }}>{p}</code>)}
                      </div>
                    )}

                    {/* 메타데이터 (참고용) */}
                    {(plan?.instructorName || plan?.freeClassDate || plan?.ebookHook) && (
                      <details style={{ marginTop: '4px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>채워진 변수 보기</summary>
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
                          {plan.instructorName && <div><b style={{ color: '#a5b4fc' }}>강사명:</b> {plan.instructorName}</div>}
                          {plan.freeClassDate && <div><b style={{ color: '#a5b4fc' }}>무료강의 일시:</b> {plan.freeClassDate}</div>}
                          {plan.ebookHook && <div><b style={{ color: '#a5b4fc' }}>전자책 후킹:</b> {plan.ebookHook}</div>}
                          {plan.instructorDescription && <div><b style={{ color: '#a5b4fc' }}>강사 설명:</b> {plan.instructorDescription}</div>}
                          {Array.isArray(plan.hooks) && plan.hooks.length > 0 && (
                            <div>
                              <b style={{ color: '#a5b4fc' }}>강사 후킹:</b>
                              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                {plan.hooks.map((h, i) => <li key={i}>{h}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                )
              }

              return (
                <pre style={{ fontSize: '12px', color: '#cbd5e1', background: 'rgba(0,0,0,0.30)', padding: '12px', borderRadius: '8px', overflow: 'auto', maxHeight: '400px', margin: 0 }}>
                  {JSON.stringify(plan, null, 2)}
                </pre>
              )
            }

            const copyToClipboard = (taskKey, plan) => {
              const text = JSON.stringify(plan, null, 2)
              navigator.clipboard.writeText(text).catch(() => {})
            }

            return (
              <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '100%', margin: '0 auto' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-grad)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
                      <Wand2 size={18} color="#fff" strokeWidth={2.2} />
                    </span>
                    프로젝트 기획
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.55 }}>
                    강사·기수를 선택하면 매칭된 자료를 자동으로 불러옵니다. 자료 추가 후 <b>기획 생성</b>을 누르면 선택 항목들이 한 번에 만들어집니다.
                  </p>
                </div>

                {/* ───── 1. 강사 / 기수 선택 ───── */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>👤</span> 강사 / 기수 선택 <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 500 }}>* 필수</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    {/* 강사 */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>강사</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select
                          value={selectedInstructor}
                          onChange={(e) => {
                            setSelectedInstructor(e.target.value)
                            const filtered = sessions.filter(s => s.instructors?.name === e.target.value)
                              .sort((a, b) => getSessionNumber(a.session_name) - getSessionNumber(b.session_name))
                            if (filtered.length > 0) {
                              setSelectedSessionId(filtered[0].id)
                            } else {
                              setSelectedSessionId(null)
                            }
                          }}
                          style={{ flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                        >
                          <option value="" style={{ background: '#1e1e2e', color: '#fff' }}>강사 선택…</option>
                          {instructorNames.map(name => {
                            const preparing = isInstructorPreparing(name)
                            return (
                              <option key={name} value={name} style={{ background: '#1e1e2e', color: '#fff' }}>
                                {name}{preparing ? ' (준비중)' : ''}
                              </option>
                            )
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setAddType('instructor'); setShowAddModal(true) }}
                          title="새 강사 추가"
                          style={{ width: '38px', padding: 0, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '18px', cursor: 'pointer' }}
                        >+</button>
                      </div>
                    </div>
                    {/* 기수 */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>기수</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select
                          value={selectedSessionId || ''}
                          onChange={(e) => setSelectedSessionId(e.target.value || null)}
                          disabled={!selectedInstructor}
                          style={{ flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', opacity: selectedInstructor ? 1 : 0.5 }}
                        >
                          <option value="" style={{ background: '#1e1e2e', color: '#fff' }}>기수 선택…</option>
                          {sessionsForInstructor.map(s => {
                            const preparing = isSessionPreparing(selectedInstructor, s.session_name)
                            return (
                              <option key={s.id} value={s.id} style={{ background: '#1e1e2e', color: '#fff' }}>
                                {s.session_name}{preparing ? ' (준비중)' : ''}
                              </option>
                            )
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedInstructor) { alert('강사를 먼저 선택하세요.'); return }
                            setAddType('session')
                            const inst = instructors.find(i => i.name === selectedInstructor)
                            if (inst) setNewSession(s => ({ ...s, instructor_id: inst.id }))
                            setShowAddModal(true)
                          }}
                          title="새 기수 추가"
                          disabled={!selectedInstructor}
                          style={{ width: '38px', padding: 0, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '18px', cursor: selectedInstructor ? 'pointer' : 'not-allowed', opacity: selectedInstructor ? 1 : 0.5 }}
                        >+</button>
                      </div>
                    </div>
                  </div>
                  {ready && (() => {
                    const instPrep = isInstructorPreparing(selectedInstructor)
                    const sessPrep = isSessionPreparing(selectedInstructor, currentSession?.session_name)
                    const PrepBadge = () => (
                      <span style={{ marginLeft: '4px', padding: '1px 6px', background: 'rgba(251,191,36,0.18)', color: '#fbbf24', borderRadius: '999px', fontSize: '10px', fontWeight: 700 }}>준비중</span>
                    )
                    return (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: '#94a3b8' }}>
                        현재 선택: <b style={{ color: '#a5b4fc' }}>{selectedInstructor}</b>{instPrep && <PrepBadge />}
                        {' · '}<b style={{ color: '#a5b4fc' }}>{currentSession?.session_name}</b>{sessPrep && !instPrep && <PrepBadge />}
                        {' · '}매칭된 자료 <b style={{ color: '#fff' }}>{attachments.length}개</b>
                      </div>
                    )
                  })()}
                  {selectedInstructor && sessionsForInstructor.length === 0 && (
                    <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.30)', borderRadius: '8px', fontSize: '12px', color: '#fbbf24', lineHeight: 1.55 }}>
                      <b>{selectedInstructor}</b> 강사의 기수가 아직 없습니다. 우측 <b>+</b> 버튼으로 첫 기수를 추가하세요. (예: "1기")
                    </div>
                  )}
                  {/* 진단용 — 프론트가 실제 받은 데이터 확인. 문제 해결되면 제거 가능. */}
                  <details style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-faint)' }}>
                    <summary style={{ cursor: 'pointer' }}>🔍 디버그: 로드된 데이터 ({instructors.length}명 강사, {sessions.length}개 기수)</summary>
                    <div style={{ marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.30)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '11px', maxHeight: '120px', overflowY: 'auto' }}>
                      <div style={{ color: '#94a3b8', marginBottom: '4px' }}>강사 ({instructors.length}):</div>
                      <div style={{ color: '#cbd5e1' }}>{instructors.map(i => i.name).join(', ') || '(없음)'}</div>
                    </div>
                  </details>
                </div>

                {/* ───── 1.5. 무료 강의 주제 + 추가 컨텍스트 (저장 가능) ───── */}
                {(() => {
                  const saveInputs = async () => {
                    if (!ready) { setPpError('강사·기수를 먼저 선택하세요.'); return }
                    setPpInputsSaving(true)
                    try {
                      const res = await fetch('/api/tools/project-planner/inputs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({
                          sessionId: selectedSessionId,
                          topic: pp_topic,
                          additionalContext: pp_additionalContext,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok || !data.success) {
                        setPpError(data.error || `저장 실패 (HTTP ${res.status})`)
                        return
                      }
                      setPpInputsSavedAt(new Date(data.inputs?.updated_at || Date.now()))
                      setPpInputsDirty(false)
                    } catch (e) {
                      setPpError('네트워크 오류: ' + e.message)
                    } finally {
                      setPpInputsSaving(false)
                    }
                  }
                  return (
                    <div style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '14px',
                      padding: '20px',
                      border: '1px solid var(--border)',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px' }}>🎯</span> 무료 강의 주제 · 추가 컨텍스트
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>· 💾 저장 버튼을 눌러야 저장됩니다</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {pp_inputsSavedAt && (
                            <span style={{ fontSize: '11px', color: '#86efac' }}>
                              ✅ {formatKST(pp_inputsSavedAt)} 저장됨
                            </span>
                          )}
                          <button onClick={saveInputs} disabled={!ready || pp_inputsSaving}
                            style={{
                              padding: '7px 14px',
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: (!ready || pp_inputsSaving) ? 'not-allowed' : 'pointer',
                              opacity: (!ready || pp_inputsSaving) ? 0.5 : 1,
                              boxShadow: '0 4px 10px rgba(99,102,241,0.30)',
                            }}>
                            {pp_inputsSaving ? '저장 중…' : '💾 저장'}
                          </button>
                        </div>
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                          무료 강의 주제 <span style={{ color: '#f87171' }}>*</span>
                        </label>
                        <input type="text" value={pp_topic} onChange={(e) => setPpTopic(e.target.value)} placeholder="예: AI 활용 유튜브 수익화 / 쿠팡 부업 / 숏폼 중개"
                          style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                          추가 컨텍스트 (선택) <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>· 첨부 자료/녹음에 안 들어간 정보를 자유 기재</span>
                        </label>
                        <textarea value={pp_additionalContext} onChange={(e) => setPpAdditionalContext(e.target.value)} rows={4}
                          placeholder="예: 강사 본인이 월 2,500만원 수익화 경험. LUCY AI Studio 보유. 캐치프레이즈는 '설계가 답이다'."
                          style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
                      </div>
                    </div>
                  )
                })()}

                {/* ───── 2. 자료 업로드 ───── */}
                <div
                  style={{
                    background: isDragging ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.04)',
                    border: isDragging ? '2px dashed rgba(99,102,241,0.55)' : '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '20px',
                    marginBottom: '16px',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}
                  onDragOver={ready ? handleDragOver : undefined}
                  onDragLeave={ready ? handleDragLeave : undefined}
                  onDrop={ready ? handleDrop : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px' }}>📎</span> 자료 (데이터 소스)
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>· 강사·기수에 매칭되어 DB에 저장 · <b style={{ color: '#cbd5e1' }}>파일당 최대 200MB</b> · 공용 양식은 <b style={{ color: '#a5b4fc' }}>기획 봇 설정</b>에서 관리</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple style={{ display: 'none' }} />
                      <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" multiple style={{ display: 'none' }} />
                      <input type="file" ref={ebookInputRef} onChange={handleEbookUpload} accept=".pdf,.txt,.md,.markdown" multiple style={{ display: 'none' }} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={!ready || fileUploading}
                        title="녹음/메모 등 강사 데이터. 이 자료의 '내용'이 정리본에 들어감."
                        style={{ padding: '7px 12px', background: 'var(--accent-grad)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: ready && !fileUploading ? 'pointer' : 'not-allowed', opacity: ready && !fileUploading ? 1 : 0.5 }}>
                        {fileUploading ? '업로드 중…' : '📁 파일'}
                      </button>
                      <button onClick={() => folderInputRef.current?.click()} disabled={!ready || fileUploading}
                        style={{ padding: '7px 12px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 600, cursor: ready && !fileUploading ? 'pointer' : 'not-allowed', opacity: ready && !fileUploading ? 1 : 0.5 }}>
                        📂 폴더
                      </button>
                      <button onClick={() => setShowFileModal(true)} disabled={!ready}
                        title="노션/구글드라이브 등 외부 링크. 강사 자료의 '내용'으로 사용."
                        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.5 }}>
                        🔗 링크
                      </button>
                      <button onClick={() => ebookInputRef.current?.click()} disabled={!ready || fileUploading}
                        title="강사가 제공한 전자책 PDF/텍스트. AI가 무료 전자책 기획안의 핵심 자료로 사용."
                        style={{ padding: '7px 12px', background: 'linear-gradient(135deg, #d97706, #f59e0b)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: ready && !fileUploading ? 'pointer' : 'not-allowed', opacity: ready && !fileUploading ? 1 : 0.5, boxShadow: '0 4px 10px rgba(245,158,11,0.30)' }}>
                        📚 전자책
                      </button>
                    </div>
                  </div>

                  {!ready && (
                    <div style={{ padding: '14px', background: 'rgba(0,0,0,0.20)', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                      강사·기수를 먼저 선택해야 자료 업로드가 가능합니다.
                    </div>
                  )}

                  {ready && isDragging && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#a5b4fc', fontSize: '13px' }}>
                      📥 여기에 파일 또는 폴더를 놓으세요
                    </div>
                  )}

                  {ready && !isDragging && attachments.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px', border: '2px dashed rgba(255,255,255,0.10)', borderRadius: '10px' }}>
                      자료가 없습니다. 파일을 드래그하거나 위 버튼으로 추가하세요.
                    </div>
                  )}

                  {ready && !isDragging && attachments.length > 0 && (
                    <>
                      <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>총 <b style={{ color: '#fff' }}>{attachments.length}</b>개</span>
                        <button onClick={deleteAllAttachments} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#f87171', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}>전체 삭제</button>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.20)', borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                        {attachments.map((file, idx) => {
                          const isEbook = file.file_role === 'ebook'
                          const isReference = file.file_role === 'summary_reference'
                          const tagColor = isEbook ? '#fbbf24'
                            : isReference ? '#5eead4'
                            : (file.session_id ? '#a5b4fc' : '#94a3b8')
                          const tagBg = isEbook ? 'rgba(245,158,11,0.20)'
                            : isReference ? 'rgba(20,184,166,0.18)'
                            : (file.session_id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)')
                          const tagLabel = isEbook ? '📚 전자책'
                            : isReference ? '🎯 레퍼런스'
                            : (file.session_id ? '기수전용' : '강사공통')
                          return (
                            <div key={file.id} style={{
                              display: 'flex', alignItems: 'center',
                              padding: '8px 12px',
                              borderBottom: idx < attachments.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              gap: '8px',
                              background: isEbook ? 'rgba(245,158,11,0.06)' : isReference ? 'rgba(20,184,166,0.06)' : 'transparent',
                            }}>
                              <span style={{ fontSize: '14px' }}>{isEbook ? '📚' : isReference ? '🎯' : getFileIcon(file.file_type)}</span>
                              <span style={{ fontSize: '10px', padding: '2px 6px', background: tagBg, color: tagColor, borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {tagLabel}
                              </span>
                              <a href={file.file_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: file.file_type === 'link' ? '#a5b4fc' : '#e2e8f0', fontSize: '12px', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.file_name}
                              </a>
                              <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                {file.file_type === 'link' ? '링크' : formatFileSize(file.file_size)}
                              </span>
                              <button onClick={() => deleteAttachment(file.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '12px', cursor: 'pointer', padding: '2px 6px' }} title="삭제">✕</button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* ───── 2.5. 정리봇 — 강사 자료 정리본 (다른 기획 봇들과 분리) ───── */}
                {(() => {
                  // SSE reader로 진행 상황 처리. 이벤트 핸들러가 state 업데이트.
                  const runSummarySSE = async (action, payload) => {
                    setPpSummaryError('')
                    setPpSummaryStartedAt(Date.now())
                    setPpSummaryAiStartedAt(0)
                    setPpSummaryPhase(action === 'generate' ? 'extracting' : 'ai_writing')
                    setPpSummaryItems([])

                    try {
                      const res = await fetch('/api/tools/project-planner/summary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify(payload),
                      })
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}))
                        setPpSummaryError(data.error || `요청 실패 (HTTP ${res.status})`)
                        return
                      }
                      let gotResult = false
                      await readPlannerSSE(res, (event, data) => {
                        if (event === 'phase') {
                          setPpSummaryPhase(data?.phase || '')
                          if (data?.phase === 'ai_writing') setPpSummaryAiStartedAt(Date.now())
                        } else if (event === 'item_start') {
                          setPpSummaryItems((prev) => [
                            ...prev.filter((it) => !(it.kind === data.kind && it.name === data.name)),
                            { kind: data.kind, name: data.name, status: 'progress' },
                          ])
                        } else if (event === 'item_progress') {
                          setPpSummaryItems((prev) => prev.map((it) =>
                            (it.kind === data.kind && it.name === data.name)
                              ? {
                                  ...it,
                                  blocks: data.blocks ?? it.blocks,
                                  chars: data.chars ?? it.chars,
                                  stage: data.stage ?? it.stage,
                                  bytes: data.bytes ?? it.bytes,
                                  mode: data.mode ?? it.mode,
                                }
                              : it
                          ))
                        } else if (event === 'item_done') {
                          setPpSummaryItems((prev) => prev.map((it) =>
                            (it.kind === data.kind && it.name === data.name)
                              ? {
                                  ...it,
                                  status: 'done',
                                  charCount: data.charCount,
                                  blocks: data.blocks ?? it.blocks,
                                  durationMs: data.durationMs,
                                  truncated: data.truncated,
                                  audioCount: data.audioCount ?? it.audioCount,
                                  audioOk: data.audioOk ?? it.audioOk,
                                  mode: data.mode ?? it.mode,
                                }
                              : it
                          ))
                        } else if (event === 'item_error') {
                          setPpSummaryItems((prev) => prev.map((it) =>
                            (it.kind === data.kind && it.name === data.name)
                              ? { ...it, status: 'error', error: data.error }
                              : it
                          ))
                        } else if (event === 'ai_start') {
                          setPpSummaryAiStartedAt(Date.now())
                        } else if (event === 'ai_done') {
                          // ai_done 후 phase=saving 으로 곧 이어짐
                        } else if (event === 'result') {
                          if (data?.summary) {
                            setPpSummary(data.summary)
                            gotResult = true
                          }
                        } else if (event === 'fatal') {
                          setPpSummaryError(data?.message || '서버 스트림 오류')
                        }
                      })
                      if (!gotResult && !pp_summaryError) {
                        // 스트림은 끝났는데 result 이벤트가 안 온 경우
                        setPpSummaryError('정리본 생성이 완료되지 않았습니다. 다시 시도해주세요.')
                      }
                    } catch (e) {
                      setPpSummaryError('네트워크 오류: ' + e.message)
                    }
                  }

                  const generateSummaryHandler = async () => {
                    if (!ready) { setPpSummaryError('강사·기수를 먼저 선택하세요.'); return }
                    setPpSummaryGenerating(true)
                    try {
                      await runSummarySSE('generate', {
                        action: 'generate',
                        sessionId: selectedSessionId,
                        instructor: selectedInstructor,
                        sessionName: currentSession?.session_name || '',
                        additionalContext: pp_additionalContext || '',
                      })
                    } finally {
                      setPpSummaryGenerating(false)
                      setPpSummaryPhase('')
                    }
                  }
                  const reviseSummaryHandler = async () => {
                    if (!pp_summary) return
                    if (!pp_summaryFeedback.trim()) { setPpSummaryError('수정 요청 내용을 입력하세요.'); return }
                    setPpSummaryRevising(true)
                    try {
                      await runSummarySSE('revise', {
                        action: 'revise',
                        sessionId: selectedSessionId,
                        instructor: selectedInstructor,
                        sessionName: currentSession?.session_name || '',
                        feedback: pp_summaryFeedback,
                      })
                      setPpSummaryFeedback('')
                    } finally {
                      setPpSummaryRevising(false)
                      setPpSummaryPhase('')
                    }
                  }
                  // 노션 강사미팅 기록 DB에 새 페이지로 push
                  const createNotionPageHandler = async () => {
                    if (!pp_summary) return
                    setPpSummaryError('')
                    setPpNotionResult(null)
                    setPpNotionCreating(true)
                    try {
                      const res = await fetch('/api/integrations/notion/create-meeting-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({ sessionId: selectedSessionId }),
                      })
                      const data = await res.json()
                      if (!res.ok || !data.success) {
                        setPpSummaryError(data.error || `노션 페이지 생성 실패 (HTTP ${res.status})`)
                        return
                      }
                      setPpNotionResult(data)
                    } catch (e) {
                      setPpSummaryError('네트워크 오류: ' + e.message)
                    } finally {
                      setPpNotionCreating(false)
                    }
                  }
                  const busy = pp_summaryGenerating || pp_summaryRevising || pp_notionCreating
                  return (
                    <div style={{
                      background: 'rgba(34,197,94,0.04)',
                      borderRadius: '14px',
                      padding: '20px',
                      border: '1px solid rgba(34,197,94,0.20)',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ fontSize: '20px', marginTop: '-2px' }}>📋</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '3px' }}>
                            강사 자료 정리본 <span style={{ fontSize: '11px', fontWeight: 500, color: '#86efac', marginLeft: '6px', padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: '999px' }}>정리봇</span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                            <b style={{ color: '#cbd5e1' }}>📁 데이터 소스</b>(녹음·노션·메모)에서 사실을 뽑아,
                            <b style={{ color: '#5eead4' }}>공용 레퍼런스 양식</b> 그대로 정리합니다.
                            레퍼런스 양식은 사이드바 <b style={{ color: '#a5b4fc' }}>🪄 기획 봇 설정 → 강사 자료 정리봇</b>에서 한 번만 등록.
                            아래 기획 봇들이 이 정리본을 자동 참고합니다.
                          </div>
                        </div>
                      </div>

                      {pp_summaryLoading ? (
                        <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                          정리본 불러오는 중…
                        </div>
                      ) : !pp_summary ? (
                        <div style={{
                          padding: '20px',
                          textAlign: 'center',
                          background: 'rgba(0,0,0,0.25)',
                          borderRadius: '10px',
                          border: '1px dashed var(--border)',
                        }}>
                          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                            아직 정리본이 없습니다. 첨부 자료를 추가한 뒤 정리를 생성하세요.
                          </div>
                          <button
                            onClick={generateSummaryHandler}
                            disabled={!ready || busy}
                            style={{
                              padding: '10px 22px',
                              background: (!ready || busy) ? 'rgba(34,197,94,0.20)' : 'linear-gradient(135deg, #10b981, #14b8a6)',
                              border: 'none',
                              borderRadius: '9px',
                              color: '#fff',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: busy ? 'wait' : (ready ? 'pointer' : 'not-allowed'),
                              boxShadow: (!ready || busy) ? 'none' : '0 6px 14px rgba(16,185,129,0.30)',
                            }}>
                            {pp_summaryGenerating ? '🪄 정리 생성 중… (10~30초)' : (ready ? '🪄 정리 생성' : '강사·기수 선택 필요')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '10px', flexWrap: 'wrap', gap: '8px',
                          }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              v{pp_summary.version} · {formatKST(pp_summary.updated_at)}
                              {pp_summary.updated_by ? ` · ${pp_summary.updated_by}` : ''}
                            </div>
                            <button
                              onClick={() => {
                                if (!confirm('현재 정리본을 무시하고 첨부 자료/컨텍스트로 처음부터 다시 만들까요?')) return
                                generateSummaryHandler()
                              }}
                              disabled={busy}
                              style={{
                                padding: '5px 11px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--border)',
                                borderRadius: '7px',
                                color: '#cbd5e1',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: busy ? 'wait' : 'pointer',
                              }}>
                              {pp_summaryGenerating ? '🔄 처음부터…' : '🔄 처음부터 다시'}
                            </button>
                          </div>

                          <div style={{
                            padding: '16px 20px',
                            background: 'rgba(0,0,0,0.30)',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            maxHeight: isMobile ? '70vh' : '760px',
                            overflowY: 'auto',
                          }}>
                            <MarkdownView content={pp_summary.content_md} />
                          </div>

                          {/* 노션에 페이지 만들기 */}
                          <div style={{
                            marginTop: '12px',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}>
                            {pp_notionResult && (
                              <a
                                href={pp_notionResult.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '12px',
                                  color: '#86efac',
                                  textDecoration: 'none',
                                  padding: '7px 12px',
                                  background: 'rgba(34,197,94,0.10)',
                                  border: '1px solid rgba(34,197,94,0.35)',
                                  borderRadius: '8px',
                                  fontWeight: 600,
                                }}>
                                ✅ {pp_notionResult.title} — 노션에서 열기 ↗
                              </a>
                            )}
                            <button
                              onClick={createNotionPageHandler}
                              disabled={busy}
                              title="현재 정리본을 노션의 강사미팅 기록 데이터베이스에 새 페이지로 등록합니다"
                              style={{
                                padding: '9px 16px',
                                background: busy ? 'rgba(20,184,166,0.20)' : 'linear-gradient(135deg, #0891b2, #0d9488)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                cursor: busy ? 'wait' : 'pointer',
                                boxShadow: busy ? 'none' : '0 4px 10px rgba(13,148,136,0.30)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                              {pp_notionCreating ? '📋 노션에 push 중… (10~30초)' : '📋 노션에 페이지 만들기'}
                            </button>
                          </div>

                          {/* 수정 요청 박스 */}
                          <div style={{ marginTop: '14px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                              수정·보강 요청 <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>· 잘못된 부분 / 추가할 내용을 적으면 정리봇이 그 부분만 반영해서 수정</span>
                            </label>
                            <textarea
                              value={pp_summaryFeedback}
                              onChange={(e) => setPpSummaryFeedback(e.target.value)}
                              rows={3}
                              placeholder="예) 강사 프로필 표에 'AI 자동화 5년차' 추가. 시행착오 사례 표에서 '광고 수익 5만원' 부분은 정확히 50만원으로 수정."
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(0,0,0,0.35)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                              <button
                                onClick={reviseSummaryHandler}
                                disabled={busy || !pp_summaryFeedback.trim()}
                                style={{
                                  padding: '8px 18px',
                                  background: (busy || !pp_summaryFeedback.trim()) ? 'rgba(34,197,94,0.20)' : 'linear-gradient(135deg, #10b981, #14b8a6)',
                                  border: 'none',
                                  borderRadius: '8px',
                                  color: '#fff',
                                  fontSize: '12.5px',
                                  fontWeight: 700,
                                  cursor: busy ? 'wait' : (pp_summaryFeedback.trim() ? 'pointer' : 'not-allowed'),
                                  boxShadow: (busy || !pp_summaryFeedback.trim()) ? 'none' : '0 4px 10px rgba(16,185,129,0.25)',
                                }}>
                                {pp_summaryRevising ? '✏️ 수정 반영 중… (10~20초)' : '✏️ 수정 반영'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {/* 정리봇 진행 패널 — SSE 이벤트 기반 */}
                      {(pp_summaryGenerating || pp_summaryRevising) && (() => {
                        void pp_tick // 실시간 elapsed 갱신
                        const elapsed = pp_summaryStartedAt ? (Date.now() - pp_summaryStartedAt) : 0
                        const aiElapsed = pp_summaryAiStartedAt ? (Date.now() - pp_summaryAiStartedAt) : 0
                        const isGen = pp_summaryGenerating

                        const phaseLabel =
                          pp_summaryPhase === 'extracting' ? '📋 첨부 자료 분석 중'
                          : pp_summaryPhase === 'ai_writing' ? '✏️ AI가 정리 작성 중'
                          : pp_summaryPhase === 'saving' ? '💾 저장 중'
                          : pp_summaryPhase === 'done' ? '✅ 완료'
                          : '⏳ 준비 중'

                        // 진행률 추정: phase 가중치
                        let pct = 5
                        if (pp_summaryPhase === 'extracting') {
                          // 아이템 진행도 비율
                          const total = pp_summaryItems.length
                          const done = pp_summaryItems.filter(it => it.status === 'done' || it.status === 'error').length
                          pct = total > 0 ? 5 + Math.round((done / total) * 50) : 8
                        } else if (pp_summaryPhase === 'ai_writing') pct = 60
                        else if (pp_summaryPhase === 'saving') pct = 95
                        else if (pp_summaryPhase === 'done') pct = 100

                        return (
                          <div style={{
                            marginTop: '14px',
                            padding: '14px 16px',
                            background: 'rgba(34,197,94,0.06)',
                            border: '1px solid rgba(34,197,94,0.20)',
                            borderRadius: '10px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={{ fontSize: '13px', color: '#86efac', fontWeight: 700 }}>{phaseLabel}</div>
                              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                전체 {(elapsed / 1000).toFixed(1)}s
                                {pp_summaryPhase === 'ai_writing' && aiElapsed > 0 && (
                                  <span style={{ marginLeft: '8px' }}>· AI {(aiElapsed / 1000).toFixed(1)}s</span>
                                )}
                              </div>
                            </div>
                            <div style={{
                              height: '7px',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: '999px',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%',
                                width: pct + '%',
                                background: 'linear-gradient(135deg, #10b981, #14b8a6)',
                                transition: 'width 0.4s ease',
                                borderRadius: '999px',
                              }} />
                            </div>

                            {/* 자료 추출 단계 — 아이템별 상태 라이브 표시 */}
                            {pp_summaryItems.length > 0 && (
                              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {pp_summaryItems.map((it, i) => {
                                  const icon =
                                    it.status === 'done' ? '✅'
                                    : it.status === 'error' ? '❌'
                                    : it.status === 'progress' ? '⏳'
                                    : '⏸'
                                  const kindIcon =
                                    it.kind === 'notion' ? '📋'
                                    : it.kind === 'audio' ? '🎵'
                                    : it.kind === 'reference-notion' ? '🎯📋'
                                    : it.kind === 'reference-file' ? '🎯📄'
                                    : '📄'
                                  // 오디오의 progress 단계 라벨
                                  const audioStageLabel =
                                    it.kind === 'audio' && it.status === 'progress'
                                      ? (it.stage === 'downloading' ? '다운로드 중'
                                        : it.stage === 'uploading' ? 'Gemini 업로드 중'
                                        : it.stage === 'transcribing'
                                            ? `받아쓰기 중${it.mode === 'files-api' ? ' (대용량)' : ''}`
                                        : '처리 중')
                                      : null
                                  return (
                                    <div key={i} style={{
                                      fontSize: '11.5px',
                                      color: it.status === 'error' ? '#fca5a5' : (it.status === 'done' ? '#cbd5e1' : '#c7d2fe'),
                                      display: 'flex', alignItems: 'center', gap: '6px',
                                      padding: '4px 8px',
                                      background: it.status === 'progress' ? 'rgba(99,102,241,0.10)' : 'transparent',
                                      borderRadius: '6px',
                                    }}>
                                      <span>{icon}</span>
                                      <span>{kindIcon}</span>
                                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {it.name}
                                      </span>
                                      {it.status === 'progress' && it.kind === 'notion' && it.blocks != null && (
                                        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#94a3b8' }}>
                                          {it.blocks}블록 가져옴
                                        </span>
                                      )}
                                      {it.status === 'progress' && it.kind === 'audio' && audioStageLabel && (
                                        <span style={{ color: '#94a3b8' }}>
                                          {audioStageLabel}
                                          {it.bytes ? ` (${(it.bytes / 1024 / 1024).toFixed(1)}MB)` : ''}
                                        </span>
                                      )}
                                      {it.status === 'done' && (
                                        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#94a3b8' }}>
                                          {it.kind === 'notion' && it.blocks ? `${it.blocks}블록` : ''}
                                          {it.kind === 'notion' && it.audioCount ? ` · 🎵${it.audioOk}/${it.audioCount}` : ''}
                                          {it.kind === 'notion' && (it.blocks || it.audioCount) && it.charCount ? ' · ' : ''}
                                          {it.charCount ? `${it.charCount.toLocaleString()}자` : ''}
                                          {it.durationMs ? ` · ${(it.durationMs / 1000).toFixed(1)}s` : ''}
                                          {it.truncated ? ' · ✂️일부' : ''}
                                        </span>
                                      )}
                                      {it.status === 'error' && (
                                        <span style={{ color: '#fca5a5', fontSize: '11px' }} title={it.error}>
                                          실패
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* 단계별 안내 */}
                            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '10px', lineHeight: 1.5 }}>
                              {pp_summaryPhase === 'extracting' && '※ 첨부된 노션 페이지·PDF가 많으면 분 단위로 걸릴 수 있습니다. 위 목록이 갱신되면 정상 작동 중입니다.'}
                              {pp_summaryPhase === 'ai_writing' && '※ Claude가 자료 전체를 읽고 정리본을 작성하는 중입니다 (10~30초).'}
                              {pp_summaryPhase === 'saving' && '※ 거의 다 됐습니다.'}
                              {!pp_summaryPhase && (isGen ? '※ 곧 자료 분석을 시작합니다.' : '※ 곧 수정을 시작합니다.')}
                            </div>
                          </div>
                        )
                      })()}

                      {pp_summaryError && (
                        <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: '8px', color: '#fca5a5', fontSize: '12.5px' }}>
                          ⚠️ {pp_summaryError}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* ───── 3. 생성할 항목 / 생성 (주제·컨텍스트는 섹션 1.5로 이동됨) ───── */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '8px', fontWeight: 500 }}>생성할 항목</label>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
                      {Object.entries(PLANNER_META).map(([key, meta]) => {
                        const checked = pp_enabledTasks.includes(key)
                        const dis = !meta.enabled
                        return (
                          <label key={key} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '10px 12px',
                            background: checked ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${checked ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                            borderRadius: '9px',
                            cursor: dis ? 'not-allowed' : 'pointer',
                            opacity: dis ? 0.45 : 1,
                          }}>
                            <input type="checkbox" checked={checked} disabled={dis} onChange={() => toggleTask(key)}
                              style={{ marginTop: '2px', width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: dis ? 'not-allowed' : 'pointer' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{meta.icon}</span>
                                <span>{meta.label}</span>
                                {dis && <span style={{ fontSize: '10px', padding: '1px 7px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8', borderRadius: '999px', marginLeft: '4px' }}>준비 중</span>}
                                {/* PPT 봇에만 "구조 설정" 버튼 */}
                                {key === 'ppt' && checked && !dis && (
                                  <button type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPpStructureModalOpen(true) }}
                                    style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.40)', borderRadius: '7px', color: '#d8b4fe', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}>
                                    🔧 구조 설정 ({pp_pptStructure.length}단계)
                                  </button>
                                )}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.45 }}>{meta.desc}</div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <button onClick={handleGenerate} disabled={pp_loading || pp_prechecking || !ready}
                    style={{
                      width: '100%', padding: '14px',
                      background: (pp_loading || pp_prechecking || !ready) ? 'rgba(99,102,241,0.20)' : 'var(--accent-grad)',
                      border: 'none', borderRadius: '10px',
                      color: '#fff', fontSize: '15px', fontWeight: 700,
                      cursor: (pp_loading || pp_prechecking) ? 'wait' : (ready ? 'pointer' : 'not-allowed'),
                      boxShadow: (pp_loading || pp_prechecking || !ready) ? 'none' : '0 8px 18px rgba(99,102,241,0.30)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}>
                    <Wand2 size={16} />
                    {pp_prechecking ? '🔍 입력 점검 중… (3~5초)' :
                     pp_loading ? '생성 중…' :
                     (ready ? `🪄 기획 생성 (${pp_enabledTasks.length}개 항목)` : '강사·기수 선택 필요')}
                  </button>

                  {pp_error && (
                    <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: '8px', color: '#fca5a5', fontSize: '12.5px' }}>⚠️ {pp_error}</div>
                  )}

                  {/* ───── 진행상황 ───── */}
                  {(() => {
                    const busy = pp_loading || !!pp_taskRetrying
                    if (!busy || pp_runTasks.length === 0) return null
                    void pp_tick // useEffect interval로 갱신되어 elapsed 표시가 흐름
                    const totalTasks = pp_runTasks.length
                    const completedCount = pp_runTasks.filter(t => {
                      const s = pp_taskStatus[t]?.status
                      return s === 'done' || s === 'error'
                    }).length
                    const elapsed = pp_startedAt ? (Date.now() - pp_startedAt) : 0
                    const phaseLabel =
                      pp_phase === 'ebook_extracting' ? '📚 전자책 텍스트 추출 중...' :
                      pp_phase === 'planning' ? '🪄 기획 생성 중...' :
                      pp_phase === 'done' ? '✅ 마무리 중...' :
                      '⏳ 준비 중...'
                    // 단계별 의미를 살린 진행률: ebook 추출 단계 5%, planning 시작 시 10% 베이스라인 + 완료비율.
                    let progressPercent = 0
                    if (pp_phase === 'starting') progressPercent = 3
                    else if (pp_phase === 'ebook_extracting') progressPercent = 8
                    else if (pp_phase === 'planning' || pp_phase === 'done') {
                      const ratio = totalTasks > 0 ? completedCount / totalTasks : 0
                      progressPercent = Math.round(10 + ratio * 90)
                    }
                    if (pp_phase === 'done') progressPercent = 100
                    return (
                      <div style={{
                        marginTop: '14px',
                        padding: '14px 16px',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: '12px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{phaseLabel}</span>
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '999px' }}>
                              {completedCount} / {totalTasks} 완료
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                            {(elapsed / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div style={{
                          height: '8px',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                          position: 'relative',
                        }}>
                          <div style={{
                            height: '100%',
                            width: progressPercent + '%',
                            background: 'var(--accent-grad)',
                            transition: 'width 0.4s ease',
                            borderRadius: '999px',
                          }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                          {pp_runTasks.map((k) => {
                            const meta = PLANNER_META[k] || { label: k, icon: '🧩' }
                            const s = pp_taskStatus[k] || { status: 'pending' }
                            const taskElapsed = (s.status === 'running' && s.startedAt)
                              ? ((Date.now() - s.startedAt) / 1000).toFixed(1)
                              : null
                            const dur = (s.durationMs != null) ? (s.durationMs / 1000).toFixed(1) : null
                            const palette =
                              s.status === 'done' ? { bg: 'rgba(16,185,129,0.12)', fg: '#34d399', icon: '✅' } :
                              s.status === 'error' ? { bg: 'rgba(239,68,68,0.12)', fg: '#fca5a5', icon: '❌' } :
                              s.status === 'running' ? { bg: 'rgba(99,102,241,0.18)', fg: '#c7d2fe', icon: '⏳' } :
                              { bg: 'rgba(255,255,255,0.05)', fg: '#94a3b8', icon: '⏸' }
                            // 봇별 예상 시간 (실측 기반)
                            const ETA = {
                              ppt:               '4~7분',
                              ebook:             '1~2분',
                              boomUp:            '20~40초',
                              alimtalk:          '20~40초',
                              viralQ:            '20~40초',
                              salesPage:         '1~2분',
                              groupAnnouncement: '20~40초',
                              summarize:         '30~90초',
                            }
                            return (
                              <div key={k} style={{
                                fontSize: '11.5px',
                                padding: '5px 11px',
                                borderRadius: '999px',
                                background: palette.bg,
                                color: palette.fg,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600,
                              }}>
                                <span>{palette.icon}</span>
                                <span>{meta.icon} {meta.label}</span>
                                {taskElapsed && (
                                  <span style={{ opacity: 0.75, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{taskElapsed}s</span>
                                )}
                                {!taskElapsed && !dur && s.status !== 'done' && s.status !== 'error' && ETA[k] && (
                                  <span style={{ opacity: 0.65, fontWeight: 500, fontSize: '10.5px' }}>~{ETA[k]}</span>
                                )}
                                {dur && (
                                  <span style={{ opacity: 0.75, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{dur}s</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {/* PPT 봇이 포함된 run에 대해서 시간 안내 — 사용자 답답함 해소 */}
                        {pp_runTasks.includes('ppt') && (
                          <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '8px', fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                            💡 <b style={{ color: '#cbd5e1' }}>PPT outline은 슬라이드 250~300장이라 4~7분 소요</b>됩니다. 렉 아니에요. 한 번 만든 결과는 <b style={{ color: '#a5b4fc' }}>🗃️ 생성된 기획안</b> 탭에 자동 저장돼서 다시 만들 필요 없습니다.
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* ───── PPT 구조 설정 모달 ─────
                    11개 kind 중 사용할 것만 + 원하는 순서로. 위/아래 화살표로 순서 변경, ON/OFF 토글.
                    저장 후 localStorage에 사용자별 보존. */}
                {pp_structureModalOpen && (() => {
                  const ALL_KINDS = [
                    { key: 'hook',        icon: '🪝', label: '후크',            desc: '도발적 한 줄·충격적 수치 (3~8장)' },
                    { key: 'intro',       icon: '🎬', label: '강사 소개',       desc: '환영·자기소개·라포 (3~5장)' },
                    { key: 'proof',       icon: '💰', label: '성과 증명',       desc: '매출·순익·연소득 스크린샷 (5~10장)' },
                    { key: 'journey',     icon: '📖', label: '일대기/시행착오', desc: '연도별 타임라인 (10~25장, 핵심 분량)' },
                    { key: 'myth',        icon: '💥', label: '통념 깨기',       desc: '"다들 ~한다고 알지만…" (5~10장)' },
                    { key: 'info',        icon: '📊', label: '본론 챕터',       desc: 'CHAPTER 01~05 노하우 (40~75장, 최대 분량)' },
                    { key: 'empty',       icon: '🎞️', label: '빈/이미지',       desc: '영상·이미지 띄우는 슬라이드 (전체 산재)' },
                    { key: 'qna',         icon: '❓', label: 'Q&A 시뮬레이션',  desc: '예상 질문 미리 답변 (5~10장)' },
                    { key: 'testimonial', icon: '💬', label: '수강생 후기',     desc: '★ 3단 구조: 상황 → 코칭 → 결과 (5~10장)' },
                    { key: 'cta',         icon: '🎯', label: '정규 강의 모집',  desc: '회차·혜택·가격·마감일 (10~20장)' },
                    { key: 'outro',       icon: '🎤', label: '마무리 (호소)',    desc: '⚠️ 동기부여 멘트 류. 기본은 OFF (사용자 요청)' },
                    { key: 'breath',      icon: '💧', label: '숨고르기',        desc: '한 줄 농담·물 한 모금·잠시 쉬기. 큰 챕터 전환점에 3~6장 자동 분포' },
                  ]
                  const KIND_MAP = Object.fromEntries(ALL_KINDS.map(k => [k.key, k]))
                  const orderedItems = pp_pptStructure.map(k => KIND_MAP[k]).filter(Boolean)
                  const unusedItems = ALL_KINDS.filter(k => !pp_pptStructure.includes(k.key))

                  const moveUp = (idx) => {
                    if (idx === 0) return
                    const arr = [...pp_pptStructure]
                    ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
                    updatePptStructure(arr)
                  }
                  const moveDown = (idx) => {
                    if (idx === pp_pptStructure.length - 1) return
                    const arr = [...pp_pptStructure]
                    ;[arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]]
                    updatePptStructure(arr)
                  }
                  const removeItem = (idx) => {
                    const arr = pp_pptStructure.filter((_, i) => i !== idx)
                    updatePptStructure(arr)
                  }
                  const addItem = (key) => {
                    if (pp_pptStructure.includes(key)) return
                    updatePptStructure([...pp_pptStructure, key])
                  }
                  const resetToDefault = () => {
                    if (confirm('기본 9단계 순서로 되돌립니다. 진행할까요?')) {
                      updatePptStructure(DEFAULT_PPT_STRUCTURE)
                    }
                  }

                  // 드래그앤드롭 — 카드 왼쪽 그립을 잡아 드래그하면 순서 변경.
                  // HTML5 native API 사용 (라이브러리 X). pp_dragIndex로 현재 잡은 인덱스 추적.
                  const handleDragStart = (e, idx) => {
                    setPpDragIndex(idx)
                    e.dataTransfer.effectAllowed = 'move'
                    // Firefox 호환: 빈 데이터라도 setData 필요
                    try { e.dataTransfer.setData('text/plain', String(idx)) } catch {}
                  }
                  const handleDragOver = (e, idx) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (pp_dragOverIndex !== idx) setPpDragOverIndex(idx)
                  }
                  const handleDragLeave = () => {
                    // 카드 사이 이동 시 깜빡임 방지를 위해 즉시 클리어 X (drop 또는 dragend에서 처리)
                  }
                  const handleDrop = (e, idx) => {
                    e.preventDefault()
                    const from = pp_dragIndex
                    setPpDragIndex(null)
                    setPpDragOverIndex(null)
                    if (from == null || from === idx) return
                    const arr = [...pp_pptStructure]
                    const [moved] = arr.splice(from, 1)
                    arr.splice(idx, 0, moved)
                    updatePptStructure(arr)
                  }
                  const handleDragEnd = () => {
                    setPpDragIndex(null)
                    setPpDragOverIndex(null)
                  }

                  return (
                    <div onClick={(e) => { if (e.target === e.currentTarget) setPpStructureModalOpen(false) }}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div style={{ background: '#0f0f15', borderRadius: '14px', padding: '24px', maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #a855f7, #ec4899)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '16px' }}>🔧</span>
                          </span>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>PPT 구조 설정</h3>
                          <button onClick={() => setPpStructureModalOpen(false)} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>닫기</button>
                        </div>
                        <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.55, marginBottom: '16px' }}>
                          사용자가 직접 슬라이드 단계 순서를 변경할 수 있습니다. <b style={{ color: '#cbd5e1' }}>왼쪽 ⋮⋮ 잡고 드래그</b>하거나 <b style={{ color: '#cbd5e1' }}>↑↓ 버튼</b>으로 순서 변경, <b style={{ color: '#fca5a5' }}>✕</b>로 제거, 아래 풀에서 추가. 변경은 자동으로 본인 계정에 저장됩니다.
                        </p>

                        <div style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.08em' }}>📑 사용할 단계 ({orderedItems.length})</div>
                          {orderedItems.length === 0 && (
                            <div style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: 'rgba(0,0,0,0.30)', borderRadius: '9px', border: '1px dashed var(--border)' }}>
                              빈 구조. 아래 풀에서 추가하세요.
                            </div>
                          )}
                          {orderedItems.map((item, idx) => {
                            const isDragging = pp_dragIndex === idx
                            const isDropTarget = pp_dragOverIndex === idx && pp_dragIndex !== null && pp_dragIndex !== idx
                            return (
                              <div key={item.key}
                                draggable
                                onDragStart={(e) => handleDragStart(e, idx)}
                                onDragOver={(e) => handleDragOver(e, idx)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, idx)}
                                onDragEnd={handleDragEnd}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                  padding: '10px 12px',
                                  marginBottom: '5px',
                                  background: isDropTarget ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.08)',
                                  border: '1px solid ' + (isDropTarget ? 'rgba(129,140,248,0.65)' : 'rgba(99,102,241,0.25)'),
                                  borderRadius: '9px',
                                  opacity: isDragging ? 0.4 : 1,
                                  transition: 'background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease',
                                  cursor: 'grab',
                                }}>
                                {/* 드래그 핸들 (≡) — 시각적으로 "여기 잡을 수 있음" 표시. 실제로는 카드 전체가 draggable */}
                                <span title="드래그해서 순서 변경" style={{
                                  fontSize: '18px', color: '#64748b',
                                  lineHeight: 1,
                                  userSelect: 'none',
                                  padding: '2px 4px',
                                  cursor: 'grab',
                                }}>⋮⋮</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '20px', fontWeight: 700 }}>{idx + 1}.</span>
                                <span style={{ fontSize: '17px' }}>{item.icon}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{item.label}</div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{item.desc}</div>
                                </div>
                                <button onClick={() => moveUp(idx)} disabled={idx === 0}
                                  style={{ padding: '5px 9px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: idx === 0 ? '#475569' : '#cbd5e1', fontSize: '12px', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}>↑</button>
                                <button onClick={() => moveDown(idx)} disabled={idx === orderedItems.length - 1}
                                  style={{ padding: '5px 9px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: idx === orderedItems.length - 1 ? '#475569' : '#cbd5e1', fontSize: '12px', cursor: idx === orderedItems.length - 1 ? 'not-allowed' : 'pointer' }}>↓</button>
                                <button onClick={() => removeItem(idx)}
                                  style={{ padding: '5px 9px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                              </div>
                            )
                          })}
                        </div>

                        {unusedItems.length > 0 && (
                          <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.08em' }}>➕ 추가 가능한 단계 (풀)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {unusedItems.map(item => (
                                <button key={item.key} onClick={() => addItem(item.key)}
                                  title={item.desc}
                                  style={{ padding: '6px 11px', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <span>{item.icon}</span>
                                  <span>{item.label}</span>
                                  <span style={{ color: '#86efac', fontWeight: 700 }}>+</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <button onClick={resetToDefault}
                            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                            🔄 기본값으로
                          </button>
                          <button onClick={() => setPpStructureModalOpen(false)}
                            style={{ padding: '9px 18px', background: 'var(--accent-grad)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                            ✅ 적용
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ───── 🎨 PPT 디자인 톤 입력 모달 ─────
                    PPT 체크돼있을 때 [🪄 기획 생성] 클릭 시 자동 표시.
                    사용자가 design.md 톤 복붙하거나 기본 톤으로 진행. */}
                {pp_toneModalOpen && (() => {
                  const parsed = parseToneMd(pp_designToneMd)
                  const T = applyToneOverrides(parsed, pp_designToneOverrides)
                  // 추출 결과가 모두 기본값과 동일하면 = 추출 실패 (hex 없는 MD)
                  const detected = parsed._detected || {}
                  const overrideKeys = Object.keys(pp_designToneOverrides || {}).filter(k => /^[0-9A-Fa-f]{6}$/.test(pp_designToneOverrides[k] || ''))
                  const colorKeys = ['primary', 'secondary', 'background', 'text', 'accent', 'soft', 'highlight']
                  const detectedCount = colorKeys.filter(k => detected[k]).length
                  const extractionFailed = detectedCount === 0 && overrideKeys.length === 0
                  // 칩에서 hex 직접 수정
                  const updateOverride = (key, value) => {
                    const clean = (value || '').replace(/^#/, '').trim().toUpperCase()
                    setPpDesignToneOverrides(prev => {
                      const next = { ...prev, [key]: clean }
                      if (typeof window !== 'undefined' && loginId) {
                        try { localStorage.setItem(`pp_designToneOverrides:${loginId}`, JSON.stringify(next)) } catch {}
                      }
                      return next
                    })
                  }
                  return (
                    <div onClick={(e) => { if (e.target === e.currentTarget) cancelToneAndAbort() }}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div style={{ background: '#0f0f15', borderRadius: '14px', padding: '24px', maxWidth: '760px', width: '100%', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #f472b6, #a855f7)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🎨</span>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>PPT 디자인 톤</h3>
                          <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(168,85,247,0.15)', color: '#d8b4fe', borderRadius: '999px', fontWeight: 700 }}>선택</span>
                        </div>
                        <p style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.55, marginBottom: '10px' }}>
                          <a href="https://www.designmd.org/" target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc' }}>design.md</a> 같은 곳에서 원하는 톤의 MD를 복사해 붙여넣으세요.
                          색상 hex(예: <code style={{ color: '#fbbf24' }}>#111111</code>)와 폰트명을 자동 추출합니다. 입력 안 하면 <b style={{ color: '#cbd5e1' }}>기본 N잡연구소 톤</b>(Nike editorial, 흰 캔버스 + 검정 잉크)으로 진행.
                        </p>
                        <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '8px', fontSize: '11.5px', color: '#fbbf24', lineHeight: 1.55 }}>
                          ℹ️ <b>폰트 안내</b>: 기본값은 <b style={{ color: '#fef3c7' }}>Pretendard</b>. 다운로드 시 PPTX의 폰트 슬롯 3종(영문/한글/복합)을 모두 Pretendard로 자동 강제 적용합니다.
                          <b style={{ color: '#fef3c7' }}> 보내는 쪽 + 받는 쪽 PC 모두 Pretendard 설치돼있으면</b> 디자인 그대로 보입니다.
                          (<a href="https://github.com/orioncactus/pretendard/releases" target="_blank" rel="noopener noreferrer" style={{ color: '#fcd34d', textDecoration: 'underline' }}>Pretendard 무료 다운로드</a>)
                        </div>

                        <textarea value={pp_designToneMd} onChange={(e) => setPpDesignToneMd(e.target.value)} rows={14}
                          placeholder="# Brand Tone\nModern, minimal, bold typography...\n\n## Colors\n- Primary: #6366F1\n- Background: #0F0F23\n..."
                          style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '8px', color: '#cbd5e1', fontSize: '12.5px', fontFamily: 'monospace', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical', minHeight: '220px' }} />

                        {/* 추출 실패 경고 — MD에 hex가 없는 경우 (예: Meta 톤은 토큰 참조만 있어 추출 불가) */}
                        {extractionFailed && (
                          <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', fontSize: '12px', color: '#fca5a5', lineHeight: 1.6 }}>
                            ⚠️ <b style={{ color: '#fecaca' }}>MD에서 색상 hex를 찾지 못했습니다.</b> 이 MD는 <code style={{ color: '#fde68a' }}>{`{colors.primary}`}</code> 같은 토큰 참조만 있거나 색상 이름만 있어 자동 추출이 불가능합니다.
                            아래 칩의 hex 값을 직접 입력하거나, MD에 <code style={{ color: '#fde68a' }}>Primary: #0064E0</code> 같이 hex를 명시한 라인을 추가하세요. 그대로 진행하면 <b>기본 검정 톤</b>으로 생성됩니다.
                          </div>
                        )}

                        {/* 추출된 톤 미리보기 — 사용자가 입력한 MD에서 자동 파싱 결과 + 인라인 hex 편집 */}
                        <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>🔍 자동 추출 결과 (클릭해서 직접 수정 가능)</div>
                            {(overrideKeys.length > 0 || (pp_designToneOverrides.fontMain && pp_designToneOverrides.fontMain.trim())) && (
                              <button onClick={() => {
                                setPpDesignToneOverrides({})
                                if (typeof window !== 'undefined' && loginId) {
                                  try { localStorage.removeItem(`pp_designToneOverrides:${loginId}`) } catch {}
                                }
                              }} style={{ fontSize: '10.5px', padding: '3px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer' }}>
                                ↺ 수동 입력 초기화
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            {[
                              { key: 'primary', label: 'Primary' },
                              { key: 'secondary', label: 'Secondary' },
                              { key: 'background', label: 'Background' },
                              { key: 'text', label: 'Text' },
                              { key: 'accent', label: 'Accent' },
                              { key: 'soft', label: 'Soft' },
                              { key: 'highlight', label: 'Highlight' },
                            ].map(c => {
                              const isOverride = /^[0-9A-Fa-f]{6}$/.test(pp_designToneOverrides[c.key] || '')
                              const source = isOverride ? '✏️' : (detected[c.key] === 'hex' ? '🔍' : detected[c.key] === 'named' ? '🧠' : '⚙️')
                              return (
                                <div key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px 4px 10px', background: 'rgba(0,0,0,0.30)', borderRadius: '7px', border: isOverride ? '1px solid rgba(168,85,247,0.45)' : '1px solid var(--border)' }}>
                                  <span style={{ width: '18px', height: '18px', borderRadius: '4px', background: `#${T[c.key]}`, border: '1px solid rgba(255,255,255,0.18)' }} />
                                  <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{c.label}</span>
                                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>#</span>
                                  <input
                                    type="text"
                                    maxLength={7}
                                    value={T[c.key]}
                                    onChange={(e) => updateOverride(c.key, e.target.value)}
                                    title={isOverride ? '수동 입력값' : detected[c.key] === 'hex' ? 'MD에서 hex 추출' : detected[c.key] === 'named' ? 'MD의 색상 이름으로 추론' : '기본값'}
                                    style={{ width: '64px', padding: '2px 4px', background: 'transparent', border: 'none', color: isOverride ? '#fbcfe8' : '#cbd5e1', fontSize: '10.5px', fontFamily: 'monospace', outline: 'none', textTransform: 'uppercase' }}
                                  />
                                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{source}</span>
                                </div>
                              )
                            })}
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(99,102,241,0.10)', borderRadius: '7px', border: '1px solid rgba(99,102,241,0.30)' }}>
                              <span style={{ fontSize: '11px', color: '#a5b4fc' }}>🔤 본문</span>
                              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>{T.fontMain}</span>
                            </div>
                            {T.fontDisplay && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(244,114,182,0.10)', borderRadius: '7px', border: '1px solid rgba(244,114,182,0.30)' }}>
                                <span style={{ fontSize: '11px', color: '#f0abfc' }}>🔢 강조</span>
                                <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>{T.fontDisplay}</span>
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '8px' }}>
                            🔍 MD에서 hex 추출 · 🧠 색상 이름으로 추론 · ⚙️ 기본값 · ✏️ 직접 입력
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <button onClick={() => {
                            setPpDesignToneMd(DEFAULT_DESIGN_TONE_MD)
                            setPpDesignToneOverrides({})
                            if (typeof window !== 'undefined' && loginId) {
                              try { localStorage.removeItem(`pp_designToneOverrides:${loginId}`) } catch {}
                            }
                          }}
                            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                            🔄 기본 톤으로
                          </button>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={cancelToneAndAbort}
                              style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                              취소
                            </button>
                            <button onClick={confirmToneAndProceed}
                              style={{ padding: '9px 22px', background: 'linear-gradient(135deg, #a855f7, #ec4899)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 14px rgba(168,85,247,0.30)' }}>
                              🪄 이 톤으로 기획 생성
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ───── 사전 점검 모달 ───── */}
                {pp_modalOpen && pp_precheckResult && (
                  <div
                    onClick={(e) => { if (e.target === e.currentTarget && !pp_loading) setPpModalOpen(false) }}
                    style={{
                      position: 'fixed', inset: 0,
                      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
                      zIndex: 100, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '20px',
                    }}>
                    <div style={{
                      background: '#0f172a',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      maxWidth: '640px', width: '100%',
                      maxHeight: '90vh', overflow: 'auto',
                      padding: isMobile ? '20px' : '28px',
                      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '6px' }}>
                        <div style={{ fontSize: '22px' }}>🔍</div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0, marginBottom: '4px' }}>
                            시작 전에 확인이 필요해요
                          </h3>
                          <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: 0, lineHeight: 1.55 }}>
                            AI가 입력을 점검한 결과, 더 좋은 결과물을 위해 몇 가지가 추가로 필요합니다.
                            {' '}답변하기 어려운 항목은 비워두셔도 되고, 전부 건너뛰셔도 됩니다.
                          </p>
                        </div>
                      </div>

                      {pp_precheckResult.summary && (
                        <div style={{
                          marginTop: '16px',
                          padding: '10px 12px',
                          background: 'rgba(99,102,241,0.08)',
                          border: '1px solid rgba(99,102,241,0.25)',
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          color: '#c7d2fe',
                          lineHeight: 1.5,
                        }}>
                          <span style={{ color: '#a5b4fc', fontWeight: 600 }}>AI 평가: </span>
                          {pp_precheckResult.summary}
                        </div>
                      )}

                      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {pp_precheckResult.questions.map((q, i) => (
                          <div key={i}>
                            <label style={{
                              display: 'block',
                              fontSize: '13px',
                              color: '#e2e8f0',
                              fontWeight: 600,
                              marginBottom: '6px',
                              lineHeight: 1.5,
                            }}>
                              <span style={{ color: '#a5b4fc', marginRight: '6px' }}>Q{i + 1}.</span>
                              {q}
                            </label>
                            <textarea
                              value={pp_answers[i] || ''}
                              onChange={(e) => setPpAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                              rows={2}
                              placeholder="자유롭게 답변... (비워두면 이 질문은 건너뜁니다)"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                lineHeight: 1.5,
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '22px',
                        flexDirection: isMobile ? 'column-reverse' : 'row',
                        justifyContent: 'flex-end',
                      }}>
                        <button
                          onClick={handleModalSkip}
                          disabled={pp_loading}
                          style={{
                            padding: '11px 18px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border)',
                            borderRadius: '9px',
                            color: '#cbd5e1',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: pp_loading ? 'wait' : 'pointer',
                          }}>
                          건너뛰고 그냥 생성
                        </button>
                        <button
                          onClick={handleModalContinue}
                          disabled={pp_loading}
                          style={{
                            padding: '11px 22px',
                            background: 'var(--accent-grad)',
                            border: 'none',
                            borderRadius: '9px',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: pp_loading ? 'wait' : 'pointer',
                            boxShadow: '0 6px 14px rgba(99,102,241,0.30)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}>
                          답변 후 생성 →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ───── 결과 ───── */}
                {pp_results && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(pp_results).map(([taskKey, r]) => {
                      const meta = PLANNER_META[taskKey] || { label: taskKey, icon: '🧩' }
                      const isOpen = pp_expanded[taskKey]
                      const retrying = pp_taskRetrying === taskKey
                      return (
                        <div key={taskKey} style={{
                          background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                          border: '1px solid ' + (r.ok ? 'var(--border)' : 'rgba(239,68,68,0.30)'),
                          overflow: 'hidden',
                        }}>
                          <button type="button" onClick={() => setPpExpanded(prev => ({ ...prev, [taskKey]: !prev[taskKey] }))}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: '18px' }}>{meta.icon}</span>
                            <span style={{ flex: 1, fontSize: '15px', fontWeight: 600 }}>{meta.label}</span>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: r.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: r.ok ? '#34d399' : '#fca5a5', fontWeight: 600 }}>
                              {r.ok ? '✅ 성공' : '❌ 실패'}
                            </span>
                            {r.durationMs != null && (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{(r.durationMs / 1000).toFixed(1)}s</span>
                            )}
                            <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {isOpen && (
                            <div style={{ padding: '0 16px 16px' }}>
                              {r.ok ? (
                                <>
                                  {renderPlanContent(taskKey, r.plan)}
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                                    <button onClick={() => handleRegenerate(taskKey)} disabled={retrying}
                                      style={{ padding: '8px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 600, cursor: retrying ? 'wait' : 'pointer' }}>
                                      {retrying ? '재생성 중…' : '🔄 이 섹션만 다시'}
                                    </button>
                                    <button onClick={() => copyToClipboard(taskKey, r.plan)}
                                      style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                      📋 JSON 복사
                                    </button>
                                  </div>
                                  {r.usage && (
                                    <details style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>
                                      <summary style={{ cursor: 'pointer' }}>토큰 사용량</summary>
                                      <pre style={{ marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.30)', borderRadius: '6px', overflow: 'auto', margin: 0 }}>{JSON.stringify(r.usage, null, 2)}</pre>
                                    </details>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div style={{ padding: '12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: '8px', color: '#fca5a5', fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>
                                    {r.error}
                                  </div>
                                  <button onClick={() => handleRegenerate(taskKey)} disabled={retrying}
                                    style={{ marginTop: '10px', padding: '8px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 600, cursor: retrying ? 'wait' : 'pointer' }}>
                                    {retrying ? '재시도 중…' : '🔄 다시 시도'}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 시트 설정 탭 */}
          {currentTab === 'sheet-settings' && (
            <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '100%', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚙ 구글시트 컬럼 매핑 설정
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>
                    왼쪽에서 매핑을 수정하면 오른쪽 미리보기에 실시간 반영됩니다.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={fetchSheetPreview}
                    disabled={sheetPreviewLoading}
                    style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
                  >
                    {sheetPreviewLoading ? '로딩...' : '🔄 미리보기 새로고침'}
                  </button>
                  <button
                    onClick={saveSheetConfig}
                    disabled={sheetConfigSaving}
                    style={{
                      padding: '10px 24px',
                      background: sheetConfigSaving ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: sheetConfigSaving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {sheetConfigSaving ? '저장 중...' : '💾 설정 저장'}
                  </button>
                </div>
              </div>

              {/* 좌우 분할 레이아웃 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

                {/* 왼쪽: 설정 패널 */}
                <div style={{ flex: '0 0 520px', minWidth: 0 }}>
                  {/* 시트 기본 정보 */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '20px 24px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f87171', marginBottom: '16px' }}>시트 기본 정보</h3>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ flex: 3 }}>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>시트 ID</label>
                        <input
                          type="text"
                          value={sheetConfig.sheetId}
                          onChange={(e) => setSheetConfig({ ...sheetConfig, sheetId: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>범위</label>
                        <input
                          type="text"
                          value={sheetConfig.dataRange}
                          onChange={(e) => setSheetConfig({ ...sheetConfig, dataRange: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>헤더 식별 키워드 (A열 값)</label>
                      <input
                        type="text"
                        value={sheetConfig.headerKeyword}
                        onChange={(e) => setSheetConfig({ ...sheetConfig, headerKeyword: e.target.value })}
                        style={{ width: '260px', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  {/* 컬럼 매핑 */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '8px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f87171' }}>컬럼 매핑</h3>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setSheetColumnShift({ ...sheetColumnShift, show: !sheetColumnShift.show })}
                          style={{ padding: '6px 12px', background: sheetColumnShift.show ? 'rgba(250,204,21,0.2)' : 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.4)', borderRadius: '6px', color: '#fcd34d', fontSize: '11px', cursor: 'pointer' }}
                        >
                          ↕ 시프트
                        </button>
                        <button
                          onClick={() => setSheetConfig({
                            ...sheetConfig,
                            columnMappings: [...sheetConfig.columnMappings, { fieldKey: '', displayName: '', columnIndex: 0, type: '숫자' }]
                          })}
                          style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '6px', color: '#a5b4fc', fontSize: '11px', cursor: 'pointer' }}
                        >
                          + 추가
                        </button>
                      </div>
                    </div>

                    {/* 열 시프트 패널 */}
                    {sheetColumnShift.show && (
                      <div style={{ background: 'rgba(250,204,21,0.05)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px' }}>
                        <p style={{ color: '#fcd34d', fontSize: '11px', marginBottom: '10px', fontWeight: '600' }}>
                          열 추가/삭제 시 이후 매핑 인덱스를 일괄 조정
                        </p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}>기준 열</label>
                            <input
                              type="number"
                              value={sheetColumnShift.fromIndex}
                              onChange={(e) => setSheetColumnShift({ ...sheetColumnShift, fromIndex: e.target.value })}
                              placeholder="10"
                              style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '12px', width: '70px' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}>이동 칸수</label>
                            <input
                              type="number"
                              value={sheetColumnShift.count}
                              onChange={(e) => setSheetColumnShift({ ...sheetColumnShift, count: parseInt(e.target.value) || 0 })}
                              style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '12px', width: '70px' }}
                            />
                          </div>
                          <button
                            onClick={() => {
                              const from = parseInt(sheetColumnShift.fromIndex)
                              const shift = sheetColumnShift.count
                              if (isNaN(from) || shift === 0) return alert('기준 열 번호와 이동 칸수를 입력하세요.')
                              const updated = sheetConfig.columnMappings.map(m => {
                                if (m.columnIndex >= from) {
                                  return { ...m, columnIndex: Math.max(0, m.columnIndex + shift) }
                                }
                                return m
                              })
                              const affected = sheetConfig.columnMappings.filter(m => m.columnIndex >= from).length
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                              setSheetColumnShift({ show: false, fromIndex: '', count: 1 })
                              alert(`${affected}개 매핑을 ${shift > 0 ? '+' : ''}${shift} 이동`)
                            }}
                            style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            적용
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 매핑 목록 */}
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      {sheetConfig.columnMappings.map((mapping, idx) => (
                        <div
                          key={idx}
                          onMouseEnter={() => setSheetPreviewHighlight(mapping.columnIndex)}
                          onMouseLeave={() => setSheetPreviewHighlight(null)}
                          style={{
                            display: 'flex', gap: '6px', padding: '6px 4px', alignItems: 'center',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            background: sheetPreviewHighlight === mapping.columnIndex ? 'rgba(99,102,241,0.1)' : 'transparent',
                            borderRadius: '6px', transition: 'background 0.15s'
                          }}
                        >
                          <input
                            type="text"
                            value={mapping.fieldKey}
                            onChange={(e) => {
                              const updated = [...sheetConfig.columnMappings]
                              updated[idx] = { ...updated[idx], fieldKey: e.target.value }
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                            }}
                            placeholder="필드키"
                            style={{ flex: 2, padding: '8px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '12px', minWidth: 0 }}
                          />
                          <input
                            type="text"
                            value={mapping.displayName}
                            onChange={(e) => {
                              const updated = [...sheetConfig.columnMappings]
                              updated[idx] = { ...updated[idx], displayName: e.target.value }
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                            }}
                            placeholder="표시이름"
                            style={{ flex: 2, padding: '8px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '12px', minWidth: 0 }}
                          />
                          <input
                            type="number"
                            value={mapping.columnIndex}
                            onChange={(e) => {
                              const updated = [...sheetConfig.columnMappings]
                              updated[idx] = { ...updated[idx], columnIndex: parseInt(e.target.value) || 0 }
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                            }}
                            style={{ width: '50px', padding: '8px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '12px', textAlign: 'center' }}
                          />
                          <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '4px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                            {columnIndexToLetter(mapping.columnIndex)}
                          </span>
                          <select
                            value={mapping.type}
                            onChange={(e) => {
                              const updated = [...sheetConfig.columnMappings]
                              updated[idx] = { ...updated[idx], type: e.target.value }
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                            }}
                            style={{ width: '70px', padding: '8px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '11px', cursor: 'pointer' }}
                          >
                            <option value="이름" style={{ background: '#1e1e2e' }}>이름</option>
                            <option value="날짜" style={{ background: '#1e1e2e' }}>날짜</option>
                            <option value="숫자" style={{ background: '#1e1e2e' }}>숫자</option>
                            <option value="퍼센트" style={{ background: '#1e1e2e' }}>퍼센트</option>
                          </select>
                          <button
                            onClick={() => {
                              const updated = sheetConfig.columnMappings.filter((_, i) => i !== idx)
                              setSheetConfig({ ...sheetConfig, columnMappings: updated })
                            }}
                            style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '14px', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 오른쪽: 실시간 미리보기 */}
                <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#10b981' }}>실시간 미리보기</h3>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {sheetPreviewRaw ? `원본 ${sheetPreviewRaw.length}행` : '데이터 없음'}
                      </span>
                    </div>

                    {sheetPreviewLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        시트 데이터 불러오는 중...
                      </div>
                    ) : sheetPreviewRaw ? (
                      <div style={{ overflowX: 'auto' }}>
                        {/* 원본 시트 데이터 (상단) */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}>원본 시트 데이터</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr>
                                {sheetPreviewRaw[0] && sheetPreviewRaw[0].map((_, colIdx) => (
                                  <th key={colIdx} style={{
                                    padding: '6px 8px',
                                    background: sheetPreviewHighlight === colIdx ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                                    color: sheetPreviewHighlight === colIdx ? '#a5b4fc' : '#64748b',
                                    fontWeight: '600',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    transition: 'all 0.15s',
                                    position: 'relative'
                                  }}>
                                    {columnIndexToLetter(colIdx)}
                                    {sheetConfig.columnMappings.some(m => m.columnIndex === colIdx) && (
                                      <span style={{ display: 'block', fontSize: '9px', color: '#6366f1', fontWeight: '700' }}>
                                        {sheetConfig.columnMappings.find(m => m.columnIndex === colIdx)?.displayName}
                                      </span>
                                    )}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sheetPreviewRaw.slice(0, 5).map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {row.map((cell, colIdx) => (
                                    <td key={colIdx} style={{
                                      padding: '5px 8px',
                                      color: sheetPreviewHighlight === colIdx ? '#e2e8f0' : '#94a3b8',
                                      background: sheetPreviewHighlight === colIdx ? 'rgba(99,102,241,0.1)' : 'transparent',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '100px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                                      transition: 'all 0.15s'
                                    }}>
                                      {String(cell || '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* 매핑 적용 결과 (하단) */}
                        <div style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: '#10b981', marginBottom: '8px', fontWeight: '600' }}>매핑 적용 결과</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr>
                                {sheetConfig.columnMappings.map((m, idx) => (
                                  <th key={idx}
                                    onMouseEnter={() => setSheetPreviewHighlight(m.columnIndex)}
                                    onMouseLeave={() => setSheetPreviewHighlight(null)}
                                    style={{
                                      padding: '6px 8px',
                                      background: sheetPreviewHighlight === m.columnIndex ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.05)',
                                      color: sheetPreviewHighlight === m.columnIndex ? '#34d399' : '#10b981',
                                      fontWeight: '600',
                                      textAlign: 'center',
                                      whiteSpace: 'nowrap',
                                      borderBottom: '1px solid rgba(16,185,129,0.15)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {m.displayName || m.fieldKey}
                                    <span style={{ display: 'block', fontSize: '9px', color: '#64748b' }}>{columnIndexToLetter(m.columnIndex)}열</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // 헤더 키워드로 시작행 찾기
                                let startIdx = 0
                                for (let i = 0; i < sheetPreviewRaw.length; i++) {
                                  if (sheetPreviewRaw[i][0] === sheetConfig.headerKeyword) {
                                    startIdx = i + 1
                                    break
                                  }
                                }
                                return sheetPreviewRaw.slice(startIdx, startIdx + 5).map((row, rowIdx) => (
                                  <tr key={rowIdx}>
                                    {sheetConfig.columnMappings.map((m, colIdx) => {
                                      let val = row[m.columnIndex] || ''
                                      if (m.type === '퍼센트' && typeof val === 'number') {
                                        val = (val * 100).toFixed(1) + '%'
                                      } else if (m.type === '숫자' && typeof val === 'number') {
                                        val = val.toLocaleString()
                                      }
                                      return (
                                        <td key={colIdx}
                                          onMouseEnter={() => setSheetPreviewHighlight(m.columnIndex)}
                                          onMouseLeave={() => setSheetPreviewHighlight(null)}
                                          style={{
                                            padding: '5px 8px',
                                            color: sheetPreviewHighlight === m.columnIndex ? '#e2e8f0' : '#94a3b8',
                                            background: sheetPreviewHighlight === m.columnIndex ? 'rgba(16,185,129,0.08)' : 'transparent',
                                            whiteSpace: 'nowrap',
                                            maxWidth: '100px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            textAlign: m.type === '숫자' || m.type === '퍼센트' ? 'right' : 'left',
                                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                          }}
                                        >
                                          {String(val)}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        미리보기를 불러오려면 새로고침을 클릭하세요
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 결제자 데이터 탭 */}
          {currentTab === 'payer-data' && (
            <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  💳 결제자 매칭
                  <HelpTooltip text={"[사용 방법]\n1. 왼쪽에서 결제자 시트 탭을 선택합니다\n2. 오른쪽에서 신청자 엑셀 파일을 업로드합니다\n   (여러 파일 가능: 1기_GDN.xlsx, 1기_돈깨비.xlsx 등)\n3. 매칭 시작을 누르면 자동으로 처리됩니다\n\n[매칭 로직]\n• 결제자의 전화번호와 신청자의 전화번호를 비교합니다\n• 같은 번호가 있으면 → 해당 신청자 파일명이 유입경로가 됩니다\n• 같은 사람이 여러 파일에 있으면 → 신청일이 가장 빠른 것 하나만 사용\n• 전화번호가 매칭 안 되면 → '직접구매'로 표시됩니다\n\n[제외 조건]\n• 결제 구분이 '전체환불'인 건은 자동 제외됩니다\n• 결제금액이 0원 이하인 건도 자동 제외됩니다\n• 부분환불은 포함됩니다\n\n[결과 엑셀 컬럼]\n구매자 / 전화번호 / 결제금액 / 결제일 / 신청일 / 유입경로 / 결제수단(카드·계좌이체)"} />
                </h2>
                <p style={{ color: '#64748b', fontSize: '13px' }}>결제자 시트를 선택하고 신청자 파일을 업로드하면 전화번호 기반으로 유입경로를 매칭합니다.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: '20px' }}>
                {/* 왼쪽: 결제자 시트 탭 선택 */}
                <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📋 결제자 시트
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
                        {['25', '26'].map(y => (
                          <button
                            key={y}
                            onClick={() => { setPayerSheetYear(y); loadPayerSheetTabs(y) }}
                            style={{
                              padding: '4px 10px',
                              background: payerSheetYear === y ? 'rgba(99,102,241,0.3)' : 'transparent',
                              border: 'none',
                              color: payerSheetYear === y ? '#818cf8' : '#94a3b8',
                              fontSize: '12px',
                              fontWeight: payerSheetYear === y ? '600' : '400',
                              cursor: 'pointer'
                            }}
                          >{y}년</button>
                        ))}
                      </div>
                      <button
                        onClick={() => loadPayerSheetTabs(payerSheetYear)}
                        disabled={payerSheetLoading}
                        style={{
                          padding: '4px 10px',
                          background: 'rgba(99,102,241,0.15)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: '6px',
                          color: '#818cf8',
                          fontSize: '12px',
                          cursor: payerSheetLoading ? 'wait' : 'pointer'
                        }}
                      >{payerSheetLoading ? '로딩...' : '불러오기'}</button>
                    </div>
                  </div>

                  {payerSheetTabs.length > 0 && (
                    <div>
                      <input
                        type="text"
                        placeholder="강사명 또는 기수 검색..."
                        value={payerSheetSearch}
                        onChange={e => setPayerSheetSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '6px',
                          color: '#e2e8f0',
                          fontSize: '12px',
                          marginBottom: '8px',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />

                      <div style={{ maxHeight: '500px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {payerSheetTabs
                          .filter(tab => {
                            if (!payerSheetSearch) return true
                            const q = payerSheetSearch.toLowerCase()
                            const mapping = payerTabMappings[`${payerSheetYear}_${tab.raw}`]
                            const inst = mapping?.instructor || tab.instructor
                            const coh = mapping?.cohort || tab.cohort
                            return inst.toLowerCase().includes(q) || coh.toLowerCase().includes(q) || tab.raw.toLowerCase().includes(q)
                          })
                          .map((tab, i) => {
                            const mapping = payerTabMappings[`${payerSheetYear}_${tab.raw}`]
                            const displayInstructor = mapping?.instructor || tab.instructor
                            const displayCohort = mapping?.cohort || tab.cohort
                            const isEditing = payerEditingTab === tab.raw
                            const isSelected = payerSheetSelectedTab?.raw === tab.raw

                            return (
                              <div key={i}>
                                <div
                                  onClick={() => {
                                    const mapped = { ...tab, instructor: displayInstructor, cohort: displayCohort }
                                    setPayerSheetSelectedTab(mapped)
                                    setPayerMatchResult(null)
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                    border: isSelected ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: isEditing ? '6px 6px 0 0' : '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: mapping ? '#a5b4fc' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayInstructor}</span>
                                    {displayCohort && <span style={{ fontSize: '11px', color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 }}>{displayCohort}</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>{tab.displayDate}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (isEditing) {
                                          setPayerEditingTab(null)
                                        } else {
                                          setPayerEditingTab(tab.raw)
                                          setPayerEditInstructor(displayInstructor)
                                          setPayerEditCohort(displayCohort)
                                        }
                                      }}
                                      style={{
                                        padding: '2px 4px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: isEditing ? '#818cf8' : '#64748b',
                                        fontSize: '11px',
                                        cursor: 'pointer'
                                      }}
                                      title="강사/기수 수정"
                                    >✏️</button>
                                  </div>
                                </div>

                                {/* 인라인 편집 폼 */}
                                {isEditing && (
                                  <div style={{
                                    padding: '8px 12px',
                                    background: 'rgba(99,102,241,0.08)',
                                    border: '1px solid rgba(99,102,241,0.2)',
                                    borderTop: 'none',
                                    borderRadius: '0 0 6px 6px',
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center'
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  >
                                    <input
                                      value={payerEditInstructor}
                                      onChange={e => setPayerEditInstructor(e.target.value)}
                                      placeholder="강사명"
                                      style={{
                                        flex: 1,
                                        padding: '5px 8px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        borderRadius: '4px',
                                        color: '#e2e8f0',
                                        fontSize: '12px',
                                        outline: 'none',
                                        minWidth: 0
                                      }}
                                    />
                                    <input
                                      value={payerEditCohort}
                                      onChange={e => setPayerEditCohort(e.target.value)}
                                      placeholder="기수"
                                      style={{
                                        width: '60px',
                                        padding: '5px 8px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        borderRadius: '4px',
                                        color: '#e2e8f0',
                                        fontSize: '12px',
                                        outline: 'none'
                                      }}
                                    />
                                    <button
                                      onClick={() => {
                                        savePayerTabMapping(payerSheetYear, tab.raw, payerEditInstructor.trim(), payerEditCohort.trim())
                                        setPayerEditingTab(null)
                                        if (payerSheetSelectedTab?.raw === tab.raw) {
                                          setPayerSheetSelectedTab({ ...tab, instructor: payerEditInstructor.trim(), cohort: payerEditCohort.trim() })
                                        }
                                      }}
                                      style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '4px', color: '#10b981', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}
                                    >저장</button>
                                    {mapping && (
                                      <button
                                        onClick={() => {
                                          deletePayerTabMapping(payerSheetYear, tab.raw)
                                          setPayerEditingTab(null)
                                          if (payerSheetSelectedTab?.raw === tab.raw) {
                                            setPayerSheetSelectedTab({ ...tab })
                                          }
                                        }}
                                        style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', color: '#f87171', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}
                                      >초기화</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  {payerSheetTabs.length === 0 && !payerSheetLoading && (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '12px' }}>
                      "불러오기"를 눌러 시트 탭 목록을 로드하세요
                    </div>
                  )}
                </div>

                {/* 오른쪽: 신청자 업로드 + 매칭 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* 선택된 시트 정보 */}
                  <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔄 유입경로 매칭
                    </div>

                    {/* 선택 상태 표시 */}
                    <div style={{ padding: '12px 16px', background: payerSheetSelectedTab ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: `1px solid ${payerSheetSelectedTab ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}`, marginBottom: '16px' }}>
                      {payerSheetSelectedTab ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#10b981', fontSize: '14px' }}>✓</span>
                          <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: '500' }}>
                            결제자: {payerSheetSelectedTab.instructor} {payerSheetSelectedTab.cohort}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '11px' }}>({payerSheetSelectedTab.displayDate})</span>
                          {payerTabMappings[`${payerSheetYear}_${payerSheetSelectedTab.raw}`] && (
                            <span style={{ color: '#94a3b8', fontSize: '10px' }}>원본: {payerSheetSelectedTab.raw}</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '13px' }}>왼쪽에서 결제자 시트를 선택해주세요</span>
                      )}
                    </div>

                    {/* 신청자 데이터 — DB 검색 또는 엑셀 업로드 두 가지 모드 */}
                    <div style={{
                      padding: '16px',
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: '10px',
                      border: '1px solid rgba(99,102,241,0.25)',
                      marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📥 신청자 데이터
                      </div>

                      {/* 모드 토글 — DB 검색 / 엑셀 업로드 */}
                      <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'rgba(0,0,0,0.30)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '12px' }}>
                        {[
                          { key: 'db', label: '🔎 DB 검색', desc: 'nlab DB의 무료강의 신청자' },
                          { key: 'manual', label: '📁 엑셀 업로드', desc: 'GDN·돈깨비 등 외부 신청자 명단' },
                        ].map(m => {
                          const active = payerMatchMode === m.key
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => {
                                setPayerMatchMode(m.key)
                                setPayerMatchResult(null)
                              }}
                              style={{
                                flex: 1, padding: '7px 10px',
                                background: active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
                                border: 'none', borderRadius: '6px',
                                color: active ? '#fff' : '#94a3b8',
                                fontSize: '12px', fontWeight: active ? 600 : 500,
                                cursor: 'pointer', textAlign: 'center'
                              }}
                            >{m.label}</button>
                          )
                        })}
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '10px' }}>
                        {payerMatchMode === 'db'
                          ? '강의명 검색 → 강의 선택 → 신청자가 자동으로 유입경로로 매칭됩니다'
                          : '파일을 여러 개 올려도 됩니다. 파일명이 유입경로 라벨로 사용됩니다 (예: GDN.xlsx → GDN). 헤더에서 이름·전화번호·신청일 컬럼을 자동 감지합니다.'}
                      </p>

                      {payerMatchMode === 'manual' && (() => {
                        const PHONE_HINTS = ['휴대폰', '휴대전화', '연락처', '전화번호', '폰번호', '핸드폰', 'phone', 'mobile', 'tel', 'hp']
                        const NAME_HINTS = ['이름', '성명', '고객명', '회원명', '수신자', '구매자', '수강생', 'name']
                        const DATE_HINTS = ['신청일', '가입일', '등록일', '신청시간', '등록시간', 'date', 'registered']
                        const detectHeader = (headers, hints) => {
                          const lower = headers.map(h => String(h || '').replace(/\s/g, '').toLowerCase())
                          for (const hint of hints) {
                            const h = hint.toLowerCase()
                            const idx = lower.findIndex(x => x.includes(h))
                            if (idx >= 0) return headers[idx]
                          }
                          return null
                        }
                        const handleFiles = async (filesList) => {
                          const files = Array.from(filesList || [])
                          if (files.length === 0) return
                          setPayerMatchManualParsing(true)
                          try {
                            const XLSX = await import('xlsx')
                            const parsedFiles = []
                            for (const f of files) {
                              const baseLabel = f.name.replace(/\.(csv|tsv|xlsx|xls)$/i, '').trim() || f.name
                              try {
                                // DB카트는 .xls 확장자지만 실제는 HTML 테이블.
                                // 파일명에 "디비카트" 들어있을 때만 HTML 파싱, 그 외엔 기존 방식.
                                const isDbCart = /디비\s*카트|dbcart|db카트/i.test(f.name)
                                let wb
                                if (isDbCart) {
                                  const text = await f.text()
                                  wb = XLSX.read(text, { type: 'string' })
                                } else {
                                  const buffer = await f.arrayBuffer()
                                  wb = XLSX.read(buffer, { type: 'array', codepage: 949 })
                                }
                                const sheet = wb.Sheets[wb.SheetNames[0]]
                                if (!sheet) throw new Error('시트가 비어있습니다.')
                                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
                                if (rows.length === 0) {
                                  parsedFiles.push({ fileName: f.name, label: baseLabel, rows: [], parseError: '데이터 없음' })
                                  continue
                                }
                                const headers = Object.keys(rows[0])
                                const phoneKey = detectHeader(headers, PHONE_HINTS)
                                const nameKey = detectHeader(headers, NAME_HINTS)
                                const dateKey = detectHeader(headers, DATE_HINTS)
                                if (!phoneKey) {
                                  parsedFiles.push({ fileName: f.name, label: baseLabel, rows: [], parseError: `전화번호 컬럼을 찾을 수 없습니다 (헤더: ${headers.join(', ')})` })
                                  continue
                                }
                                const parsed = rows
                                  .map(row => ({
                                    name: nameKey ? String(row[nameKey] || '').trim() : '',
                                    phone: String(row[phoneKey] || '').trim(),
                                    appliedAt: dateKey ? String(row[dateKey] || '').trim() : ''
                                  }))
                                  .filter(r => r.phone)
                                parsedFiles.push({ fileName: f.name, label: baseLabel, rows: parsed })
                              } catch (err) {
                                parsedFiles.push({ fileName: f.name, label: baseLabel, rows: [], parseError: err.message })
                              }
                            }
                            setPayerMatchManualFiles(prev => [...prev, ...parsedFiles])
                          } finally {
                            setPayerMatchManualParsing(false)
                          }
                        }
                        const totalRows = payerMatchManualFiles.reduce((s, f) => s + f.rows.length, 0)
                        return (
                          <div>
                            <label style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                              padding: '18px',
                              background: 'rgba(99,102,241,0.06)',
                              border: '2px dashed rgba(99,102,241,0.35)',
                              borderRadius: '10px',
                              color: '#c7d2fe', fontSize: '13px',
                              cursor: payerMatchManualParsing ? 'wait' : 'pointer',
                              marginBottom: '10px'
                            }}>
                              <input
                                type="file"
                                accept=".csv,.tsv,.xlsx,.xls"
                                multiple
                                style={{ display: 'none' }}
                                disabled={payerMatchManualParsing}
                                onChange={(e) => {
                                  handleFiles(e.target.files)
                                  e.target.value = ''
                                }}
                              />
                              📁 {payerMatchManualParsing ? '파싱 중...' : '신청자 엑셀/CSV 파일 선택 (여러 개 가능)'}
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>(.csv, .tsv, .xlsx)</span>
                            </label>

                            {payerMatchManualFiles.length > 0 && (
                              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div style={{ marginBottom: '8px', fontSize: '11px', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>파일 <b style={{ color: '#fff' }}>{payerMatchManualFiles.length}개</b> · 신청자 합 <b style={{ color: '#34d399' }}>{totalRows.toLocaleString()}명</b></span>
                                  <button
                                    type="button"
                                    onClick={() => setPayerMatchManualFiles([])}
                                    style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '5px', color: '#94a3b8', fontSize: '10.5px', cursor: 'pointer' }}
                                  >전체 비우기</button>
                                </div>
                                <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {payerMatchManualFiles.map((f, idx) => (
                                    <div key={idx} style={{
                                      padding: '8px 10px',
                                      background: f.parseError ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                                      border: '1px solid ' + (f.parseError ? 'rgba(239,68,68,0.30)' : 'var(--border)'),
                                      borderRadius: '6px',
                                      fontSize: '11.5px',
                                      display: 'flex', alignItems: 'center', gap: '8px'
                                    }}>
                                      <span style={{ color: '#e2e8f0', flexShrink: 0 }}>📄</span>
                                      <input
                                        value={f.label}
                                        onChange={e => {
                                          const v = e.target.value
                                          setPayerMatchManualFiles(prev => prev.map((x, i) => i === idx ? { ...x, label: v } : x))
                                        }}
                                        placeholder="유입경로 라벨"
                                        style={{
                                          flex: 1, minWidth: 0, padding: '4px 8px',
                                          background: 'rgba(0,0,0,0.35)',
                                          border: '1px solid var(--border)',
                                          borderRadius: '4px', color: '#fff', fontSize: '11.5px'
                                        }}
                                      />
                                      {f.parseError ? (
                                        <span style={{ color: '#fca5a5', fontSize: '10.5px', flexShrink: 0 }}>⚠️ {f.parseError}</span>
                                      ) : (
                                        <span style={{ color: '#34d399', fontWeight: 600, fontSize: '10.5px', flexShrink: 0 }}>{f.rows.length.toLocaleString()}명</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setPayerMatchManualFiles(prev => prev.filter((_, i) => i !== idx))}
                                        style={{ padding: '2px 6px', background: 'transparent', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}
                                        title="제거"
                                      >✕</button>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '10.5px', color: '#64748b' }}>
                                  파일명이 라벨 기본값이지만, 클릭해서 직접 수정 가능합니다.
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {payerMatchMode === 'db' && (
                      <>
                      {/* 검색 입력 */}
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={payerMatchKeyword}
                          onChange={(e) => setPayerMatchKeyword(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key !== 'Enter') return
                            if (!payerMatchKeyword.trim()) return
                            setPayerMatchSearching(true)
                            try {
                              const token = getAuthToken() || ''
                              const res = await fetch(`/api/tools/shoong-bulk/courses?keyword=${encodeURIComponent(payerMatchKeyword.trim())}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              })
                              const data = await res.json()
                              if (!res.ok) {
                                alert(data.error || '검색 실패')
                                setPayerMatchCourses([])
                              } else {
                                setPayerMatchCourses(data.courses || [])
                                setPayerMatchSelectedCourseIds([])
                              }
                            } catch (err) {
                              alert(err.message)
                            } finally {
                              setPayerMatchSearching(false)
                            }
                          }}
                          placeholder='강의명 검색 (예: 루시, 김탄생) — Enter'
                          style={{
                            flex: 1, padding: '8px 10px',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid rgba(99,102,241,0.30)',
                            borderRadius: '6px', color: '#fff', fontSize: '12px'
                          }}
                        />
                        <button
                          type="button"
                          disabled={payerMatchSearching || !payerMatchKeyword.trim()}
                          onClick={async () => {
                            setPayerMatchSearching(true)
                            try {
                              const token = getAuthToken() || ''
                              const res = await fetch(`/api/tools/shoong-bulk/courses?keyword=${encodeURIComponent(payerMatchKeyword.trim())}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              })
                              const data = await res.json()
                              if (!res.ok) {
                                alert(data.error || '검색 실패')
                                setPayerMatchCourses([])
                              } else {
                                setPayerMatchCourses(data.courses || [])
                                setPayerMatchSelectedCourseIds([])
                              }
                            } catch (err) {
                              alert(err.message)
                            } finally {
                              setPayerMatchSearching(false)
                            }
                          }}
                          style={{
                            padding: '8px 14px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none', borderRadius: '6px',
                            color: '#fff', fontSize: '12px', fontWeight: 600,
                            cursor: (payerMatchSearching || !payerMatchKeyword.trim()) ? 'not-allowed' : 'pointer',
                            opacity: (payerMatchSearching || !payerMatchKeyword.trim()) ? 0.6 : 1
                          }}
                        >
                          {payerMatchSearching ? '검색 중...' : '🔍 검색'}
                        </button>
                      </div>

                      {/* 검색 결과 체크박스 리스트 */}
                      {payerMatchCourses.length > 0 && (() => {
                        const selectedCount = payerMatchSelectedCourseIds.length
                        const totalApplicants = payerMatchCourses
                          .filter(c => payerMatchSelectedCourseIds.includes(c.id))
                          .reduce((sum, c) => sum + (c.applicantCount || 0), 0)
                        const allSelected = payerMatchSelectedCourseIds.length === payerMatchCourses.length
                        return (
                          <div style={{ padding: '8px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => setPayerMatchSelectedCourseIds(payerMatchCourses.map(c => c.id))}
                                disabled={allSelected}
                                style={{
                                  flex: 1, padding: '6px 10px',
                                  background: allSelected ? 'rgba(139,92,246,0.10)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                  border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px',
                                  color: allSelected ? '#64748b' : '#fff',
                                  fontSize: '11px', fontWeight: 600,
                                  cursor: allSelected ? 'not-allowed' : 'pointer',
                                  opacity: allSelected ? 0.5 : 1
                                }}
                              >✅ 전체 선택 ({payerMatchCourses.length})</button>
                              <button
                                type="button"
                                onClick={() => setPayerMatchSelectedCourseIds([])}
                                disabled={selectedCount === 0}
                                style={{
                                  flex: 1, padding: '6px 10px',
                                  background: selectedCount === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                                  border: `1px solid ${selectedCount === 0 ? 'var(--border)' : 'rgba(239,68,68,0.4)'}`,
                                  borderRadius: '6px',
                                  color: selectedCount === 0 ? '#64748b' : '#fca5a5',
                                  fontSize: '11px', fontWeight: 600,
                                  cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                                  opacity: selectedCount === 0 ? 0.5 : 1
                                }}
                              >❌ 전체 해제</button>
                            </div>
                            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#cbd5e1' }}>
                              결과 <b style={{ color: '#fff' }}>{payerMatchCourses.length}개</b> · 선택 <b style={{ color: '#a78bfa' }}>{selectedCount}개</b> · 신청자 합 <b style={{ color: '#34d399' }}>{totalApplicants.toLocaleString()}명</b>
                            </div>
                            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {payerMatchCourses.map(c => {
                                const checked = payerMatchSelectedCourseIds.includes(c.id)
                                return (
                                  <label
                                    key={c.id}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '8px',
                                      padding: '6px 8px',
                                      background: checked ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                                      border: `1px solid ${checked ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                                      borderRadius: '6px', cursor: 'pointer', fontSize: '11.5px'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setPayerMatchSelectedCourseIds(prev =>
                                          prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                                        )
                                      }}
                                      style={{ width: '14px', height: '14px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                                    />
                                    <span style={{ flex: 1, color: '#e2e8f0', wordBreak: 'break-all' }}>{c.title}</span>
                                    <span style={{ color: '#34d399', fontWeight: 600, fontSize: '10.5px', whiteSpace: 'nowrap' }}>
                                      {(c.applicantCount || 0).toLocaleString()}명
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                      {payerMatchCourses.length === 0 && payerMatchKeyword && !payerMatchSearching && (
                        <div style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '11.5px', background: 'rgba(0,0,0,0.20)', borderRadius: '6px' }}>
                          검색 결과가 없습니다. (Enter 또는 🔍 검색)
                        </div>
                      )}
                      </>
                      )}
                    </div>

                    {/* 매칭 버튼 — DB 모드와 엑셀 업로드 모드를 분기 처리 */}
                    {(() => {
                      const manualTotalRows = payerMatchManualFiles.reduce((s, f) => s + f.rows.length, 0)
                      const inputReady = payerMatchMode === 'db'
                        ? payerMatchSelectedCourseIds.length > 0
                        : manualTotalRows > 0
                      const disabled = payerMatchProcessing || !payerSheetSelectedTab || !inputReady
                      return (
                        <button
                          onClick={async () => {
                            if (!payerSheetSelectedTab) {
                              alert('결제자 시트를 선택해주세요.')
                              return
                            }
                            if (payerMatchMode === 'db' && payerMatchSelectedCourseIds.length === 0) {
                              alert('신청자 데이터를 가져올 강의를 1개 이상 선택해주세요.')
                              return
                            }
                            if (payerMatchMode === 'manual' && manualTotalRows === 0) {
                              alert('엑셀/CSV 파일을 1개 이상 업로드해주세요.')
                              return
                            }
                            setPayerMatchProcessing(true)
                            setPayerMatchLog(['처리 시작...'])
                            setPayerMatchResult(null)

                            try {
                              const token = getAuthToken()
                              const body = {
                                year: payerSheetYear,
                                tabName: payerSheetSelectedTab.raw,
                              }
                              if (payerMatchMode === 'db') {
                                body.freeCourseIds = payerMatchSelectedCourseIds
                              } else {
                                // 파일별 label을 행마다 펼쳐서 전송 — 라벨이 비면 파일명으로 폴백
                                body.manualApplicants = payerMatchManualFiles.flatMap(f => {
                                  const label = (f.label || '').trim() || f.fileName.replace(/\.(csv|tsv|xlsx|xls)$/i, '')
                                  return f.rows.map(r => ({
                                    name: r.name || '',
                                    phone: r.phone,
                                    appliedAt: r.appliedAt || '',
                                    label,
                                  }))
                                })
                              }
                              const res = await fetch('/api/tools/payer-match', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': token ? `Bearer ${token}` : ''
                                },
                                body: JSON.stringify(body)
                              })
                              const data = await res.json()
                              if (data.success) {
                                setPayerMatchResult(data)
                                setPayerMatchLog(data.logs || ['처리 완료'])
                              } else {
                                setPayerMatchLog(['오류: ' + data.error])
                              }
                            } catch (err) {
                              setPayerMatchLog(['오류: ' + err.message])
                            }
                            setPayerMatchProcessing(false)
                          }}
                          disabled={disabled}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: payerMatchProcessing ? '#4c4c6d' : disabled ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none',
                            borderRadius: '10px',
                            color: disabled ? '#64748b' : '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: payerMatchProcessing ? 'wait' : disabled ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {payerMatchProcessing ? '매칭 처리 중...' : '🔄 매칭 시작'}
                        </button>
                      )
                    })()}

                    {/* 로그 */}
                    {payerMatchLog.length > 0 && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px',
                        maxHeight: '120px',
                        overflow: 'auto',
                        fontFamily: 'monospace',
                        fontSize: '11px'
                      }}>
                        {payerMatchLog.map((log, i) => (
                          <div key={i} style={{ color: log.startsWith('오류') ? '#f87171' : '#94a3b8', marginBottom: '3px' }}>{log}</div>
                        ))}
                      </div>
                    )}

                    {/* 매칭 결과 */}
                    {payerMatchResult && payerMatchResult.success && (
                      <div style={{ marginTop: '12px', padding: '14px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ color: '#10b981', fontWeight: '600', fontSize: '14px' }}>✓ 매칭 완료</span>
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            매칭: {payerMatchResult.matched}명 / 미매칭: {payerMatchResult.unmatched}명 / 전체: {payerMatchResult.total}명
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = payerMatchResult.downloadUrl
                              link.download = `매칭결과_${payerSheetSelectedTab?.instructor}_${payerSheetSelectedTab?.cohort}.xlsx`
                              link.click()
                            }}
                            style={{
                              padding: '8px 16px',
                              background: 'rgba(16,185,129,0.2)',
                              border: '1px solid rgba(16,185,129,0.4)',
                              borderRadius: '8px',
                              color: '#10b981',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >📥 결과 다운로드</button>
                          <button
                            onClick={() => {
                              setPayerMatchResult(null)
                              setPayerMatchLog([])
                              setPayerMatchKeyword('')
                              setPayerMatchCourses([])
                              setPayerMatchSelectedCourseIds([])
                              setPayerMatchManualFiles([])
                            }}
                            style={{
                              padding: '8px 16px',
                              background: 'rgba(99,102,241,0.2)',
                              border: '1px solid rgba(99,102,241,0.4)',
                              borderRadius: '8px',
                              color: '#a5b4fc',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >🔄 초기화</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 매칭 결과 미리보기 테이블 */}
                  {payerMatchResult && payerMatchResult.success && payerMatchResult.matchedData && (
                    <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.2)' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#e2e8f0' }}>
                        매칭 결과 미리보기
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>매칭 {payerMatchResult.matchedData.length}건 + 직접구매 {payerMatchResult.unmatchedData.length}건</span>
                      </div>
                      <div style={{ maxHeight: '400px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#1e293b', position: 'sticky', top: 0, zIndex: 1 }}>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>#</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>구매자</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>전화번호</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>결제금액</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>유입경로</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>결제수단</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...payerMatchResult.matchedData, ...payerMatchResult.unmatchedData].slice(0, 50).map((row, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{i + 1}</td>
                                <td style={{ padding: '6px 10px', color: '#e2e8f0' }}>{row.구매자 || '-'}</td>
                                <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{row.전화번호 || '-'}</td>
                                <td style={{ padding: '6px 10px', color: '#10b981', textAlign: 'right' }}>{row.결제금액 || '-'}</td>
                                <td style={{ padding: '6px 10px', color: row.유입경로 === '(직접구매)' ? '#f59e0b' : '#818cf8' }}>{row.유입경로 || '-'}</td>
                                <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{row.결제수단 || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 🗃️ 생성된 기획안 탭 — 봇 결과 자동 저장 후 다시 열람/내보내기/삭제.
              계정별 분리 (owner_username 토큰으로). 본인 것만 보이고 본인 것만 삭제. */}
          {currentTab === 'saved-plans' && (() => {
            const PLANNER_META_LOCAL = PLANNER_TASK_META

            const openDetail = async (id) => {
              setSavedPlanDetail(null)
              setSavedPlanDetailLoading(true)
              try {
                const res = await fetch(`/api/tools/project-planner/saved-plans?id=${id}`, {
                  headers: { ...getAuthHeaders() },
                })
                const data = await res.json()
                if (res.ok && data?.plan) {
                  setSavedPlanDetail(data.plan)
                } else {
                  alert(data?.error || `상세 불러오기 실패 (HTTP ${res.status})`)
                }
              } catch (e) {
                alert('네트워크 오류: ' + e.message)
              } finally {
                setSavedPlanDetailLoading(false)
              }
            }

            const deleteOne = async (id) => {
              if (!confirm('이 기획안을 삭제할까요? 복구 불가.')) return
              setSavedPlanDeleting(id)
              try {
                const res = await fetch(`/api/tools/project-planner/saved-plans?id=${id}`, {
                  method: 'DELETE',
                  headers: { ...getAuthHeaders() },
                })
                const data = await res.json()
                if (res.ok && data?.success) {
                  setSavedPlans(prev => prev.filter(p => p.id !== id))
                  if (savedPlanDetail?.id === id) setSavedPlanDetail(null)
                } else {
                  alert(data?.error || `삭제 실패 (HTTP ${res.status})`)
                }
              } catch (e) {
                alert('네트워크 오류: ' + e.message)
              } finally {
                setSavedPlanDeleting(null)
              }
            }

            // 강사 목록 추출 (필터 옵션용 — 본인이 저장한 강사들만)
            const instructorOptions = Array.from(new Set(savedPlans.map(p => p.instructor_name))).filter(Boolean).sort()

            return (
              <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-grad)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
                      <FolderOpen size={18} color="#fff" strokeWidth={2.2} />
                    </span>
                    생성된 기획안
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.55 }}>
                    프로젝트 기획에서 생성된 결과가 자동 저장됩니다. <b style={{ color: '#cbd5e1' }}>본인 계정 ({loginId})</b>이 만든 것만 표시.
                  </p>
                </div>

                {/* 필터 */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>필터:</span>
                  <select value={savedPlansFilter.taskKey}
                    onChange={(e) => setSavedPlansFilter(prev => ({ ...prev, taskKey: e.target.value }))}
                    style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '12px' }}>
                    <option value="">전체 봇</option>
                    {Object.entries(PLANNER_META_LOCAL).map(([k, m]) => (
                      <option key={k} value={k}>{m.icon} {m.label}</option>
                    ))}
                  </select>
                  <select value={savedPlansFilter.instructorName}
                    onChange={(e) => setSavedPlansFilter(prev => ({ ...prev, instructorName: e.target.value }))}
                    style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '12px' }}>
                    <option value="">전체 강사</option>
                    {instructorOptions.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {savedPlansLoading && <span style={{ fontSize: '11px', color: '#94a3b8' }}>불러오는 중…</span>}
                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>{savedPlans.length}건</span>
                </div>

                {/* 좌측 목록 + 우측 상세 */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: '14px' }}>
                  {/* 좌측: 목록 */}
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px', border: '1px solid var(--border)', maxHeight: '70vh', overflowY: 'auto' }}>
                    {savedPlans.length === 0 && !savedPlansLoading && (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
                        저장된 기획안이 없습니다. <br/>
                        프로젝트 기획 탭에서 봇을 실행하면 자동 저장됩니다.
                      </div>
                    )}
                    {savedPlans.map(p => {
                      const meta = PLANNER_META_LOCAL[p.task_key]
                      const isOpen = savedPlanDetail?.id === p.id
                      return (
                        <div key={p.id} onClick={() => openDetail(p.id)}
                          style={{
                            padding: '12px 14px',
                            marginBottom: '6px',
                            background: isOpen ? 'var(--accent-grad-soft)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (isOpen ? 'rgba(129,140,248,0.45)' : 'var(--border)'),
                            borderRadius: '10px',
                            cursor: 'pointer',
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                            <span style={{ fontSize: '13px' }}>{meta?.icon || '🪄'}</span>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{meta?.label || p.task_key}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: '#94a3b8' }}>
                              {formatKST(p.created_at)}
                            </span>
                          </div>
                          <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginBottom: '2px' }}>
                            <b style={{ color: '#a5b4fc' }}>{p.instructor_name}</b>
                            {p.session_name ? <span style={{ marginLeft: '4px', color: '#94a3b8' }}>· {p.session_name}</span> : null}
                          </div>
                          {p.topic && (
                            <div style={{ fontSize: '11.5px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              주제: {p.topic}
                            </div>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); deleteOne(p.id) }} disabled={savedPlanDeleting === p.id}
                            style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', color: '#f87171', fontSize: '10.5px', cursor: savedPlanDeleting === p.id ? 'wait' : 'pointer' }}>
                            {savedPlanDeleting === p.id ? '삭제 중…' : '🗑️ 삭제'}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* 우측: 상세 */}
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', minHeight: '300px' }}>
                    {savedPlanDetailLoading && (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>상세 불러오는 중…</div>
                    )}
                    {!savedPlanDetailLoading && !savedPlanDetail && (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        왼쪽에서 항목을 선택하면 상세 내용이 표시됩니다.
                      </div>
                    )}
                    {savedPlanDetail && (() => {
                      const plan = savedPlanDetail.plan || {}
                      const taskKey = savedPlanDetail.task_key
                      const isPpt = taskKey === 'ppt'
                      const safeTitle = makeSafeFileName(
                        plan.title || `${savedPlanDetail.instructor_name}_${PLANNER_META_LOCAL[taskKey]?.label || taskKey}`,
                        'plan'
                      )
                      const markdown = isPpt ? pptPlanToMarkdown(plan) : genericPlanToMarkdown(taskKey, plan)
                      const exportBusy = pp_exportBusy[`saved:${savedPlanDetail.id}`] || null

                      // 1) 마크다운 복사
                      const copyMd = async () => {
                        try {
                          await navigator.clipboard.writeText(markdown)
                          alert('마크다운으로 복사 완료.')
                        } catch (e) { alert('복사 실패. 수동으로 선택해주세요.') }
                      }
                      // 2) .md 다운로드
                      const downloadMd = () => {
                        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `${safeTitle}.md`
                        document.body.appendChild(a); a.click(); document.body.removeChild(a)
                        setTimeout(() => URL.revokeObjectURL(url), 1000)
                      }
                      // 3) .pptx 다운로드 — PPT만. 디자인 톤 적용된 파일 생성.
                      //    저장된 결과의 톤은 메타에 없어서(현재 미저장) localStorage의 현재 사용자 톤 사용.
                      //    원래 생성 시 톤과 다를 수 있지만 어차피 같은 사용자라 비슷할 것.
                      const downloadPptxSaved = async () => {
                        if (!isPpt) return
                        setPpExportBusy(prev => ({ ...prev, [`saved:${savedPlanDetail.id}`]: 'pptx' }))
                        try {
                          const parsed = parseToneMd(pp_designToneMd || DEFAULT_DESIGN_TONE_MD)
                          await buildDesignedPptx(plan, parsed, safeTitle)
                        } catch (e) {
                          alert('.pptx 생성 실패: ' + (e?.message || e))
                        } finally {
                          setPpExportBusy(prev => ({ ...prev, [`saved:${savedPlanDetail.id}`]: null }))
                        }
                      }
                      // 4) 노션 페이지 만들기
                      const createNotionSaved = async () => {
                        setPpExportBusy(prev => ({ ...prev, [`saved:${savedPlanDetail.id}`]: 'notion' }))
                        try {
                          const pageTitle = `[${savedPlanDetail.instructor_name}${savedPlanDetail.session_name ? ' ' + savedPlanDetail.session_name : ''}] ${PLANNER_META_LOCAL[taskKey]?.label || taskKey}`
                          const res = await fetch('/api/integrations/notion/create-plan-page', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify({ title: pageTitle, markdown }),
                          })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`)
                          setPpPlanNotionResult(prev => ({ ...prev, [`saved:${savedPlanDetail.id}`]: { url: data.url, title: pageTitle } }))
                        } catch (e) {
                          alert('노션 페이지 생성 실패: ' + (e?.message || e))
                        } finally {
                          setPpExportBusy(prev => ({ ...prev, [`saved:${savedPlanDetail.id}`]: null }))
                        }
                      }
                      const notionRes = pp_planNotionResult[`saved:${savedPlanDetail.id}`]

                      // PPT plan의 종류별 카운트 (분포 표시)
                      let distroEntries = []
                      if (isPpt && Array.isArray(plan.slides)) {
                        const counts = {}
                        for (const s of plan.slides) { const k = s.kind || 'info'; counts[k] = (counts[k] || 0) + 1 }
                        distroEntries = Object.entries(counts).filter(([k]) => PPT_KIND_META[k])
                      }

                      return (
                        <div>
                          {/* 헤더 */}
                          <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <span style={{ fontSize: '20px' }}>{PLANNER_META_LOCAL[taskKey]?.icon || '🪄'}</span>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                                {PLANNER_META_LOCAL[taskKey]?.label || taskKey}
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                                {formatKST(savedPlanDetail.created_at, 'full')}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                              <b style={{ color: '#a5b4fc' }}>{savedPlanDetail.instructor_name}</b>
                              {savedPlanDetail.session_name && <span style={{ color: '#94a3b8' }}> · {savedPlanDetail.session_name}</span>}
                            </div>
                            {savedPlanDetail.topic && (
                              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>주제: {savedPlanDetail.topic}</div>
                            )}
                          </div>

                          {/* 내보내기 버튼 4종 */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', padding: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', alignSelf: 'center', marginRight: '4px' }}>📤 내보내기:</div>
                            <button onClick={copyMd}
                              style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '7px', color: '#e2e8f0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                              📋 마크다운 복사
                            </button>
                            <button onClick={downloadMd}
                              style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '7px', color: '#e2e8f0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                              📄 .md 다운로드
                            </button>
                            {isPpt && (
                              <button onClick={downloadPptxSaved} disabled={exportBusy === 'pptx'}
                                style={{
                                  padding: '7px 12px',
                                  background: exportBusy === 'pptx' ? 'rgba(99,102,241,0.20)' : 'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(168,85,247,0.30))',
                                  border: '1px solid rgba(99,102,241,0.45)', borderRadius: '7px',
                                  color: '#fff', fontSize: '12px', fontWeight: 700,
                                  cursor: exportBusy === 'pptx' ? 'wait' : 'pointer',
                                }}>
                                {exportBusy === 'pptx' ? '⏳ .pptx 생성 중…' : '🎨 디자인 적용 .pptx'}
                              </button>
                            )}
                            <button onClick={createNotionSaved} disabled={exportBusy === 'notion'}
                              style={{
                                padding: '7px 12px',
                                background: exportBusy === 'notion' ? 'rgba(16,185,129,0.20)' : 'linear-gradient(135deg, #10b981, #14b8a6)',
                                border: 'none', borderRadius: '7px',
                                color: '#fff', fontSize: '12px', fontWeight: 700,
                                cursor: exportBusy === 'notion' ? 'wait' : 'pointer',
                              }}>
                              {exportBusy === 'notion' ? `⏳ 노션 push 중… ${isPpt ? '(1~3분)' : ''}` : '📋 노션에 페이지 만들기'}
                            </button>
                            {notionRes?.url && (
                              <a href={notionRes.url} target="_blank" rel="noopener noreferrer"
                                style={{ alignSelf: 'center', fontSize: '11px', color: '#86efac', textDecoration: 'underline', marginLeft: '4px' }}>
                                ✅ 노션 페이지 열기 →
                              </a>
                            )}
                          </div>

                          {/* 본문 — PPT는 슬라이드 카드, 그 외는 마크다운 미리보기 + JSON 펼침 */}
                          {isPpt ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
                              {/* 강의 제목 + 분포 */}
                              <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px' }}>
                                <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 700, marginBottom: '4px' }}>강의 제목 · 총 {plan.totalSlides || (plan.slides?.length ?? 0)}장</div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: distroEntries.length ? '8px' : 0 }}>{plan.title}</div>
                                {distroEntries.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {distroEntries.map(([k, n]) => (
                                      <span key={k} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: PPT_KIND_META[k].bg, color: PPT_KIND_META[k].color, fontWeight: 600 }}>
                                        {PPT_KIND_META[k].label} {n}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* 슬라이드 카드 */}
                              {Array.isArray(plan.slides) && plan.slides.map((s, i) => {
                                const kindMeta = PPT_KIND_META[s.kind] || null
                                return (
                                  <div key={i} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '9px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <div style={{ fontSize: '10.5px', color: '#a5b4fc', fontWeight: 700 }}>슬라이드 {s.slideNumber || i + 1}</div>
                                      {kindMeta && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: kindMeta.bg, color: kindMeta.color, fontWeight: 600 }}>
                                          {kindMeta.label}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff', marginTop: '4px', marginBottom: '4px' }}>{s.title}</div>
                                    {Array.isArray(s.bullets) && s.bullets.length > 0 && (
                                      <ul style={{ margin: '4px 0 6px 18px', padding: 0, fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                                        {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                                      </ul>
                                    )}
                                    {s.speakerNotes && (
                                      <div style={{ marginTop: '4px', padding: '7px 9px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', borderLeft: '2px solid rgba(99,102,241,0.5)' }}>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>🎤 발표 멘트</div>
                                        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{s.speakerNotes}</div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            // PPT 외 봇: 마크다운 미리보기 우선 + JSON 펼침 details
                            <>
                              <div style={{ padding: '12px', background: 'rgba(0,0,0,0.30)', border: '1px solid var(--border)', borderRadius: '8px', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.7, maxHeight: '55vh', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {markdown}
                              </div>
                              <details style={{ marginTop: '10px' }}>
                                <summary style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>📦 원본 JSON</summary>
                                <pre style={{ marginTop: '6px', padding: '10px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#94a3b8', fontSize: '11.5px', lineHeight: 1.55, maxHeight: '40vh', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {JSON.stringify(plan, null, 2)}
                                </pre>
                              </details>
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 🐞 에러 로그 탭 — localhost(DEV) 또는 jinwoo만.
              사용자에겐 친절한 메시지로 숨기고 원문/스택/컨텍스트를 여기서 조회. */}
          {currentTab === 'error-logs' && (isDevEnv || loginId === 'jinwoo') && (
            <ErrorLogsTab isMobile={isMobile} isDevEnv={isDevEnv} loginId={loginId} />
          )}

          {/* 🛠️ 기획 봇 설정 탭 (jinwoo 전용)
              ※ 여기서는 모든 봇을 enabled=true로 풀어 지침/레퍼런스 사전 작성 가능.
                실제 실행 가능 여부는 lib/planners/index.js의 PLANNER_META를 따르고,
                project-planner 탭의 PLANNER_META에서 체크박스 활성화 여부가 결정됨. */}
          {currentTab === 'planner-config' && loginId === 'jinwoo' && (() => {
            const PLANNER_META = {
              summarize:         { label: '강사 자료 정리봇',         icon: '🗂️', enabled: true },
              ebook:             { label: '무료 전자책 기획안',     icon: '📚', enabled: true },
              boomUp:            { label: '붐업 멘트 (스타일별)',    icon: '🎉', enabled: true },
              alimtalk:          { label: '채널톡 멘트',              icon: '💬', enabled: true },
              viralQ:            { label: '바이럴 질문',            icon: '❓', enabled: true },
              ppt:               { label: '강의 PPT outline',       icon: '📋', enabled: true },
              salesPage:         { label: '무료 상페 카피',          icon: '📄', enabled: true },
              groupAnnouncement: { label: '단톡방 입장시 필독 공지',  icon: '📢', enabled: true },
            }

            const pickFeature = (key) => {
              setPcSelectedFeature(key)
              setPcAddingRef(false)
              setPcEditingRefId(null)
              const cur = pc_prompts.find(p => p.feature_key === key)
              setPcInstructionsDraft(cur?.instructions || '')
              setPcMessage('')
            }

            const refsForFeature = pc_refs.filter(r => r.feature_key === pc_selectedFeature)
            const promptForFeature = pc_prompts.find(p => p.feature_key === pc_selectedFeature)

            const saveInstructions = async () => {
              setPcSavingInstructions(true)
              setPcMessage('')
              try {
                const res = await fetch('/api/admin/planner-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ action: 'save-instructions', featureKey: pc_selectedFeature, instructions: pc_instructionsDraft }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcPrompts(prev => {
                  const others = prev.filter(p => p.feature_key !== pc_selectedFeature)
                  return [...others, data.prompt]
                })
                setPcMessage('✅ 지침 저장됨')
              } catch (e) {
                setPcMessage('❌ 저장 실패: ' + e.message)
              } finally {
                setPcSavingInstructions(false)
              }
            }

            // PPTX는 ZIP+XML 구조 → 브라우저에서 JSZip으로 풀어서 텍스트만 추출.
            // 서버 업로드 X (200~800MB 파일도 OK). 모든 텍스트박스/도형/SmartArt의 <a:t> 노드를
            // 슬라이드 순서대로 추출. 발표자 노트도 포함. 개요 보기에 안 잡히는 디자인 텍스트박스도
            // 다 잡힘.
            //
            // 한도: PER_FILE_CHAR_LIMIT(8만자)에서 절단 — 슬라이드 200~300장이면 보통 5~10만자 수준.
            const extractPptxClientSide = async (file) => {
              const PER_FILE_CHAR_LIMIT = 80000
              const { default: JSZip } = await import('jszip')

              setPcMessage(`⏳ "${file.name}" 압축 해제 중… (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
              const zip = await JSZip.loadAsync(file)

              // 슬라이드 / 발표자 노트 파일 목록 수집
              const slideEntries = []   // { idx, entry }
              const noteEntries = {}    // idx -> entry
              zip.forEach((path, entry) => {
                let m
                if ((m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/))) {
                  slideEntries.push({ idx: Number(m[1]), entry })
                } else if ((m = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/))) {
                  noteEntries[Number(m[1])] = entry
                }
              })
              if (slideEntries.length === 0) {
                throw new Error('PPTX 안에 슬라이드(ppt/slides/slideN.xml)를 찾을 수 없습니다. 손상된 파일이거나 .pptx 형식이 아닙니다.')
              }
              slideEntries.sort((a, b) => a.idx - b.idx)

              const parser = new DOMParser()
              const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

              // XML 한 덩어리에서 단락별 텍스트 추출. <a:p> 단위로 묶어서 텍스트박스 단락 구조 보존.
              const extractTextFromXml = (xmlString) => {
                const doc = parser.parseFromString(xmlString, 'application/xml')
                const paragraphs = doc.getElementsByTagNameNS(DRAWING_NS, 'p')
                const lines = []
                for (let i = 0; i < paragraphs.length; i++) {
                  const tNodes = paragraphs[i].getElementsByTagNameNS(DRAWING_NS, 't')
                  let line = ''
                  for (let j = 0; j < tNodes.length; j++) {
                    line += tNodes[j].textContent || ''
                  }
                  line = line.trim()
                  if (line) lines.push(line)
                }
                return lines
              }

              const outLines = []
              let total = slideEntries.length
              for (let i = 0; i < slideEntries.length; i++) {
                const { idx, entry } = slideEntries[i]
                // 10장마다 진행 상황 업데이트 (300장 추출 시 30회 정도)
                if (i % 10 === 0) {
                  setPcMessage(`⏳ 슬라이드 추출 중… ${i + 1}/${total}`)
                  // 메인 스레드 양보 (UI 멈춤 방지)
                  await new Promise(r => setTimeout(r, 0))
                }
                const xml = await entry.async('string')
                const lines = extractTextFromXml(xml)

                let noteText = ''
                if (noteEntries[idx]) {
                  const noteXml = await noteEntries[idx].async('string')
                  noteText = extractTextFromXml(noteXml).join(' ').trim()
                }

                if (lines.length === 0 && !noteText) continue  // 빈 슬라이드 스킵
                outLines.push(`## 슬라이드 ${idx}`)
                if (lines.length) outLines.push(lines.join('\n'))
                if (noteText) outLines.push(`[발표자 노트] ${noteText}`)
                outLines.push('')
              }

              let text = outLines.join('\n').trim()
              const originalLen = text.length
              let truncated = false
              if (text.length > PER_FILE_CHAR_LIMIT) {
                text = text.slice(0, PER_FILE_CHAR_LIMIT)
                truncated = true
              }
              return { text, charCount: text.length, originalLen, truncated, slideCount: slideEntries.length }
            }

            // 파일(PDF/이미지/텍스트/PPTX)을 텍스트로 추출 → 새 레퍼런스 폼 자동 채움.
            // - PPTX: 브라우저에서 직접 처리(서버 업로드 X). 큰 파일 OK.
            // - 나머지: 서버 라우트(Gemini OCR/PDF)로 위임.
            // 제목은 이미 입력되어 있으면 보존, 비어있으면 파일명에서 확장자 떼고 채움.
            const extractFromFile = async (file) => {
              if (!file) return
              setPcExtracting(true)
              setPcMessage('')
              try {
                const lowerName = (file.name || '').toLowerCase()
                const isPptx = lowerName.endsWith('.pptx') ||
                               file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                const isLegacyPpt = lowerName.endsWith('.ppt') && !isPptx
                if (isLegacyPpt) {
                  throw new Error('구버전 .ppt는 미지원. PowerPoint에서 "다른 이름으로 저장 → .pptx"로 변환해주세요.')
                }

                if (isPptx) {
                  // 클라이언트 측 추출 — 200~800MB도 OK
                  const result = await extractPptxClientSide(file)
                  setPcNewRef(prev => ({
                    title: prev.title || (file.name || '').replace(/\.[^.]+$/, ''),
                    content: result.text || '',
                  }))
                  setPcMessage(`✅ "${file.name}" 슬라이드 ${result.slideCount}장에서 ${result.charCount.toLocaleString()}자 추출${result.truncated ? ` (원본 ${result.originalLen.toLocaleString()}자에서 8만자로 절단)` : ''}. 검토 후 추가 버튼을 눌러주세요.`)
                  return
                }

                // PDF / 이미지 / 텍스트 → 서버(Gemini) 경로
                const fd = new FormData()
                fd.append('file', file)
                // ⚠️ FormData 사용 시 Content-Type을 명시하면 boundary 자동 설정이 깨짐 →
                // getAuthHeaders() 대신 Authorization 만 직접 세팅
                const token = getAuthToken()
                const res = await fetch('/api/admin/planner-config/extract-file', {
                  method: 'POST',
                  headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                  body: fd,
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcNewRef(prev => ({
                  title: prev.title || (file.name || '').replace(/\.[^.]+$/, ''),
                  content: data.text || '',
                }))
                setPcMessage(`✅ "${file.name}"에서 ${data.charCount?.toLocaleString() || 0}자 추출${data.truncated ? ' (8만자에서 절단)' : ''}. 검토 후 추가 버튼을 눌러주세요.`)
              } catch (e) {
                setPcMessage('❌ 파일 추출 실패: ' + e.message)
              } finally {
                setPcExtracting(false)
              }
            }

            const addReference = async () => {
              if (!pc_newRef.content.trim()) {
                setPcMessage('❌ 본문은 필수')
                return
              }
              setPcSavingInstructions(true)
              setPcMessage('')
              try {
                const res = await fetch('/api/admin/planner-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({
                    action: 'add-reference',
                    featureKey: pc_selectedFeature,
                    title: pc_newRef.title.trim(),
                    content: pc_newRef.content.trim(),
                  }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcRefs(prev => [...prev, data.reference])
                setPcNewRef({ title: '', content: '' })
                setPcAddingRef(false)
                setPcMessage('✅ 레퍼런스 추가됨')
              } catch (e) {
                setPcMessage('❌ 추가 실패: ' + e.message)
              } finally {
                setPcSavingInstructions(false)
              }
            }

            const startEditRef = (ref) => {
              setPcEditingRefId(ref.id)
              setPcEditRefDraft({ title: ref.title, content: ref.content })
              setPcAddingRef(false)
            }

            const saveEditRef = async () => {
              if (!pc_editRefDraft.title.trim() || !pc_editRefDraft.content.trim()) {
                setPcMessage('❌ 제목과 본문 모두 필수')
                return
              }
              setPcBusyRefId(pc_editingRefId)
              try {
                const res = await fetch('/api/admin/planner-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({
                    action: 'update-reference',
                    id: pc_editingRefId,
                    title: pc_editRefDraft.title.trim(),
                    content: pc_editRefDraft.content.trim(),
                  }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcRefs(prev => prev.map(r => r.id === pc_editingRefId ? data.reference : r))
                setPcEditingRefId(null)
                setPcMessage('✅ 레퍼런스 수정됨')
              } catch (e) {
                setPcMessage('❌ 수정 실패: ' + e.message)
              } finally {
                setPcBusyRefId(null)
              }
            }

            const toggleRefEnabled = async (ref) => {
              setPcBusyRefId(ref.id)
              try {
                const res = await fetch('/api/admin/planner-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ action: 'update-reference', id: ref.id, enabled: !ref.enabled }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcRefs(prev => prev.map(r => r.id === ref.id ? data.reference : r))
              } catch (e) {
                setPcMessage('❌ 토글 실패: ' + e.message)
              } finally {
                setPcBusyRefId(null)
              }
            }

            const deleteRef = async (ref) => {
              if (!confirm(`"${ref.title}" 레퍼런스를 삭제할까요?`)) return
              setPcBusyRefId(ref.id)
              try {
                const res = await fetch('/api/admin/planner-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ action: 'delete-reference', id: ref.id }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setPcRefs(prev => prev.filter(r => r.id !== ref.id))
                setPcMessage('✅ 삭제됨')
              } catch (e) {
                setPcMessage('❌ 삭제 실패: ' + e.message)
              } finally {
                setPcBusyRefId(null)
              }
            }

            return (
              <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-grad)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
                      <Library size={18} color="#fff" strokeWidth={2.2} />
                    </span>
                    기획 봇 설정
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.55 }}>
                    봇별로 작성 지침과 참고할 레퍼런스 자료를 관리합니다. 저장 즉시 다음 기획 생성부터 반영됩니다.
                  </p>
                </div>

                {pc_loading && (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>불러오는 중…</div>
                )}

                {!pc_loading && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: '16px' }}>
                    {/* 좌: 봇 목록 */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '8px', border: '1px solid var(--border)', height: 'fit-content' }}>
                      <div style={{ padding: '6px 10px', fontSize: '10px', color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>봇 목록</div>
                      {Object.entries(PLANNER_META).map(([key, meta]) => {
                        const isActive = pc_selectedFeature === key
                        const refCount = pc_refs.filter(r => r.feature_key === key).length
                        const hasInstructions = !!pc_prompts.find(p => p.feature_key === key)?.instructions
                        return (
                          <button key={key} type="button" onClick={() => pickFeature(key)}
                            disabled={!meta.enabled && !isActive && !hasInstructions && refCount === 0}
                            style={{
                              width: '100%',
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '10px 12px', marginBottom: '2px',
                              background: isActive ? 'var(--accent-grad-soft)' : 'transparent',
                              border: '1px solid ' + (isActive ? 'rgba(129,140,248,0.35)' : 'transparent'),
                              borderRadius: '8px',
                              color: isActive ? '#fff' : '#cbd5e1',
                              fontSize: '13px',
                              fontWeight: isActive ? 600 : 500,
                              cursor: 'pointer',
                              textAlign: 'left',
                              opacity: meta.enabled ? 1 : 0.6,
                            }}>
                            <span>{meta.icon}</span>
                            <span style={{ flex: 1 }}>{meta.label}</span>
                            {!meta.enabled && (
                              <span style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(255,255,255,0.06)', color: '#64748b', borderRadius: '999px' }}>준비중</span>
                            )}
                            {refCount > 0 && (
                              <span style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', borderRadius: '999px', fontWeight: 700 }}>{refCount}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* 우: 선택된 봇의 지침 + 레퍼런스 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {pc_message && (
                        <div style={{
                          padding: '10px 14px',
                          background: pc_message.startsWith('✅') ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                          border: `1px solid ${pc_message.startsWith('✅') ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
                          borderRadius: '8px',
                          color: pc_message.startsWith('✅') ? '#34d399' : '#fca5a5',
                          fontSize: '13px',
                        }}>{pc_message}</div>
                      )}

                      {/* 지침 */}
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              📝 지침 (instructions)
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>· {PLANNER_META[pc_selectedFeature]?.label}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              톤·구조·금지표현 등 작성 규칙. 비워두면 코드의 기본값 사용.
                            </div>
                          </div>
                          {promptForFeature?.updated_at && (
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              마지막 수정: {formatKST(promptForFeature.updated_at, 'full')}
                              {promptForFeature.updated_by ? ` · ${promptForFeature.updated_by}` : ''}
                            </div>
                          )}
                        </div>
                        <textarea value={pc_instructionsDraft} onChange={(e) => setPcInstructionsDraft(e.target.value)} rows={12}
                          placeholder="예: - 톤: 강사가 직접 1인칭으로 말하는 느낌&#10;- 도입: 도발적/역설적 한 줄&#10;- 본문: 4섹션, 각 200~400자&#10;- 금지: '꼭 보세요!', '지금 바로!' 같은 표현"
                          style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', minHeight: '180px' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                          <button onClick={saveInstructions} disabled={pc_savingInstructions}
                            style={{ padding: '9px 18px', background: 'var(--accent-grad)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: pc_savingInstructions ? 'wait' : 'pointer' }}>
                            {pc_savingInstructions ? '저장 중…' : '💾 지침 저장'}
                          </button>
                        </div>
                      </div>

                      {/* 레퍼런스 */}
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              📚 레퍼런스 자료
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>· {refsForFeature.length}개</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              모범 사례를 본문째 추가합니다. AI가 톤·구조를 모방합니다.
                            </div>
                          </div>
                          {!pc_addingRef && (
                            <button onClick={() => { setPcAddingRef(true); setPcEditingRefId(null); setPcNewRef({ title: '', content: '' }) }}
                              style={{ padding: '8px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                              ➕ 새 레퍼런스
                            </button>
                          )}
                        </div>

                        {pc_addingRef && (
                          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                            {/* 파일 업로드: PDF/이미지/텍스트 → Gemini로 추출 후 본문 자동 채움 */}
                            <label
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                              onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation()
                                const f = e.dataTransfer?.files?.[0]
                                if (f && !pc_extracting) extractFromFile(f)
                              }}
                              style={{
                                display: 'block',
                                padding: '14px',
                                marginBottom: '10px',
                                background: 'rgba(0,0,0,0.20)',
                                border: '1.5px dashed ' + (pc_extracting ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.18)'),
                                borderRadius: '8px',
                                color: '#cbd5e1',
                                fontSize: '12px',
                                textAlign: 'center',
                                cursor: pc_extracting ? 'wait' : 'pointer',
                                lineHeight: 1.5,
                              }}>
                              <input type="file"
                                accept=".pdf,.txt,.md,.json,.xml,.pptx,image/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                disabled={pc_extracting}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) extractFromFile(f)
                                  e.target.value = ''  // 같은 파일 재선택 가능하게
                                }}
                                style={{ display: 'none' }} />
                              {pc_extracting ? (
                                <span>{pc_message && pc_message.startsWith('⏳') ? pc_message : '⏳ 텍스트 추출 중…'}</span>
                              ) : (
                                <span>
                                  📎 <b>파일 업로드</b> (PDF · 이미지 · 텍스트 · PPTX) — 클릭하거나 여기로 드래그<br/>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                                    PDF/이미지는 Gemini OCR, <b>PPTX는 브라우저에서 직접 처리</b>(파일 크기 무관·외부 업로드 없음).<br/>
                                    슬라이드 200~300장도 OK. 모든 텍스트박스·도형·SmartArt 추출 + 발표자 노트.
                                  </span>
                                </span>
                              )}
                            </label>

                            <input type="text" value={pc_newRef.title} onChange={(e) => setPcNewRef(s => ({ ...s, title: e.target.value }))}
                              placeholder="레퍼런스 제목 (선택 — 비우면 본문 첫 줄로 자동 생성)"
                              style={{
                                width: '100%', padding: '9px 11px',
                                background: 'rgba(0,0,0,0.40)',
                                border: '1px solid var(--border)',
                                borderRadius: '7px', color: '#fff', fontSize: '13px', marginBottom: '8px', boxSizing: 'border-box'
                              }} />
                            <textarea value={pc_newRef.content} onChange={(e) => setPcNewRef(s => ({ ...s, content: e.target.value }))} rows={10}
                              placeholder={'본문 직접 붙여넣기 — 또는 노션 URL 한 줄만 적어도 자동으로 본문 펼쳐집니다.\n예) https://www.notion.so/...\n(노션 양식 수정하면 5분 후부터 다음 호출에 자동 반영)'}
                              style={{
                                width: '100%', padding: '11px',
                                background: 'rgba(0,0,0,0.40)',
                                border: '1px solid ' + (pc_message.startsWith('❌') && !pc_newRef.content.trim() ? '#ef4444' : 'var(--border)'),
                                borderRadius: '7px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical', minHeight: '160px'
                              }} />
                            {pc_message && (
                              <div style={{
                                marginTop: '10px',
                                padding: '8px 12px',
                                background: pc_message.startsWith('✅') ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                                border: '1px solid ' + (pc_message.startsWith('✅') ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'),
                                borderRadius: '7px',
                                color: pc_message.startsWith('✅') ? '#34d399' : '#fca5a5',
                                fontSize: '12px',
                              }}>{pc_message}</div>
                            )}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                              <button onClick={() => { setPcAddingRef(false); setPcNewRef({ title: '', content: '' }) }}
                                style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>취소</button>
                              <button onClick={addReference} disabled={pc_savingInstructions || pc_extracting}
                                style={{ padding: '8px 16px', background: 'var(--accent-grad)', border: 'none', borderRadius: '7px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: (pc_savingInstructions || pc_extracting) ? 'wait' : 'pointer' }}>
                                {pc_savingInstructions ? '추가 중…' : '추가'}
                              </button>
                            </div>
                          </div>
                        )}

                        {refsForFeature.length === 0 && !pc_addingRef && (
                          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12.5px', border: '2px dashed rgba(255,255,255,0.10)', borderRadius: '10px' }}>
                            등록된 레퍼런스가 없습니다. <b>새 레퍼런스</b> 버튼으로 추가하세요. 비어있으면 코드의 기본 샘플이 사용됩니다.
                          </div>
                        )}

                        {refsForFeature.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {refsForFeature.map(ref => {
                              const isEditing = pc_editingRefId === ref.id
                              const busy = pc_busyRefId === ref.id
                              return (
                                <div key={ref.id} style={{
                                  background: ref.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                                  border: '1px solid ' + (isEditing ? 'rgba(99,102,241,0.35)' : 'var(--border)'),
                                  borderRadius: '10px',
                                  padding: '12px 14px',
                                  opacity: ref.enabled ? 1 : 0.5,
                                }}>
                                  {!isEditing && (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff', flex: 1 }}>{ref.title}</div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button onClick={() => toggleRefEnabled(ref)} disabled={busy}
                                            title={ref.enabled ? '비활성화' : '활성화'}
                                            style={{ padding: '5px 9px', background: ref.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (ref.enabled ? 'rgba(16,185,129,0.30)' : 'var(--border)'), borderRadius: '6px', color: ref.enabled ? '#34d399' : '#64748b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                            {ref.enabled ? 'ON' : 'OFF'}
                                          </button>
                                          <button onClick={() => startEditRef(ref)} disabled={busy}
                                            style={{ padding: '5px 9px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', cursor: 'pointer' }}>
                                            ✏️ 수정
                                          </button>
                                          <button onClick={() => deleteRef(ref)} disabled={busy}
                                            style={{ padding: '5px 9px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}>
                                            🗑️
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: '6em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                                        {ref.content}
                                      </div>
                                    </>
                                  )}
                                  {isEditing && (
                                    <>
                                      <input type="text" value={pc_editRefDraft.title} onChange={(e) => setPcEditRefDraft(s => ({ ...s, title: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 11px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '13px', marginBottom: '8px', boxSizing: 'border-box' }} />
                                      <textarea value={pc_editRefDraft.content} onChange={(e) => setPcEditRefDraft(s => ({ ...s, content: e.target.value }))} rows={8}
                                        style={{ width: '100%', padding: '11px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '7px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical', minHeight: '140px' }} />
                                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                        <button onClick={() => { setPcEditingRefId(null) }}
                                          style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>취소</button>
                                        <button onClick={saveEditRef} disabled={busy}
                                          style={{ padding: '7px 14px', background: 'var(--accent-grad)', border: 'none', borderRadius: '7px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                                          {busy ? '저장 중…' : '저장'}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* 👥 계정 관리 탭 (jinwoo 전용) — 이름·아이디·비밀번호·권한 CRUD */}
          {currentTab === 'account-management' && loginId === 'jinwoo' && (() => {
            const FEATURE_LABELS = {
              'basic-dashboard': '기본 대시보드',
              'tools':           '업무 툴',
              'resources':       '시트 통합',
              'cs-ai':           'CS AI',
              'lecture-analyzer':'무료강의 분석기',
              'project-planner': '프로젝트 기획',
              'sheet-settings':  '시트 설정',
              'payer-data':      '결제자 데이터',
            }

            const openAdd = () => {
              setAmDraft({ name: '', username: '', password: '', features: ['basic-dashboard', 'tools', 'resources', 'lecture-analyzer'] })
              setAmModal('add')
              setAmMessage('')
            }
            const openEdit = (acc) => {
              setAmDraft({ name: acc.name || '', username: acc.username || '', password: acc.password || '', features: [...(acc.features || [])] })
              setAmModal({ id: acc.id, originalUsername: acc.username })
              setAmMessage('')
            }
            const closeModal = () => {
              if (am_busy) return
              setAmModal(null)
            }
            const toggleFeatureInDraft = (key) => {
              setAmDraft(d => ({
                ...d,
                features: d.features.includes(key) ? d.features.filter(f => f !== key) : [...d.features, key]
              }))
            }

            const submitModal = async () => {
              const isAdd = am_modal === 'add'
              const id = am_modal && am_modal.id
              if (!am_draft.name.trim() || !am_draft.username.trim() || (isAdd && !am_draft.password.trim())) {
                setAmMessage('❌ 이름·아이디·비밀번호 모두 필요')
                return
              }
              setAmBusy(true)
              setAmMessage('')
              try {
                const body = isAdd
                  ? { action: 'create', name: am_draft.name.trim(), username: am_draft.username.trim(), password: am_draft.password.trim(), features: am_draft.features }
                  : { action: 'update', id, name: am_draft.name.trim(), username: am_draft.username.trim(), password: am_draft.password.trim() || undefined, features: am_draft.features }
                const res = await fetch('/api/admin/accounts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify(body),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                // 갱신
                const refreshed = await fetch('/api/admin/accounts', { headers: getAuthHeaders() }).then(r => r.json())
                if (refreshed.success) setAmAccounts(refreshed.accounts || [])
                setAmModal(null)
                setAmMessage(isAdd ? '✅ 계정 추가됨' : '✅ 계정 수정됨')
              } catch (e) {
                setAmMessage('❌ ' + e.message)
              } finally {
                setAmBusy(false)
              }
            }

            const deleteAccount = async (acc) => {
              if (acc.isSuperAdmin) {
                alert('슈퍼어드민(jinwoo) 계정은 삭제할 수 없습니다.')
                return
              }
              if (!confirm(`정말로 계정 "${acc.name} (${acc.username})" 을(를) 삭제할까요?\n\n이 계정으로 로그인된 활성 세션도 모두 종료됩니다.`)) return
              setAmBusy(true)
              try {
                const res = await fetch('/api/admin/accounts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ action: 'delete', id: acc.id }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                setAmAccounts(prev => prev.filter(a => a.id !== acc.id))
                setAmMessage('✅ 계정 삭제됨')
              } catch (e) {
                setAmMessage('❌ ' + e.message)
              } finally {
                setAmBusy(false)
              }
            }

            const togglePwdReveal = (id) => {
              setAmRevealPwd(s => ({ ...s, [id]: !s[id] }))
            }

            return (
              <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-grad)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
                        <ShieldCheck size={18} color="#fff" strokeWidth={2.2} />
                      </span>
                      계정 관리
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.55 }}>
                      관리자 계정의 이름·아이디·비밀번호·메뉴 권한을 등록·수정·삭제합니다. 슈퍼어드민(jinwoo)은 보호되어 변경 불가.
                    </p>
                  </div>
                  <button onClick={openAdd}
                    style={{ padding: '10px 16px', background: 'var(--accent-grad)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 14px rgba(99,102,241,0.30)' }}>
                    ➕ 새 계정 추가
                  </button>
                </div>

                {am_message && (
                  <div style={{
                    marginBottom: '14px', padding: '10px 14px',
                    background: am_message.startsWith('✅') ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                    border: `1px solid ${am_message.startsWith('✅') ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
                    borderRadius: '8px',
                    color: am_message.startsWith('✅') ? '#34d399' : '#fca5a5',
                    fontSize: '13px',
                  }}>{am_message}</div>
                )}

                {am_loading && (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>불러오는 중…</div>
                )}

                {!am_loading && am_accounts.length === 0 && (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px', border: '2px dashed var(--border)', borderRadius: '10px' }}>
                    등록된 계정이 없습니다.
                  </div>
                )}

                {!am_loading && am_accounts.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {am_accounts.map(acc => {
                      const revealed = !!am_revealPwd[acc.id]
                      return (
                        <div key={acc.id} style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '14px 16px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-grad)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                              {(acc.name || acc.username || '?').trim().charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: '180px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{acc.name}</span>
                                {acc.isSuperAdmin && (
                                  <span style={{ fontSize: '10px', padding: '2px 8px', background: 'rgba(245,158,11,0.20)', color: '#fbbf24', borderRadius: '999px', fontWeight: 700 }}>슈퍼어드민</span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>@{acc.username}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => openEdit(acc)} disabled={acc.isSuperAdmin || am_busy}
                                style={{ padding: '7px 12px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '7px', color: '#c7d2fe', fontSize: '12px', fontWeight: 600, cursor: acc.isSuperAdmin ? 'not-allowed' : 'pointer', opacity: acc.isSuperAdmin ? 0.4 : 1 }}>
                                ✏️ 편집
                              </button>
                              <button onClick={() => deleteAccount(acc)} disabled={acc.isSuperAdmin || am_busy}
                                style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: '7px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: acc.isSuperAdmin ? 'not-allowed' : 'pointer', opacity: acc.isSuperAdmin ? 0.4 : 1 }}>
                                🗑️ 삭제
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                            <div>
                              <div style={{ color: 'var(--text-faint)', fontSize: '10px', fontWeight: 600, marginBottom: '3px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>비밀번호</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <code style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.30)', border: '1px solid var(--border)', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {revealed ? (acc.password || '(빈 값)') : '••••••••'}
                                </code>
                                <button type="button" onClick={() => togglePwdReveal(acc.id)}
                                  style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {revealed ? '숨기기' : '보기'}
                                </button>
                              </div>
                            </div>
                            <div>
                              <div style={{ color: 'var(--text-faint)', fontSize: '10px', fontWeight: 600, marginBottom: '3px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>권한 ({acc.features.length}/{Object.keys(FEATURE_LABELS).length})</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {acc.features.map(f => (
                                  <span key={f} style={{ fontSize: '10.5px', padding: '3px 8px', background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', borderRadius: '999px', fontWeight: 600 }}>
                                    {FEATURE_LABELS[f] || f}
                                  </span>
                                ))}
                                {acc.features.length === 0 && (
                                  <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>(권한 없음)</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 추가/편집 모달 */}
                {am_modal && (
                  <div onClick={closeModal}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
                    <div onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%', maxWidth: '500px', background: '#11131a', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 700 }}>
                          {am_modal === 'add' ? '➕ 새 계정 추가' : '✏️ 계정 편집'}
                        </h3>
                        <button onClick={closeModal} disabled={am_busy}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: am_busy ? 'wait' : 'pointer' }}>×</button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>이름 *</label>
                          <input type="text" value={am_draft.name} onChange={(e) => setAmDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="홍길동"
                            style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>아이디 *</label>
                          <input type="text" value={am_draft.username} onChange={(e) => setAmDraft(d => ({ ...d, username: e.target.value }))}
                            placeholder="hong"
                            style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: 500 }}>
                            비밀번호 {am_modal === 'add' ? '*' : <span style={{ color: '#64748b', fontWeight: 400 }}>(변경 시에만 입력)</span>}
                          </label>
                          <input type="text" value={am_draft.password} onChange={(e) => setAmDraft(d => ({ ...d, password: e.target.value }))}
                            placeholder={am_modal === 'add' ? '비밀번호' : '비워두면 기존 비밀번호 유지'}
                            style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.40)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '8px', fontWeight: 500 }}>권한 (메뉴 표시 여부)</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                              const checked = am_draft.features.includes(key)
                              return (
                                <label key={key} style={{
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                  padding: '7px 10px',
                                  background: checked ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                  border: `1px solid ${checked ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                                  borderRadius: '7px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleFeatureInDraft(key)}
                                    style={{ accentColor: '#8b5cf6', cursor: 'pointer' }} />
                                  <span>{label}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button onClick={closeModal} disabled={am_busy}
                          style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', cursor: am_busy ? 'wait' : 'pointer' }}>
                          취소
                        </button>
                        <button onClick={submitModal} disabled={am_busy}
                          style={{ padding: '9px 18px', background: 'var(--accent-grad)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: am_busy ? 'wait' : 'pointer', boxShadow: '0 6px 14px rgba(99,102,241,0.30)' }}>
                          {am_busy ? '저장 중…' : (am_modal === 'add' ? '추가' : '저장')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

        </div>

        {/* 푸터 */}
        <div style={{
          padding: '20px 32px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '12px',
          borderTop: '1px solid rgba(255,255,255,0.05)'
        }}>
          개발자 이진우
        </div>
      </div>

      {/* 기수별 차트 모달 */}
      {showSessionChart && (() => {
        const getInstructorName = (name) => name.split(' ').slice(0, -1).join(' ')
        const getSessionLabel = (name) => name.split(' ').pop()
        const instructorSessions = allSheetData
          .filter(d => getInstructorName(d.name) === selectedInstructor)
          .map(d => ({ ...d, label: getSessionLabel(d.name) }))
        const CHART_METRICS = [
          { key: 'revenue', title: '매출', color: '#60a5fa', gradient: ['#3b82f6', '#1d4ed8'], format: v => formatMoney(v), yFormat: v => v >= 1e8 ? (v / 1e8).toFixed(1) + '억' : Math.round(v / 1e4) + '만' },
          { key: 'kakaoRoomDb', title: 'DB 수 (카톡방)', color: '#34d399', gradient: ['#10b981', '#059669'], format: v => formatNumber(v) + '명', yFormat: v => formatNumber(v) },
          { key: 'conversionCost', title: '전환단가 (낮을수록 좋음)', color: '#f59e0b', gradient: ['#f59e0b', '#d97706'], format: v => formatNumber(v) + '원', yFormat: v => v >= 1e4 ? Math.round(v / 1e4) + '만' : formatNumber(v), lowerIsBetter: true },
          { key: 'operatingProfit', title: '영업이익', color: '#a78bfa', gradient: ['#8b5cf6', '#6d28d9'], format: v => formatMoney(v), yFormat: v => v >= 1e8 ? (v / 1e8).toFixed(1) + '억' : Math.round(v / 1e4) + '만' },
        ]
        // CustomChartTooltip은 CompareMetricBarChart 내부로 이동됨
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }} onClick={() => setShowSessionChart(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg, #1e293b 0%, #1a1f35 100%)', borderRadius: '20px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>📊 {selectedInstructor} - 기수별 차트</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{instructorSessions.length}개 기수 데이터</div>
                </div>
                <button onClick={() => setShowSessionChart(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {instructorSessions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>{selectedInstructor} 강사의 기수별 데이터가 없습니다.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                    {CHART_METRICS.map(metric => {
                      const validData = instructorSessions.filter(d => d[metric.key] !== undefined && d[metric.key] !== null && d[metric.key] !== 0)
                      if (validData.length === 0) return (
                        <div key={metric.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: '600', color: metric.color, margin: '0 0 16px 0' }}>{metric.title}</h3>
                          <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '13px' }}>데이터 없음</div>
                        </div>
                      )
                      const values = validData.map(d => d[metric.key])
                      const maxVal = Math.max(...values)
                      const minVal = Math.min(...values)
                      const avgVal = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
                      const bestVal = metric.lowerIsBetter ? minVal : maxVal
                      return (
                        <div key={metric.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '600', color: metric.color, margin: 0 }}>{metric.title}</h3>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>평균: {metric.format(avgVal)}</span>
                          </div>
                          <CompareMetricBarChart validData={validData} metric={metric} bestVal={bestVal} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 강의 분석 히스토리 보기 모달 */}
      {laViewItem && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setLaViewItem(null) }}
        >
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '24px', width: '700px', maxWidth: '95vw', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{laViewItem.video_title || '분석 결과'}</h3>
                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span>{formatKST(laViewItem.created_at, 'full')} 완료</span>
                  {laViewItem.video_duration && (
                    <span>· 영상 {Math.floor(laViewItem.video_duration / 3600) > 0 ? `${Math.floor(laViewItem.video_duration / 3600)}시간 ` : ''}{Math.floor((laViewItem.video_duration % 3600) / 60)}분</span>
                  )}
                </div>
                {laViewItem.youtube_url && (
                  <a href={laViewItem.youtube_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#6366f1', textDecoration: 'none', marginTop: '4px', display: 'inline-block' }}>
                    🔗 YouTube 영상 보기
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const text = `--- 무료강의 분석 결과 ---\n영상: ${laViewItem.video_title || ''}\nURL: ${laViewItem.youtube_url || ''}\n분석일: ${formatKST(laViewItem.created_at, 'full')}\n\n${laViewItem.analysis}`
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `강의분석_${(laViewItem.video_title || 'result').slice(0, 30)}_${new Date(laViewItem.created_at).toISOString().slice(0, 10)}.txt`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  style={{
                    padding: '8px 14px',
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '8px',
                    color: '#34d399',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  📥 다운로드
                </button>
                <button
                  onClick={() => setLaViewItem(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}
                >×</button>
              </div>
            </div>
            <div style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '12px',
              padding: '20px',
              overflowY: 'auto',
              fontSize: '14px',
              color: '#e2e8f0',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap'
            }}>
              {laViewItem.analysis}
            </div>
          </div>
        </div>
      )}

      {/* 유튜브 채팅 보기 모달 */}
      {ytViewSession && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => {
            // 배경 클릭 시 모달 닫기
            if (e.target === e.currentTarget) {
              if (viewPollingRef.current) {
                clearInterval(viewPollingRef.current)
                viewPollingRef.current = null
              }
              setYtViewSession(null)
              setYtViewMessages([])
            }
          }}
        >
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '24px', width: '600px', maxWidth: '95vw', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>{ytViewSession.session_name || ytViewSession.video_title}</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {ytViewSession.message_count}개 메시지 · {ytViewSession.status === 'collecting' ? '🟢 수집 중' : ytViewSession.status === 'stopped' ? '⏹️ 중지됨' : '🔴 종료됨'}
                </div>
              </div>
              <button
                onClick={() => {
                  if (viewPollingRef.current) {
                    clearInterval(viewPollingRef.current)
                    viewPollingRef.current = null
                  }
                  setYtViewSession(null)
                  setYtViewMessages([])
                }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>

            {/* 채팅 목록 */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              {ytViewMessages.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
                  {ytViewSession?.message_count > 0 ? '채팅 불러오는 중...' : '수집된 채팅이 없습니다.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ytViewMessages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
                      <span style={{ color: '#64748b', minWidth: '50px' }}>{msg.time_kst}</span>
                      <span style={{ color: '#a5b4fc', fontWeight: '600', minWidth: '80px' }}>{msg.author}</span>
                      <span style={{ color: '#e2e8f0', flex: 1 }}>{msg.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              {ytViewSession.status === 'collecting' && (
                <button
                  onClick={async () => {
                    await fetch('/api/tools/youtube-chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'stop', sessionId: ytViewSession.id })
                    })
                    // 새로고침
                    const res = await fetch('/api/tools/youtube-chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'messages', sessionId: ytViewSession.id, limit: 200 })
                    })
                    const data = await res.json()
                    if (data.success) {
                      setYtViewSession(data.session)
                    }
                    // 세션 목록도 새로고침
                    const listRes = await fetch('/api/tools/youtube-chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'list' })
                    })
                    const listData = await listRes.json()
                    if (listData.success) setYtSessions(listData.sessions)
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'rgba(250,204,21,0.2)',
                    border: '1px solid rgba(250,204,21,0.4)',
                    borderRadius: '10px',
                    color: '#fcd34d',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ⏹️ 수집 정지
                </button>
              )}
              <button
                onClick={async () => {
                  const res = await fetch('/api/tools/youtube-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'download', sessionId: ytViewSession.id })
                  })
                  const data = await res.json()
                  if (data.success) {
                    const link = document.createElement('a')
                    link.href = data.downloadUrl
                    link.download = data.filename
                    link.click()
                  }
                }}
                style={{
                  padding: '12px 20px',
                  background: 'rgba(16,185,129,0.2)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  borderRadius: '10px',
                  color: '#10b981',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                📥 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메모 모달 */}
      {showMemoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '32px', width: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>강사 메모 작성</h3>
              <button onClick={() => setShowMemoModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)} placeholder="강사 관련 메모를 입력하세요 (미팅 내용, 강의 피드백, 특이사항 등)" style={{ width: '100%', height: '150px', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px', resize: 'none', marginBottom: '16px' }} />
            <button onClick={saveMemo} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>저장</button>
          </div>
        </div>
      )}

      {/* 강사/기수 모달 */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '32px', width: '500px', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{addType === 'instructor' ? '강사 추가' : addType === 'session' ? '기수 추가' : '강사/기수 삭제'}</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            {addType === 'instructor' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>강사명</label>
                  <input type="text" value={newInstructor} onChange={(e) => setNewInstructor(e.target.value)} placeholder="강사 이름 입력" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
                </div>
                <button onClick={addInstructor} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>추가</button>
              </>
            )}

            {addType === 'session' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>강사 선택</label>
                  <select value={newSession.instructor_id} onChange={(e) => setNewSession({...newSession, instructor_id: e.target.value})} style={{ width: '100%', padding: '14px', background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }}>
                    <option value="" style={{ background: '#1e1e2e', color: '#fff' }}>강사 선택</option>
                    {instructors.map(inst => (<option key={inst.id} value={inst.id} style={{ background: '#1e1e2e', color: '#fff' }}>{inst.name}</option>))}
                  </select>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>기수명</label>
                  <input type="text" value={newSession.session_name} onChange={(e) => setNewSession({...newSession, session_name: e.target.value})} placeholder="예: 1기, 2기" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>주제</label>
                  <input type="text" value={newSession.topic} onChange={(e) => setNewSession({...newSession, topic: e.target.value})} placeholder="강의 주제" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
                </div>
                <button onClick={addSession} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>추가</button>
              </>
            )}

            {addType === 'delete' && (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>강사 삭제</h4>
                  {instructors.map(inst => (
                    <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '8px' }}>
                      <span>{inst.name}</span>
                      <button onClick={() => deleteInstructor(inst.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 12px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>삭제</button>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>기수 삭제</h4>
                  {sessions.map(sess => (
                    <div key={sess.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '8px' }}>
                      <span>{sess.instructors?.name} {sess.session_name}</span>
                      <button onClick={() => deleteSession(sess.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 12px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>삭제</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 유튜브 모달 */}
      {showYoutubeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '32px', width: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>유튜브 링크 추가</h3>
              <button onClick={() => setShowYoutubeModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>유튜브 URL</label>
              <input type="text" value={newYoutube.url} onChange={(e) => setNewYoutube({...newYoutube, url: e.target.value})} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); setTimeout(() => fetchYoutubeInfo(pasted), 100) }} onBlur={(e) => fetchYoutubeInfo(e.target.value)} placeholder="https://youtube.com/watch?v=... 붙여넣기" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>링크를 붙여넣으면 채널명과 조회수를 자동으로 가져옵니다</p>
            </div>
            {youtubeFetching && (
              <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', fontSize: '13px', color: '#a5b4fc', textAlign: 'center' }}>채널 정보 가져오는 중...</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>채널명 {newYoutube.channel_name && '✓'}</label>
                <input type="text" value={newYoutube.channel_name} onChange={(e) => setNewYoutube({...newYoutube, channel_name: e.target.value})} placeholder="자동 입력됨" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>조회수 {newYoutube.views && '✓'}</label>
                <input type="number" value={newYoutube.views} onChange={(e) => setNewYoutube({...newYoutube, views: e.target.value})} placeholder="자동 입력됨" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>전환수 (수동 입력)</label>
              <input type="number" value={newYoutube.conversions} onChange={(e) => setNewYoutube({...newYoutube, conversions: e.target.value})} placeholder="전환 인원 수" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
            </div>
            <button onClick={saveYoutube} disabled={youtubeFetching} style={{ width: '100%', padding: '14px', background: youtubeFetching ? '#4c4c6d' : 'linear-gradient(135deg, #f43f5e, #ec4899)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: youtubeFetching ? 'wait' : 'pointer' }}>추가</button>
          </div>
        </div>
      )}

      {/* 링크 추가 모달 */}
      {showFileModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '32px', width: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>🔗 링크 추가</h3>
              <button onClick={() => setShowFileModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>URL *</label>
              <input
                type="url"
                value={newLink.url}
                onChange={(e) => setNewLink({...newLink, url: e.target.value})}
                placeholder="https://..."
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>제목 (선택)</label>
              <input
                type="text"
                value={newLink.title}
                onChange={(e) => setNewLink({...newLink, title: e.target.value})}
                placeholder="링크 제목"
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>설명 (선택)</label>
              <input
                type="text"
                value={newLink.description}
                onChange={(e) => setNewLink({...newLink, description: e.target.value})}
                placeholder="링크에 대한 간단한 설명"
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }}
              />
            </div>
            <button
              onClick={handleLinkSave}
              disabled={fileUploading || !newLink.url}
              style={{ width: '100%', padding: '14px', background: fileUploading || !newLink.url ? '#4c4c6d' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: fileUploading || !newLink.url ? 'not-allowed' : 'pointer' }}
            >
              {fileUploading ? '저장 중...' : '링크 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 파일 업로드 진행 모달 */}
      {uploadProgress.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)', borderRadius: '24px', padding: '40px', width: '420px', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ width: '80px', height: '80px', background: 'rgba(99,102,241,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '36px' }}>
              📤
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
              파일 업로드 중
            </h2>
            <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '24px', lineHeight: 1.6 }}>
              잠시만 기다려주세요...
            </p>

            {/* 진행률 바 */}
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '10px', height: '12px', marginBottom: '16px', overflow: 'hidden' }}>
              <div style={{
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                borderRadius: '10px',
                transition: 'width 0.3s ease'
              }} />
            </div>

            {/* 진행 상태 텍스트 */}
            <div style={{ fontSize: '14px', color: '#a5b4fc', fontWeight: '600', marginBottom: '8px' }}>
              {uploadProgress.current} / {uploadProgress.total} 파일
            </div>

            {/* 현재 파일명 */}
            <div style={{ fontSize: '13px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 20px' }}>
              {uploadProgress.fileName}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}