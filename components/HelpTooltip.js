'use client'

import { useState, useRef, useEffect } from 'react'

export default function HelpTooltip({ text, size = 14 }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState('bottom')
  const iconRef = useRef(null)

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
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
        borderWidth: '1.5px',
        borderStyle: 'solid',
        borderColor: show ? 'rgba(99,102,241,0.8)' : 'rgba(148,163,184,0.5)',
        color: show ? '#818cf8' : 'rgba(148,163,184,0.7)',
        background: show ? 'rgba(99,102,241,0.1)' : 'transparent',
        fontSize: `${size - 5}px`,
        fontWeight: '700',
        cursor: 'help',
        flexShrink: 0,
        lineHeight: 1,
        userSelect: 'none',
        transition: 'all 0.2s ease'
      }}
    >
      ?
      {show && (
        <span
          style={{
            position: 'absolute',
            [pos === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(99,102,241,0.3)',
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
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: pos === 'bottom' ? 'rgba(99,102,241,0.3)' : 'transparent',
            borderLeftWidth: '1px',
            borderLeftStyle: 'solid',
            borderLeftColor: pos === 'bottom' ? 'rgba(99,102,241,0.3)' : 'transparent',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: pos === 'bottom' ? 'transparent' : 'rgba(99,102,241,0.3)',
            borderRightWidth: '1px',
            borderRightStyle: 'solid',
            borderRightColor: pos === 'bottom' ? 'transparent' : 'rgba(99,102,241,0.3)',
          }} />
        </span>
      )}
    </span>
  )
}
