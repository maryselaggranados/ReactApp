import { useState } from 'react'
import type { Shared } from '../App'
import { acceptIssueType, draftWithChecks, readWithRetry } from '../ai'
import { decideBoth } from '../engine'
import { lastLine, pyDeterminism, pythonReady } from '../python'
import {
  COORD,
  ENG,
  FIELDS,
  NEXT_STEP,
  PRIVACY,
  PRODUCT,
  RANK,
  RENEWAL_WINDOW_DAYS,
  RULES_TABLE,
  SAMPLE_REQUESTS,
  SCENARIOS,
  SEV1,
  SEV1_TEACHERS,
  SUPPORT,
  validate,
  type RawFields,
  type Typed,
} from '../rules'
import { RULES_PY } from '../rulesPy'
import { runStressTest, type StressResult } from '../selftest'
import { Badge, Card, DECIDER_BORDER, Divider, LinkButton, Loading, Mono, PrimaryButton, SecondaryButton, StatusWord, type Decider } from '../ui'

interface RunRow {
  read: string
  fieldCheck: string
  fieldPass: boolean | null
  route: string | null
  draft: string | null
  draftCheck: string
  draftPass: boolean | null
}

const WAITING = 'Waiting for the requester'
const first20 = (text: string) => {
  const words = text.trim().split(/\s+/)
  return words.length > 20 ? words.slice(0, 20).join(' ') + '…' : text
}

function Cell({ decider, children, right }: { decider: Decider; children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`border-l-[3px] px-3 py-2 align-top ${DECIDER_BORDER[decider]} ${right ? 'tabular text-right' : ''}`}>{children}</td>
  )
}

