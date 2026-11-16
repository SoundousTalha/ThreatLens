import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LoginEvent } from '../api'
import { fmtTime } from '../api'
import { Panel, RiskBar, SeverityBadge, SyntheticTag, TriageBadge } from './ui'

const PAGE = 15

export interface Filters {
  q: string
  result: 'all' | 'success' | 'failed'
  flag: 'all' | 'flagged' | 'normal'
  severity: 'all' | 'high' | 'medium' | 'low'
  triage: 'all' | 'new' | 'reviewing' | 'confirmed' | 'dismissed'
}

export const defaultFilters: Filters = { q: '', result: 'all', flag: 'all', severity: 'all', triage: 'all' }

export default function EventsTable({ events, filters, setFilters, onOpen, selectedId }: {
  events: LoginEvent[]
  filters: Filters
  setFilters: (f: Filters) => void
  onOpen: (id: string) => void
  selectedId: string | null
}) {
  const [page, setPage] = useState(0)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setFilters({ ...filters, [k]: v }); setPage(0) }

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return events.filter((e) => {
      if (q && !`${e.id} ${e.user_id} ${e.ip} ${e.city} ${e.country} ${e.device}`.toLowerCase().includes(q)) return false
      if (filters.result === 'success' && !e.success) return false
      if (filters.result === 'failed' && e.success) return false
      if (filters.flag === 'flagged' && !e.is_anomaly) return false
      if (filters.flag === 'normal' && e.is_anomaly) return false
      if (filters.severity !== 'all' && e.severity !== filters.severity) return false
      if (filters.triage !== 'all' && e.triage !== filters.triage) return false
      return true
    })
  }, [events, filters])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const p = Math.min(page, pages - 1)
  const view = rows.slice(p * PAGE, p * PAGE + PAGE)
  const active = JSON.stringify(filters) !== JSON.stringify(defaultFilters)

  return (
    <Panel title={<span className="flex items-center gap-2">Login records <SyntheticTag /></span>}
      subtitle={`${rows.length.toLocaleString()} of ${events.length.toLocaleString()} records · click a row to investigate`}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Search user, IP, city, device or event ID…"
            className="w-full rounded-lg border border-line bg-ink-900/80 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-500" />
          <Select value={filters.flag} onChange={(v) => set('flag', v as Filters['flag'])}
            options={[['all', 'All events'], ['flagged', 'Flagged only'], ['normal', 'Not flagged']]} />
          <Select value={filters.result} onChange={(v) => set('result', v as Filters['result'])}
            options={[['all', 'Any result'], ['success', 'Successful'], ['failed', 'Failed']]} />
          <Select value={filters.severity} onChange={(v) => set('severity', v as Filters['severity'])}
            options={[['all', 'Any severity'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
          <Select value={filters.triage} onChange={(v) => set('triage', v as Filters['triage'])}
            options={[['all', 'Any status'], ['new', 'Unreviewed'], ['reviewing', 'Under review'], ['confirmed', 'Confirmed attack'], ['dismissed', 'False positive']]} />
          {active && (
            <button onClick={() => { setFilters(defaultFilters); setPage(0) }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-white">
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-[13px]">
          <thead>
            <tr className="border-y border-line text-[11px] uppercase tracking-wider text-slate-500">
              {['Time', 'Event', 'User', 'Source IP', 'Location', 'Device', 'Result', 'Risk pct.', 'Severity', 'Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium first:pl-5 last:pr-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((e) => (
              <tr key={e.id} onClick={() => onOpen(e.id)}
                className={`cursor-pointer border-b border-line/60 transition hover:bg-cyan-300/[0.04] ${selectedId === e.id ? 'bg-cyan-300/[0.07]' : ''} ${e.is_anomaly ? 'shadow-[inset_2px_0_0_0_var(--color-sev-high)]' : ''}`}>
                <td className="whitespace-nowrap px-3 py-2.5 pl-5 text-slate-400">{fmtTime(e.timestamp)}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{e.id}{e.simulated && <span className="ml-1.5 rounded bg-violet-400/15 px-1 py-px text-[10px] text-violet-200">sim</span>}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-100">{e.user_id}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{e.ip}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">{e.city}<span className="text-slate-500">, {e.country}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{e.device}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-medium ${e.success ? 'text-emerald-300/90' : 'text-amber-300'}`}>{e.success ? 'Success' : 'Failed'}</span>
                  {e.failed_last_hour >= 3 && <span className="ml-1 font-mono text-[10px] text-amber-300/70">×{e.failed_last_hour}</span>}
                </td>
                <td className="px-3 py-2.5"><RiskBar value={e.risk_percentile} anomaly={e.is_anomaly} /></td>
                <td className="px-3 py-2.5"><SeverityBadge severity={e.severity} /></td>
                <td className="px-3 py-2.5 pr-5"><TriageBadge triage={e.triage} /></td>
              </tr>
            ))}
            {!view.length && (
              <tr><td colSpan={10} className="py-14 text-center text-sm text-slate-500">No records match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>Page {p + 1} of {pages}</span>
        <div className="flex gap-1.5">
          <PageBtn disabled={p === 0} onClick={() => setPage(p - 1)}><ChevronLeft size={14} /> Prev</PageBtn>
          <PageBtn disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next <ChevronRight size={14} /></PageBtn>
        </div>
      </div>
    </Panel>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-ink-900/80 px-2.5 py-2 text-xs text-slate-200 outline-none transition hover:border-cyan-300/25 focus:border-cyan-300/40">
      {options.map(([v, l]) => <option key={v} value={v} className="bg-ink-900">{l}</option>)}
    </select>
  )
}

function PageBtn({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 transition enabled:hover:border-cyan-300/30 enabled:hover:text-white disabled:opacity-35">
      {children}
    </button>
  )
}
