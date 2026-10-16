import { useCallback, useEffect, useState } from 'react'
import { loadPython, type PyState } from './python'
import { DEFAULT_ROI, type RoiInputs } from './roi'
import { runSelfTest, type SelfTestResult } from './selftest'
import type { RawFields } from './rules'
import { timeNow } from './ui'
import Overview from './views/Overview'
import AppView from './views/AppView'
import RulesView from './views/RulesView'
import Readout from './views/Readout'

export type View = 'overview' | 'app' | 'rules' | 'readout'

export type ReadOutcome = 'passed first time' | 'passed after one retry' | 'asked the requester' | 'sent to a person'
export type DraftOutcome = 'passed first time' | 'passed after one retry' | 'sent to a person'
export interface LogEntry<T> {
  time: string
  outcome: T
}

export interface Shared {
  view: View
  go: (view: View, anchor?: string) => void
  py: PyState
  roi: RoiInputs
  setRoi: (r: RoiInputs) => void
  selfTest: SelfTestResult | null
  runSelf: () => SelfTestResult
  readLog: LogEntry<ReadOutcome>[]
  draftLog: LogEntry<DraftOutcome>[]
  logRead: (o: ReadOutcome) => void
  setLastRead: (o: ReadOutcome) => void
  logDraft: (o: DraftOutcome) => void
  lastRaw: RawFields | null
  setLastRaw: (r: RawFields) => void
}

const NAV: [View, string][] = [
  ['overview', 'Overview'],
  ['app', 'App'],
  ['rules', 'Rules Module'],
  ['readout', 'Readout'],
]

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [py, setPy] = useState<PyState>({ status: 'loading' })
  const [roi, setRoi] = useState<RoiInputs>(DEFAULT_ROI)
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null)
  const [readLog, setReadLog] = useState<LogEntry<ReadOutcome>[]>([])
  const [draftLog, setDraftLog] = useState<LogEntry<DraftOutcome>[]>([])
  const [lastRaw, setLastRaw] = useState<RawFields | null>(null)

  const runSelf = useCallback(() => {
    const result = runSelfTest()
    setSelfTest(result)
    return result
  }, [])

  // Load Python once, without blocking the page; then run Self-Test for the live badge.
  useEffect(() => {
    loadPython().then((state) => {
      setPy(state)
      runSelf()
    })
  }, [runSelf])

  const go = useCallback((next: View, anchor?: string) => {
    setView(next)
    requestAnimationFrame(() => {
      if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else window.scrollTo({ top: 0 })
    })
  }, [])

  const shared: Shared = {
    view,
    go,
    py,
    roi,
    setRoi,
    selfTest,
    runSelf,
    readLog,
    draftLog,
    logRead: (outcome) => setReadLog((l) => [...l, { time: timeNow(), outcome }]),
    setLastRead: (outcome) =>
      setReadLog((l) => (l.length ? [...l.slice(0, -1), { ...l[l.length - 1], outcome }] : [{ time: timeNow(), outcome }])),
    logDraft: (outcome) => setDraftLog((l) => [...l, { time: timeNow(), outcome }]),
    lastRaw,
    setLastRaw,
  }

  return (
    <div className="min-h-screen">
      <header className="no-print bg-primary text-white">
        <div className="mx-auto flex h-14 max-w-[72rem] items-center justify-between gap-4 px-4">
          <div className="flex items-baseline gap-2">
            <button className="font-semibold" onClick={() => go('overview')}>
              Escalation Router
            </button>
            <span className="hidden text-xs text-white/70 sm:inline">Prototype · synthetic data</span>
          </div>
          <nav className="flex gap-4 overflow-x-auto">
            {NAV.map(([key, label]) => (
              <button
                key={key}
                onClick={() => go(key)}
                className={`whitespace-nowrap py-1 ${view === key ? 'underline decoration-white decoration-2 underline-offset-8' : 'text-white/80 hover:text-white'}`}
                aria-current={view === key ? 'page' : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[72rem] px-4 py-6">
        {view === 'overview' && <Overview s={shared} />}
        {view === 'app' && <AppView s={shared} />}
        {view === 'rules' && <RulesView s={shared} />}
        {view === 'readout' && <Readout s={shared} />}
      </main>
    </div>
  )
}
