'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'

export default function Dashboard({ onLogout, userName }) {
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

  useEffect(() => {
    if (instructors.length >= 0 && sessions.length >= 0 && !synced) {
      setSynced(true)
      syncFromSheet()
    }
  }, [instructors, sessions])

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
        width: isMobile ? '240px' : (sidebarCollapsed ? '70px' : '240px'),
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
            padding: sidebarCollapsed ? '14px 0' : '14px 20px',
            background: currentTab === 'dashboard' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'dashboard' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'dashboard' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'dashboard' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: sidebarCollapsed ? 'center' : 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            transition: 'all 0.3s ease'
          }} title="대시보드">
            <span style={{ fontSize: sidebarCollapsed ? '20px' : '14px' }}>📈</span>
            {!sidebarCollapsed && '대시보드'}
          </button>
          <button onClick={() => { setCurrentTab('detail'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '14px 0' : '14px 20px',
            background: currentTab === 'detail' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'detail' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'detail' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'detail' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: sidebarCollapsed ? 'center' : 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            transition: 'all 0.3s ease'
          }} title="상세 정보">
            <span style={{ fontSize: sidebarCollapsed ? '20px' : '14px' }}>📝</span>
            {!sidebarCollapsed && '상세 정보'}
          </button>
          <button onClick={() => { setCurrentTab('ranking'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '14px 0' : '14px 20px',
            background: currentTab === 'ranking' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'ranking' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'ranking' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'ranking' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: sidebarCollapsed ? 'center' : 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            transition: 'all 0.3s ease'
          }} title="랭킹">
            <span style={{ fontSize: sidebarCollapsed ? '20px' : '14px' }}>🏆</span>
            {!sidebarCollapsed && '랭킹'}
          </button>
          <button onClick={() => { setCurrentTab('compare'); if(isMobile) setMobileMenuOpen(false) }} style={{
            width: '100%',
            padding: sidebarCollapsed ? '14px 0' : '14px 20px',
            background: currentTab === 'compare' ? 'rgba(99,102,241,0.2)' : 'transparent',
            backdropFilter: currentTab === 'compare' ? 'blur(10px)' : 'none',
            border: 'none',
            borderLeft: currentTab === 'compare' ? '3px solid #818cf8' : '3px solid transparent',
            color: currentTab === 'compare' ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: sidebarCollapsed ? 'center' : 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            transition: 'all 0.3s ease'
          }} title="대조">
            <span style={{ fontSize: sidebarCollapsed ? '20px' : '14px' }}>⚖️</span>
            {!sidebarCollapsed && '대조'}
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div style={{ flex: 1, overflow: 'auto', width: '100%' }}>
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
            <button onClick={onLogout} style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
              로그아웃
            </button>
          </div>
        )}

        {/* 우측 상단 환영 메시지 + 로그아웃 - 글래스모피즘 */}
        {!isMobile && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '16px 32px 0', maxWidth: '1200px', margin: '0 auto' }}>
          {userName && (
            <div style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ color: '#a5b4fc', fontSize: '14px' }}><strong>{userName}</strong>님 반갑습니다 👋</span>
            </div>
          )}
          <button onClick={onLogout} style={{ padding: '10px 18px', background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#f87171', cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.3s ease' }}>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>⏰ 무료특강 후 시간별 구매 추이</span>
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
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>💵 영업이익 현황</div>
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
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px', color: 'rgba(255,255,255,0.8)' }}>📈 광고 성과</div>
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
                  <div style={{ fontSize: '15px', fontWeight: '600' }}>📺 유튜브 출연 성과</div>
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
              <button onClick={() => runAiAnalysis('dashboard')} disabled={analyzing} style={{ background: analyzing ? '#4c4c6d' : 'linear-gradient(135deg, #ec4899, #f43f5e)', border: 'none', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: analyzing ? 'wait' : 'pointer', marginBottom: '24px' }}>
                {analyzing ? '✨ AI 분석 중...' : '✨ AI 분석 실행'}
              </button>

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
                  <div style={{ fontSize: '18px', fontWeight: '600' }}>📝 강사 메모</div>
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
                  <div style={{ fontSize: '18px', fontWeight: '600' }}>📎 첨부파일 & 링크</div>
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
                  <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>🏆 랭킹</h2>
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
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '20px' }}>⚖️ 대조</h2>
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