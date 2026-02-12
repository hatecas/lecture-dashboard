'use client'

import { useState, useRef, useEffect } from 'react'

export default function HelpTooltip({ text, size = 14 }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState('bottom')
  const iconRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      // 화면 아래쪽 공간이 부족하면 위에 표시
      if (rect.bottom + 80 > window.innerHeight) {
        setPos('top')
      } else {
        setPos('bottom')
      }
    }
  }, [show])

  return (
    <span
      ref={iconRef}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: '1.5px solid rgba(148,163,184,0.5)',
        color: 'rgba(148,163,184,0.7)',
        fontSize: `${size - 5}px`,
        fontWeight: '700',
        cursor: 'help',
        flexShrink: 0,
        lineHeight: 1,
        userSelect: 'none',
        transition: 'all 0.2s ease',
        ...(show ? { borderColor: 'rgba(99,102,241,0.8)', color: '#818cf8', background: 'rgba(99,102,241,0.1)' } : {})
      }}
    >
      ?
      {show && (
        <span
          ref={tooltipRef}
          style={{
            position: 'absolute',
            [pos === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#cbd5e1',
            fontSize: '12px',
            lineHeight: '1.6',
            width: 'max-content',
            maxWidth: '260px',
            whiteSpace: 'pre-line',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            animation: 'tooltipFadeIn 0.15s ease'
          }}
        >
          {text}
          <span style={{
            position: 'absolute',
            [pos === 'bottom' ? 'top' : 'bottom']: '-5px',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '8px',
            height: '8px',
            background: '#1e293b',
            border: pos === 'bottom'
              ? '1px solid rgba(99,102,241,0.3) transparent transparent 1px solid rgba(99,102,241,0.3)'
              : 'transparent 1px solid rgba(99,102,241,0.3) 1px solid rgba(99,102,241,0.3) transparent',
            borderTop: pos === 'bottom' ? '1px solid rgba(99,102,241,0.3)' : 'none',
            borderLeft: pos === 'bottom' ? '1px solid rgba(99,102,241,0.3)' : 'none',
            borderBottom: pos === 'bottom' ? 'none' : '1px solid rgba(99,102,241,0.3)',
            borderRight: pos === 'bottom' ? 'none' : '1px solid rgba(99,102,241,0.3)',
          }} />
        </span>
      )}
    </span>
  )
}
