import { useRef, useState } from 'react'
import type { ReadOutcome, Shared } from '../App'
import { acceptIssueType, askRequester, draftWithChecks, readWithRetry, type DraftRun, type FieldNote } from '../ai'
import { decideBoth, trimmed, type Outcome } from '../engine'
import {
  AI_ISSUE_OUTCOMES,
  COORD,
  FIELDS,
  FIELD_LABELS,
  ISSUE_TYPES,
  OWNER,
  PRIVACY,
  RESULT_STATUS,
  SAMPLE_REPLY,
  SAMPLE_REQUESTS,
  SCENARIOS,
  SEV1,
  STUDENT_DATA,
  routesNotUsed,
  validate,
  type Check,
  type Decision,
  type FieldKey,
  type RawFields,
  type Scenario,
  type Typed,
} from '../rules'
import { runStressTest, type StressResult } from '../selftest'
import { StressOutput } from './RulesView'
import RoiPanel from './RoiPanel'
import {
  Badge,
  Card,
  DECIDER_BORDER,
  Divider,
  LinkButton,
  Loading,
  Mono,
  PrimaryButton,
  STATUS_TEXT,
  SecondaryButton,
  SectionLabel,
  StatusWord,
  timeNow,
  type Decider,
} from '../ui'

const EMPTY: RawFields = { issue_type: '', student_data: '', teachers_affected: '', renewal_days: '' }

type MetaNote = FieldNote | 'needs_person'
interface FieldMeta {
  source: 'ai' | 'person'
  confidence?: number
  note?: MetaNote
}

interface ReadInfo {
  outcome: ReadOutcome | 'error'
  retried: boolean
  failing: FieldKey[]
  aiIssue: string | null
  aiIssueConf: number | null
}

interface IssueCall {
  aiValue: string
  confidence: number
  used: string
  overridden: boolean
}

interface Submission {
  id: number
  raw: RawFields
  outcome: Outcome
  typed: Typed | null
  fromRead: boolean
  fieldCheck: string
  issue: IssueCall | null
  draft: DraftRun | 'running' | null
}

interface AiLogEntry {
  time: string
  inputs: string
  decision: string
  confidence: number
  overridden: string
}

const NEEDS_APPROVAL: Record<string, string> = {
  [PRIVACY]: 'Privacy officer',
  [SEV1]: 'Head of Customer Success (on-call already paged)',
  [COORD]: 'CS coordinator',
}

function checkpointsFor(sub: Submission): string[] {
  if (sub.outcome.mismatch) return [COORD]
  const d = sub.outcome.decision
  const list: string[] = []
  if (NEEDS_APPROVAL[d.result]) list.push(d.result)
  if (d.rules_fired.includes('R10') && d.result !== SEV1) list.push(SEV1)
  return list
}

// The rule that sent the item to this person, and the input value that decided it.
function checkpointReason(result: string, sub: Submission): string {
  const d = sub.outcome.decision
  const find = (id: string) => d.explanation.find((e) => e.startsWith(id + ' '))
  if (sub.outcome.mismatch) return 'Engine mismatch: the Python and JavaScript rules disagree.'
  if (result === PRIVACY) return find('R2') ?? ''
  if (result === SEV1) return [find('R3'), find('R10')].filter(Boolean).join(' ')
  return find('R1') ?? find('R8') ?? find('R11') ?? ''
}

const failLabels = (fields: FieldKey[]) => fields.map((k) => FIELD_LABELS[k]).join(', ')

