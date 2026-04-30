'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  LayoutDashboard,
  ChevronLeft,
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
  TrendingUp,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import HelpTooltip from './HelpTooltip'
import * as XLSX from 'xlsx'

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [showFileModal, setShowFileModal] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [newLink, setNewLink] = useState({ url: '', title: '', description: '' })
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ show: false, current: 0, total: 0, fileName: '' })
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // 툴 관련 상태
  const [currentTool, setCurrentTool] = useState('crm') // crm, kakao, youtube (inflow는 권한 필요)
  const [toolFiles1, setToolFiles1] = useState([]) // 여러 파일 지원
  const [toolFiles2, setToolFiles2] = useState([]) // 여러 파일 지원
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
      { fieldKey: 'revenue', displayName: '최종매출액', columnIndex: 8, type: '숫자' },
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
  // 테스트 모드: ON이면 모든 발송이 testPhone으로만 감 (수만명 신청자한테 가는 사고 방지)
  const [shoongBulkTestMode, setShoongBulkTestMode] = useState(true) // 기본 ON
  const [shoongBulkTestPhone, setShoongBulkTestPhone] = useState('')
  const [shoongBulkTestLimit, setShoongBulkTestLimit] = useState(1)

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
  const [payerMatchFiles, setPayerMatchFiles] = useState([])
  const [payerMatchProcessing, setPayerMatchProcessing] = useState(false)
  const [payerMatchLog, setPayerMatchLog] = useState([])
  const [payerMatchResult, setPayerMatchResult] = useState(null)
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
    setToolFiles2([])
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
  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    }
  }

  useEffect(() => {
    loadSessions()
    loadInstructors()
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

  // 권한에 따라 기본 툴 설정
  useEffect(() => {
    if (permissions.canUseInflow) {
      setCurrentTool('inflow')
    } else if (currentTool === 'inflow') {
      setCurrentTool('crm')
    }
  }, [permissions.canUseInflow])

  // 슝 툴 진입 시 서버 .env 기본값(SHOONG_API_KEY, SHOONG_SENDER_KEY) 로드해서 폼/curl 자동 채움
  useEffect(() => {
    if (currentTool !== 'shoong' || shoongDefaultsLoaded) return
    const token = localStorage.getItem('authToken')
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
    if (currentTab === 'admin-permissions' && loginId === 'jinwoo' && permUsers.length === 0) {
      setPermLoading(true)
      fetch(`/api/user-permissions?action=all-users&requestLoginId=${loginId}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setPermUsers(data.users)
            setPermAllFeatures(data.allFeatures)
          }
        })
        .catch(() => {})
        .finally(() => setPermLoading(false))
    }
  }, [currentTab])

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

  // 강사 변경 시 첨부파일 로드
  useEffect(() => {
    if (selectedInstructor && instructors.length > 0) {
      loadAttachments()
    }
  }, [selectedInstructor, instructors])

  // 전체 시트 데이터 로드 (랭킹/대조용)
  useEffect(() => {
    if (sessions.length > 0) {
      loadAllSheetData()
    }
  }, [sessions])

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

  const loadInstructors = async () => {
    const { data } = await supabase.from('instructors').select('*').order('name')
    if (data) setInstructors(data)
  }

  const loadSessions = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*, instructors (name)')
    if (data && data.length > 0) {
      setSessions(data)
      // 강사를 ㄱㄴㄷ순으로 정렬 후 첫 번째 강사 선택 (최초 로드 시에만)
      const sortedInstructorNames = [...new Set(data.map(s => s.instructors?.name))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))
      const firstInstructor = sortedInstructorNames[0] || ''
      const getNum = (name) => { const m = name?.match(/(\d+)/); return m ? parseInt(m[1]) : 0 }
      // 기존 선택이 없을 때만 기본값 설정
      setSelectedInstructor(prev => {
        if (prev) return prev // 이미 선택된 경우 유지
        const firstSession = data
          .filter(s => s.instructors?.name === firstInstructor)
          .sort((a, b) => getNum(a.session_name) - getNum(b.session_name))[0]
        if (firstSession) setSelectedSessionId(firstSession.id)
        return firstInstructor
      })
    }
    setLoading(false)
  }

  const loadSheetData = async (instructorName, sessionName) => {
    const name = `${instructorName} ${sessionName}`
    try {
      const response = await fetch(`/api/sheets?name=${encodeURIComponent(name)}`, {
        headers: getAuthHeaders()
      })
      const data = await response.json()
      if (!data.error) return data
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

      // 시트에 없는 강사/기수 삭제
      const sheetInstructorNames = [...new Set(data.map(item => {
        const parts = item.name.replace(/\s+/g, ' ').trim().split(' ')
        return parts.slice(0, -1).join(' ')
      }))]

      const { data: dbInstructors } = await supabase.from('instructors').select('*')
      if (dbInstructors) {
        for (const inst of dbInstructors) {
          if (!sheetInstructorNames.includes(inst.name.trim())) {
            // 시트에 없는 강사 삭제 (cascade로 sessions도 삭제됨)
            await supabase.from('sessions').delete().eq('instructor_id', inst.id)
            await supabase.from('instructors').delete().eq('id', inst.id)
          }
        }
      }

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
    const { error } = await supabase.from('instructors').insert({ name: newInstructor })
    if (!error) {
      setNewInstructor('')
      setShowAddModal(false)
      loadInstructors()
    }
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
      const response = await fetch(`/api/files?instructor_id=${instructorId}&t=${Date.now()}`, {
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

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return
    const instructorId = getSelectedInstructorId()
    if (!instructorId) return

    const fileArray = Array.from(files)

    // 압축 파일 필터링 (ZIP, RAR, 7Z 등)
    const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz']
    const archiveFiles = fileArray.filter(f => archiveExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    const validFiles = fileArray.filter(f => !archiveExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))

    if (archiveFiles.length > 0) {
      alert(`압축 파일(${archiveFiles.map(f => f.name).join(', ')})은 AI 분석을 지원하지 않아 업로드가 불가능합니다.`)
    }

    if (validFiles.length === 0) return

    setFileUploading(true)
    setUploadProgress({ show: true, current: 0, total: validFiles.length, fileName: '' })

    let successCount = 0
    let failCount = 0
    const PARALLEL_LIMIT = 5 // 동시 업로드 개수

    // 파일 업로드 함수
    const uploadSingleFile = async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('instructor_id', instructorId)
      formData.append('file_type', 'file')

      try {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
          body: formData
        })
        const result = await response.json()
        return result.success
      } catch (e) {
        return false
      }
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

    // 결과 알림
    if (failCount === 0) {
      alert(`✅ ${successCount}개 파일 업로드 완료!`)
    } else if (successCount === 0) {
      alert(`❌ 업로드 실패 (${failCount}개)`)
    } else {
      alert(`⚠️ ${successCount}개 성공, ${failCount}개 실패`)
    }
  }

  const handleFileUpload = async (e) => {
    await uploadFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
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
    formData.append('file_type', 'link')
    formData.append('link_url', newLink.url)
    formData.append('link_title', newLink.title)
    formData.append('description', newLink.description)

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
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

    // 시트에서 데이터 확인
    const instructor = instructors.find(i => i.id === newSession.instructor_id)
    const sheetCheck = await loadSheetData(instructor?.name, newSession.session_name)
    
    if (!sheetCheck) {
      alert('데이터베이스 시트에 "' + instructor?.name + ' ' + newSession.session_name + '" 데이터가 없습니다.\n시트에 먼저 등록해주세요.')
      return
    }

    const { error } = await supabase.from('sessions').insert({
      instructor_id: newSession.instructor_id,
      session_name: newSession.session_name,
      topic: newSession.topic,
      free_class_date: sheetCheck.freeClassDate || null
    })
    if (!error) {
      setNewSession({ instructor_id: '', session_name: '', topic: '' })
      setShowAddModal(false)
      loadSessions()
    }
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
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--accent-grad)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.20)',
            }}>
              <LayoutDashboard size={18} color="#fff" strokeWidth={2.2} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
            </div>
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
              <SidebarItem icon={FileText} label="상세 정보" shortLabel="상세"
                active={currentTab === 'detail'}
                collapsed={sidebarCollapsed && !isMobile}
                onClick={() => { setCurrentTab('detail'); if(isMobile) setMobileMenuOpen(false) }} />
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
                  <SidebarItem icon={TrendingUp} label="구매 추이 시트" shortLabel="구매추이"
                    href="https://docs.google.com/spreadsheets/d/1NciqOt6PaUggmroaov60UycBbkdIY6eVXSXfwLyvCRo/edit?gid=1217448453#gid=1217448453"
                    external
                    collapsed={sidebarCollapsed && !isMobile} />
                  <SidebarItem icon={ShieldCheck} label="권한 설정" shortLabel="권한"
                    active={currentTab === 'admin-permissions'}
                    collapsed={sidebarCollapsed && !isMobile}
                    onClick={() => { setCurrentTab('admin-permissions'); if(isMobile) setMobileMenuOpen(false) }} />
                </>
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
          {/* 드롭다운 - 대시보드/상세 탭에서만 표시 */}
          {(currentTab === 'dashboard' || currentTab === 'detail') && <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                    return (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={groupedData.map(item => ({
                          name: getIntervalLabel(item.hour) + '분',
                          shortName: item.hour + '',
                          purchases: item.purchases,
                          pct: total > 0 ? ((item.purchases / total) * 100).toFixed(1) : 0
                        }))}>
                        <defs>
                          <linearGradient id="purchaseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="shortName"
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          interval={2}
                          tickFormatter={(value) => {
                            const min = parseInt(value)
                            if (min === 0) return '0분'
                            if (min % 60 === 0) return `${min / 60}시간`
                            if (min > 60) return `${Math.floor(min / 60)}시간${min % 60}분`
                            return `${min}분`
                          }}
                        />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#1e1e2e', border: '1px solid #4c4c6d', borderRadius: '8px', color: '#e2e8f0' }}
                          formatter={(value, name, props) => [`${value}건 (${props.payload.pct}%)`, '구매건수']}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.name || label}
                        />
                        <Area type="monotone" dataKey="purchases" stroke="#6366f1" fill="url(#purchaseGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                    )
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

          {/* 상세 정보 탭 */}
          {currentTab === 'detail' && (
            <>
              {/* 강사 메모 */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 강사 메모 <HelpTooltip text={"각 기수별 강사 메모를 기록합니다.\n특이사항, 피드백, 개선점 등을\n자유롭게 작성하세요."} /></div>
                  <button onClick={() => setShowMemoModal(true)} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', padding: '10px 18px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>메모 추가</button>
                </div>
                {memos.length > 0 ? (
                  <div>
                    {memos.map((memo) => (
                      <div key={memo.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '20px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{memo.memo_date}</div>
                        <div style={{ color: '#e2e8f0', fontSize: '15px', lineHeight: 1.7 }}>{memo.content}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>등록된 강사 메모가 없습니다</div>
                )}
              </div>

              {/* 첨부파일 섹션 */}
              <div
                style={{
                  background: isDragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '16px',
                  padding: '24px',
                  border: isDragging ? '2px dashed #6366f1' : '1px solid rgba(255,255,255,0.1)',
                  marginBottom: '24px',
                  transition: 'all 0.2s ease'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>📎 첨부파일 & 링크 <HelpTooltip text={"기수별 관련 파일과 링크를 관리합니다.\n파일 업로드, 폴더 업로드, 드래그&드롭을\n모두 지원합니다.\n링크는 URL, 제목, 설명을 입력할 수 있습니다."} /></div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      style={{ display: 'none' }}
                    />
                    <input
                      type="file"
                      ref={folderInputRef}
                      onChange={handleFileUpload}
                      webkitdirectory=""
                      directory=""
                      multiple
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={fileUploading}
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', padding: '10px 18px', color: '#fff', fontSize: '14px', cursor: fileUploading ? 'wait' : 'pointer' }}
                    >
                      {fileUploading ? '업로드 중...' : '파일 업로드'}
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      disabled={fileUploading}
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px', padding: '10px 18px', color: '#a5b4fc', fontSize: '14px', cursor: fileUploading ? 'wait' : 'pointer' }}
                    >
                      📁 폴더 업로드
                    </button>
                    <button
                      onClick={() => setShowFileModal(true)}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '10px 18px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}
                    >
                      🔗 링크 추가
                    </button>
                  </div>
                </div>

                {/* 드래그 앤 드롭 안내 */}
                {isDragging && (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#a5b4fc', background: 'rgba(99,102,241,0.1)', borderRadius: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📥</div>
                    <p style={{ fontSize: '16px', fontWeight: '600' }}>여기에 파일을 놓으세요</p>
                    <p style={{ fontSize: '13px', marginTop: '4px' }}>파일 또는 폴더를 드롭하면 업로드됩니다</p>
                  </div>
                )}

                {!isDragging && attachments.length > 0 ? (
                  <>
                    <div style={{ marginBottom: '8px', fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>총 {attachments.length}개 파일</span>
                      <button onClick={deleteAllAttachments} style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#f87171', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>전체삭제</button>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                      {attachments.map((file, idx) => (
                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: idx < attachments.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', gap: '8px' }}>
                          <span style={{ fontSize: '14px' }}>{getFileIcon(file.file_type)}</span>
                          <a href={file.file_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: file.file_type === 'link' ? '#a5b4fc' : '#e2e8f0', fontSize: '12px', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.file_name}
                          </a>
                          <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {file.file_type === 'link' ? '링크' : formatFileSize(file.file_size)}
                          </span>
                          <button onClick={() => deleteAttachment(file.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '12px', cursor: 'pointer', padding: '2px 6px' }} title="삭제">✕</button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : !isDragging && (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📁</div>
                    <p style={{ fontSize: '13px' }}>파일을 드래그하여 업로드</p>
                  </div>
                )}
              </div>

              {/* AI 분석 */}
              <button onClick={() => runAiAnalysis('detail')} disabled={analyzing} style={{ background: analyzing ? '#4c4c6d' : 'linear-gradient(135deg, #ec4899, #f43f5e)', border: 'none', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: analyzing ? 'wait' : 'pointer', marginBottom: '24px' }}>
                {analyzing ? '✨ AI 분석 중...' : '✨ AI 종합 분석 실행'}
              </button>

              {aiAnalysis && (
                <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', borderRadius: '16px', padding: '24px', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>✨ AI 종합 분석 결과</div>
                  <p style={{ color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.6 }}>{aiAnalysis.summary}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ color: '#10b981', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>💪 강점</div>
                      {aiAnalysis.strengths?.map((s, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {s}</div>))}
                    </div>
                    <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>⚠️ 개선점</div>
                      {aiAnalysis.weaknesses?.map((w, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {w}</div>))}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ color: '#818cf8', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>📋 추천 액션</div>
                    {aiAnalysis.recommendations?.map((r, i) => (<div key={i} style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>• {r}</div>))}
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
                  { id: 'inflow', icon: '🔀', label: '유입경로 매칭', requiresPermission: 'canUseInflow' },
                  { id: 'order-sync', icon: '📦', label: '주문 동기화' },
                  { id: 'crm', icon: '📋', label: 'CRM 정리' },
                  { id: 'kakao', icon: '💬', label: '카톡 매칭' },
                  { id: 'youtube', icon: '📡', label: '유튜브 채팅 로그 수집' },
                  { id: 'shoong', icon: '💌', label: '슝 알림톡 발송 (테스트)' }
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

              {/* 유입경로 매칭 툴 */}
              {currentTool === 'inflow' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>🔀 신청자-결제자 유입경로 매칭 <HelpTooltip text={"무료특강 신청자 명단과 결제자 명단을\n연락처 기준으로 매칭합니다.\n좌측에 신청자, 우측에 결제자 파일을\n업로드 후 매칭 시작을 누르세요.\n결과를 Excel로 다운로드할 수 있습니다."} /></h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>무료특강 신청자와 결제자 데이터를 비교하여 유입경로를 매칭합니다.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* 신청자 파일 (여러개 가능) */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(99,102,241,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(99,102,241,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📥</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>신청자 데이터</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>연락처, 유입경로 포함 (Excel/CSV, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={(e) => setToolFiles1(Array.from(e.target.files))}
                        style={{ display: 'none' }}
                        id="tool-file1"
                      />
                      <label
                        htmlFor="tool-file1"
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

                    {/* 결제자 파일 (여러개 가능) */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(168,85,247,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>💳</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>결제자 데이터</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>결제자 연락처 포함 (Excel/CSV, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={(e) => setToolFiles2(Array.from(e.target.files))}
                        style={{ display: 'none' }}
                        id="tool-file2"
                      />
                      <label
                        htmlFor="tool-file2"
                        style={{
                          display: 'inline-block',
                          padding: '8px 16px',
                          background: 'rgba(168,85,247,0.3)',
                          borderRadius: '8px',
                          color: '#c4b5fd',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        파일 선택
                      </label>
                      {toolFiles2.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981', maxHeight: '80px', overflow: 'auto' }}>
                          {toolFiles2.map((f, i) => <div key={i}>✓ {f.name}</div>)}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (toolFiles1.length === 0 || toolFiles2.length === 0) {
                        alert('두 쪽 모두 파일을 선택해주세요.')
                        return
                      }
                      setToolProcessing(true)
                      setToolLog(['처리 시작...'])

                      const formData = new FormData()
                      toolFiles1.forEach(f => formData.append('applicants', f))
                      toolFiles2.forEach(f => formData.append('payers', f))

                      try {
                        const res = await fetch('/api/tools/inflow-match', {
                          method: 'POST',
                          body: formData
                        })
                        const data = await res.json()
                        if (data.success) {
                          setToolResult(data)
                          setToolLog(data.logs || ['처리 완료'])
                        } else {
                          setToolLog(['오류: ' + data.error])
                        }
                      } catch (err) {
                        setToolLog(['오류: ' + err.message])
                      }
                      setToolProcessing(false)
                    }}
                    disabled={toolProcessing || toolFiles1.length === 0 || toolFiles2.length === 0}
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
                    {toolProcessing ? '처리 중...' : '🔄 매칭 시작'}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ color: '#10b981', fontWeight: '600' }}>✓ 매칭 완료</span>
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                          매칭됨: {toolResult.matched}명 / 미매칭: {toolResult.unmatched}명
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => {
                            const link = document.createElement('a')
                            link.href = toolResult.downloadUrl
                            link.download = 'matched_result.xlsx'
                            link.click()
                          }}
                          style={{
                            padding: '10px 20px',
                            background: 'rgba(16,185,129,0.2)',
                            border: '1px solid rgba(16,185,129,0.4)',
                            borderRadius: '8px',
                            color: '#10b981',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          📥 결과 다운로드
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
                          {kakaoTabsLoading ? '불러오는 중...' : (kakaoTabs.length > 0 ? '🔄 새로고침' : '📂 탭 불러오기')}
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
                        const token = localStorage.getItem('authToken')
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
                          {orderSyncTabsLoading ? '불러오는 중...' : (orderSyncTabs.length > 0 ? '🔄 새로고침' : '📂 탭 불러오기')}
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
                            const token = localStorage.getItem('authToken')
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
                          { label: '연락처 누락', value: orderSyncPreview.stats.invalid, color: '#cbd5e1' }
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

              {/* 슝(Shoong) 알림톡 발송 테스트 툴 */}
              {currentTool === 'shoong' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      💌 슝(Shoong) 알림톡 발송 테스트
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                      슝 API(<code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>POST https://api.shoong.kr/send</code>)에 직접 발송합니다.
                      슝은 IP 화이트리스트 정책이라 발송 경로별로 결과가 다를 수 있습니다.
                    </p>
                  </div>

                  {/* 안내 박스 */}
                  <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px', fontSize: '12px', color: '#fbbf24', lineHeight: 1.6 }}>
                    ⚠️ <b>테스트 목적</b>: 슝 API가 우리 환경에서 호출 가능한지 확인하는 것. 실제 알림톡이 수신자 폰으로 전송되니, <b>본인 번호</b>로 먼저 테스트하세요.<br/>
                    📝 <b>API 키</b>: Vercel 서버 모드는 <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: '3px' }}>SHOONG_API_KEY</code> env에서 읽고, 브라우저 직접 모드는 아래 입력란 키를 사용합니다.
                  </div>

                  {/* 입력 폼: 공통 4개 + 선택된 템플릿의 변수만 동적 렌더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    {(() => {
                      // 템플릿별 변수 슬롯 정의 (실제 카카오 검수 통과한 변수명과 정확히 일치해야 함)
                      const TEMPLATE_VARS = {
                        'start(1)': ['고객명', '유튜브링크', '강좌명', '강사명', '링크명'],
                        'start(2)': ['고객명', '유튜브링크', '강좌명', '강사님', '링크명'],
                        'start(3)': ['고객명', '시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
                      }
                      const tplCode = shoongForm['channelConfig.templatecode'] || 'start(2)'
                      const tplVars = TEMPLATE_VARS[tplCode] || []
                      const fields = [
                        { key: 'sendType', label: '발송 타입 (sendType)', placeholder: 'at', help: '알림톡=at' },
                        { key: 'phone', label: '수신자 전화번호 (phone)', placeholder: '01012345678', help: '하이픈 없이' },
                        { key: 'channelConfig.senderkey', label: '발신프로필 키 (senderkey)', placeholder: '비우면 서버 .env의 SHOONG_SENDER_KEY 사용', help: '비워두면 서버 기본값 자동 적용' },
                        { key: 'channelConfig.templatecode', label: '템플릿 코드 (templatecode)', placeholder: 'start(2)', help: '템플릿마다 변수 다름', preset: ['start(1)', 'start(2)', 'start(3)'] },
                        ...tplVars.map(v => ({
                          key: `variables.${v}`,
                          label: `변수: ${v}`,
                          placeholder: v === '유튜브링크' ? 'https://youtu.be/...' : v === '강좌명' ? '예: AI활용 컨텐츠 부업' : v === '시청자수' ? '예: 320' : v === '강사명' || v === '강사님' ? '예: 씨오' : v === '링크명' ? 'https://... (버튼 클릭 시 이동할 URL)' : '홍길동',
                          help: tplCode === 'start(1)' && v === '강사명' ? '⚠️ start(1)은 \'강사명\'(님 X)' : v === '링크명' ? '⚠️ URL 양식 (https://...)' : ''
                        }))
                      ]
                      return fields
                    })().map(field => (
                      <div key={field.key}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: '500' }}>
                          {field.label}
                          {field.help && <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '11px' }}>· {field.help}</span>}
                        </label>
                        <input
                          type="text"
                          value={shoongForm[field.key] || ''}
                          onChange={(e) => setShoongForm(f => ({ ...f, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px',
                            fontFamily: field.key.includes('senderkey') ? 'monospace' : 'inherit',
                            boxSizing: 'border-box'
                          }}
                        />
                        {field.preset && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {field.preset.map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setShoongForm(f => ({ ...f, [field.key]: p }))}
                                style={{
                                  padding: '3px 8px',
                                  background: shoongForm[field.key] === p ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.12)',
                                  border: '1px solid rgba(99,102,241,0.3)',
                                  borderRadius: '5px',
                                  color: '#c7d2fe',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >{p}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 브라우저 직접 발송 모드용 API 키 입력 */}
                  <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: '500' }}>
                      🔑 슝 API 키 (브라우저 / curl 모드용)
                      <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '11px' }}>· Bearer 뒤에 붙는 ak_xxxx 키</span>
                      {shoongDefaultsLoaded && (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: shoongApiKey ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: shoongApiKey ? '#34d399' : '#f87171',
                          border: `1px solid ${shoongApiKey ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                        }}>
                          {shoongApiKey
                            ? `✅ env 자동로드 (${shoongApiKey.length}자, ${shoongApiKey.slice(0, 3)}...${shoongApiKey.slice(-4)})`
                            : '⚠️ SHOONG_API_KEY env 비어있음'}
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={shoongApiKey}
                      onChange={(e) => setShoongApiKey(e.target.value)}
                      placeholder="ak_xxxxxxxxxxxxxxxx"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                      🔐 이 키는 브라우저 메모리에만 있고 어디로도 전송되지 않습니다 (Vercel 서버 모드는 별도로 .env의 키를 사용).
                    </p>
                  </div>

                  {/* 즉시발송 / 예약발송 토글 */}
                  <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '8px', fontWeight: '500' }}>
                      📅 발송 시점
                    </label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: shoongSendMode === 'reserved' ? '10px' : 0 }}>
                      {[
                        { v: 'immediate', label: '⚡ 즉시발송' },
                        { v: 'reserved', label: '⏰ 예약발송' }
                      ].map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setShoongSendMode(opt.v)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: shoongSendMode === opt.v ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'rgba(255,255,255,0.04)',
                            border: '1px solid ' + (shoongSendMode === opt.v ? 'transparent' : 'rgba(255,255,255,0.12)'),
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: shoongSendMode === opt.v ? '600' : '500',
                            cursor: 'pointer'
                          }}
                        >{opt.label}</button>
                      ))}
                    </div>
                    {shoongSendMode === 'reserved' && (
                      <div>
                        <input
                          type="datetime-local"
                          value={shoongReservedAt}
                          onChange={(e) => setShoongReservedAt(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                            colorScheme: 'dark'
                          }}
                        />
                        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                          현재 시각보다 미래여야 함. 슝 서버에 ISO 시각으로 전송됨 (<code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: '3px' }}>reservedTime</code>).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 발송 버튼 3개 */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {/* Vercel 서버 발송 */}
                    <button
                      onClick={async () => {
                        setShoongSending(true)
                        setShoongResult(null)
                        try {
                          const res = await fetch('/api/tools/shoong-send', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                            },
                            body: JSON.stringify(buildShoongPayload())
                          })
                          const data = await res.json()
                          setShoongResult({ mode: '🖥️ Vercel 서버', httpStatus: res.status, ...data })
                        } catch (e) {
                          setShoongResult({ mode: '🖥️ Vercel 서버', error: e.message })
                        } finally {
                          setShoongSending(false)
                        }
                      }}
                      disabled={shoongSending}
                      style={{
                        flex: '1 1 200px',
                        padding: '12px 18px',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: shoongSending ? 'wait' : 'pointer'
                      }}
                    >
                      🖥️ Vercel 서버에서 발송
                      <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px', fontWeight: '400' }}>권장 · 어디서 눌러도 동일 동작</div>
                    </button>

                    {/* 브라우저 직접 발송 */}
                    <button
                      onClick={async () => {
                        if (!shoongApiKey) {
                          setShoongResult({ mode: '🌐 브라우저 직접', error: 'API 키를 먼저 입력하세요.' })
                          return
                        }
                        setShoongSending(true)
                        setShoongResult(null)
                        try {
                          const res = await fetch('https://api.shoong.kr/send', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${shoongApiKey}`
                            },
                            body: JSON.stringify(buildShoongPayload())
                          })
                          const text = await res.text()
                          let parsed; try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }
                          setShoongResult({
                            mode: '🌐 브라우저 직접',
                            httpStatus: res.status,
                            ok: res.ok,
                            response: parsed
                          })
                        } catch (e) {
                          // CORS 차단 가능성 — 그래도 요청은 슝에 도달했을 수 있음
                          setShoongResult({
                            mode: '🌐 브라우저 직접',
                            error: e.message,
                            note: 'CORS 차단일 수 있습니다 (요청은 슝에 도달했을 수 있음, 응답을 못 읽는 상태). 정확한 결과는 curl로 확인 권장.'
                          })
                        } finally {
                          setShoongSending(false)
                        }
                      }}
                      disabled={shoongSending}
                      style={{
                        flex: '1 1 200px',
                        padding: '12px 18px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: shoongSending ? 'wait' : 'pointer'
                      }}
                    >
                      🌐 브라우저(내 PC)에서 직접 발송
                      <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px', fontWeight: '400' }}>회사 고정 IP 등록 시 200 기대</div>
                    </button>

                    {/* curl 복사 */}
                    <button
                      onClick={() => {
                        const apiKeyForCurl = shoongApiKey || 'ak_YOUR_KEY'
                        // Windows cmd 호환: 한 줄 + JSON 내부 큰따옴표를 \" 로 이스케이프, 전체는 큰따옴표로 감쌈
                        const payloadEscaped = JSON.stringify(buildShoongPayload()).replace(/"/g, '\\"')
                        const curl = `curl -X POST https://api.shoong.kr/send -H "Content-Type: application/json" -H "Authorization: Bearer ${apiKeyForCurl}" -d "${payloadEscaped}"`
                        navigator.clipboard.writeText(curl)
                        setShoongCurlCopied(true)
                        setTimeout(() => setShoongCurlCopied(false), 2000)
                      }}
                      style={{
                        flex: '1 1 200px',
                        padding: '12px 18px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      📋 {shoongCurlCopied ? 'curl 복사됨!' : 'curl 명령 복사'}
                      <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px', fontWeight: '400' }}>터미널에서 실행 → 내 PC IP로 발송</div>
                    </button>
                  </div>

                  {/* 결과 출력 */}
                  {shoongResult && (
                    <div style={{
                      padding: '16px 18px',
                      background: shoongResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${shoongResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      borderRadius: '12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: shoongResult.ok ? '#10b981' : '#ef4444' }}>
                          {shoongResult.ok ? '✅ 성공' : '❌ 실패'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{shoongResult.mode}</span>
                        {shoongResult.httpStatus && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', color: '#fff', fontFamily: 'monospace' }}>
                            HTTP {shoongResult.httpStatus}
                          </span>
                        )}
                      </div>
                      {shoongResult.error && (
                        <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '8px' }}>
                          에러: {shoongResult.error}
                        </div>
                      )}
                      {shoongResult.note && (
                        <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '8px' }}>
                          💡 {shoongResult.note}
                        </div>
                      )}
                      {shoongResult.response && (
                        <pre style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          background: 'rgba(0,0,0,0.4)',
                          padding: '10px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          maxHeight: '300px',
                          margin: 0
                        }}>{JSON.stringify(shoongResult.response, null, 2)}</pre>
                      )}
                      {shoongResult.sentPayload && (
                        <details style={{ marginTop: '10px' }}>
                          <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#a3a3a3', fontWeight: '500' }}>
                            🔍 실제 슝에 전송된 페이로드 (디버그)
                          </summary>
                          <pre style={{
                            fontSize: '11px',
                            color: '#fbbf24',
                            background: 'rgba(0,0,0,0.4)',
                            padding: '10px',
                            borderRadius: '6px',
                            overflow: 'auto',
                            maxHeight: '300px',
                            margin: '8px 0 0 0',
                            border: '1px solid rgba(251,191,36,0.2)'
                          }}>{JSON.stringify(shoongResult.sentPayload, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  {/* 대량 발송 (FreeCourse 검색 → 신청자 일괄 발송) */}
                  {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                  <div style={{
                    marginTop: '32px',
                    padding: '24px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(139,92,246,0.06))',
                    border: '1px solid rgba(139,92,246,0.3)',
                    borderRadius: '14px'
                  }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: '#c4b5fd' }}>
                      📢 대량 발송 (실전)
                    </h3>
                    <p style={{ color: '#a3a3a3', fontSize: '12px', marginBottom: '18px', lineHeight: 1.6 }}>
                      FreeCourse를 검색해서 선택 → 해당 강의 신청자들의 <b>이름·전화번호</b>는 nlab DB에서 자동으로 채워 일괄 발송합니다. 변수 4개(유튜브링크/강좌명/강사명/링크명)만 직접 입력하세요.
                    </p>

                    {/* 1. 검색창 */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: '500' }}>
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
                              const token = localStorage.getItem('authToken') || ''
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
                              const token = localStorage.getItem('authToken') || ''
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
                            color: '#fff', fontSize: '13px', fontWeight: '600',
                            cursor: shoongBulkSearching ? 'not-allowed' : 'pointer',
                            opacity: shoongBulkSearching ? 0.6 : 1
                          }}
                        >
                          {shoongBulkSearching ? '검색 중...' : '검색'}
                        </button>
                      </div>
                    </div>

                    {/* 2. 검색 결과 리스트 */}
                    {shoongBulkCourses.length > 0 && (() => {
                      const selectedCount = shoongBulkSelectedIds.length
                      const totalApplicants = shoongBulkCourses
                        .filter(c => shoongBulkSelectedIds.includes(c.id))
                        .reduce((sum, c) => sum + (c.applicantCount || 0), 0)
                      const allSelected = shoongBulkCourses.length > 0 && shoongBulkSelectedIds.length === shoongBulkCourses.length
                      return (
                        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.25)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {/* 전체 선택/해제 버튼 (큼직하게, 상단 별도 줄) */}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <button
                              type="button"
                              onClick={() => setShoongBulkSelectedIds(shoongBulkCourses.map(c => c.id))}
                              disabled={allSelected}
                              style={{
                                flex: 1, padding: '8px 12px',
                                background: allSelected ? 'rgba(139,92,246,0.1)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px',
                                color: allSelected ? '#64748b' : '#fff',
                                fontSize: '12px', fontWeight: '600',
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
                                border: `1px solid ${selectedCount === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.4)'}`,
                                borderRadius: '8px',
                                color: selectedCount === 0 ? '#64748b' : '#fca5a5',
                                fontSize: '12px', fontWeight: '600',
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
                                    border: `1px solid ${checked ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
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
                                  <span style={{ color: '#34d399', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
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
                      <div style={{ marginBottom: '16px', padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        검색 결과가 없습니다. (Enter 또는 검색 버튼으로 조회)
                      </div>
                    )}

                    {/* 3. 변수 입력 (선택된 강의가 있을 때만) */}
                    {shoongBulkSelectedIds.length > 0 && (() => {
                      const TPL = {
                        'start(1)': ['유튜브링크', '강좌명', '강사명', '링크명'],
                        'start(2)': ['유튜브링크', '강좌명', '강사님', '링크명'],
                        'start(3)': ['시청자수', '유튜브링크', '강좌명', '강사님', '링크명']
                      }
                      const tplVars = TPL[shoongBulkTplCode] || []
                      return (
                        <>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: '500' }}>
                              📋 템플릿 코드
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {Object.keys(TPL).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setShoongBulkTplCode(t)}
                                  style={{
                                    padding: '6px 14px',
                                    background: shoongBulkTplCode === t ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${shoongBulkTplCode === t ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                    borderRadius: '7px',
                                    color: shoongBulkTplCode === t ? '#fff' : '#94a3b8',
                                    fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                                  }}
                                >{t}</button>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                            {tplVars.map(v => (
                              <div key={v}>
                                <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '500' }}>
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
                          {(() => {
                            // datetime-local 입력은 로컬 타임존 기준 "YYYY-MM-DDTHH:mm"을 받음.
                            const toLocalInputValue = (date) => {
                              const pad = (n) => String(n).padStart(2, '0')
                              return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
                            }
                            const now = new Date()
                            const minLead = new Date(now.getTime() + 5 * 60 * 1000) // 기본 +5분으로 채움
                            const reservedDate = shoongBulkReservedAt ? new Date(shoongBulkReservedAt) : null
                            const leadMinutes = reservedDate ? Math.round((reservedDate.getTime() - now.getTime()) / 60000) : null
                            // 알림톡은 1분 후 예약도 보통 잘 잡힘. 0분 이하만 경고.
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
                              <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px', fontWeight: '500' }}>
                                  ⏰ 발송 시간
                                </label>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {['immediate', 'reserved'].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setShoongBulkSendMode(m)
                                        // 예약 모드 진입 시 비어있으면 +10분으로 자동 세팅
                                        if (m === 'reserved' && !shoongBulkReservedAt) {
                                          setShoongBulkReservedAt(toLocalInputValue(minLead))
                                        }
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        background: shoongBulkSendMode === m ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${shoongBulkSendMode === m ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
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
                                    {/* 빠른 프리셋 */}
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
                                    {/* 검증 안내 */}
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
                            )
                          })()}

                          {/* 🧪 테스트 모드 박스 (대참사 방지) */}
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
                              <span style={{ fontSize: '13px', fontWeight: '700', color: shoongBulkTestMode ? '#fbbf24' : '#f87171' }}>
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

                          {/* 발송 버튼들 */}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              disabled={shoongBulkSending}
                              onClick={async () => {
                                setShoongBulkSending(true)
                                setShoongBulkResult(null)
                                try {
                                  const token = localStorage.getItem('authToken') || ''
                                  const tplVarsForSend = TPL[shoongBulkTplCode] || []
                                  const variables = {}
                                  for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                  const res = await fetch('/api/tools/shoong-bulk/send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({
                                      courseIds: shoongBulkSelectedIds,
                                      templatecode: shoongBulkTplCode,
                                      variables,
                                      dryRun: true
                                    })
                                  })
                                  const data = await res.json()
                                  setShoongBulkResult({ ...data, _httpStatus: res.status, _dryRun: true })
                                } catch (err) {
                                  setShoongBulkResult({ error: err.message })
                                } finally {
                                  setShoongBulkSending(false)
                                }
                              }}
                              style={{
                                padding: '10px 18px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                color: '#cbd5e1', fontSize: '13px', fontWeight: '600',
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
                                  // 실전 모드 — 2단계 컨펌
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
                                try {
                                  const token = localStorage.getItem('authToken') || ''
                                  const tplVarsForSend = TPL[shoongBulkTplCode] || []
                                  const variables = {}
                                  for (const v of tplVarsForSend) variables[v] = (shoongBulkVars[v] || '').trim()
                                  const body = {
                                    courseIds: shoongBulkSelectedIds,
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
                                  const res = await fetch('/api/tools/shoong-bulk/send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify(body)
                                  })
                                  const data = await res.json()
                                  setShoongBulkResult({ ...data, _httpStatus: res.status })
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
                                color: '#fff', fontSize: '13px', fontWeight: '700',
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
                      )
                    })()}

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
                              <span style={{ marginLeft: '6px', padding: '2px 8px', background: 'rgba(251,191,36,0.2)', color: '#fbbf24', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>🧪 테스트 모드</span>
                            )}<br/>
                            {shoongBulkResult.testMode && (
                              <>• 테스트 번호 <b style={{ color: '#fbbf24' }}>{shoongBulkResult.testMode.testPhone}</b>로 {shoongBulkResult.testMode.limit}건 발송 (실제 신청자 {shoongBulkResult.testMode.realRecipientCount?.toLocaleString()}명은 발송 안 됨)<br/></>
                            )}
                            • 대상: <b style={{ color: '#fff' }}>{shoongBulkResult.recipientCount?.toLocaleString()}명</b> ·
                            성공 <b style={{ color: '#34d399' }}>{shoongBulkResult.sent}</b> ·
                            실패 <b style={{ color: '#f87171' }}>{shoongBulkResult.failed}</b>
                            {shoongBulkResult.reservedTime && <><br/>• 예약 시간: <b>{shoongBulkResult.reservedTime}</b></>}
                            {shoongBulkResult.errors?.length > 0 && (
                              <details style={{ marginTop: '8px' }}>
                                <summary style={{ cursor: 'pointer', color: '#fbbf24' }}>실패 샘플 ({shoongBulkResult.errors.length}건)</summary>
                                <pre style={{ fontSize: '11px', color: '#fca5a5', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: '6px 0 0 0' }}>{JSON.stringify(shoongBulkResult.errors, null, 2)}</pre>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 도움말 */}
                  <details style={{ fontSize: '12px', color: '#94a3b8', marginTop: '24px' }}>
                    <summary style={{ cursor: 'pointer', padding: '6px 0' }}>📖 결과 해석 가이드</summary>
                    <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', lineHeight: 1.7 }}>
                      <div><b>HTTP 200 / success:true</b> → 발송 성공. 수신자에게 알림톡 도착.</div>
                      <div><b>HTTP 400</b> → 파라미터 오류 (필드 값 확인).</div>
                      <div><b>HTTP 401</b> → API 키 잘못됨 또는 누락.</div>
                      <div><b>HTTP 403</b> → <b>IP 차단</b>. 호출한 IP가 슝에 등록 안 됨. 회사 IP를 슝 개발자도구에서 등록하거나 다른 호출 경로 검토.</div>
                      <div><b>HTTP 404</b> → 템플릿 코드(<code>templatecode</code>)가 슝에 없음.</div>
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <b>모드별 발송 IP</b>:<br/>
                        🖥️ Vercel 서버 → Vercel 서버 IP (가변, 보통 미등록)<br/>
                        🌐 브라우저 직접 → 이 PC가 인터넷으로 나갈 때의 공인 IP (회사 고정 IP)<br/>
                        📋 curl → 터미널 실행한 PC의 공인 IP
                      </div>
                    </div>
                  </details>
                </div>
              )}
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

                    const directBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL
                    let response
                    if (directBackendUrl) {
                      response = await fetch(`${directBackendUrl}/api/analyze`, {
                        method: 'POST',
                        body: formData
                      })
                    } else {
                      const token = localStorage.getItem('authToken')
                      response = await fetch('/api/lecture-analyze-gemini', {
                        method: 'POST',
                        headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                        body: formData
                      })
                    }

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
                            <span>{new Date(item.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
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
                                  const text = `--- 무료강의 분석 결과 ---\n영상: ${fullItem.video_title || ''}\nURL: ${fullItem.youtube_url || ''}\n분석일: ${new Date(fullItem.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n${fullItem.analysis}`
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

                    {/* 신청자 파일 업로드 */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: '10px',
                      border: '2px dashed rgba(99,102,241,0.25)',
                      textAlign: 'center',
                      marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '28px', marginBottom: '6px' }}>📥</div>
                      <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>신청자 데이터</p>
                      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '10px' }}>D열=전화번호, E열=신청일, 파일명=유입경로 (Excel/CSV, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={(e) => { setPayerMatchFiles(Array.from(e.target.files)); setPayerMatchResult(null) }}
                        style={{ display: 'none' }}
                        id="payer-match-file"
                      />
                      <label
                        htmlFor="payer-match-file"
                        style={{
                          display: 'inline-block',
                          padding: '7px 16px',
                          background: 'rgba(99,102,241,0.3)',
                          borderRadius: '6px',
                          color: '#a5b4fc',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >파일 선택</label>
                      {payerMatchFiles.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#10b981', maxHeight: '60px', overflow: 'auto' }}>
                          {payerMatchFiles.map((f, i) => <div key={i}>✓ {f.name}</div>)}
                        </div>
                      )}
                    </div>

                    {/* 매칭 버튼 */}
                    <button
                      onClick={async () => {
                        if (!payerSheetSelectedTab) {
                          alert('결제자 시트를 선택해주세요.')
                          return
                        }
                        if (payerMatchFiles.length === 0) {
                          alert('신청자 파일을 선택해주세요.')
                          return
                        }
                        setPayerMatchProcessing(true)
                        setPayerMatchLog(['처리 시작...'])
                        setPayerMatchResult(null)

                        const formData = new FormData()
                        payerMatchFiles.forEach(f => formData.append('applicants', f))
                        formData.append('year', payerSheetYear)
                        formData.append('tabName', payerSheetSelectedTab.raw)

                        try {
                          const token = localStorage.getItem('authToken')
                          const res = await fetch('/api/tools/payer-match', {
                            method: 'POST',
                            headers: { 'Authorization': token ? `Bearer ${token}` : '' },
                            body: formData
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
                      disabled={payerMatchProcessing || !payerSheetSelectedTab || payerMatchFiles.length === 0}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: payerMatchProcessing ? '#4c4c6d' : (!payerSheetSelectedTab || payerMatchFiles.length === 0) ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none',
                        borderRadius: '10px',
                        color: (!payerSheetSelectedTab || payerMatchFiles.length === 0) ? '#64748b' : '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: payerMatchProcessing ? 'wait' : (!payerSheetSelectedTab || payerMatchFiles.length === 0) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {payerMatchProcessing ? '매칭 처리 중...' : '🔄 매칭 시작'}
                    </button>

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
                            onClick={() => { setPayerMatchResult(null); setPayerMatchLog([]); setPayerMatchFiles([]) }}
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

          {/* 권한 설정 탭 (jinwoo 전용) */}
          {currentTab === 'admin-permissions' && loginId === 'jinwoo' && (
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>
                  🔐 권한 설정
                </h2>
                <p style={{ color: '#64748b', fontSize: '13px' }}>가입된 계정별로 접근 가능한 기능을 설정합니다.</p>
              </div>

              {permLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>불러오는 중...</div>
              ) : (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px',
                  overflow: 'hidden'
                }}>
                  {/* 테이블 헤더 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)'
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>이름</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>아이디</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>권한 수</span>
                  </div>

                  {permUsers.map((user, idx) => {
                    const isSuper = user.isSuperAdmin
                    const editFeatures = permEditMap[user.id] || user.features
                    const isExpanded = permExpandedUser === user.id
                    const enabledCount = isSuper ? permAllFeatures.length : editFeatures.length

                    return (
                      <div key={user.id} style={{
                        borderBottom: idx < permUsers.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none'
                      }}>
                        {/* 행 (클릭 가능) */}
                        <div
                          onClick={() => setPermExpandedUser(isExpanded ? null : user.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            padding: '14px 20px',
                            cursor: 'pointer',
                            alignItems: 'center',
                            background: isExpanded ? 'rgba(99,102,241,0.08)' : 'transparent',
                            transition: 'background 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              width: '32px', height: '32px', borderRadius: '50%',
                              background: isSuper ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '13px', fontWeight: '700', color: '#fff', flexShrink: 0
                            }}>
                              {(user.name || user.username || '?')[0].toUpperCase()}
                            </span>
                            <span style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0' }}>
                              {user.name || user.username}
                              {isSuper && <span style={{ marginLeft: '8px', fontSize: '10px', background: 'rgba(99,102,241,0.3)', padding: '2px 8px', borderRadius: '10px', color: '#a5b4fc' }}>최고 관리자</span>}
                            </span>
                          </div>
                          <span style={{ fontSize: '13px', color: '#94a3b8' }}>@{user.username}</span>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                            <span style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '600' }}>
                              {enabledCount} / {permAllFeatures.length}
                            </span>
                            <span style={{
                              fontSize: '12px', color: '#64748b',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s'
                            }}>▼</span>
                          </div>
                        </div>

                        {/* 펼침 영역 */}
                        {isExpanded && (
                          <div style={{
                            padding: '16px 20px',
                            background: 'rgba(99,102,241,0.04)',
                            borderTop: '1px solid rgba(255,255,255,0.06)'
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: !isSuper ? '16px' : '0' }}>
                              {permAllFeatures.map(f => {
                                const checked = isSuper ? true : editFeatures.includes(f.key)
                                return (
                                  <label key={f.key} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: checked ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                    cursor: isSuper ? 'default' : 'pointer',
                                    opacity: isSuper ? 0.7 : 1,
                                    transition: 'all 0.2s'
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={isSuper}
                                      onChange={() => {
                                        if (isSuper) return
                                        setPermEditMap(prev => {
                                          const current = prev[user.id] || [...user.features]
                                          const next = current.includes(f.key)
                                            ? current.filter(k => k !== f.key)
                                            : [...current, f.key]
                                          return { ...prev, [user.id]: next }
                                        })
                                      }}
                                      style={{ accentColor: '#6366f1', width: '16px', height: '16px' }}
                                    />
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: '600', color: checked ? '#a5b4fc' : 'rgba(255,255,255,0.6)' }}>{f.label}</div>
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>{f.desc}</div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                            {!isSuper && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={async () => {
                                    setPermSaving(user.id)
                                    try {
                                      const res = await fetch('/api/user-permissions', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          action: 'save-permissions',
                                          requestLoginId: loginId,
                                          userId: user.id,
                                          features: editFeatures
                                        })
                                      })
                                      const data = await res.json()
                                      if (data.success) {
                                        setPermUsers(prev => prev.map(u => u.id === user.id ? { ...u, features: [...editFeatures] } : u))
                                      } else {
                                        alert(data.error || '저장 실패')
                                      }
                                    } catch (e) { alert('저장 중 오류') }
                                    setPermSaving(null)
                                  }}
                                  disabled={permSaving === user.id}
                                  style={{
                                    padding: '8px 24px',
                                    background: permSaving === user.id ? '#4c4c6d' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: 'none', borderRadius: '10px',
                                    color: '#fff', fontSize: '13px', fontWeight: '600',
                                    cursor: permSaving === user.id ? 'wait' : 'pointer'
                                  }}
                                >
                                  {permSaving === user.id ? '저장 중...' : '저장'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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
        const CustomChartTooltip = ({ active, payload, label, chartConfig }) => {
          if (!active || !payload?.length) return null
          return (
            <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '12px 16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: chartConfig.color, fontWeight: '600' }}>{chartConfig.format(payload[0]?.value)}</div>
            </div>
          )
        }
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
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={validData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                              <defs>
                                <linearGradient id={`cg-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={metric.gradient[0]} stopOpacity={0.9} />
                                  <stop offset="100%" stopColor={metric.gradient[1]} stopOpacity={0.6} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} interval={0} />
                              <YAxis tickFormatter={metric.yFormat} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                              <Tooltip content={<CustomChartTooltip chartConfig={metric} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                              <Bar dataKey={metric.key} fill={`url(#cg-${metric.key})`} radius={[4, 4, 0, 0]} maxBarSize={52}>
                                {validData.map((d, idx) => {
                                  const isBest = d[metric.key] === bestVal
                                  return <Cell key={idx} fill={isBest ? metric.gradient[0] : `url(#cg-${metric.key})`} stroke={isBest ? metric.color : 'none'} strokeWidth={isBest ? 2 : 0} />
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
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
                  <span>{new Date(laViewItem.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 완료</span>
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
                    const text = `--- 무료강의 분석 결과 ---\n영상: ${laViewItem.video_title || ''}\nURL: ${laViewItem.youtube_url || ''}\n분석일: ${new Date(laViewItem.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n${laViewItem.analysis}`
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