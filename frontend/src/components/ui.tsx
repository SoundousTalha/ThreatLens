import type { ReactNode } from 'react'
import type { Severity, Triage } from '../api'

export function Panel({ title, subtitle, action, children, className = '', delay = 0 }: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <section className={`panel animate-rise p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-display text-[15px] font-semibold tracking-tight text-slate-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export const SEV_COLOR: Record<Exclude<Severity, 'none'>, string> = {
  high: 'var(--color-sev-high)',
  medium: 'var(--color-sev-med)',
  low: 'var(--color-sev-low)',
}

const sevStyles: Record<Severity, string> = {
  high: 'bg-red-400/10 text-red-300 ring-red-400/25',
  medium: 'bg-amber-400/10 text-amber-200 ring-amber-400/25',
  low: 'bg-indigo-400/10 text-indigo-200 ring-indigo-400/25',
  none: 'bg-slate-400/5 text-slate-400 ring-slate-400/15',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severity === 'none' ? 'Normal' : severity[0].toUpperCase() + severity.slice(1)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${sevStyles[severity]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: severity === 'none' ? '#64748b' : SEV_COLOR[severity] }} />
      {label}
    </span>
  )
}

const triageMeta: Record<Triage, { label: string; cls: string }> = {
  new: { label: 'Anomaly · unreviewed', cls: 'text-cyan-200 ring-cyan-300/25 bg-cyan-300/5' },
  reviewing: { label: 'Under review', cls: 'text-amber-200 ring-amber-300/25 bg-amber-300/5' },
  confirmed: { label: 'Confirmed attack', cls: 'text-white ring-red-400/50 bg-red-500/25' },
  dismissed: { label: 'False positive', cls: 'text-slate-400 ring-slate-400/20 bg-slate-400/5' },
  none: { label: 'Not flagged', cls: 'text-slate-500 ring-slate-500/15' },
}

export function TriageBadge({ triage }: { triage: Triage }) {
  const m = triageMeta[triage]
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${m.cls}`}>{m.label}</span>
}

export function SyntheticTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded border border-dashed border-cyan-300/30 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-cyan-200/80 ${className}`}>
      Synthetic
    </span>
  )
}

export function RiskBar({ value, anomaly }: { value: number; anomaly: boolean }) {
  const color = !anomaly ? '#3b5179' : value >= 99 ? 'var(--color-sev-high)' : value >= 97.5 ? 'var(--color-sev-med)' : 'var(--color-sev-low)'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full" style={{ width: `${Math.max(value, 3)}%`, background: color }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${anomaly ? 'text-slate-100' : 'text-slate-500'}`}>{value.toFixed(1)}</span>
    </div>
  )
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
}
