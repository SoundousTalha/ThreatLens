import { Activity, AlertTriangle, ChevronRight, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Summary } from '../api'
import { fmtTime } from '../api'
import { HourlyChart, ScoreChart, SeverityDonut, TimelineChart } from './Charts'
import { Panel, RiskBar, SeverityBadge, TriageBadge } from './ui'

function Kpi({ icon, label, value, sub, tone, delay }: {
  icon: ReactNode; label: string; value: number | string; sub: ReactNode; tone: string; delay: number
}) {
  return (
    <div className="panel animate-rise group relative overflow-hidden p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-35" style={{ background: tone }} />
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
        <span className="grid h-7 w-7 place-items-center rounded-lg ring-1 ring-inset ring-white/5" style={{ color: tone, background: 'rgba(255,255,255,0.03)' }}>{icon}</span>
        {label}
      </div>
      <div className="mt-3 font-display text-[34px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{sub}</div>
    </div>
  )
}

export default function Overview({ summary, onOpen, onGoEvents, onGoLab }: {
  summary: Summary
  onOpen: (id: string) => void
  onGoEvents: () => void
  onGoLab: () => void
}) {
  const s = summary
  const failRate = ((s.failed / s.total) * 100).toFixed(1)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi delay={0} icon={<Activity size={15} />} tone="#22d3ee" label="Login attempts" value={s.total.toLocaleString()}
          sub={<>{s.users} anonymized users · 30 days + simulations</>} />
        <Kpi delay={60} icon={<KeyRound size={15} />} tone="#f5b84b" label="Failed logins" value={s.failed.toLocaleString()}
          sub={<>{failRate}% of all attempts</>} />
        <Kpi delay={120} icon={<AlertTriangle size={15} />} tone="#f87171" label="Anomalies flagged" value={s.anomalies}
          sub={<>{s.open} awaiting analyst review</>} />
        <Kpi delay={180} icon={<ShieldAlert size={15} />} tone="#fda4af" label="Confirmed attacks" value={s.confirmed}
          sub={s.confirmed ? <>Confirmed by an analyst after review</> : <>Only an analyst can confirm an attack</>} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" delay={200} title="Login activity timeline"
          subtitle="Daily attempts, failures and model-flagged anomalies"
          action={<Legend items={[['#22d3ee', 'Attempts'], ['#f5b84b', 'Failed'], ['#f87171', 'Anomalies']]} />}>
          <TimelineChart data={s.timeline} />
        </Panel>
        <Panel delay={260} title="Alert severity" subtitle="Assigned by risk percentile among flagged events">
          <SeverityDonut severity={s.severity} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(['high', 'medium', 'low'] as const).map((k) => (
              <div key={k} className="rounded-lg bg-white/[0.02] py-2 ring-1 ring-inset ring-white/5">
                <div className="font-display text-lg font-semibold text-white tabular-nums">{s.severity[k]}</div>
                <div className="mt-0.5 flex justify-center"><SeverityBadge severity={k} /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
            <TriageRow label="Unreviewed" n={s.triage.new} color="#22d3ee" total={s.anomalies} />
            <TriageRow label="Under review" n={s.triage.reviewing} color="#f5b84b" total={s.anomalies} />
            <TriageRow label="Confirmed attack" n={s.triage.confirmed} color="#f87171" total={s.anomalies} />
            <TriageRow label="False positive" n={s.triage.dismissed} color="#64748b" total={s.anomalies} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Panel delay={320} title="Anomaly score distribution" subtitle="Isolation Forest decision scores. Events below 0 (red) are flagged.">
          <ScoreChart data={s.score_distribution} />
        </Panel>
        <Panel delay={380} title="Activity by hour of day" subtitle="Logins (teal) with anomalies stacked (red)">
          <HourlyChart data={s.hourly} />
        </Panel>
        <Panel delay={440} className="lg:col-span-2 xl:col-span-1" title="Recent alerts" subtitle="Latest events flagged by the model"
          action={<button onClick={onGoEvents} className="inline-flex items-center gap-0.5 text-xs text-cyan-300 hover:text-cyan-200">All events <ChevronRight size={14} /></button>}>
          <ul className="-mx-2 max-h-[232px] space-y-0.5 overflow-y-auto pr-1">
            {s.recent_alerts.map((e) => (
              <li key={e.id}>
                <button onClick={() => onOpen(e.id)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-cyan-300/[0.05]">
                  <span className="h-8 w-1 rounded-full" style={{ background: e.severity === 'high' ? 'var(--color-sev-high)' : e.severity === 'medium' ? 'var(--color-sev-med)' : 'var(--color-sev-low)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] text-slate-100">
                      <span className="font-mono">{e.user_id}</span>
                      <span className="truncate text-slate-400">· {e.city}, {e.country}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      {fmtTime(e.timestamp)} · {e.success ? 'success' : 'failed'} <TriageBadge triage={e.triage} />
                    </div>
                  </div>
                  <RiskBar value={e.risk_percentile} anomaly />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="panel animate-rise flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center" style={{ animationDelay: '500ms' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300 ring-1 ring-inset ring-cyan-300/20"><ShieldCheck size={20} /></span>
          <div>
            <div className="font-display font-semibold text-white">Test the detector live</div>
            <div className="text-sm text-slate-400">Inject a scenario such as off-hours access or a brute-force burst. The trained model scores it instantly.</div>
          </div>
        </div>
        <button onClick={onGoLab} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-ink-950 shadow-[0_0_24px_-6px_rgba(34,211,238,0.7)] transition hover:bg-cyan-300">
          Open Scenario Lab
        </button>
      </div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="hidden gap-3 sm:flex">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}
        </span>
      ))}
    </div>
  )
}

function TriageRow({ label, n, color, total }: { label: string; n: number; color: string; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: color }} />
      </div>
      <span className="w-7 text-right font-mono tabular-nums text-slate-300">{n}</span>
    </div>
  )
}