export default function RulesView({ s }: { s: Shared }) {
  const [sample, setSample] = useState<keyof typeof SAMPLE_REQUESTS>('clean')
  const [runs, setRuns] = useState<RunRow[] | null>(null)
  const [running, setRunning] = useState<number | null>(null)
  const [determinism, setDeterminism] = useState<string | null>(null)
  const [stress, setStress] = useState<StressResult | null>(null)
  const [copied, setCopied] = useState(false)

  async function runOnce(text: string): Promise<RunRow> {
    const read = await readWithRetry(text)
    if (!read.ok || !read.check) {
      s.logRead('sent to a person')
      return {
        read: read.error || 'AI unavailable',
        fieldCheck: 'Sent to a person',
        fieldPass: false,
        route: null,
        draft: null,
        draftCheck: 'Skipped',
        draftPass: null,
      }
    }
    const c = read.check
    const readText = FIELDS.map((k) => `${k}: ${c.values[k] || 'missing'}`).join(' · ')
    if (c.failing.length) {
      s.logRead('asked the requester')
      return { read: readText, fieldCheck: 'Asked the requester', fieldPass: false, route: WAITING, draft: WAITING, draftCheck: 'Skipped', draftPass: null }
    }
    s.logRead(read.retried ? 'passed after one retry' : 'passed first time')
    const raw: RawFields = { ...c.values, issue_type: acceptIssueType(c.values.issue_type, c.confidence.issue_type) }
    const outcome = decideBoth(raw)
    const route = `${outcome.decision.result} · ${outcome.mismatch ? 'Engine mismatch' : outcome.decision.rules_fired.join(', ')}`
    const fieldCheck = read.retried ? 'Passed after one retry' : 'Pass'
    const { typed, errors } = validate(raw)
    if (errors.length) return { read: readText, fieldCheck, fieldPass: true, route, draft: null, draftCheck: 'Skipped', draftPass: null }
    const draft = await draftWithChecks(typed as Typed, outcome.decision)
    if (!draft.ok || draft.summary === undefined) {
      return { read: readText, fieldCheck, fieldPass: true, route, draft: draft.error || 'Draft unavailable', draftCheck: 'Skipped', draftPass: null }
    }
    s.logDraft(draft.held ? 'sent to a person' : draft.retried ? 'passed after one retry' : 'passed first time')
    const failed = (draft.checks || []).filter((x) => !x.pass).map((x) => x.id)
    return {
      read: readText,
      fieldCheck,
      fieldPass: true,
      route,
      draft: draft.summary,
      draftCheck: draft.held ? `Held for a person: ${failed.join(', ')}` : draft.retried ? 'Passed after one retry' : 'Pass',
      draftPass: !draft.held,
    }
  }

  async function runThree() {
    setRuns(null)
    setRunning(Date.now())
    const text = SAMPLE_REQUESTS[sample].text
    const rows = await Promise.all([runOnce(text), runOnce(text), runOnce(text)])
    setRuns(rows)
    setRunning(null)
  }

  function runDeterminism() {
    if (!pythonReady()) {
      setDeterminism('Python did not run: still loading.')
      return
    }
    const input = s.lastRaw ?? SCENARIOS[1].fields
    try {
      const n = pyDeterminism(input, 25)
      setDeterminism(`25 runs · ${n} distinct result${n === 1 ? '' : 's'}`)
    } catch (err) {
      setDeterminism(`Python did not run: ${lastLine(err)}`)
    }
  }

  const drafted = runs?.filter((r) => r.draftPass !== null && r.draft !== null) ?? []
  const routed = runs?.filter((r) => r.route && r.route !== WAITING) ?? []
  const checks = runs?.flatMap((r) => [r.fieldPass, r.draftPass]).filter((x): x is boolean => x !== null) ?? []
  const distinctDrafts = new Set(drafted.map((r) => r.draft)).size
  const distinctRoutes = new Set(routed.map((r) => r.route)).size

  const count = <T extends string>(log: { outcome: T }[], o: T) => log.filter((e) => e.outcome === o).length
  const recent = [
    ...s.readLog.map((e) => ({ ...e, kind: 'Read' })),
    ...s.draftLog.map((e) => ({ ...e, kind: 'Draft' })),
  ]
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-10)
    .reverse()

  function printRules() {
    document.body.classList.add('print-rules-only')
    const done = () => {
      document.body.classList.remove('print-rules-only')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  function copySource() {
    navigator.clipboard.writeText(RULES_PY).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function downloadSource() {
    const url = URL.createObjectURL(new Blob([RULES_PY], { type: 'text/x-python' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'rules.py'
    a.click()
    URL.revokeObjectURL(url)
  }

  const st = s.selfTest

  return (
    <div className="flex flex-col gap-6">
      <h1 className="no-print">Determinism + Probabilism</h1>

      {/* Same request, 3 runs */}
      <Card className="no-print">
        <h2 className="mb-3">Same request, 3 runs</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(SAMPLE_REQUESTS) as (keyof typeof SAMPLE_REQUESTS)[]).map((key, i) => (
            <span key={key} className="flex gap-2">
              {i > 0 && <span className="text-muted">·</span>}
              <LinkButton onClick={() => setSample(key)} className={sample === key ? 'font-semibold' : ''}>
                {SAMPLE_REQUESTS[key].name}
              </LinkButton>
            </span>
          ))}
        </div>
        <p className="mb-3 max-w-[44rem] text-muted">{SAMPLE_REQUESTS[sample].text}</p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={runThree} disabled={running !== null}>
            Run this request 3 times
          </PrimaryButton>
          <span className="text-muted">Uses up to 12 AI calls</span>
          {running !== null && <Loading label="Reading the request..." startedAt={running} />}
        </div>
        {runs && (
          <>
            <div className="tabular mb-3 text-[1.75rem] font-bold leading-tight">
              3 runs · {distinctDrafts} different draft{distinctDrafts === 1 ? '' : 's'} · {distinctRoutes} route{distinctRoutes === 1 ? '' : 's'} · checks passed{' '}
              {checks.filter(Boolean).length} / {checks.length}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left">
                <thead>
                  <tr className="text-xs text-muted">
                    {['Run', 'AI read', 'Field check', 'Route and rule IDs', 'AI draft', 'Draft check'].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-muted/20">
                      <Cell decider="rules" right>
                        {i + 1}
                      </Cell>
                      <Cell decider="ai">{r.read}</Cell>
                      <Cell decider="rules">
                        <StatusWord word={r.fieldCheck} />
                      </Cell>
                      <Cell decider="rules">{r.route ?? <StatusWord word="Skipped" />}</Cell>
                      <Cell decider="ai">{r.draft ? first20(r.draft) : <StatusWord word="Skipped" />}</Cell>
                      <Cell decider="rules">
                        <StatusWord word={r.draftCheck} />
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-4 max-w-[44rem]">
          AI reads and writes, and decides only the issue type, which a person can reverse, and its words vary from run to run. Your rules check every AI
          output and make every decision, so the route never varies. A person approves the high-stakes calls. Every miss becomes a test.
        </p>
        <p className="mt-2 max-w-[44rem] text-muted">
          Autonomy: low by design. Code sets the order of the steps; AI reads, asks, and drafts; your rules check and decide; a person approves. Raise
          autonomy only as the checks earn trust.
        </p>
        <Divider />
        <div className="flex flex-wrap items-center gap-3">
          <SecondaryButton onClick={runDeterminism}>Rules alone, run 25 times</SecondaryButton>
          {determinism && <span className="tabular font-semibold">{determinism}</span>}
        </div>
      </Card>

      {/* The check loop */}
      <Card className="no-print">
        <h2 className="mb-3">The check loop</h2>
        <div className="tabular mb-2">
          <span className="font-semibold">Reads:</span> passed first time {count(s.readLog, 'passed first time')} · passed after one retry{' '}
          {count(s.readLog, 'passed after one retry')} · asked the requester {count(s.readLog, 'asked the requester')} · sent to a person{' '}
          {count(s.readLog, 'sent to a person')}
        </div>
        <div className="tabular mb-3">
          <span className="font-semibold">Drafts:</span> passed first time {count(s.draftLog, 'passed first time')} · passed after one retry{' '}
          {count(s.draftLog, 'passed after one retry')} · sent to a person {count(s.draftLog, 'sent to a person')}
        </div>
        {recent.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                {recent.map((e, i) => (
                  <tr key={i} className="h-9 border-t border-muted/20">
                    <td className="tabular pr-4">{e.time}</td>
                    <td className="pr-4">{e.kind}</td>
                    <td>{e.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Your business rules, in plain English */}
      <Card id="rules-readout">
        <h2 className="mb-2">Your business rules, in plain English</h2>
        <p className="mb-3">Rules version 1.0 · owned by the Customer Success operations lead · 11 rules · 11 tests</p>
        <ul className="mb-4 list-disc pl-6">
          <li>Sev1 at {SEV1_TEACHERS} or more teachers affected</li>
          <li>Account manager copied at {RENEWAL_WINDOW_DAYS} or fewer days to renewal</li>
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="text-xs text-muted">
                <th className="h-9 pr-3 font-semibold">ID</th>
                <th className="h-9 pr-3 font-semibold">Rule (IF … THEN …)</th>
                <th className="h-9 pr-3 font-semibold">Result</th>
                <th className="h-9 font-semibold">Tested by</th>
              </tr>
            </thead>
            <tbody>
              {RULES_TABLE.map((r) => {
                const tested = SCENARIOS.filter((sc) => sc.expectedRules.includes(r.id))
                return (
                  <tr key={r.id} className="border-t border-muted/20 align-top">
                    <td className="py-2 pr-3">
                      <Mono>{r.id}</Mono>
                    </td>
                    <td className="py-2 pr-3">{r.rule}</td>
                    <td className="py-2 pr-3">{r.output}</td>
                    <td className="py-2">
                      {tested.length ? (
                        tested.map((sc) => (
                          <div key={sc.id}>
                            <Mono>{sc.id}</Mono> {sc.name}
                          </div>
                        ))
                      ) : (
                        <span className="font-semibold text-escalate">Not tested</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4">
          When more than one rule fires, the most restrictive result wins: {RANK.join(' > ')}. Every rule that fired is recorded.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {[PRIVACY, SEV1, COORD, ENG, PRODUCT, SUPPORT].map((r) => (
            <li key={r}>
              <span className="font-semibold">{r}:</span> {NEXT_STEP[r]}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-muted">
          To change a rule, tell the Copilot its ID and the change. It updates the rule, its tests, and the code together, and Self-Test checks them.
        </p>
        <SecondaryButton className="no-print mt-3" onClick={printRules}>
          Print the rules
        </SecondaryButton>
      </Card>

      {/* Your expert rules, extracted into code */}
      <Card className="no-print">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2>Your expert rules, extracted into code</h2>
          <div className="flex gap-2">
            <SecondaryButton onClick={copySource}>{copied ? 'Copied' : 'Copy'}</SecondaryButton>
            <SecondaryButton onClick={downloadSource}>Download rules.py</SecondaryButton>
          </div>
        </div>
        <div className="max-h-[32rem] overflow-auto rounded-[4px] border border-muted/20 bg-page">
          <pre className="font-mono text-xs leading-5">
            {RULES_PY.split('\n').map((line, i) => (
              <div key={i} className="flex">
                <span className="tabular w-12 shrink-0 select-none pr-3 text-right text-muted">{i + 1}</span>
                <code className="whitespace-pre">{line}</code>
              </div>
            ))}
          </pre>
        </div>
      </Card>

      {/* Parity */}
      <Card className="no-print">
        <h2 className="mb-3">Parity</h2>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SecondaryButton onClick={() => setStress(runStressTest())}>Run Stress Test</SecondaryButton>
          <SecondaryButton onClick={() => s.runSelf()}>Run Self-Test</SecondaryButton>
        </div>
        {stress && <StressOutput stress={stress} />}
        {st && (
          <>
            {st.pyError && <p className="mb-2 font-semibold text-escalate">Python did not run: {st.pyError}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="text-xs text-muted">
                    {['Scenario', 'Expected', 'Python', 'JavaScript', 'Match'].map((h) => (
                      <th key={h} className="h-9 pr-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {st.rows.map((r) => (
                    <tr key={r.scenario.id} className="h-9 border-t border-muted/20">
                      <td className="pr-3">
                        <Mono>{r.scenario.id}</Mono> {r.scenario.name}
                      </td>
                      <td className="pr-3">
                        {r.scenario.expected} · <Mono>{r.scenario.expectedRules.join(', ')}</Mono>
                      </td>
                      <td className="pr-3">
                        {r.py ? (
                          <>
                            {r.py.result} · <Mono>{r.py.rules.join(', ')}</Mono>
                          </>
                        ) : (
                          <StatusWord word="Skipped" />
                        )}
                      </td>
                      <td className="pr-3">
                        {r.ts.result} · <Mono>{r.ts.rules.join(', ')}</Mono>
                      </td>
                      <td>
                        <StatusWord word={r.agree === null ? 'Skipped' : r.agree && r.pyPass && r.tsPass ? 'Pass' : 'Fail'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="mt-3">
          <Badge decider="rules">Decided by your rules</Badge>
        </div>
      </Card>
    </div>
  )
}

export function StressOutput({ stress }: { stress: StressResult }) {
  if (stress.pyError) return <p className="mb-3 font-semibold text-escalate">Python did not run: {stress.pyError}</p>
  return (
    <div className="mb-4">
      <p className="tabular font-semibold">
        {stress.count} inputs · {stress.disagreements.length} disagreements
      </p>
      {stress.disagreements.slice(0, 10).map((d, i) => (
        <p key={i} className="font-mono text-xs">
          {JSON.stringify(d.input)} → Python {d.py.result} [{d.py.rules.join(', ')}] · JavaScript {d.ts.result} [{d.ts.rules.join(', ')}]
        </p>
      ))}
    </div>
  )
}
