'use client'

// 기수별 비교 BarChart — 강사 모달의 기수별 매출/DB/전환단가/영업이익 비교.
// Dashboard.js에서 추출 (recharts lazy load 목적).

import { BarChart, Bar, CartesianGrid, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function CustomChartTooltip({ active, payload, label, chartConfig }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '12px 16px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: chartConfig.color, fontWeight: '600' }}>{chartConfig.format(payload[0]?.value)}</div>
    </div>
  )
}

export default function CompareMetricBarChart({ validData, metric, bestVal }) {
  return (
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
  )
}
