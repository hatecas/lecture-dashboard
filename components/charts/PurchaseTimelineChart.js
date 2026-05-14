'use client'

// 무료특강 후 시간별 구매 추이 — AreaChart.
// Dashboard.js에서 추출 (recharts 라이브러리 lazy load 목적).
// Dashboard.js에서는 next/dynamic으로 import → 첫 로드 시 recharts 다운 안 받음.

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function PurchaseTimelineChart({ groupedData, getIntervalLabel, total }) {
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
}