export default function AppView({ s }: { s: Shared }) {
  const [pasteText, setPasteText] = useState('')
  const [values, setValues] = useState<RawFields>(EMPTY)
  const [meta, setMeta] = useState<Record<FieldKey, FieldMeta>>(() => blankMeta())
  const [readInfo, setReadInfo] = useState<ReadInfo | null>(null)
  const [question, setQuestion] = useState<{ text: string; checks: Check[] } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<{ label: string; startedAt: number } | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [aiLog, setAiLog] = useState<AiLogEntry[]>([])
  const [approvals, setApprovals] = useState<Record<string, string>>({})
  const [selfTestShown, setSelfTestShown] = useState(false)
  const [stress, setStress] = useState<StressResult | null>(null)
  const [copied, setCopied] = useState(false)
  const subId = useRef(0)

  function blankMeta(): Record<FieldKey, FieldMeta> {
    return { issue_type: { source: 'person' }, student_data: { source: 'person' }, teachers_affected: { source: 'person' }, renewal_days: { source: 'person' } }
  }

  const step = (label: string) => setBusy({ label, startedAt: Date.now() })

  // ---------- (R) The read ----------

  async function read(text: string) {
    if (!text.trim() || busy) return
    setAiMessage(null)
    setQuestion(null)
    setSubmission(null)
    setApprovals({})
    step('Reading the request...')
    const res = await readWithRetry(text)
    if (!res.ok || !res.check) {
      setBusy(null)
      setAiMessage(res.error ?? 'AI unavailable')
      setReadInfo({ outcome: 'error', retried: res.retried, failing: [...FIELDS], aiIssue: null, aiIssueConf: null })
      s.logRead('sent to a person')
      return
    }
    const c = res.check
    setValues(c.values)
    const m = {} as Record<FieldKey, FieldMeta>
    for (const k of FIELDS) m[k] = { source: 'ai', confidence: c.confidence[k], note: c.notes[k] }
    setMeta(m)

    if (!c.failing.length) {
      setBusy(null)
      const outcome: ReadOutcome = res.retried ? 'passed after one retry' : 'passed first time'
      setReadInfo({ outcome, retried: res.retried, failing: [], aiIssue: c.aiIssue, aiIssueConf: c.confidence.issue_type })
      s.logRead(outcome)
      return
    }

    // (Q) Blank means failing: ask the requester at once.
    setReadInfo({ outcome: 'asked the requester', retried: res.retried, failing: c.failing, aiIssue: c.aiIssue, aiIssueConf: c.confidence.issue_type })
    step('Writing a question...')
    const q = await askRequester(text, c.failing)
    setBusy(null)
    if (q.ok && q.question) {
      setQuestion({ text: q.question, checks: q.checks ?? [] })
      s.logRead('asked the requester')
      return
    }
    if (q.error) setAiMessage(q.error)
    setMeta((prev) => {
      const next = { ...prev }
      for (const k of c.failing) next[k] = { ...next[k], note: 'needs_person' }
      return next
    })
    setReadInfo((r) => (r ? { ...r, outcome: 'sent to a person' } : r))
    s.logRead('sent to a person')
  }

  function readAgain() {
    if (!reply.trim()) return
    read(`${pasteText}\n\nReply from the requester: ${reply}`)
  }

  // ---------- Field editing ----------

  function setField(key: FieldKey, value: string) {
    const v = key === 'teachers_affected' || key === 'renewal_days' ? value.replace(/[^0-9]/g, '') : value
    setValues((prev) => ({ ...prev, [key]: v }))
    setMeta((prev) => ({ ...prev, [key]: { source: 'person', note: v ? undefined : prev[key].note } }))
  }

  const blocking = readInfo && readInfo.outcome !== 'passed first time' && readInfo.outcome !== 'passed after one retry'
  const stillBlank = blocking ? readInfo.failing.filter((k) => !values[k].trim()) : []
  const submitDisabled = !!busy || stillBlank.length > 0

  // ---------- Submit: rules decide, then the AI drafts ----------

  async function submit(raw: RawFields, opts: { fromRead: boolean; override?: string; issueSource: 'ai' | 'person'; sentToPerson?: boolean }) {
    const id = ++subId.current
    let issue: IssueCall | null = null
    const input = { ...raw }

    if (opts.override) {
      const prev = submission?.issue
      issue = { aiValue: prev?.aiValue ?? '', confidence: prev?.confidence ?? 0, used: opts.override, overridden: true }
      input.issue_type = opts.override
    } else if (opts.issueSource === 'ai' && readInfo?.aiIssue && raw.issue_type === readInfo.aiIssue) {
      const conf = readInfo.aiIssueConf ?? 1
      const used = acceptIssueType(raw.issue_type, conf)
      issue = { aiValue: raw.issue_type, confidence: conf, used, overridden: false }
      input.issue_type = used
    }

    const outcome = decideBoth(input)
    const { typed, errors } = validate(trimmed(input))
    s.setLastRaw(trimmed(input))

    let fieldCheck: string
    if (opts.fromRead && readInfo) {
      fieldCheck =
        opts.sentToPerson || readInfo.outcome === 'sent to a person' || readInfo.outcome === 'error'
          ? 'Sent to a person'
          : readInfo.outcome === 'asked the requester'
            ? 'Asked the requester'
            : readInfo.retried
              ? 'Passed after one retry'
              : 'Pass'
    } else {
      fieldCheck = errors.length ? `Fail: ${failLabels(errors)}` : 'Pass'
    }

    const sub: Submission = {
      id,
      raw: input,
      outcome,
      typed: errors.length ? null : (typed as Typed),
      fromRead: opts.fromRead,
      fieldCheck,
      issue,
      draft: errors.length ? null : 'running',
    }
    setSubmission(sub)
    setApprovals({})
    if (opts.sentToPerson) s.setLastRead('sent to a person')

    if (issue) {
      const inputs = FIELDS.map((k) => `${k}=${input[k] || 'missing'}`).join(', ')
      if (opts.override) {
        setAiLog((log) =>
          log.length ? [...log.slice(0, -1), { ...log[log.length - 1], overridden: `Yes → ${opts.override}` }] : log,
        )
      } else {
        setAiLog((log) => [
          ...log,
          {
            time: timeNow(),
            inputs,
            decision: issue.used === issue.aiValue ? issue.used : `${issue.used} (AI said ${issue.aiValue})`,
            confidence: issue.confidence,
            overridden: 'No',
          },
        ])
      }
    }

    if (errors.length) return
    step('Drafting the routing note...')
    const draft = await draftWithChecks(typed as Typed, outcome.decision)
    if (subId.current !== id) return
    setBusy(null)
    if (draft.ok) s.logDraft(draft.held ? 'sent to a person' : draft.retried ? 'passed after one retry' : 'passed first time')
    else if (draft.error) setAiMessage(draft.error)
    setSubmission((cur) => (cur && cur.id === id ? { ...cur, draft } : cur))
  }

  function submitForm(sentToPerson = false) {
    const fromRead = !!readInfo
    const issueSource = meta.issue_type.source
    submit(values, { fromRead, issueSource, sentToPerson })
  }

  function runScenario(sc: Scenario) {
    setValues(sc.fields)
    setMeta(blankMeta())
    setReadInfo(null)
    setQuestion(null)
    setAiMessage(null)
    submit(sc.fields, { fromRead: false, issueSource: 'person' })
  }

  function override(value: string) {
    if (!submission || !value) return
    setValues((v) => ({ ...v, issue_type: value }))
    submit({ ...submission.raw, issue_type: value }, { fromRead: submission.fromRead, override: value, issueSource: 'person' })
  }

  function reset() {
    subId.current++
    setPasteText('')
    setValues(EMPTY)
    setMeta(blankMeta())
    setReadInfo(null)
    setQuestion(null)
    setReply('')
    setBusy(null)
    setAiMessage(null)
    setSubmission(null)
    setApprovals({})
    setSelfTestShown(false)
    setStress(null)
  }

  function copyResult() {
    if (!submission) return
    const d = submission.outcome.decision
    const lines = [
      `Result: ${d.result}`,
      `Rules fired: ${d.rules_fired.join(', ') || 'none'}`,
      ...d.explanation,
      d.cc.length ? `Copy: ${d.cc.join(', ')}` : '',
      `Next step: ${d.next_step}`,
      `Owner: ${OWNER[d.result]}`,
      submission.draft && submission.draft !== 'running' && submission.draft.summary ? `AI draft: ${submission.draft.summary}` : '',
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // ---------- Render ----------

  const fieldMark = (key: FieldKey) => {
    const m = meta[key]
    const confirmed = submission && values[key].trim() !== ''
    if (m.note === 'needs_person') return <StatusWord word="Needs a person" />
    if (m.note === 'not_in_request' && !values[key])
      return (
        <span className="flex flex-wrap gap-2">
          <StatusWord word="Not in the request" />
          <StatusWord word="Missing · needs the requester" />
        </span>
      )
    if ((m.note === 'missing' || m.note === 'invalid') && !values[key]) return <StatusWord word="Missing · needs the requester" />
    if (confirmed) return <span className="text-xs text-secondary">Confirmed by you</span>
    if (m.source === 'ai' && values[key])
      return (
        <span className="text-xs text-accent">
          Proposed by AI · check · <span className="tabular">{m.confidence}/10</span>
        </span>
      )
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        {/* ---------- Input column ---------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <label htmlFor="paste" className="mb-2 block font-semibold">
              Paste the request
            </label>
            <textarea
              id="paste"
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full rounded-[4px] border border-muted/40 p-2"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <LinkButton onClick={() => setPasteText(SAMPLE_REQUESTS.clean.text)}>{SAMPLE_REQUESTS.clean.name}</LinkButton>
              <span className="text-muted">·</span>
              <LinkButton onClick={() => setPasteText(SAMPLE_REQUESTS.missing.text)}>{SAMPLE_REQUESTS.missing.name}</LinkButton>
            </div>
            <PrimaryButton className="mt-3" onClick={() => read(pasteText)} disabled={!!busy || !pasteText.trim()}>
              Read request
            </PrimaryButton>
            {busy && (busy.label === 'Reading the request...' || busy.label === 'Writing a question...') && (
              <div className="mt-3">
                <Loading label={busy.label} startedAt={busy.startedAt} />
              </div>
            )}
            {aiMessage && <p className="mt-3 font-semibold text-escalate">{aiMessage}</p>}

            {question && (
              <>
                <Divider />
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3>Question for the requester</h3>
                  <Badge decider="ai">Drafted by AI · checked by your rules</Badge>
                </div>
                <p className="mb-2">{question.text}</p>
                <div className="mb-2 flex flex-wrap gap-3 text-xs">
                  {question.checks.map((c) => (
                    <span key={c.id}>
                      <Mono>{c.id}</Mono> <StatusWord word={c.pass ? 'Pass' : 'Fail'} />
                    </span>
                  ))}
                </div>
                <SecondaryButton onClick={() => navigator.clipboard.writeText(question.text)}>Copy</SecondaryButton>
                <label htmlFor="reply" className="mt-4 mb-2 block font-semibold">
                  Paste the reply
                </label>
                <textarea id="reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full rounded-[4px] border border-muted/40 p-2" />
                <LinkButton className="mt-1" onClick={() => setReply(SAMPLE_REPLY)}>
                  Sample reply
                </LinkButton>
                <div className="mt-3">
                  <PrimaryButton onClick={readAgain} disabled={!!busy || !reply.trim()}>
                    Read again
                  </PrimaryButton>
                </div>
              </>
            )}

            {s.readLog.length > 0 && (
              <>
                <Divider />
                <SectionLabel>Check loop log</SectionLabel>
                <ul className="tabular flex flex-col gap-1 text-xs">
                  {s.readLog
                    .slice(-3)
                    .reverse()
                    .map((e, i) => (
                      <li key={i}>
                        {e.time} · {e.outcome}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!submitDisabled) submitForm()
              }}
              noValidate
              className="flex flex-col gap-3"
            >
              {FIELDS.map((key) => (
                <div key={key} className="flex flex-col gap-1 lg:grid lg:grid-cols-[10rem_1fr] lg:items-start lg:gap-3">
                  <label htmlFor={key} className="font-semibold lg:pt-2">
                    {FIELD_LABELS[key]}
                  </label>
                  <div className="flex flex-col gap-1">
                    {key === 'issue_type' || key === 'student_data' ? (
                      <select
                        id={key}
                        value={values[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        className="h-9 rounded-[4px] border border-muted/40 bg-card px-2"
                      >
                        <option value="">{values[key] ? '' : 'missing'}</option>
                        {(key === 'issue_type' ? ISSUE_TYPES : STUDENT_DATA).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                        {values[key] && !(key === 'issue_type' ? (ISSUE_TYPES as readonly string[]) : (STUDENT_DATA as readonly string[])).includes(values[key]) && (
                          <option value={values[key]}>{values[key]}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        id={key}
                        type="text"
                        inputMode="numeric"
                        placeholder="missing"
                        value={values[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        className="tabular h-9 rounded-[4px] border border-muted/40 px-2"
                      />
                    )}
                    {fieldMark(key)}
                  </div>
                </div>
              ))}
              <PrimaryButton type="submit" className="w-full" disabled={submitDisabled}>
                Route this item
              </PrimaryButton>
              {stillBlank.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-escalate">Missing: {failLabels(stillBlank)}</p>
                  <SecondaryButton type="button" onClick={() => submitForm(true)} disabled={!!busy}>
                    Send to a person
                  </SecondaryButton>
                </div>
              )}
            </form>

            <Divider />
            <p className="leading-7">
              <span className="font-semibold">Try an example: </span>
              {SCENARIOS.map((sc, i) => (
                <span key={sc.id}>
                  {i > 0 && <span className="px-1 text-muted">·</span>}
                  <LinkButton onClick={() => runScenario(sc)} disabled={!!busy}>
                    <Mono>{sc.id}</Mono> {sc.name}
                  </LinkButton>
                </span>
              ))}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SecondaryButton
                onClick={() => {
                  s.runSelf()
                  setSelfTestShown(true)
                }}
              >
                Run Self-Test
              </SecondaryButton>
              <SecondaryButton onClick={() => setStress(runStressTest())}>Run Stress Test</SecondaryButton>
            </div>
            {selfTestShown && s.selfTest && <SelfTestOutput s={s} />}
            {stress && (
              <div className="mt-3">
                <StressOutput stress={stress} />
              </div>
            )}
          </Card>
        </div>

        {/* ---------- Output column ---------- */}
        <div className="flex flex-col gap-6">
          <OutputPanel
            s={s}
            sub={submission}
            readInfo={readInfo}
            busy={busy}
            onOverride={override}
          />

          <div className="no-print flex flex-wrap gap-2">
            <SecondaryButton onClick={copyResult} disabled={!submission}>
              {copied ? 'Copied' : 'Copy Result'}
            </SecondaryButton>
            <SecondaryButton onClick={() => window.print()}>Print or Save as PDF</SecondaryButton>
            <SecondaryButton onClick={reset}>Reset</SecondaryButton>
          </div>

          {submission && checkpointsFor(submission).length > 0 && (
            <Card>
              <div className="flex flex-col gap-4">
                {checkpointsFor(submission).map((result, i) => (
                  <div key={result} className={i > 0 ? 'border-t border-muted/20 pt-4' : ''}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge decider="person">A person decides</Badge>
                      <span className="font-semibold">Needs approval: {NEEDS_APPROVAL[result]}</span>
                    </div>
                    <p className="mb-1 text-xs text-muted">
                      Rule trace: <Mono>{submission.outcome.decision.rules_fired.join(', ') || 'Engine mismatch'}</Mono>
                    </p>
                    <p className="mb-3">
                      <span className="font-semibold">Check before you approve:</span> {checkpointReason(result, submission)}
                    </p>
                    {approvals[result] ? (
                      <p className="font-semibold text-secondary">{approvals[result]} (simulated)</p>
                    ) : (
                      <div className="flex gap-2">
                        <PrimaryButton onClick={() => setApprovals((a) => ({ ...a, [result]: 'Approved by you' }))}>Approve</PrimaryButton>
                        <SecondaryButton onClick={() => setApprovals((a) => ({ ...a, [result]: 'Returned by you' }))}>Return</SecondaryButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {aiLog.length > 0 && (
            <Card>
              <h3 className="mb-2">AI decision log</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="h-9 pr-3 font-semibold">Time</th>
                      <th className="h-9 pr-3 font-semibold">Inputs</th>
                      <th className="h-9 pr-3 font-semibold">AI decision</th>
                      <th className="h-9 pr-3 text-right font-semibold">Confidence</th>
                      <th className="h-9 font-semibold">Overridden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiLog.map((e, i) => (
                      <tr key={i} className="h-9 border-t border-muted/20 align-top">
                        <td className="tabular py-2 pr-3">{e.time}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{e.inputs}</td>
                        <td className="py-2 pr-3">{e.decision}</td>
                        <td className="tabular py-2 pr-3 text-right">{e.confidence}/10</td>
                        <td className="py-2">{e.overridden}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="no-print">
        <RoiPanel s={s} />
      </div>
    </div>
  )
}

// ---------- Self-Test output ----------

function SelfTestOutput({ s }: { s: Shared }) {
  const st = s.selfTest!
  const failures = st.rows.filter((r) => !r.tsPass || (r.py && !r.pyPass))
  return (
    <div className="mt-3 flex flex-col gap-1">
      {st.pyError && <p className="font-semibold text-escalate">Python did not run: {st.pyError}</p>}
      <p className={`tabular font-semibold ${st.allPass ? 'text-approve' : 'text-escalate'}`}>
        Python {st.pyPassed} / {st.total} · JavaScript {st.tsPassed} / {st.total} · Engines agree {st.agreed} / {st.bothRan}
      </p>
      {st.pyOwn && (
        <p className="tabular text-muted">
          Python module self_test(): {st.pyOwn.passed} / {st.pyOwn.total}
        </p>
      )}
      {failures.map((r) => (
        <p key={r.scenario.id} className="text-escalate">
          <Mono>{r.scenario.id}</Mono> expected {r.scenario.expected} [{r.scenario.expectedRules.join(', ')}]; Python{' '}
          {r.py ? `${r.py.result} [${r.py.rules.join(', ')}]` : 'did not run'}; JavaScript {r.ts.result} [{r.ts.rules.join(', ')}]
        </p>
      ))}
    </div>
  )
}

// ---------- Output panel ----------

interface StepView {
  decider: Decider
  name: string
  word: string
}

function OutputPanel({
  s,
  sub,
  readInfo,
  busy,
  onOverride,
}: {
  s: Shared
  sub: Submission | null
  readInfo: ReadInfo | null
  busy: { label: string; startedAt: number } | null
  onOverride: (v: string) => void
}) {
  if (!sub && !readInfo) {
    return (
      <Card>
        <p className="text-muted">Pick an example or enter a request.</p>
      </Card>
    )
  }

  const d: Decision | null = sub?.outcome.decision ?? null
  const draft = sub?.draft ?? null
  const steps = buildSteps(sub, readInfo)
  const status = d ? RESULT_STATUS[d.result] : null
  const notUsed = d ? routesNotUsed(d) : {}

  return (
    <Card className="@container">
      <h2 className="mb-3">How this request ran</h2>
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-3 @[40rem]:grid-cols-6">
        {steps.map((st, i) => (
          <div key={i} className={`border-t-[3px] p-3 ${DECIDER_BORDER[st.decider]}`}>
            <Badge decider={st.decider}>{st.decider === 'rules' ? 'Your rules' : st.decider === 'ai' ? 'AI' : 'A person'}</Badge>
            <div className="mt-2 text-[13px] font-semibold leading-tight">{st.name}</div>
            <div className="mt-1 text-xs">
              <StatusWord word={st.word} />
            </div>
          </div>
        ))}
      </div>

      {!sub && (
        <>
          <Divider />
          <p className="text-muted">Review the fields, then route the item.</p>
        </>
      )}

      {sub && d && status && (
        <>
          <Divider />
          {sub.fromRead && <p className="mb-2 text-xs text-muted">Fields read by AI, checked by your rules, confirmed by you</p>}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge decider="rules">Decided by your rules</Badge>
            <span className="text-xs text-muted">
              {sub.outcome.source === 'python'
                ? sub.outcome.mismatch
                  ? 'Decided by: Python rules module · JavaScript disagrees'
                  : 'Decided by: Python rules module · JavaScript agrees'
                : 'Decided by: JavaScript rules (Python loading)'}
            </span>
          </div>
          {sub.outcome.mismatch && sub.outcome.py && (
            <div className="mb-2">
              <p className="font-semibold text-escalate">Engine mismatch</p>
              <p>
                Python: {sub.outcome.py.result} [<Mono>{sub.outcome.py.rules_fired.join(', ')}</Mono>] · JavaScript: {sub.outcome.ts.result} [
                <Mono>{sub.outcome.ts.rules_fired.join(', ')}</Mono>]
              </p>
            </div>
          )}
          {sub.outcome.pyError && <p className="mb-2 font-semibold text-escalate">Python did not run: {sub.outcome.pyError}</p>}
          <div className={`text-[1.75rem] font-bold leading-tight ${STATUS_TEXT[status]}`}>{d.result}</div>
          {d.cc.length > 0 && <p className="mt-1 font-semibold">Copy: {d.cc.join(', ')}</p>}
          {sub.issue?.overridden && <p className="mt-1 font-semibold text-secondary">Overridden by a person.</p>}

          <Divider />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3>Why this result</h3>
            <Badge decider="rules">Decided by your rules</Badge>
          </div>
          <ul className="flex flex-col gap-1">
            {d.explanation.map((e, i) => {
              const id = e.split(' ')[0]
              const lostTo = sub.outcome.mismatch ? undefined : notUsed[id]
              return (
                <li key={i}>
                  {/^R\d+$/.test(id) ? (
                    <>
                      <Mono>{id}</Mono>
                      {e.slice(id.length)}
                    </>
                  ) : (
                    e
                  )}
                  {lostTo && (
                    <span className="text-muted">
                      {' '}
                      (route not used: <Mono>{lostTo}</Mono> wins)
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <LinkButton className="no-print mt-2" onClick={() => s.go('rules', 'rules-readout')}>
            How this was decided
          </LinkButton>

          {sub.issue && (
            <>
              <Divider />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge decider="ai">Decided by AI · low-stakes · reversible</Badge>
                <span>
                  Issue type: <span className="font-semibold">{sub.issue.aiValue || 'none'}</span> · confidence{' '}
                  <span className="tabular">{sub.issue.confidence}/10</span>
                  {sub.issue.used === 'needs_review' && !sub.issue.overridden && ' · below 7, so needs_review'}
                </span>
              </div>
              <label className="no-print flex flex-wrap items-center gap-2">
                <span className="font-semibold">Override</span>
                <select
                  value=""
                  onChange={(e) => onOverride(e.target.value)}
                  className="h-9 rounded-[4px] border border-muted/40 bg-card px-2"
                  disabled={!!busy}
                >
                  <option value="" />
                  {AI_ISSUE_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <Divider />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3>AI draft</h3>
            <Badge decider="ai">Drafted by AI · wording varies</Badge>
          </div>
          {draft === null && <StatusWord word="Skipped" />}
          {draft === 'running' && busy && <Loading label={busy.label} startedAt={busy.startedAt} />}
          {draft !== null && draft !== 'running' && !draft.ok && <p className="font-semibold text-escalate">Draft unavailable</p>}
          {draft !== null && draft !== 'running' && draft.ok && (
            <>
              {draft.needsReview && <p className="mb-1 font-semibold text-review">Check this draft</p>}
              {draft.held && (
                <p className="mb-1 font-semibold text-escalate">
                  Held for a person: {(draft.checks ?? []).filter((c) => !c.pass).map((c) => `${c.id} ${c.reason}`).join('; ')}
                </p>
              )}
              <p className="mb-2">{draft.summary}</p>
              <p className="mb-1 text-xs font-semibold text-muted">Checked by your rules:</p>
              <ul className="flex flex-col gap-1 text-xs">
                {(draft.checks ?? []).map((c) => (
                  <li key={c.id}>
                    <Mono>{c.id}</Mono> {c.name}: <StatusWord word={c.pass ? 'Pass' : 'Fail'} /> <span className="text-muted">({c.reason})</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Divider />
          <h3 className="mb-2">Next step and owner</h3>
          <p>{d.next_step}</p>
          <p className="mt-1">
            <span className="font-semibold">Owner:</span> {OWNER[d.result]}
          </p>
        </>
      )}

      <Divider />
      <p className="font-mono text-xs text-muted">RULES v1.0 · 11 RULES · SYNTHETIC DATA · PROTOTYPE</p>
    </Card>
  )
}

function buildSteps(sub: Submission | null, readInfo: ReadInfo | null): StepView[] {
  const fromRead = sub ? sub.fromRead : !!readInfo
  // (1) AI read
  let s1: StepView
  if (!fromRead || !readInfo) s1 = { decider: 'person', name: 'Entered by the coordinator', word: 'Pass' }
  else if (readInfo.outcome === 'error') s1 = { decider: 'ai', name: 'AI read the request', word: 'Fail' }
  else if (readInfo.outcome === 'asked the requester' || (readInfo.outcome === 'sent to a person' && readInfo.failing.length))
    s1 = { decider: 'ai', name: 'AI read the request and named the issue type', word: 'Asked the requester' }
  else
    s1 = {
      decider: 'ai',
      name: 'AI read the request and named the issue type',
      word: `${readInfo.aiIssue ?? 'none'} · ${readInfo.aiIssueConf ?? 1}/10`,
    }

  // (2) Rules checked the fields
  let w2: string
  if (sub) w2 = sub.fieldCheck
  else if (!readInfo) w2 = 'Skipped'
  else if (readInfo.outcome === 'error' || readInfo.outcome === 'sent to a person') w2 = 'Sent to a person'
  else if (readInfo.outcome === 'asked the requester') w2 = 'Asked the requester'
  else w2 = readInfo.retried ? 'Passed after one retry' : 'Pass'

  // (3) Rules decided the route
  const d = sub?.outcome.decision
  const w3 = d ? `${d.result} · ${sub!.outcome.mismatch ? 'Engine mismatch' : d.rules_fired.join(', ')}` : 'Skipped'

  // (4) AI drafted, (5) rules checked the draft
  const draft = sub?.draft ?? null
  let w4 = 'Skipped'
  let w5 = 'Skipped'
  if (draft === 'running') w4 = 'Running'
  else if (draft && !draft.ok) w4 = 'Draft unavailable'
  else if (draft && draft.ok) {
    w4 = 'Drafted'
    const failed = (draft.checks ?? []).filter((c) => !c.pass).map((c) => c.id)
    w5 = draft.held ? `Held for a person: ${failed.join(', ')}` : draft.retried ? 'Passed after one retry' : 'Pass · D1–D4'
  }

  // (6) A person decides
  let w6 = 'Skipped'
  if (sub) {
    const approvers = checkpointsFor(sub).map((r) => NEEDS_APPROVAL[r])
    w6 = approvers.length ? approvers.join(' + ') : 'No person needed'
  }

  return [
    s1,
    { decider: 'rules', name: 'Rules checked the fields', word: w2 },
    { decider: 'rules', name: 'Rules decided the route', word: w3 },
    { decider: 'ai', name: 'AI drafted the note', word: w4 },
    { decider: 'rules', name: 'Rules checked the draft', word: w5 },
    { decider: 'person', name: 'A person decides', word: w6 },
  ]
}
