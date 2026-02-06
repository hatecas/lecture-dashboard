'use client'

import { useState } from 'react'

// 샘플 데이터
const sampleData = {
  revenue: 45000000,
  profit: 12500000,
  profitMargin: 27.8,
  adSpend: 8500000
}

// 1. 글래스모피즘 스타일
function GlassStyle() {
  return (
    <div style={{ padding: '24px', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', borderRadius: '16px', minHeight: '400px' }}>
      <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>1. 글래스모피즘</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {[
          { label: '매출', value: sampleData.revenue, color: '#60a5fa' },
          { label: '영업이익', value: sampleData.profit, color: '#34d399' },
          { label: '영업이익률', value: sampleData.profitMargin + '%', color: '#a78bfa' },
          { label: '광고비', value: sampleData.adSpend, color: '#f472b6' }
        ].map((item, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '16px',
            padding: '20px',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.transform = 'translateY(-4px)'
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>{item.label}</div>
            <div style={{ color: item.color, fontSize: '24px', fontWeight: '700' }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() + '원' : item.value}
            </div>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: '20px',
        padding: '12px 24px',
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '12px',
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.3s'
      }}>
        AI 분석 요청
      </button>
    </div>
  )
}

// 2. 네온/사이버펑크 스타일
function NeonStyle() {
  return (
    <div style={{ padding: '24px', background: '#0a0a0f', borderRadius: '16px', minHeight: '400px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', textShadow: '0 0 10px rgba(139,92,246,0.5)' }}>2. 네온/사이버펑크</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', position: 'relative' }}>
        {[
          { label: '매출', value: sampleData.revenue, color: '#00f5ff', shadow: '0 0 20px rgba(0,245,255,0.5)' },
          { label: '영업이익', value: sampleData.profit, color: '#39ff14', shadow: '0 0 20px rgba(57,255,20,0.5)' },
          { label: '영업이익률', value: sampleData.profitMargin + '%', color: '#ff00ff', shadow: '0 0 20px rgba(255,0,255,0.5)' },
          { label: '광고비', value: sampleData.adSpend, color: '#ff073a', shadow: '0 0 20px rgba(255,7,58,0.5)' }
        ].map((item, i) => (
          <div key={i} style={{
            background: 'rgba(20,20,30,0.8)',
            border: `1px solid ${item.color}`,
            borderRadius: '8px',
            padding: '20px',
            boxShadow: item.shadow,
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = item.shadow.replace('20px', '30px').replace('0.5', '0.8')
            e.currentTarget.style.transform = 'scale(1.02)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = item.shadow
            e.currentTarget.style.transform = 'scale(1)'
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '2px' }}>{item.label}</div>
            <div style={{ color: item.color, fontSize: '24px', fontWeight: '700', textShadow: item.shadow }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() + '원' : item.value}
            </div>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: '20px',
        padding: '12px 24px',
        background: 'transparent',
        border: '2px solid #00f5ff',
        borderRadius: '4px',
        color: '#00f5ff',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        boxShadow: '0 0 20px rgba(0,245,255,0.3), inset 0 0 20px rgba(0,245,255,0.1)',
        transition: 'all 0.3s'
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(0,245,255,0.6), inset 0 0 30px rgba(0,245,255,0.2)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(0,245,255,0.3), inset 0 0 20px rgba(0,245,255,0.1)'}>
        AI 분석 요청
      </button>
    </div>
  )
}

// 3. 다크 미니멀 스타일
function MinimalStyle() {
  return (
    <div style={{ padding: '24px', background: '#111111', borderRadius: '16px', minHeight: '400px' }}>
      <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px', fontWeight: '400' }}>3. 다크 미니멀</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { label: '매출', value: sampleData.revenue, accent: '#3b82f6' },
          { label: '영업이익', value: sampleData.profit, accent: '#10b981' },
          { label: '영업이익률', value: sampleData.profitMargin + '%', accent: '#8b5cf6' },
          { label: '광고비', value: sampleData.adSpend, accent: '#f59e0b' }
        ].map((item, i) => (
          <div key={i} style={{
            background: '#1a1a1a',
            borderRadius: '12px',
            padding: '20px',
            borderLeft: `3px solid ${item.accent}`,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#222222'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#1a1a1a'
          }}>
            <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px', fontWeight: '500' }}>{item.label}</div>
            <div style={{ color: '#fff', fontSize: '22px', fontWeight: '600' }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() + '원' : item.value}
            </div>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: '20px',
        padding: '12px 24px',
        background: '#fff',
        border: 'none',
        borderRadius: '8px',
        color: '#111',
        cursor: 'pointer',
        fontWeight: '500',
        transition: 'all 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        AI 분석 요청
      </button>
    </div>
  )
}

// 4. 그라데이션 강조 스타일
function GradientStyle() {
  return (
    <div style={{ padding: '24px', background: 'linear-gradient(180deg, #1e1e2f 0%, #151521 100%)', borderRadius: '16px', minHeight: '400px' }}>
      <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>4. 그라데이션 강조</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {[
          { label: '매출', value: sampleData.revenue, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '영업이익', value: sampleData.profit, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { label: '영업이익률', value: sampleData.profitMargin + '%', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '광고비', value: sampleData.adSpend, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
        ].map((item, i) => (
          <div key={i} style={{
            background: item.gradient,
            borderRadius: '16px',
            padding: '20px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = 'none'
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', transform: 'translate(30%, -30%)' }} />
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', marginBottom: '8px', position: 'relative' }}>{item.label}</div>
            <div style={{ color: '#fff', fontSize: '24px', fontWeight: '700', position: 'relative' }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() + '원' : item.value}
            </div>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: '20px',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        cursor: 'pointer',
        fontWeight: '600',
        boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
        transition: 'all 0.3s'
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
        AI 분석 요청
      </button>
    </div>
  )
}

export default function DesignPreview() {
  const [selected, setSelected] = useState(null)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', padding: '40px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ color: '#fff', fontSize: '32px', marginBottom: '8px', textAlign: 'center' }}>디자인 스타일 선택</h1>
        <p style={{ color: '#666', textAlign: 'center', marginBottom: '40px' }}>마음에 드는 스타일을 클릭하세요</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
          <div
            onClick={() => setSelected(1)}
            style={{
              cursor: 'pointer',
              outline: selected === 1 ? '3px solid #6366f1' : 'none',
              outlineOffset: '4px',
              borderRadius: '20px',
              transition: 'all 0.3s'
            }}
          >
            <GlassStyle />
          </div>
          <div
            onClick={() => setSelected(2)}
            style={{
              cursor: 'pointer',
              outline: selected === 2 ? '3px solid #00f5ff' : 'none',
              outlineOffset: '4px',
              borderRadius: '20px',
              transition: 'all 0.3s'
            }}
          >
            <NeonStyle />
          </div>
          <div
            onClick={() => setSelected(3)}
            style={{
              cursor: 'pointer',
              outline: selected === 3 ? '3px solid #fff' : 'none',
              outlineOffset: '4px',
              borderRadius: '20px',
              transition: 'all 0.3s'
            }}
          >
            <MinimalStyle />
          </div>
          <div
            onClick={() => setSelected(4)}
            style={{
              cursor: 'pointer',
              outline: selected === 4 ? '3px solid #667eea' : 'none',
              outlineOffset: '4px',
              borderRadius: '20px',
              transition: 'all 0.3s'
            }}
          >
            <GradientStyle />
          </div>
        </div>

        {selected && (
          <div style={{
            marginTop: '40px',
            textAlign: 'center',
            padding: '24px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px'
          }}>
            <p style={{ color: '#fff', fontSize: '18px', marginBottom: '16px' }}>
              <strong>{selected}번 스타일</strong>을 선택하셨습니다!
            </p>
            <p style={{ color: '#888', marginBottom: '20px' }}>
              이 스타일로 대시보드를 변경하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button style={{
                padding: '12px 32px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                이 스타일로 적용하기
              </button>
              <button
                onClick={() => setSelected(null)}
                style={{
                  padding: '12px 32px',
                  background: 'transparent',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  color: '#888',
                  cursor: 'pointer'
                }}
              >
                다시 선택
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
