'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'
import HelpTooltip from './HelpTooltip'

export default function Dashboard({ onLogout, userName, userId, permissions = {} }) {
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
  const [timelineInterval, setTimelineInterval] = useState(10) // 5, 10, 15, 20, 30분
  const [rankingMetric, setRankingMetric] = useState('revenue')
  const [rankingOrder, setRankingOrder] = useState('desc')
  const [showCohortChart, setShowCohortChart] = useState(false)
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

  // 업무 요청 상태
  const [taskTab, setTaskTab] = useState('received') // 'received' | 'sent'
  const [taskSentList, setTaskSentList] = useState([])
  const [taskReceivedList, setTaskReceivedList] = useState([])
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskUsers, setTaskUsers] = useState([])
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [newTask, setNewTask] = useState({ assignee_id: '', title: '', description: '', priority: 'normal', deadline: '' })
  const [taskCreating, setTaskCreating] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(null) // task id
  const [rejectReason, setRejectReason] = useState('')
  const [taskDetailView, setTaskDetailView] = useState(null) // 상세보기용
  const [taskPage, setTaskPage] = useState(1) // 업무 목록 페이지네이션
  const TASKS_PER_PAGE = 8

  // 알림 설정 상태
  const [showNotifSettings, setShowNotifSettings] = useState(false)
  const [notifProfile, setNotifProfile] = useState({ phone: '', slack_email: '' })
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifLoaded, setNotifLoaded] = useState(false)

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
    // 유튜브 채팅 수집 중지
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setYtCollecting(false)
  }

  // API 호출용 인증 헤더 생성
  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    }
  }

  // 업무 목록 로드
  const loadTasks = async () => {
    if (!userId) return
    setTaskLoading(true)
    try {
      const res = await fetch(`/api/tasks?userId=${userId}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTaskSentList(data.sent || [])
      setTaskReceivedList(data.received || [])
    } catch (e) {
      console.error('업무 로드 실패:', e)
    }
    setTaskLoading(false)
  }

  // 직원 목록 로드
  const loadTaskUsers = async () => {
    try {
      const res = await fetch('/api/users', { headers: getAuthHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTaskUsers(data.users || [])
    } catch (e) {
      console.error('직원 목록 로드 실패:', e)
    }
  }

  // 업무 생성
  const createTask = async () => {
    if (!newTask.assignee_id || !newTask.title || !newTask.deadline) return
    setTaskCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...newTask, requester_id: userId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // 생성된 업무를 바로 목록에 추가 (서버 응답 데이터 활용)
      if (data.task) {
        setTaskSentList(prev => [data.task, ...prev])
      } else {
        loadTasks()
      }
      setShowTaskModal(false)
      setNewTask({ assignee_id: '', title: '', description: '', priority: 'normal', deadline: '' })
    } catch (e) {
      console.error('업무 생성 실패:', e)
    }
    setTaskCreating(false)
  }

  // 업무 상태 변경 (낙관적 업데이트)
  const updateTaskStatus = async (taskId, status, rejection_reason) => {
    // 낙관적 업데이트: UI를 먼저 반영
    const prevSent = [...taskSentList]
    const prevReceived = [...taskReceivedList]
    const updateList = (list) => list.map(t => t.id === taskId ? { ...t, status, ...(rejection_reason ? { rejection_reason } : {}) } : t)
    setTaskSentList(updateList(taskSentList))
    setTaskReceivedList(updateList(taskReceivedList))
    setShowRejectModal(null)
    setRejectReason('')
    // 상세보기도 즉시 반영
    if (taskDetailView?.id === taskId) {
      setTaskDetailView(prev => prev ? { ...prev, status, ...(rejection_reason ? { rejection_reason } : {}) } : prev)
    }

    try {
      const body = { id: taskId, status }
      if (rejection_reason) body.rejection_reason = rejection_reason
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('업무 상태 변경 실패')
    } catch (e) {
      // 실패 시 롤백
      console.error('업무 상태 변경 실패:', e)
      setTaskSentList(prevSent)
      setTaskReceivedList(prevReceived)
    }
  }

  // 업무 삭제 (낙관적 업데이트)
  const deleteTask = async (taskId) => {
    if (!confirm('이 업무를 삭제하시겠습니까?')) return
    // 낙관적 업데이트: UI에서 먼저 제거
    const prevSent = [...taskSentList]
    const prevReceived = [...taskReceivedList]
    setTaskSentList(taskSentList.filter(t => t.id !== taskId))
    setTaskReceivedList(taskReceivedList.filter(t => t.id !== taskId))
    setTaskDetailView(null)

    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: taskId })
      })
      if (!res.ok) throw new Error('업무 삭제 실패')
    } catch (e) {
      // 실패 시 롤백
      console.error('업무 삭제 실패:', e)
      setTaskSentList(prevSent)
      setTaskReceivedList(prevReceived)
    }
  }

  // 알림 설정 (연락처) 로드
  const loadNotifProfile = async () => {
    try {
      const res = await fetch(`/api/profile?userId=${userId}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (res.ok && data.profile) {
        setNotifProfile({ phone: data.profile.phone || '', slack_email: data.profile.slack_email || '' })
        setNotifLoaded(true)
      }
    } catch (e) {
      console.error('알림 설정 로드 실패:', e)
    }
  }

  // 알림 설정 (연락처) 저장
  const saveNotifProfile = async () => {
    setNotifSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, ...notifProfile })
      })
      if (!res.ok) throw new Error('저장 실패')
      alert('알림 연락처가 저장되었습니다.')
      setShowNotifSettings(false)
    } catch (e) {
      console.error('알림 설정 저장 실패:', e)
      alert('저장에 실패했습니다.')
    }
    setNotifSaving(false)
  }

  // 마감일까지 남은 일수 계산
  const getDaysUntilDeadline = (deadline) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadlineDate = new Date(deadline)
    deadlineDate.setHours(0, 0, 0, 0)
    return Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24))
  }

  // 마감일 상태 색상
  const getDeadlineColor = (deadline, status) => {
    if (status === 'completed') return '#10b981'
    if (status === 'rejected') return '#64748b'
    const days = getDaysUntilDeadline(deadline)
    if (days < 0) return '#ef4444' // 기한 초과
    if (days === 0) return '#f97316' // 오늘 마감
    if (days <= 2) return '#fbbf24' // 2일 이내
    return '#94a3b8'
  }

  // 마감일 텍스트
  const getDeadlineText = (deadline, status) => {
    if (status === 'completed') return '완료'
    if (status === 'rejected') return '반려'
    const days = getDaysUntilDeadline(deadline)
    if (days < 0) return `${Math.abs(days)}일 초과`
    if (days === 0) return '오늘 마감'
    if (days === 1) return '내일 마감'
    return `${days}일 남음`
  }

  // 우선순위 관련
  const priorityConfig = {
    urgent: { label: '긴급', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    high: { label: '높음', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    normal: { label: '보통', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
    low: { label: '낮음', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' }
  }

  // 상태 관련
  const statusConfig = {
    pending: { label: '대기중', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    in_progress: { label: '진행중', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
    completed: { label: '완료', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    rejected: { label: '반려', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
  }

  // 로그인 시 업무 데이터 로드 (알림 뱃지용) - 토큰 준비 대기 후 조용히 로드
  useEffect(() => {
    if (userId && localStorage.getItem('authToken')) {
      loadTasks().catch(() => {})
    }
  }, [userId])

  useEffect(() => {
    loadSessions()
    loadInstructors()

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
    const { data } = await supabase.from('purchase_timeline').select('*').eq('session_id', selectedSessionId).order('hour', { ascending: true })

    // 기존 데이터가 구버전인지 확인 - 두번째 항목이 5가 아니면 구버전
    const isOldFormat = data && data.length > 1 && data[1]?.hour !== 5

    // 새 형식 데이터가 있으면 그대로 사용
    if (data && data.length > 0 && !isOldFormat) {
      setPurchaseTimeline(data)
      return
    }

    // 데이터 없으면 빈 배열로 초기화
    if (!data || data.length === 0) {
      setPurchaseTimeline([])
    }

    // 구버전 데이터는 무시하고 항상 새로 분석 (autoAnalyzedRef는 데이터 없는 경우에만 체크)
    const needsAnalysis = isOldFormat || !data || data.length === 0
    if (!needsAnalysis) return

    // 데이터 없는 경우에만 중복 분석 방지
    if (!isOldFormat && autoAnalyzedRef.current.has(selectedSessionId)) {
      return
    }
    autoAnalyzedRef.current.add(selectedSessionId)

    const session = sessions.find(s => s.id === selectedSessionId)
    if (!session || !session.free_class_date) {
      // 무료강의 날짜 없으면 구버전 데이터라도 표시
      if (data && data.length > 0) setPurchaseTimeline(data)
      return
    }

    const tabName = `${session.instructors?.name} ${session.session_name}`
    try {
      const response = await fetch('/api/sales-analysis', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tabName,
          freeClassDate: session.free_class_date,
          sessionId: selectedSessionId
        })
      })
      const result = await response.json()
      if (result.success) {
        const { data: newData } = await supabase.from('purchase_timeline').select('*').eq('session_id', selectedSessionId).order('hour', { ascending: true })
        if (newData) setPurchaseTimeline(newData)
      } else if (data && data.length > 0) {
        // 분석 실패시 기존 데이터 표시
        setPurchaseTimeline(data)
      }
    } catch (e) {
      // 탭이 없거나 데이터 없으면 기존 데이터라도 표시
      if (data && data.length > 0) setPurchaseTimeline(data)
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>데이터 로딩 중...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
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

      {/* 사이드바 - 글래스모피즘 */}
      <div style={{
        width: isMobile ? '240px' : (sidebarCollapsed ? '100px' : '240px'),
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        ...(isMobile ? {
          position: 'fixed',
          top: 0,
          left: mobileMenuOpen ? 0 : '-250px',
          height: '100vh',
          zIndex: 999
        } : {})
      }}>
        <div style={{ padding: sidebarCollapsed && !isMobile ? '0 10px' : '0 20px', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {sidebarCollapsed && !isMobile ? (
            <span style={{ fontSize: '24px' }}>📊</span>
          ) : (
            <h1 style={{ fontSize: '18px', fontWeight: '700', background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📊 강의 통합 관리</h1>
          )}
          {/* 사이드바 토글 버튼 */}
          {!isMobile && (
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                padding: '6px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                transform: sidebarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
              title={sidebarCollapsed ? '사이드바 열기' : '사이드바 닫기'}
            >
              ◀
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{
                padding: '6px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <button onClick={() => { setCurrentTab('dashboard'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'dashboard' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'dashboard' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'dashboard' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'dashboard' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="대시보드">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>📈</span>
            대시보드
          </button>
          <button onClick={() => { setCurrentTab('detail'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'detail' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'detail' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'detail' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'detail' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="상세 정보">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>📝</span>
            상세 정보
          </button>
          <button onClick={() => { setCurrentTab('ranking'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'ranking' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'ranking' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'ranking' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'ranking' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="랭킹">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>🏆</span>
            랭킹
          </button>
          <button onClick={() => { setCurrentTab('compare'); resetToolState(); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'compare' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'compare' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'compare' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'compare' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="대조">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>⚖️</span>
            대조
          </button>

          {/* 구분선 */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 16px' }} />

          {/* 툴 메뉴 */}
          <button onClick={() => { setCurrentTab('tools'); resetToolState(); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'tools' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'tools' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'tools' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'tools' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="툴">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>🛠️</span>
            툴
          </button>

          {/* 시트 통합 메뉴 */}
          <button onClick={() => { setCurrentTab('resources'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'resources' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'resources' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'resources' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'resources' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="시트 통합">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>📁</span>
            시트 통합
          </button>

          {/* CS AI 메뉴 */}
          <button onClick={() => { setCurrentTab('cs-ai'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'cs-ai' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'cs-ai' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'cs-ai' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'cs-ai' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease'
          }} title="CS AI">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>🤖</span>
            CS AI
          </button>

          {/* 무료강의 분석기 메뉴 */}
          <button onClick={async () => {
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
          }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'lecture-analyzer' ? 'rgba(99,102,241,0.2)' : laProcessing ? 'rgba(99,102,241,0.08)' : 'transparent',
            backdropFilter: currentTab === 'lecture-analyzer' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'lecture-analyzer' ? '3px solid #818cf8' : laProcessing ? '3px solid #6366f1' : '3px solid transparent',
            color: currentTab === 'lecture-analyzer' ? '#a5b4fc' : laProcessing ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease',
            position: 'relative'
          }} title="무료강의 분석기">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>🎓</span>
            {sidebarCollapsed ? '강의분석' : '무료강의 분석기'}
            {laProcessing && (
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#818cf8',
                animation: 'laPulse 1.5s ease-in-out infinite',
                marginLeft: sidebarCollapsed ? '0' : 'auto',
                position: sidebarCollapsed ? 'absolute' : 'static',
                top: sidebarCollapsed ? '6px' : 'auto',
                right: sidebarCollapsed ? '6px' : 'auto'
              }} />
            )}
          </button>

          {/* 업무 관리 메뉴 */}
          <button onClick={() => {
            setCurrentTab('tasks');
            if(isMobile) setMobileMenuOpen(false);
            loadTasks();
            loadTaskUsers();
          }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '10px 8px' : '14px 20px',
            background: currentTab === 'tasks' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'tasks' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'tasks' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'tasks' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: sidebarCollapsed ? '11px' : '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '4px' : '10px',
            transition: 'all 0.3s ease',
            position: 'relative'
          }} title="업무 관리">
            <span style={{ fontSize: sidebarCollapsed ? '18px' : '14px' }}>📋</span>
            {sidebarCollapsed ? '업무' : '업무'}
            {taskReceivedList.filter(t => t.status === 'pending' || (t.status !== 'completed' && t.status !== 'rejected' && getDaysUntilDeadline(t.deadline) <= 1)).length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '10px',
                padding: '1px 6px',
                minWidth: '18px',
                textAlign: 'center',
                marginLeft: sidebarCollapsed ? '0' : 'auto',
                position: sidebarCollapsed ? 'absolute' : 'static',
                top: sidebarCollapsed ? '4px' : 'auto',
                right: sidebarCollapsed ? '4px' : 'auto'
              }}>
                {taskReceivedList.filter(t => t.status === 'pending' || (t.status !== 'completed' && t.status !== 'rejected' && getDaysUntilDeadline(t.deadline) <= 1)).length}
              </span>
            )}
          </button>
        </div>
      </div>

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
            background: 'rgba(15,15,26,0.95)',
            backdropFilter: 'blur(10px)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            zIndex: 100
          }}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ☰
            </button>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#a5b4fc' }}>📊 강의 관리</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => { setCurrentTab('tasks'); setMobileMenuOpen(false); loadTasks(); loadTaskUsers() }}
                style={{
                  position: 'relative',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🔔
                {taskReceivedList.filter(t => t.status === 'pending').length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    width: '16px',
                    height: '16px',
                    background: '#ef4444',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: '700',
                    color: '#fff',
                    border: '2px solid #1a1a2e'
                  }}>
                    {taskReceivedList.filter(t => t.status === 'pending').length}
                  </span>
                )}
              </button>
              <button onClick={handleLogoutWithConfirm} style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
                로그아웃
              </button>
            </div>
          </div>
        )}

        {/* 우측 상단 환영 메시지 + 알림 + 로그아웃 - 글래스모피즘 */}
        {!isMobile && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '16px 32px 0', maxWidth: '1200px', margin: '0 auto' }}>
          {userName && (
            <div style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ color: '#a5b4fc', fontSize: '14px' }}><strong>{userName}</strong>님 반갑습니다 👋</span>
            </div>
          )}
          {/* 알림 버튼 */}
          <button
            onClick={() => { setCurrentTab('tasks'); loadTasks(); loadTaskUsers() }}
            style={{
              position: 'relative',
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="업무 알림"
          >
            🔔
            {taskReceivedList.filter(t => t.status === 'pending').length > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: taskReceivedList.filter(t => t.status === 'pending').length > 9 ? '20px' : '18px',
                height: '18px',
                background: '#ef4444',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: '700',
                color: '#fff',
                boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                border: '2px solid #1a1a2e'
              }}>
                {taskReceivedList.filter(t => t.status === 'pending').length}
              </span>
            )}
          </button>
          <button onClick={handleLogoutWithConfirm} style={{ padding: '10px 18px', background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#f87171', cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.3s ease' }}>
            로그아웃
          </button>
        </div>}
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
                  onClick={() => setShowCohortChart(true)}
                  style={{
                    padding: '7px 14px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(99,102,241,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  📊 기수별 차트
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '16px', marginBottom: '24px' }}>
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
                      {sheetData?.purchaseConversionRate ? `${(sheetData.purchaseConversionRate * 100).toFixed(2)}%` : `${purchaseConversionRate}%`}
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
                conversionRate: d.purchaseConversionRate ? parseFloat((d.purchaseConversionRate * 100).toFixed(2)) : 0
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
              { label: '구매전환율', key: 'conversionRate', format: v => (v * 100).toFixed(2) + '%', higherBetter: true, calc: d => d.purchaseConversionRate },
              { label: '전환비용', key: 'conversionCost', format: v => formatNumber(v) + '원', higherBetter: false },
              { label: 'GDN 전환단가', key: 'gdnConvCost', format: v => formatNumber(Math.round(v)) + '원', higherBetter: false },
              { label: '메타 전환단가', key: 'metaConvCost', format: v => formatNumber(Math.round(v)) + '원', higherBetter: false },
              { label: '인당 매출', key: 'revenuePerPurchase', format: v => formatMoney(v), higherBetter: true, calc: d => d.totalPurchases > 0 ? Math.round(d.revenue / d.totalPurchases) : 0 },
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
                  { id: 'crm', icon: '📋', label: 'CRM 정리' },
                  { id: 'kakao', icon: '💬', label: '카톡 매칭' },
                  { id: 'youtube', icon: '📡', label: '유튜브 채팅 로그 수집' }
                ].filter(tool => !tool.requiresPermission || permissions[tool.requiresPermission]).map(tool => (
                  <button
                    key={tool.id}
                    onClick={async () => {
                      setCurrentTool(tool.id)
                      resetToolState()
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
                        onChange={(e) => {
                          const newFiles = Array.from(e.target.files)
                          setToolFiles1(prev => {
                            const existingNames = new Set(prev.map(f => f.name))
                            const unique = newFiles.filter(f => !existingNames.has(f.name))
                            return [...prev, ...unique]
                          })
                          e.target.value = ''
                        }}
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
                          {toolFiles1.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <span>✓ {f.name}</span>
                              <button
                                onClick={() => setToolFiles1(prev => prev.filter((_, idx) => idx !== i))}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}
                              >✕</button>
                            </div>
                          ))}
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
                        onChange={(e) => {
                          const newFiles = Array.from(e.target.files)
                          setToolFiles2(prev => {
                            const existingNames = new Set(prev.map(f => f.name))
                            const unique = newFiles.filter(f => !existingNames.has(f.name))
                            return [...prev, ...unique]
                          })
                          e.target.value = ''
                        }}
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
                          {toolFiles2.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <span>✓ {f.name}</span>
                              <button
                                onClick={() => setToolFiles2(prev => prev.filter((_, idx) => idx !== i))}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}
                              >✕</button>
                            </div>
                          ))}
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

                  <div style={{
                    padding: '20px',
                    background: 'rgba(99,102,241,0.1)',
                    borderRadius: '12px',
                    border: '2px dashed rgba(99,102,241,0.3)',
                    textAlign: 'center',
                    marginBottom: '20px'
                  }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                    <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>CRM 데이터</p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>정리할 CRM 데이터 (Excel/CSV, 여러개 가능)</p>
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

                      const formData = new FormData()
                      toolFiles1.forEach(f => formData.append('files', f))

                      try {
                        const res = await fetch('/api/tools/crm-cleanup', {
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

              {/* 카톡 매칭 툴 */}
              {currentTool === 'kakao' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>💬 카카오톡 입장자 매칭 <HelpTooltip text={"카카오톡 오픈채팅 입장 로그와\n결제자 데이터를 이름 기준으로 매칭합니다.\n좌측에 카톡 로그(TXT), 우측에 결제자\n파일을 업로드하세요.\n매칭/미매칭 결과를 확인하고\nExcel로 다운로드할 수 있습니다."} /></h3>
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>카카오톡 오픈채팅 입장 로그와 결제자 데이터를 매칭합니다.</p>
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
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>오픈채팅 입장 내역 (TXT/Excel, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".txt,.xlsx,.xls,.csv"
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

                    {/* 결제자 파일 */}
                    <div style={{
                      padding: '20px',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: '12px',
                      border: '2px dashed rgba(168,85,247,0.3)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>💳</div>
                      <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>결제자 데이터</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>결제자 이름/연락처 (Excel/CSV, 여러개 가능)</p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={(e) => setToolFiles2(Array.from(e.target.files))}
                        style={{ display: 'none' }}
                        id="kakao-file2"
                      />
                      <label
                        htmlFor="kakao-file2"
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
                      toolFiles1.forEach(f => formData.append('kakaoLogs', f))
                      toolFiles2.forEach(f => formData.append('payers', f))

                      try {
                        const res = await fetch('/api/tools/kakao-match', {
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
                      background: toolProcessing ? '#4c4c6d' : 'linear-gradient(135deg, #facc15, #f59e0b)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#000',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: toolProcessing ? 'wait' : 'pointer'
                    }}
                  >
                    {toolProcessing ? '처리 중...' : '💬 매칭 시작'}
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
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{toolResult.matched}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>매칭됨</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#f87171' }}>{toolResult.unmatched}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>미매칭</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#fcd34d' }}>{toolResult.totalKakao}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>카톡 입장자</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => {
                            const link = document.createElement('a')
                            link.href = toolResult.downloadUrl
                            link.download = 'kakao_matched.xlsx'
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
        </div>

        {/* ==================== 업무 관리 탭 ==================== */}
        {currentTab === 'tasks' && (() => {
          const currentList = taskTab === 'received' ? taskReceivedList : taskSentList
          const sortedList = [...currentList].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          const totalPages = Math.max(1, Math.ceil(sortedList.length / TASKS_PER_PAGE))
          const safePage = Math.min(taskPage, totalPages)
          const pagedList = sortedList.slice((safePage - 1) * TASKS_PER_PAGE, safePage * TASKS_PER_PAGE)
          const pendingCount = taskReceivedList.filter(t => t.status === 'pending').length
          const inProgressCount = currentList.filter(t => t.status === 'in_progress').length
          const completedCount = currentList.filter(t => t.status === 'completed').length
          const urgentIncompleteCount = currentList.filter(t => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'rejected').length

          return (
          <div style={{ padding: isMobile ? '16px' : '0 32px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>업무 관리</h2>
                <p style={{ fontSize: '13px', color: '#64748b' }}>팀원에게 업무를 요청하고 진행 상황을 추적합니다</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { if (!notifLoaded) loadNotifProfile(); setShowNotifSettings(true) }}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#94a3b8',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="알림 설정"
                >
                  🔔 알림 설정
                </button>
                <button
                  onClick={() => { setShowTaskModal(true); loadTaskUsers() }}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  + 업무 요청
                </button>
              </div>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(251,191,36,0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(251,191,36,0.15)' }}>
                <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '600', marginBottom: '6px' }}>대기중</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#fbbf24' }}>{pendingCount}</div>
              </div>
              <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(99,102,241,0.15)' }}>
                <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: '600', marginBottom: '6px' }}>진행중</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#a5b4fc' }}>{inProgressCount}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', marginBottom: '6px' }}>완료</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>{completedCount}</div>
              </div>
              <div style={{ background: urgentIncompleteCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.05)', borderRadius: '12px', padding: '16px', border: urgentIncompleteCount > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(239,68,68,0.1)' }}>
                <div style={{ fontSize: '11px', color: '#f87171', fontWeight: '600', marginBottom: '6px' }}>긴급 미완료</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: urgentIncompleteCount > 0 ? '#ef4444' : '#f87171' }}>{urgentIncompleteCount}</div>
              </div>
            </div>

            {/* 탭 전환: 요청받은 / 요청한 */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '4px' }}>
              <button
                onClick={() => { setTaskTab('received'); setTaskPage(1) }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: taskTab === 'received' ? 'rgba(99,102,241,0.3)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: taskTab === 'received' ? '#a5b4fc' : '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                요청받은 업무 ({taskReceivedList.length})
              </button>
              <button
                onClick={() => { setTaskTab('sent'); setTaskPage(1) }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: taskTab === 'sent' ? 'rgba(99,102,241,0.3)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: taskTab === 'sent' ? '#a5b4fc' : '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                요청한 업무 ({taskSentList.length})
              </button>
            </div>

            {/* 정렬 안내 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>최신순 정렬 · {sortedList.length}건</span>
              {totalPages > 1 && <span style={{ fontSize: '12px', color: '#64748b' }}>{safePage} / {totalPages} 페이지</span>}
            </div>

            {/* 업무 목록 */}
            {taskLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>업무를 불러오는 중...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sortedList.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                    <div style={{ color: '#64748b', fontSize: '15px' }}>
                      {taskTab === 'received' ? '요청받은 업무가 없습니다' : '요청한 업무가 없습니다'}
                    </div>
                  </div>
                ) : (
                  pagedList.map(task => {
                    const deadlineColor = getDeadlineColor(task.deadline, task.status)
                    const deadlineText = getDeadlineText(task.deadline, task.status)
                    const daysLeft = getDaysUntilDeadline(task.deadline)
                    const isUrgent = task.status !== 'completed' && task.status !== 'rejected' && daysLeft <= 1
                    const priority = priorityConfig[task.priority] || priorityConfig.normal
                    const statusInfo = statusConfig[task.status] || statusConfig.pending
                    const isDanger = task.priority === 'urgent' && task.status !== 'completed' && task.status !== 'rejected'

                    return (
                      <div
                        key={task.id}
                        onClick={() => setTaskDetailView(task)}
                        style={{
                          background: isDanger
                            ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.08) 100%)'
                            : isUrgent ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
                          borderRadius: '14px',
                          padding: '18px 24px',
                          border: isDanger
                            ? '1px solid rgba(239,68,68,0.4)'
                            : isUrgent ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          boxShadow: isDanger ? '0 0 20px rgba(239,68,68,0.1)' : 'none',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {isDanger && (
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '4px',
                            background: 'linear-gradient(180deg, #ef4444, #dc2626)',
                            boxShadow: '0 0 12px rgba(239,68,68,0.5)'
                          }} />
                        )}

                        <div style={{
                          width: '4px',
                          height: '40px',
                          borderRadius: '4px',
                          background: priority.color,
                          flexShrink: 0,
                          marginLeft: isDanger ? '8px' : 0
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            {isDanger && <span style={{ fontSize: '14px' }}>🚨</span>}
                            <span style={{ fontSize: '15px', fontWeight: '600', color: isDanger ? '#fca5a5' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {task.title}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: statusInfo.color,
                              background: statusInfo.bg,
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}>
                              {statusInfo.label}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: priority.color,
                              background: priority.bg,
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}>
                              {priority.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                            <span>{taskTab === 'received' ? `요청자: ${task.requester?.name || task.requester?.username || '?'}` : `담당자: ${task.assignee?.name || task.assignee?.username || '?'}`}</span>
                            <span>|</span>
                            <span>{new Date(task.created_at).toLocaleDateString('ko-KR')}</span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '700',
                            color: deadlineColor,
                            marginBottom: '2px'
                          }}>
                            {deadlineText}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {task.deadline}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '24px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setTaskPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  style={{
                    padding: '8px 14px',
                    background: safePage <= 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    color: safePage <= 1 ? '#4a5568' : '#94a3b8',
                    fontSize: '13px',
                    cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  ← 이전
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setTaskPage(page)}
                    style={{
                      padding: '8px 12px',
                      background: page === safePage ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.03)',
                      border: page === safePage ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      color: page === safePage ? '#a5b4fc' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: page === safePage ? '700' : '400',
                      cursor: 'pointer',
                      minWidth: '36px',
                      transition: 'all 0.2s'
                    }}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setTaskPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  style={{
                    padding: '8px 14px',
                    background: safePage >= totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    color: safePage >= totalPages ? '#4a5568' : '#94a3b8',
                    fontSize: '13px',
                    cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
          )
        })()}

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


      {/* 알림 설정 모달 */}
      {showNotifSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: '20px'
        }} onClick={() => setShowNotifSettings(false)}>
          <div style={{
            background: '#1a1f2e', borderRadius: '16px', padding: '28px',
            width: '100%', maxWidth: '440px', border: '1px solid rgba(255,255,255,0.1)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
              🔔 알림 설정
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>
              업무 알림을 받을 연락처를 설정하세요. 신규 업무 배정, 마감 임박, 긴급 업무 알림이 발송됩니다.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', fontWeight: '600', marginBottom: '6px' }}>
                📱 휴대폰 번호 (SMS)
              </label>
              <input
                type="tel"
                placeholder="01012345678"
                value={notifProfile.phone}
                onChange={e => setNotifProfile(p => ({ ...p, phone: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
              />
              <p style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>하이픈(-) 없이 숫자만 입력</p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', fontWeight: '600', marginBottom: '6px' }}>
                💬 슬랙 이메일
              </label>
              <input
                type="email"
                placeholder="user@company.com"
                value={notifProfile.slack_email}
                onChange={e => setNotifProfile(p => ({ ...p, slack_email: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
              />
              <p style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>슬랙 계정에 등록된 이메일</p>
            </div>

            <div style={{
              background: 'rgba(99,102,241,0.08)', borderRadius: '10px', padding: '14px',
              border: '1px solid rgba(99,102,241,0.15)', marginBottom: '24px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#a5b4fc', marginBottom: '8px' }}>알림 발송 조건</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                • 신규 업무 배정 시 즉시 알림<br/>
                • 마감 1일 전 미완료 업무 알림<br/>
                • 긴급 업무 미완료 시 매일 알림
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowNotifSettings(false)}
                style={{
                  flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  color: '#94a3b8', fontSize: '14px', cursor: 'pointer'
                }}
              >취소</button>
              <button
                onClick={saveNotifProfile}
                disabled={notifSaving}
                style={{
                  flex: 1, padding: '10px',
                  background: notifSaving ? '#4b5563' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: '8px',
                  color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: notifSaving ? 'not-allowed' : 'pointer'
                }}
              >{notifSaving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 생성 모달 */}
      {showTaskModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setShowTaskModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
            borderRadius: '20px',
            padding: '28px',
            width: '480px',
            maxWidth: '90vw',
            border: '1px solid rgba(255,255,255,0.1)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '20px' }}>업무 요청</h3>

            {/* 담당자 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>담당자 *</label>
              <select
                value={newTask.assignee_id}
                onChange={e => setNewTask({ ...newTask, assignee_id: e.target.value })}
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none'
                }}
              >
                <option value="" style={{ background: '#1e1e2e' }}>담당자 선택</option>
                {taskUsers.filter(u => u.id !== userId).map(u => (
                  <option key={u.id} value={u.id} style={{ background: '#1e1e2e' }}>{u.name || u.username}</option>
                ))}
              </select>
            </div>

            {/* 제목 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>업무 제목 *</label>
              <input
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="업무 제목을 입력하세요"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none'
                }}
              />
            </div>

            {/* 설명 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>상세 내용</label>
              <textarea
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="업무 내용을 상세히 작성해주세요"
                rows={4}
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none',
                  resize: 'vertical', lineHeight: '1.6'
                }}
              />
            </div>

            {/* 우선순위 + 마감일 */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>우선순위</label>
                <select
                  value={newTask.priority}
                  onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none'
                  }}
                >
                  <option value="low" style={{ background: '#1e1e2e' }}>낮음</option>
                  <option value="normal" style={{ background: '#1e1e2e' }}>보통</option>
                  <option value="high" style={{ background: '#1e1e2e' }}>높음</option>
                  <option value="urgent" style={{ background: '#1e1e2e' }}>긴급</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>마감일 *</label>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowTaskModal(false)}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#94a3b8', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                취소
              </button>
              <button
                onClick={createTask}
                disabled={taskCreating || !newTask.assignee_id || !newTask.title || !newTask.deadline}
                style={{
                  flex: 1, padding: '12px',
                  background: taskCreating || !newTask.assignee_id || !newTask.title || !newTask.deadline
                    ? '#4c4c6d' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: taskCreating || !newTask.assignee_id || !newTask.title || !newTask.deadline ? 'not-allowed' : 'pointer'
                }}
              >
                {taskCreating ? '요청 중...' : '업무 요청'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 상세 보기 모달 */}
      {taskDetailView && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setTaskDetailView(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
            borderRadius: '20px',
            padding: '28px',
            width: '520px',
            maxWidth: '90vw',
            border: '1px solid rgba(255,255,255,0.1)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            {(() => {
              const task = taskDetailView
              const priority = priorityConfig[task.priority] || priorityConfig.normal
              const statusInfo = statusConfig[task.status] || statusConfig.pending
              const deadlineColor = getDeadlineColor(task.deadline, task.status)
              const deadlineText = getDeadlineText(task.deadline, task.status)
              const isMyTask = task.assignee_id === userId // 내가 담당자인지
              const isRequester = task.requester_id === userId // 내가 요청자인지

              return (
                <>
                  {/* 헤더 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '10px', lineHeight: '1.4' }}>
                        {task.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: statusInfo.color, background: statusInfo.bg, padding: '3px 10px', borderRadius: '6px' }}>
                          {statusInfo.label}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: priority.color, background: priority.bg, padding: '3px 10px', borderRadius: '6px' }}>
                          {priority.label}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: deadlineColor, background: `${deadlineColor}20`, padding: '3px 10px', borderRadius: '6px' }}>
                          {deadlineText}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setTaskDetailView(null)} style={{
                      background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                      width: '32px', height: '32px', color: '#94a3b8', fontSize: '18px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>x</button>
                  </div>

                  {/* 정보 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>요청자</div>
                      <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '600' }}>{task.requester?.name || task.requester?.username || '?'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>담당자</div>
                      <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '600' }}>{task.assignee?.name || task.assignee?.username || '?'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>요청일</div>
                      <div style={{ fontSize: '14px', color: '#e2e8f0' }}>{new Date(task.created_at).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>마감일</div>
                      <div style={{ fontSize: '14px', color: deadlineColor, fontWeight: '600' }}>{task.deadline}</div>
                    </div>
                  </div>

                  {/* 상세 내용 */}
                  {task.description && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>상세 내용</div>
                      <div style={{ fontSize: '14px', color: '#e2e8f0', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{task.description}</div>
                    </div>
                  )}

                  {/* 반려 사유 */}
                  {task.rejection_reason && (
                    <div style={{
                      background: 'rgba(239,68,68,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '16px',
                      border: '1px solid rgba(239,68,68,0.15)'
                    }}>
                      <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px', fontWeight: '600' }}>반려 / 미완료 사유</div>
                      <div style={{ fontSize: '14px', color: '#fca5a5', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{task.rejection_reason}</div>
                    </div>
                  )}

                  {/* 완료일 */}
                  {task.completed_at && (
                    <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '16px' }}>
                      완료일: {new Date(task.completed_at).toLocaleString('ko-KR')}
                    </div>
                  )}

                  {/* 액션 버튼들 */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {/* 담당자 액션 */}
                    {isMyTask && task.status === 'pending' && (
                      <>
                        <button
                          onClick={() => { updateTaskStatus(task.id, 'in_progress'); setTaskDetailView({ ...task, status: 'in_progress' }) }}
                          style={{
                            flex: 1, padding: '10px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                          }}
                        >
                          수락 (진행 시작)
                        </button>
                        <button
                          onClick={() => setShowRejectModal(task.id)}
                          style={{
                            flex: 1, padding: '10px',
                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '10px', color: '#f87171', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                          }}
                        >
                          반려
                        </button>
                      </>
                    )}
                    {isMyTask && task.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => { updateTaskStatus(task.id, 'completed'); setTaskDetailView({ ...task, status: 'completed' }) }}
                          style={{
                            flex: 1, padding: '10px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                          }}
                        >
                          완료 처리
                        </button>
                        <button
                          onClick={() => setShowRejectModal(task.id)}
                          style={{
                            flex: 1, padding: '10px',
                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '10px', color: '#f87171', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                          }}
                        >
                          못했음 (사유 작성)
                        </button>
                      </>
                    )}
                    {/* 요청자는 삭제 가능 */}
                    {isRequester && (
                      <button
                        onClick={() => deleteTask(task.id)}
                        style={{
                          padding: '10px 16px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '10px', color: '#94a3b8', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 반려/미완료 사유 입력 모달 */}
      {showRejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => { setShowRejectModal(null); setRejectReason('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
            borderRadius: '20px',
            padding: '28px',
            width: '420px',
            maxWidth: '90vw',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>사유 작성</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
              반려 또는 미완료 사유를 작성해주세요.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="사유를 입력하세요..."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none',
                resize: 'vertical', lineHeight: '1.6', marginBottom: '16px'
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowRejectModal(null); setRejectReason('') }}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#94a3b8', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) return
                  updateTaskStatus(showRejectModal, 'rejected', rejectReason)
                  setTaskDetailView(null)
                }}
                disabled={!rejectReason.trim()}
                style={{
                  flex: 1, padding: '12px',
                  background: !rejectReason.trim() ? '#4c4c6d' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: !rejectReason.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기수별 차트 모달 */}
      {showCohortChart && (() => {
        const cohortData = allSheetData
          .filter(d => {
            const match = d.name.match(/^(.+?)\s*\d+기$/)
            return match && match[1].trim() === selectedInstructor
          })
          .sort((a, b) => {
            const aNum = parseInt(a.name.match(/(\d+)기$/)?.[1] || '0')
            const bNum = parseInt(b.name.match(/(\d+)기$/)?.[1] || '0')
            return aNum - bNum
          })
          .map(d => {
            const num = d.name.match(/(\d+)기$/)?.[1] || ''
            return { ...d, label: `${num}기` }
          })

        const CHARTS = [
          {
            key: 'revenue', title: '매출', color: '#60a5fa',
            gradient: ['#3b82f6', '#1d4ed8'],
            format: v => formatMoney(v),
            yFormat: v => v >= 100000000 ? (v / 100000000).toFixed(1) + '억' : Math.round(v / 10000) + '만'
          },
          {
            key: 'kakaoRoomDb', title: 'DB 수 (카톡방)', color: '#34d399',
            gradient: ['#10b981', '#059669'],
            format: v => formatNumber(v) + '명',
            yFormat: v => formatNumber(v)
          },
          {
            key: 'conversionCost', title: '전환단가 (낮을수록 좋음)', color: '#f59e0b',
            gradient: ['#f59e0b', '#d97706'],
            format: v => formatNumber(v) + '원',
            yFormat: v => v >= 10000 ? Math.round(v / 10000) + '만' : formatNumber(v),
            lowerIsBetter: true
          },
          {
            key: 'operatingProfit', title: '영업이익', color: '#a78bfa',
            gradient: ['#8b5cf6', '#6d28d9'],
            format: v => formatMoney(v),
            yFormat: v => v >= 100000000 ? (v / 100000000).toFixed(1) + '억' : Math.round(v / 10000) + '만'
          }
        ]

        const CohortTooltip = ({ active, payload, label, chartConfig }) => {
          if (!active || !payload?.length) return null
          return (
            <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '12px 16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: chartConfig.color, fontWeight: '600' }}>
                {chartConfig.format(payload[0]?.value)}
              </div>
            </div>
          )
        }

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 50000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(4px)'
          }} onClick={() => setShowCohortChart(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #1a1f35 100%)',
              borderRadius: '20px', width: '900px', maxWidth: '95vw', maxHeight: '90vh',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}>
              {/* 헤더 */}
              <div style={{
                padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0
              }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>📊 {selectedInstructor} - 기수별 차트</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{cohortData.length}개 기수 데이터</div>
                </div>
                <button
                  onClick={() => setShowCohortChart(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
                    width: '32px', height: '32px', color: '#fff', fontSize: '18px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </div>

              {/* 차트 영역 */}
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {cohortData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                    {selectedInstructor} 강사의 기수별 데이터가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                    {CHARTS.map(config => {
                      const filtered = cohortData.filter(d => d[config.key] !== undefined && d[config.key] !== null && d[config.key] !== 0)
                      if (filtered.length === 0) return (
                        <div key={config.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: '600', color: config.color, margin: '0 0 16px 0' }}>{config.title}</h3>
                          <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '13px' }}>데이터 없음</div>
                        </div>
                      )
                      const vals = filtered.map(d => d[config.key])
                      const maxVal = Math.max(...vals)
                      const minVal = Math.min(...vals)
                      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
                      const bestVal = config.lowerIsBetter ? minVal : maxVal

                      return (
                        <div key={config.key} style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '16px', padding: '24px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '600', color: config.color, margin: 0 }}>{config.title}</h3>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>평균: {config.format(avg)}</span>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={filtered} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                              <defs>
                                <linearGradient id={`cg-${config.key}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={config.gradient[0]} stopOpacity={0.9} />
                                  <stop offset="100%" stopColor={config.gradient[1]} stopOpacity={0.6} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} interval={0} />
                              <YAxis tickFormatter={config.yFormat} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                              <Tooltip content={<CohortTooltip chartConfig={config} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                              <Bar dataKey={config.key} fill={`url(#cg-${config.key})`} radius={[4, 4, 0, 0]} maxBarSize={52}>
                                {filtered.map((entry, idx) => {
                                  const val = entry[config.key]
                                  const isBest = val === bestVal
                                  return <Cell key={idx} fill={isBest ? config.gradient[0] : `url(#cg-${config.key})`} stroke={isBest ? config.color : 'none'} strokeWidth={isBest ? 2 : 0} />
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

    </div>
  )
}