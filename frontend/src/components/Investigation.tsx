import { Clock, Cpu, Fingerprint, Globe2, Info, MapPin, ShieldAlert, ShieldCheck, ShieldQuestion, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { EventDetail, Triage } from '../api'
import { api, fmtTime } from '../api'
import { SEV_COLOR, SeverityBadge, Spinner, SyntheticTag, TriageBadge } from './ui'

export default function Investigation({ id, onClose, onChanged, onOpen }: {
  id: string
  onClose: () => void
  onChanged: () => void
  onOpen: (id: string) => void
}) {
  const [d, setD] = useState<EventDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setD(null); setErr(null)
    api.event(id).then((r) => live && setD(r)).catch((e) => live && setErr(String(e)))
    return () => { live = false }
  }, [id])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const setTriage = async (t: Triage) => {
    if (!d) return
    setBusy(true)
    await api.triage(d.id, t)
    setD({ ...d, triage: t })
    setBusy(false)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade bg-ink-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[560px] animate-slide-in flex-col border-l border-line bg-ink-900/95 shadow-2xl">
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
              <Fingerprint size={13} /> Threat investigation
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="font-mono text-lg font-semibold text-white">{id}</h2>
              <SyntheticTag />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"><X size={18} /></button>
        </header>

        {!d && !err && <div className="grid flex-1 place-items-center"><Spinner /></div>}
        {err && <div className="p-6 text-sm text-red-300">Could not load event: {err}</div>}

        {d && (
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Model verdict */}
            <section className="panel p-4">
              <div className="flex items-center gap-4">
                <Gauge value={d.risk_percentile} anomaly={d.is_anomaly} severity={d.severity} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={d.severity} />
                    <TriageBadge triage={d.triage} />
                  </div>
                  <p className="text-sm text-slate-300">
                    {d.is_anomaly
                      ? <>The Isolation Forest flagged this event as <b className="text-white">unusual</b>. It is more isolated than {d.risk_percentile.toFixed(1)}% of training events.</>
                      : <>The model did <b className="text-white">not</b> flag this event. Its pattern resembles most training events.</>}
                  </p>
                  <div className="flex gap-4 font-mono text-[11px] text-slate-400">
                    <span>decision_function: <span className={d.anomaly_score < 0 ? 'text-red-300' : 'text-slate-200'}>{d.anomaly_score.toFixed(4)}</span></span>
                    <span>threshold: 0</span>
                  </div>
                </div>
              </div>
              {d.is_anomaly && (
                <div className="mt-3 flex gap-2 rounded-lg bg-cyan-300/[0.06] p-3 text-xs leading-relaxed text-cyan-100/90 ring-1 ring-inset ring-cyan-300/15">
                  <Info size={14} className="mt-px shrink-0 text-cyan-300" />
                  An anomaly is a statistical outlier, not a confirmed attack. Unusual events can be legitimate, such as travel, overtime or a new laptop. Only an analyst's review can confirm an attack.
                </div>
              )}
            </section>

            {/* Event details */}
            <section>
              <SectionTitle>Event details</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <Detail icon={<Clock size={13} />} label="Timestamp" value={fmtTime(d.timestamp)} />
                <Detail icon={<User size={13} />} label="User (anonymized)" value={d.user_id} mono />
                <Detail icon={<Globe2 size={13} />} label="Source IP" value={d.ip} mono />
                <Detail icon={<MapPin size={13} />} label="Approx. location" value={`${d.city}, ${d.country}`} />
                <Detail icon={<Cpu size={13} />} label="Device / client" value={d.device} />
                <Detail icon={<ShieldQuestion size={13} />} label="Result" value={d.success ? 'Success' : `Failed (${d.failed_last_hour} in last hour)`} tone={d.success ? 'text-emerald-300' : 'text-amber-300'} />
              </div>
            </section>

            {/* Factors */}
            <section>
              <SectionTitle>Possible contributing factors</SectionTitle>
              <p className="-mt-1 mb-3 text-[11px] leading-relaxed text-slate-500">
                These are rule-based comparisons against this user's baseline and the dataset. They help explain why the event may look unusual. They are <i>not</i> exact feature attributions from the model.
              </p>
              {d.factors.length ? (
                <ul className="space-y-2">
                  {d.factors.map((f) => (
                    <li key={f.feature + f.title} className="flex gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-inset ring-white/5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: f.level === 'high' ? SEV_COLOR.high : f.level === 'medium' ? SEV_COLOR.medium : SEV_COLOR.low }} />
                      <div>
                        <div className="text-sm font-medium text-slate-100">{f.title}</div>
                        <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{f.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg bg-white/[0.02] p-3 text-xs text-slate-400 ring-1 ring-inset ring-white/5">
                  No individual rule stands out. Any unusualness comes from the <i>combination</i> of features, which the model can capture but single-rule checks cannot.
                </div>
              )}
            </section>

            {/* Comparison table */}
            <section>
              <SectionTitle>Model inputs vs. dataset median</SectionTitle>
              <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-white/5">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-3 py-2 text-left font-medium">Feature</th><th className="px-3 py-2 text-right font-medium">This event</th><th className="px-3 py-2 text-right font-medium">Median</th></tr>
                  </thead>
                  <tbody>
                    {d.comparisons.map((c) => (
                      <tr key={c.feature} className="border-t border-line/60">
                        <td className="px-3 py-1.5 text-slate-300">{c.label}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${c.above_p95 ? 'text-amber-200' : 'text-slate-200'}`}>
                          {c.value}{c.above_p95 && <span className="ml-1 text-[9px] text-amber-300/80">&gt;p95</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-500">{c.median}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Baseline */}
            <section>
              <SectionTitle>User baseline</SectionTitle>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Detail label="Baseline location" value={d.baseline.home} />
                <Detail label="Typical login time" value={`~${String(Math.floor(d.baseline.typical_hour)).padStart(2, '0')}:${String(Math.round((d.baseline.typical_hour % 1) * 60)).padStart(2, '0')}`} />
                <Detail label="Known devices" value={d.baseline.devices.join(', ')} />
                <Detail label="Known IPs" value={d.baseline.ips.join(', ')} mono />
              </div>
              <div className="mt-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Recent activity for {d.user_id}</div>
                {d.user_history.map((h) => (
                  <button key={h.id} onClick={() => h.id !== d.id && onOpen(h.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${h.id === d.id ? 'bg-cyan-300/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.03]'}`}>
                    <span className="font-mono">{fmtTime(h.timestamp)}</span>
                    <span className="truncate px-2">{h.city} · {h.success ? 'ok' : 'fail'}</span>
                    <span className={`font-mono ${h.is_anomaly ? 'text-red-300' : 'text-slate-500'}`}>{h.risk_percentile.toFixed(0)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {d && d.is_anomaly && (
          <footer className="border-t border-line bg-ink-900 px-6 py-4">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Analyst decision</div>
            <div className="grid grid-cols-3 gap-2">
              <TriageBtn active={d.triage === 'reviewing'} disabled={busy} onClick={() => setTriage('reviewing')} icon={<ShieldQuestion size={14} />} cls="hover:border-amber-300/40 data-[on=true]:border-amber-300/60 data-[on=true]:bg-amber-300/10 data-[on=true]:text-amber-100">Investigating</TriageBtn>
              <TriageBtn active={d.triage === 'confirmed'} disabled={busy} onClick={() => setTriage('confirmed')} icon={<ShieldAlert size={14} />} cls="hover:border-red-400/40 data-[on=true]:border-red-400/70 data-[on=true]:bg-red-500/15 data-[on=true]:text-red-100">Confirm attack</TriageBtn>
              <TriageBtn active={d.triage === 'dismissed'} disabled={busy} onClick={() => setTriage('dismissed')} icon={<ShieldCheck size={14} />} cls="hover:border-slate-300/30 data-[on=true]:border-slate-300/40 data-[on=true]:bg-slate-300/10 data-[on=true]:text-slate-100">False positive</TriageBtn>
            </div>
            {d.triage !== 'new' && (
              <button onClick={() => setTriage('new')} className="mt-2 text-[11px] text-slate-500 hover:text-slate-300">Reset to unreviewed</button>
            )}
          </footer>
        )}
      </aside>
    </div>
  )
}

function Gauge({ value, anomaly, severity }: { value: number; anomaly: boolean; severity: string }) {
  const r = 34, c = 2 * Math.PI * r
  const color = !anomaly ? '#3b5179' : severity === 'high' ? SEV_COLOR.high : severity === 'medium' ? SEV_COLOR.medium : SEV_COLOR.low
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#16264a" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.2,.7,.2,1)', filter: anomaly ? `drop-shadow(0 0 6px ${color})` : undefined }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-semibold text-white tabular-nums">{value.toFixed(0)}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400">risk pct.</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-2.5 font-display text-[13px] font-semibold uppercase tracking-wider text-slate-300">{children}</h4>
}

function Detail({ icon, label, value, mono, tone }: { icon?: ReactNode; label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-inset ring-white/5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">{icon}{label}</div>
      <div className={`mt-0.5 break-words text-[13px] ${tone ?? 'text-slate-100'} ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  )
}

function TriageBtn({ children, active, onClick, icon, cls, disabled }: { children: ReactNode; active: boolean; onClick: () => void; icon: ReactNode; cls: string; disabled: boolean }) {
  return (
    <button data-on={active} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-2 text-xs font-medium text-slate-300 transition disabled:opacity-50 ${cls}`}>
      {icon}{children}
    </button>
  )
}
