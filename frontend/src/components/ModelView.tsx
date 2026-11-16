import { ArrowRight, Binary, BrainCircuit, Database, FileWarning, Gauge, ScanSearch } from 'lucide-react'
import type { ModelInfo } from '../api'
import { Panel, SyntheticTag } from './ui'

const PATTERN_LABEL: Record<string, string> = {
  brute_force: 'Brute force bursts',
  credential_stuffing: 'Credential stuffing',
  impossible_travel: 'Impossible travel',
  new_device_abroad: 'New device abroad',
  off_hours: 'Off-hours access',
  normal: 'Normal behaviour',
}

export default function ModelView({ info }: { info: ModelInfo }) {
  const sc = info.synthetic_check
  const steps = [
    { icon: <Database size={18} />, title: 'Synthetic data', text: `${info.training_records.toLocaleString()} login records, seed ${info.params.random_state}` },
    { icon: <Binary size={18} />, title: 'Feature engineering', text: `${info.features.length} numeric behavioural features` },
    { icon: <BrainCircuit size={18} />, title: 'Isolation Forest', text: `${info.params.n_estimators} trees · contamination ${info.params.contamination}` },
    { icon: <Gauge size={18} />, title: 'Scoring', text: 'decision_function < 0 → anomaly; percentile → severity' },
    { icon: <ScanSearch size={18} />, title: 'Analyst triage', text: 'Review, then confirm or dismiss' },
  ]
  return (
    <div className="space-y-5">
      <Panel title="Detection pipeline" subtitle="How an event moves from raw login to analyst decision">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {steps.map((s, i) => (
            <div key={s.title} className="flex flex-1 items-stretch gap-3">
              <div className="animate-rise h-full flex-1 rounded-xl border border-line bg-ink-900/60 p-4" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300 ring-1 ring-inset ring-cyan-300/20">{s.icon}</span>
                <div className="mt-3 font-display text-sm font-semibold text-white">{s.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">{s.text}</div>
              </div>
              {i < steps.length - 1 && <ArrowRight size={16} className="hidden shrink-0 self-center text-cyan-300/40 lg:block" />}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Model features" subtitle="All features are computed from past activity only (backward-looking windows)">
          <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-white/5">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2 text-left font-medium">Feature</th><th className="px-3 py-2 text-left font-medium">Key</th><th className="px-3 py-2 text-right font-medium">Median</th><th className="px-3 py-2 text-right font-medium">p95</th></tr>
              </thead>
              <tbody>
                {info.features.map((f) => (
                  <tr key={f.key} className="border-t border-line/60">
                    <td className="px-3 py-2 text-slate-200">{f.label}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-cyan-200/70">{f.key}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{f.median.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{f.p95.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Distance and travel speed are log-transformed. Isolation Forest isolates points with random splits, so outliers need fewer splits and get lower scores. Feature scaling is not required.
          </p>
        </Panel>

        <Panel title={<span className="flex items-center gap-2">Sanity check on synthetic data <SyntheticTag /></span>}
          subtitle="Do flags line up with the patterns the generator injected? (The model never sees these labels.)">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Injected-pattern records flagged" value={`${sc.injected_flagged} / ${sc.injected_records}`} />
            <Stat label="Normal records flagged" value={`${sc.normal_flagged} / ${sc.normal_records.toLocaleString()}`} />
          </div>
          <div className="mt-4 space-y-2.5">
            {sc.by_pattern.map((p) => {
              const pct = p.records ? (p.flagged / p.records) * 100 : 0
              return (
                <div key={p.pattern}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-300">{PATTERN_LABEL[p.pattern] ?? p.pattern}</span>
                    <span className="font-mono text-slate-400">{p.flagged}/{p.records.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 0.8)}%`, background: p.pattern === 'normal' ? '#64748b' : '#22d3ee' }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-2 rounded-lg bg-amber-300/[0.06] p-3 text-xs leading-relaxed text-amber-100/85 ring-1 ring-inset ring-amber-300/15">
            <FileWarning size={14} className="mt-px shrink-0 text-amber-300" />
            {info.caveat}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-inset ring-white/5">
      <div className="font-display text-2xl font-semibold text-white tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  )
}
