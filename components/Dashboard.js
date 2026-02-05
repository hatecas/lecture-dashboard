'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'

export default function Dashboard({ onLogout }) {
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
  const [selectedInstructor, setSelectedInstructor] = useState('')
  const [showYoutubeModal, setShowYoutubeModal] = useState(false)
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [salesTabName, setSalesTabName] = useState('')
  const [salesAnalyzing, setSalesAnalyzing] = useState(false)
  const autoAnalyzedRef = useRef(new Set())
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

  useEffect(() => {
    loadSessions()
    loadInstructors()
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
      // 강사를 ㄱㄴㄷ순으로 정렬 후 첫 번째 강사 선택
      const sortedInstructorNames = [...new Set(data.map(s => s.instructors?.name))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))
      const firstInstructor = sortedInstructorNames[0] || ''
      setSelectedInstructor(firstInstructor)
      // 해당 강사의 기수를 1기순으로 정렬 후 첫 번째 기수 선택
      const getNum = (name) => { const m = name?.match(/(\d+)/); return m ? parseInt(m[1]) : 0 }
      const firstSession = data
        .filter(s => s.instructors?.name === firstInstructor)
        .sort((a, b) => getNum(a.session_name) - getNum(b.session_name))[0]
      if (firstSession) setSelectedSessionId(firstSession.id)
    }
    setLoading(false)
  }

  const loadSheetData = async (instructorName, sessionName) => {
    const name = `${instructorName} ${sessionName}`
    try {
      const response = await fetch(`/api/sheets?name=${encodeURIComponent(name)}`)
      const data = await response.json()
      if (!data.error) return data
    } catch (error) {
      console.error('시트 데이터 로드 실패:', error)
    }
    return null
  }

  const syncFromSheet = async () => {
    try {
      const response = await fetch('/api/sheets')
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
    if (data && data.length > 0) {
      setPurchaseTimeline(data)
      return
    }
    setPurchaseTimeline([])

    // 데이터 없으면 자동으로 매출표에서 분석 시도
    if (autoAnalyzedRef.current.has(selectedSessionId)) return
    autoAnalyzedRef.current.add(selectedSessionId)

    const session = sessions.find(s => s.id === selectedSessionId)
    if (!session || !session.free_class_date) return

    const tabName = `${session.instructors?.name} ${session.session_name}`
    try {
      const response = await fetch('/api/sales-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (e) {
      // 탭이 없거나 데이터 없으면 무시
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
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionData: {
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
          },
          memos: memos,
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

  const runSalesAnalysis = async () => {
    if (!salesTabName.trim()) return alert('매출표 탭 이름을 입력하세요')
    setSalesAnalyzing(true)
    try {
      const session = currentSession
      const response = await fetch('/api/sales-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabName: salesTabName.trim(),
          freeClassDate: session.free_class_date,
          sessionId: selectedSessionId
        })
      })
      const data = await response.json()
      if (data.error) {
        alert('분석 실패: ' + data.error)
      } else {
        alert(`분석 완료! ${data.totalInRange}건 (범위 내) / 전체 ${data.totalAll}건`)
        setShowSalesModal(false)
        setSalesTabName('')
        loadPurchaseTimeline()
      }
    } catch (error) {
      alert('매출 분석 중 오류: ' + error.message)
    }
    setSalesAnalyzing(false)
  }

  const getIntervalLabel = (minuteValue) => {
    const labels = { 0: '0~30', 30: '30~60', 60: '60~90', 90: '90~120', 120: '120~180', 180: '180~' }
    return labels[minuteValue] || minuteValue + '분'
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
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* 사이드바 */}
      <div style={{ width: '240px', background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(255,255,255,0.1)', padding: '20px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 20px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700' }}>📊 강의 통합 관리</h1>
        </div>
        <div style={{ flex: 1 }}>
          <button onClick={() => setCurrentTab('dashboard')} style={{ width: '100%', padding: '12px 20px', background: currentTab === 'dashboard' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent', border: 'none', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📈 대시보드
          </button>
          <button onClick={() => setCurrentTab('detail')} style={{ width: '100%', padding: '12px 20px', background: currentTab === 'detail' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent', border: 'none', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📝 상세 정보
          </button>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '16px 20px' }} />
          <button onClick={syncFromSheet} style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🔄 시트 동기화
          </button>
        </div>
        <div style={{ padding: '0 20px' }}>
          <button onClick={onLogout} style={{ width: '100%', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}>
            로그아웃
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* 드롭다운 */}
          {/* 강사/기수 드롭다운 */}
          <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
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

            {/* 기수 선택 */}
            <select
              value={selectedSessionId || ''}
              onChange={(e) => {
                setSelectedSessionId(e.target.value)
                setAiAnalysis(null)
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
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
          </div>

          {/* 대시보드 탭 */}
          {currentTab === 'dashboard' && (
            <>
              {/* 지표 카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>💰 총 매출</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                    {sheetData?.revenue ? formatMoney(sheetData.revenue) : (currentSession.revenue > 0 ? formatMoney(currentSession.revenue) : '진행중')}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>🎯 구매전환율</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                    {sheetData?.purchaseConversionRate ? `${(sheetData.purchaseConversionRate * 100).toFixed(2)}%` : `${purchaseConversionRate}%`}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>시청자 {sheetData?.liveViewers ? formatNumber(sheetData.liveViewers) : formatNumber(currentSession.live_viewers)}명 → 결제 {sheetData?.totalPurchases ? formatNumber(sheetData.totalPurchases) : currentSession.total_purchases}명</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.5 3 2 6.58 2 11C2 13.13 3.05 15.07 4.75 16.5C4.75 17.1 4.33 18.67 2 21C4.37 20.89 6.64 20 8.47 18.5C9.61 18.83 10.81 19 12 19C17.5 19 22 15.42 22 11C22 6.58 17.5 3 12 3Z" fill="#FAE100"/></svg>
                    카톡방 DB
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                    {sheetData?.kakaoRoomDb ? formatNumber(sheetData.kakaoRoomDb) : formatNumber(currentSession.kakao_room_db)}명
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>📈 광고 전환비용</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                    {sheetData?.conversionCost ? formatNumber(sheetData.conversionCost) : formatNumber(currentSession.conversion_cost)}원
                  </div>
                </div>
              </div>

              {/* 2단 레이아웃 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>⏰ 무료특강 후 시간별 구매 추이</div>
                    <button onClick={() => { setSalesTabName(currentSession.instructors?.name + ' ' + currentSession.session_name); setShowSalesModal(true) }} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '6px 12px', color: '#a5b4fc', fontSize: '12px', cursor: 'pointer' }}>매출표 분석</button>
                  </div>
                  {purchaseTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={purchaseTimeline.map(item => {
                        const total = purchaseTimeline.reduce((sum, p) => sum + p.purchases, 0)
                        return {
                          name: getIntervalLabel(item.hour) + '분',
                          purchases: item.purchases,
                          pct: total > 0 ? ((item.purchases / total) * 100).toFixed(1) : 0
                        }
                      })}>
                        <defs>
                          <linearGradient id="purchaseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#1e1e2e', border: '1px solid #4c4c6d', borderRadius: '8px', color: '#e2e8f0' }}
                          formatter={(value, name, props) => [`${value}건 (${props.payload.pct}%)`, '구매건수']}
                          labelFormatter={(label) => label}
                        />
                        <Area type="monotone" dataKey="purchases" stroke="#6366f1" fill="url(#purchaseGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      아직 판매 데이터가 없습니다
                    </div>
                  )}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>💵 영업이익 현황</div>
                  {(sheetData?.revenue || currentSession.revenue > 0) ? (() => {
                    const profit = sheetData?.operatingProfit || currentSession.operating_profit || 0
                    const margin = sheetData?.profitMargin ?? currentSession.profit_margin ?? 0
                    const isPositive = profit >= 0
                    return (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
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

              {/* 종합 데이터 */}
              {sheetData ? (
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>📊 {currentSession.instructors?.name} {currentSession.session_name} 종합 데이터</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>총 매출</div>
                      <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatMoney(sheetData.revenue)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>영업이익</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: sheetData.operatingProfit >= 0 ? '#10b981' : '#f87171' }}>{formatMoney(sheetData.operatingProfit)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>영업이익률</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#818cf8' }}>{sheetData.profitMargin}%</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>광고비</div>
                      <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatMoney(sheetData.adSpend)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>카톡방 DB / 동시접속</div>
                      <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatNumber(sheetData.kakaoRoomDb)}명 / {formatNumber(sheetData.liveViewers)}명</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>결제 건수 / 전환율</div>
                      <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatNumber(sheetData.totalPurchases)}건 / {(sheetData.purchaseConversionRate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              ) : null}

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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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

              {/* AI 분석 */}
              <button onClick={() => runAiAnalysis('detail')} disabled={analyzing} style={{ background: analyzing ? '#4c4c6d' : 'linear-gradient(135deg, #ec4899, #f43f5e)', border: 'none', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: analyzing ? 'wait' : 'pointer', marginBottom: '24px' }}>
                {analyzing ? '✨ AI 분석 중...' : '✨ AI 종합 분석 실행'}
              </button>

              {aiAnalysis && (
                <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', borderRadius: '16px', padding: '24px', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>✨ AI 종합 분석 결과</div>
                  <p style={{ color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.6 }}>{aiAnalysis.summary}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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

      {/* 매출표 분석 모달 */}
      {showSalesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e1e2e', borderRadius: '20px', padding: '32px', width: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>매출표 분석</h3>
              <button onClick={() => setShowSalesModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>매출표 시트 탭 이름</label>
              <input type="text" value={salesTabName} onChange={(e) => setSalesTabName(e.target.value)} placeholder="예: 션 2기" style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '14px' }} />
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>매출표 시트에서 해당 강사의 탭 이름을 입력하세요</p>
            </div>
            <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', fontSize: '13px', color: '#a5b4fc' }}>
              <div>무료강의 날짜: <strong>{currentSession.free_class_date || '미설정'}</strong></div>
              <div style={{ marginTop: '4px' }}>분석 범위: 무료강의일 19:30 이후 첫 결제 ~ 다음날 12:30</div>
            </div>
            <button onClick={runSalesAnalysis} disabled={salesAnalyzing} style={{ width: '100%', padding: '14px', background: salesAnalyzing ? '#4c4c6d' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: salesAnalyzing ? 'wait' : 'pointer' }}>
              {salesAnalyzing ? '분석 중...' : '분석 실행'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}