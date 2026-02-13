'use client'

import { useState, useRef, useEffect } from 'react'

export default function Dashboard({ onLogout, userName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [images, setImages] = useState([])
  const endRef = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    }
  }

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, sending])

  // textarea 높이 자동 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  const sendMessage = async () => {
    if ((!input.trim() && images.length === 0) || sending) return

    const userMsg = {
      role: 'user',
      content: input.trim(),
      images: images.map(img => ({ preview: img.preview, data: img.data, mediaType: img.mediaType }))
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setImages([])
    setSending(true)

    try {
      const res = await fetch('/api/cs-ai', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          messages: newMessages.map(m => ({
            role: m.role,
            content: m.content,
            images: m.images?.filter(img => img.data).map(img => ({ data: img.data, mediaType: img.mediaType }))
          }))
        })
      })

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || data.error || '답변 생성에 실패했습니다.',
        toolsUsed: data.toolsUsed
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '네트워크 오류가 발생했습니다. 다시 시도해주세요.'
      }])
    } finally {
      setSending(false)
    }
  }

  const handleImageUpload = (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(',')[1]
        setImages(prev => [...prev, {
          file,
          preview: URL.createObjectURL(file),
          data: base64,
          mediaType: file.type
        }])
      }
      reader.readAsDataURL(file)
    }
  }

  // 마크다운 스타일 텍스트를 간단히 렌더링
  const renderContent = (text) => {
    if (!text) return null

    const lines = text.split('\n')
    const elements = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // 빈 줄
      if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: '8px' }} />)
        i++
        continue
      }

      // 헤더
      if (line.startsWith('### ')) {
        elements.push(
          <div key={i} style={{ fontSize: '14px', fontWeight: '700', color: '#c4b5fd', marginTop: '12px', marginBottom: '4px' }}>
            {line.slice(4)}
          </div>
        )
        i++
        continue
      }
      if (line.startsWith('## ')) {
        elements.push(
          <div key={i} style={{ fontSize: '15px', fontWeight: '700', color: '#a78bfa', marginTop: '14px', marginBottom: '6px' }}>
            {line.slice(3)}
          </div>
        )
        i++
        continue
      }

      // 구분선
      if (line.trim() === '---' || line.trim() === '***') {
        elements.push(
          <div key={i} style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
        )
        i++
        continue
      }

      // 볼드 처리 (**text**)
      const formatInline = (str) => {
        const parts = []
        let remaining = str
        let partIdx = 0
        while (remaining.length > 0) {
          const boldStart = remaining.indexOf('**')
          if (boldStart === -1) {
            parts.push(<span key={partIdx++}>{remaining}</span>)
            break
          }
          if (boldStart > 0) {
            parts.push(<span key={partIdx++}>{remaining.slice(0, boldStart)}</span>)
          }
          const boldEnd = remaining.indexOf('**', boldStart + 2)
          if (boldEnd === -1) {
            parts.push(<span key={partIdx++}>{remaining.slice(boldStart)}</span>)
            break
          }
          parts.push(
            <strong key={partIdx++} style={{ color: '#e2e8f0', fontWeight: '600' }}>
              {remaining.slice(boldStart + 2, boldEnd)}
            </strong>
          )
          remaining = remaining.slice(boldEnd + 2)
        }
        return parts
      }

      // 리스트 아이템
      if (/^(\s*[-*]|\s*\d+\.)\s/.test(line)) {
        const indent = line.match(/^\s*/)[0].length
        const content = line.replace(/^\s*[-*]\s|^\s*\d+\.\s/, '')
        elements.push(
          <div key={i} style={{
            display: 'flex', gap: '8px', paddingLeft: `${Math.max(indent * 4, 4)}px`,
            marginBottom: '2px'
          }}>
            <span style={{ color: '#6366f1', flexShrink: 0 }}>•</span>
            <span>{formatInline(content)}</span>
          </div>
        )
        i++
        continue
      }

      // 대화 형식 (소비자: / 상담원:)
      if (/^(소비자|고객|상담원|매니저|봇)\s*[:：]/.test(line.trim())) {
        const match = line.trim().match(/^(소비자|고객|상담원|매니저|봇)\s*[:：]\s*(.*)/)
        if (match) {
          const isCustomer = ['소비자', '고객'].includes(match[1])
          elements.push(
            <div key={i} style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start',
              padding: '6px 10px', borderRadius: '10px', marginBottom: '4px',
              background: isCustomer ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)',
              border: `1px solid ${isCustomer ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)'}`
            }}>
              <span style={{
                fontSize: '11px', fontWeight: '700', flexShrink: 0, padding: '2px 6px',
                borderRadius: '4px', marginTop: '1px',
                background: isCustomer ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)',
                color: isCustomer ? '#fca5a5' : '#a5b4fc'
              }}>{match[1]}</span>
              <span style={{ color: '#cbd5e1', lineHeight: '1.6' }}>{formatInline(match[2])}</span>
            </div>
          )
          i++
          continue
        }
      }

      // 일반 텍스트
      elements.push(
        <div key={i} style={{ marginBottom: '2px' }}>{formatInline(line)}</div>
      )
      i++
    }

    return elements
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)'
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: '700', color: '#e2e8f0', margin: 0 }}>CS AI 어시스턴트</h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>채널톡 조회 · 정책 기반 대응 · AI 답변 생성</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>{userName}</span>
          <button
            onClick={onLogout}
            style={{
              padding: '6px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#64748b', gap: '20px', minHeight: '60vh'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '20px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(99,102,241,0.3)'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: '700', color: '#e2e8f0', marginBottom: '8px' }}>CS AI 어시스턴트</p>
              <p style={{ fontSize: '14px', lineHeight: '1.8', color: '#94a3b8' }}>
                채널톡 대화 조회부터 CS 대응 답변 생성까지<br/>
                한 번에 처리합니다
              </p>
            </div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px',
              justifyContent: 'center', marginTop: '8px', maxWidth: '600px'
            }}>
              {[
                '김철수 고객 채널톡 대화 가져와',
                '환불 요청 어떻게 대응해?',
                '결제 오류 문의에 답변 만들어줘',
                '최근 컴플레인 대응 매뉴얼 보여줘'
              ].map(example => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  style={{
                    padding: '10px 18px',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '24px',
                    color: '#a5b4fc',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: '10px'
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              )}
              <div style={{
                maxWidth: msg.role === 'user' ? '70%' : '85%',
                padding: '14px 18px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                  : 'rgba(255,255,255,0.06)',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0',
                fontSize: '14px',
                lineHeight: '1.7',
                wordBreak: 'break-word'
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
                {/* 도구 사용 표시 */}
                {msg.role === 'assistant' && msg.toolsUsed && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '6px', marginBottom: '10px',
                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                    fontSize: '11px', color: '#34d399'
                  }}>
                    &#9889; 채널톡/정책/이력 자동 조회 완료
                  </div>
                )}
                {/* 메시지 내용 */}
                {msg.role === 'assistant' ? (
                  <div style={{ whiteSpace: 'normal' }}>{renderContent(msg.content)}</div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                )}
                {/* 복사 버튼 */}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      marginTop: '10px', padding: '4px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '6px', color: '#94a3b8',
                      fontSize: '11px', cursor: 'pointer'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    복사
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* 전송 중 표시 */}
        {sending && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div style={{
              padding: '14px 18px', borderRadius: '18px 18px 18px 4px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: '14px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0, 1, 2].map(d => (
                  <div key={d} style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: '#6366f1',
                    animation: `csaiPulse 1.4s ease-in-out ${d * 0.2}s infinite`
                  }} />
                ))}
              </div>
              <span>분석 중...</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* 이미지 미리보기 */}
      {images.length > 0 && (
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap',
          padding: '10px 24px',
          background: 'rgba(255,255,255,0.03)',
          borderTop: '1px solid rgba(255,255,255,0.06)'
        }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={img.preview} alt="" style={{
                width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover'
              }} />
              <button
                onClick={() => {
                  URL.revokeObjectURL(img.preview)
                  setImages(prev => prev.filter((_, idx) => idx !== i))
                }}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#ef4444', border: 'none', color: '#fff',
                  fontSize: '11px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                }}
              >x</button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 영역 */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-end',
          maxWidth: '900px', margin: '0 auto'
        }}>
          <input
            type="file"
            ref={fileRef}
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleImageUpload(Array.from(e.target.files || []))
              e.target.value = ''
            }}
          />

          <button
            onClick={() => fileRef.current?.click()}
            title="이미지 첨부"
            style={{
              padding: '10px', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault()
                  const file = item.getAsFile()
                  handleImageUpload([file])
                }
              }
            }}
            placeholder="채널톡 대화 조회, CS 대응 질문을 입력하세요... (Enter 전송)"
            style={{
              flex: 1, padding: '12px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', color: '#e2e8f0',
              fontSize: '14px', resize: 'none',
              minHeight: '48px', maxHeight: '160px',
              outline: 'none', fontFamily: 'inherit',
              lineHeight: '1.5'
            }}
            rows={1}
          />

          <button
            onClick={sendMessage}
            disabled={(!input.trim() && images.length === 0) || sending}
            style={{
              padding: '10px 20px', flexShrink: 0,
              background: (input.trim() || images.length > 0) && !sending
                ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                : 'rgba(99,102,241,0.15)',
              border: 'none', borderRadius: '12px',
              color: '#fff', fontSize: '14px', fontWeight: '600',
              cursor: (input.trim() || images.length > 0) && !sending ? 'pointer' : 'not-allowed',
              opacity: (input.trim() || images.length > 0) && !sending ? 1 : 0.4,
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {sending ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'csaiSpin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setInput(''); setImages([]) }}
              title="대화 초기화"
              style={{
                padding: '10px', flexShrink: 0,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '12px', color: '#f87171',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes csaiPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes csaiSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
