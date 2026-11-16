import { BrainCircuit, FlaskConical, LayoutDashboard, ListFilter, RefreshCw, ShieldHalf } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { LoginEvent, ModelInfo, Scenario, Summary } from './api'
import { api } from './api'
import EventsTable, { defaultFilters } from './components/EventsTable'
import type { Filters } from './components/EventsTable'
import Investigation from './components/Investigation'
import ModelView from './components/ModelView'
import Overview from './components/Overview'
import ScenarioLab from './components/ScenarioLab'
import { Spinner } from './components/ui'

type Tab = 'overview' | 'events' | 'lab' | 'model'

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
  { key: 'events', label: 'Events', icon: <ListFilter size={15} /> },
  { key: 'lab', label: 'Scenario Lab', icon: <FlaskConical size={15} /> },
  { key: 'model', label: 'Model', icon: <BrainCircuit size={15} /> },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [events, setEvents] = useState<LoginEvent[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [s, e] = await Promise.all([api.summary(), api.events()])
      setSummary(s); setEvents(e); setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    api.scenarios().then(setScenarios).catch(() => {})
    api.model().then(setModel).catch(() => {})
  }, [load])

  const reset = async () => { await api.reset(); setSelected(null); await load() }

  return (
    <div className="bg-grid scanline min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300/25 to-indigo-400/10 text-cyan-300 ring-1 ring-inset ring-cyan-300/30">
              <ShieldHalf size={19} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold tracking-tight text-white">Threat<span className="text-cyan-300">Lens</span></div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">AI Security Operations Center</div>
            </div>
          </div>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${tab === t.key ? 'bg-cyan-300/10 text-white ring-1 ring-inset ring-cyan-300/25' : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'}`}>
                <span className={tab === t.key ? 'text-cyan-300' : ''}>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-ink-900/70 px-3 py-1 text-[11px] text-slate-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Model online · Isolation Forest
            </span>
            <span className="rounded-full border border-dashed border-cyan-300/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-cyan-200/80">Synthetic data</span>
            <button onClick={load} aria-label="Refresh" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {error && (
          <div className="panel mb-5 border-red-400/30 p-4 text-sm text-red-200">
            Cannot reach the ThreatLens API ({error}). Start the backend with <code className="font-mono text-red-100">uvicorn app.main:app --port 8000</code>.
          </div>
        )}
        {!summary && !error && <div className="grid h-[60vh] place-items-center"><Spinner /></div>}

        {summary && (
          <div key={tab} className="animate-fade">
            <PageHeading tab={tab} summary={summary} />
            {tab === 'overview' && <Overview summary={summary} onOpen={setSelected} onGoEvents={() => { setFilters({ ...defaultFilters, flag: 'flagged' }); setTab('events') }} onGoLab={() => setTab('lab')} />}
            {tab === 'events' && <EventsTable events={events} filters={filters} setFilters={setFilters} onOpen={setSelected} selectedId={selected} />}
            {tab === 'lab' && <ScenarioLab scenarios={scenarios} onOpen={setSelected} onChanged={load} onReset={reset} />}
            {tab === 'model' && (model ? <ModelView info={model} /> : <Spinner />)}
          </div>
        )}

        <footer className="mt-10 border-t border-line pt-5 text-center text-xs text-slate-500">
          ThreatLens is a portfolio project. All users, IPs (RFC 5737 documentation ranges) and locations are <span className="text-slate-400">synthetic</span>. Model flags are statistical anomalies, not confirmed attacks.
        </footer>
      </main>

      {selected && <Investigation id={selected} onClose={() => setSelected(null)} onChanged={load} onOpen={setSelected} />}
    </div>
  )
}

function PageHeading({ tab, summary }: { tab: Tab; summary: Summary }) {
  const meta: Record<Tab, [string, string]> = {
    overview: ['Security overview', `Login telemetry ${new Date(summary.range.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(summary.range.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`],
    events: ['Event explorer', 'Search, filter and investigate every login attempt'],
    lab: ['Scenario Lab', 'Simulate attack-like behaviour and watch the detector respond'],
    model: ['Model card', 'What the detector sees, how it decides, and what its numbers do and do not mean'],
  }
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{meta[tab][0]}</h1>
      <p className="mt-1 text-sm text-slate-400">{meta[tab][1]}</p>
    </div>
  )
}
