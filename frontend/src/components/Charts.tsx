import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Summary } from '../api'
import { fmtDay } from '../api'
import { SEV_COLOR } from './ui'

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(7,14,31,0.96)',
    border: '1px solid rgba(125,211,252,0.18)',
    borderRadius: 10,
    fontSize: 12,
    color: '#dbe7f7',
    boxShadow: '0 12px 30px -12px rgba(0,0,0,.7)',
  },
  labelStyle: { color: '#8aa0c4', marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: 'rgba(34,211,238,0.06)', stroke: 'rgba(34,211,238,0.25)' },
}

export function TimelineChart({ data }: { data: Summary['timeline'] }) {
  return (
    <ResponsiveContainer width="100%" height={372}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5b84b" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#f5b84b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gAnom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} />
        <Area type="monotone" dataKey="total" name="Login attempts" stroke="#22d3ee" strokeWidth={2} fill="url(#gTotal)" animationDuration={900} />
        <Area type="monotone" dataKey="failed" name="Failed" stroke="#f5b84b" strokeWidth={1.5} fill="url(#gFail)" animationDuration={1100} />
        <Area type="monotone" dataKey="anomalies" name="Anomalies" stroke="#f87171" strokeWidth={1.5} fill="url(#gAnom)" animationDuration={1300} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function HourlyChart({ data }: { data: Summary['hourly'] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, '0')}`} tickLine={false} axisLine={false} interval={3} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`} />
        <Bar dataKey="total" name="Logins" stackId="a" fill="#1e5b78" radius={[0, 0, 0, 0]} />
        <Bar dataKey="anomalies" name="Anomalies" stackId="a" fill="#f87171" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ScoreChart({ data }: { data: Summary['score_distribution'] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 14, right: 4, left: -22, bottom: 0 }} barCategoryGap={1}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bin" tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(2)} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(_, p) => {
          const d = p?.[0]?.payload as Summary['score_distribution'][number] | undefined
          return d ? `Score ${d.from.toFixed(3)} to ${d.to.toFixed(3)}${d.flagged ? ' · flagged' : ''}` : ''
        }} />
        <Bar dataKey="count" name="Events" radius={[3, 3, 0, 0]} animationDuration={900}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.flagged ? '#f87171' : 'rgba(34,211,238,0.55)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SeverityDonut({ severity }: { severity: Summary['severity'] }) {
  const data = (['high', 'medium', 'low'] as const).map((k) => ({ name: k, value: severity[k] }))
  const total = data.reduce((a, b) => a + b.value, 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={58} outerRadius={78} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270} animationDuration={900}>
            {data.map((d) => <Cell key={d.name} fill={SEV_COLOR[d.name]} />)}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v, n) => [v, String(n).replace(/^./, (c) => c.toUpperCase())]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold text-white tabular-nums">{total}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">flagged</span>
      </div>
    </div>
  )
}
