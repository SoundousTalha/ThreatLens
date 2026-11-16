export type Severity = 'high' | 'medium' | 'low' | 'none'
export type Triage = 'new' | 'reviewing' | 'confirmed' | 'dismissed' | 'none'

export interface LoginEvent {
  id: string
  timestamp: string
  user_id: string
  ip: string
  city: string
  country: string
  device: string
  success: boolean
  failed_last_hour: number
  risk_percentile: number
  anomaly_score: number
  is_anomaly: boolean
  severity: Severity
  triage: Triage
  simulated: boolean
  synthetic: true
}

export interface Factor {
  feature: string
  title: string
  detail: string
  level: 'high' | 'medium' | 'low'
}

export interface EventDetail extends LoginEvent {
  login_hour: number
  km_from_home: number
  travel_speed_kmh: number
  ip_users_24h: number
  new_device: boolean
  new_ip: boolean
  factors: Factor[]
  comparisons: { feature: string; label: string; value: string; median: string; above_p95: boolean }[]
  baseline: { home: string; typical_hour: number; devices: string[]; ips: string[] }
  user_history: LoginEvent[]
}

export interface Summary {
  total: number
  failed: number
  anomalies: number
  users: number
  confirmed: number
  open: number
  severity: Record<'high' | 'medium' | 'low', number>
  triage: Record<'new' | 'reviewing' | 'confirmed' | 'dismissed', number>
  timeline: { day: string; total: number; failed: number; anomalies: number }[]
  hourly: { hour: number; total: number; anomalies: number }[]
  score_distribution: { bin: number; from: number; to: number; count: number; flagged: boolean }[]
  anomaly_countries: { country: string; count: number }[]
  recent_alerts: LoginEvent[]
  range: { start: string; end: string }
}

export interface Scenario {
  key: string
  name: string
  description: string
}

export interface SimResult {
  scenario: string
  name: string
  events: LoginEvent[]
  flagged: number
  focus_id: string
  note: string
}

export interface ModelInfo {
  algorithm: string
  params: { n_estimators: number; contamination: number; random_state: number }
  training_records: number
  features: { key: string; label: string; median: number; p95: number }[]
  synthetic_check: {
    injected_records: number
    injected_flagged: number
    normal_records: number
    normal_flagged: number
    by_pattern: { pattern: string; records: number; flagged: number }[]
  }
  caveat: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  summary: () => req<Summary>('/summary'),
  events: () => req<LoginEvent[]>('/events'),
  event: (id: string) => req<EventDetail>(`/events/${id}`),
  triage: (id: string, status: Triage) =>
    req<{ id: string; triage: Triage }>(`/events/${id}/triage`, { method: 'POST', body: JSON.stringify({ status }) }),
  scenarios: () => req<Scenario[]>('/scenarios'),
  simulate: (scenario: string) => req<SimResult>('/simulate', { method: 'POST', body: JSON.stringify({ scenario }) }),
  reset: () => req<{ status: string }>('/reset', { method: 'POST' }),
  model: () => req<ModelInfo>('/model'),
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
