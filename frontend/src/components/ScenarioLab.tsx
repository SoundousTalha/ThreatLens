import { Clock3, FlaskConical, Globe2, KeyRound, Laptop, Plane, RotateCcw, UserCheck, Users } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Scenario, SimResult } from '../api'
import { api, fmtTime } from '../api'
import { Panel, RiskBar, SeverityBadge, Spinner, SyntheticTag } from './ui'

const ICONS: Record<string, ReactNode> = {
  normal: <UserCheck size={18} />,
  off_hours: <Clock3 size={18} />,
  brute_force: <KeyRound size={18} />,
  impossible_travel: <Plane size={18} />,
  credential_stuffing: <Users size={18} />,
  new_device_abroad: <Laptop size={18} />,
}

export default function ScenarioLab({ scenarios, onOpen, onChanged, onReset }: {
  scenarios: Scenario[]
  onOpen: (id: string) => void
  onChanged: () => void
  onReset: () => void
}) {
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<SimResult[]>([])

  const run = async (key: string) => {
    setRunning(key)
    try {
      const r = await api.simulate(key)
      setResults((prev) => [r, ...prev].slice(0, 6))
      onChanged()
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-3">
        <Panel title={<span className="flex items-center gap-2"><FlaskConical size={16} className="text-cyan-300" /> Choose a scenario</span>}
          subtitle="Inject synthetic login events. The already-trained Isolation Forest scores them and is not retrained."
          action={<button onClick={() => { setResults([]); onReset() }} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:text-white"><RotateCcw size={13} /> Reset dataset</button>}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenarios.map((s, i) => (
              <button key={s.key} onClick={() => run(s.key)} disabled={!!running}
                className="group animate-rise relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border border-line bg-ink-900/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-300/[0.04] disabled:cursor-wait disabled:opacity-60"
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex w-full items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ring-1 ring-inset ${s.key === 'normal' ? 'bg-emerald-300/10 text-emerald-300 ring-emerald-300/20' : 'bg-cyan-300/10 text-cyan-300 ring-cyan-300/20'}`}>{ICONS[s.key] ?? <Globe2 size={18} />}</span>
                  {running === s.key ? <Spinner /> : <span className="text-[11px] font-medium text-cyan-300 opacity-0 transition group-hover:opacity-100">Run →</span>}
                </div>
                <div className="font-display font-semibold text-white">{s.name}{s.key === 'normal' && <span className="ml-2 text-[11px] font-normal text-emerald-300/80">control</span>}</div>
                <div className="text-xs leading-relaxed text-slate-400">{s.description}</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="xl:col-span-2">
        <Panel title="Detection results" subtitle="Latest simulated runs. Open any event to investigate it." className="h-full">
          {!results.length && (
            <div className="grid h-60 place-items-center rounded-xl border border-dashed border-line text-center text-sm text-slate-500">
              <div>
                <FlaskConical className="mx-auto mb-2 text-slate-600" />
                Run a scenario to see how the model scores it.
              </div>
            </div>
          )}
          <div className="space-y-3">
            {results.map((r, idx) => (
              <div key={r.focus_id + idx} className="animate-rise rounded-xl border border-line bg-ink-900/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-semibold text-white">{r.name}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${r.flagged ? 'bg-red-400/10 text-red-200 ring-red-400/25' : 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/25'}`}>
                    {r.flagged}/{r.events.length} flagged
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><SyntheticTag /> {r.events.length} event{r.events.length > 1 ? 's' : ''} for {new Set(r.events.map((e) => e.user_id)).size} account(s)</div>
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                  {r.events.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => onOpen(e.id)} className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-cyan-300/[0.05] ${e.id === r.focus_id ? 'bg-white/[0.03]' : ''}`}>
                        <span className="font-mono text-slate-300">{e.id}</span>
                        <span className="hidden truncate text-slate-500 sm:inline">{fmtTime(e.timestamp)} · {e.city}</span>
                        <span className="flex items-center gap-2"><RiskBar value={e.risk_percentile} anomaly={e.is_anomaly} /><SeverityBadge severity={e.severity} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => onOpen(r.focus_id)} className="mt-2 text-xs font-medium text-cyan-300 hover:text-cyan-200">Investigate highest-risk event →</button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
