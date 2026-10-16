// Escalation Router rules v1.0: the TypeScript copy of rules.py.
// Pure and deterministic. Runs beside the Python module as a cross-check
// and as the fallback while Python loads. No model calls in this file.

export type FieldKey = 'issue_type' | 'student_data' | 'teachers_affected' | 'renewal_days'
export type RawFields = Record<FieldKey, string>

export const FIELDS: FieldKey[] = ['issue_type', 'student_data', 'teachers_affected', 'renewal_days']

export const FIELD_LABELS: Record<FieldKey, string> = {
  issue_type: 'Issue type',
  student_data: 'Student data involved',
  teachers_affected: 'Teachers affected',
  renewal_days: 'Days to district renewal',
}

export const ISSUE_TYPES = ['how_to', 'bug', 'feature', 'outage', 'other', 'needs_review'] as const
export const AI_ISSUE_OUTCOMES = ['how_to', 'bug', 'feature', 'outage', 'other'] as const
export const STUDENT_DATA = ['yes', 'no', 'unsure'] as const
export const RANGES: Record<'teachers_affected' | 'renewal_days', [number, number]> = {
  teachers_affected: [1, 10000],
  renewal_days: [0, 1095],
}
export const SEV1_TEACHERS = 3
export const RENEWAL_WINDOW_DAYS = 90
export const AI_MIN_CONFIDENCE = 7

export const PRIVACY = 'Privacy officer'
export const SEV1 = 'Sev1: page engineering on-call'
export const COORD = 'Coordinator review'
export const ENG = 'Engineering queue'
export const PRODUCT = 'Product backlog'
export const SUPPORT = 'Support'

export const RANK = [PRIVACY, SEV1, COORD, ENG, PRODUCT, SUPPORT]

export const NEXT_STEP: Record<string, string> = {
  [PRIVACY]: 'Privacy officer reviews the same day and decides whether families or the district must be told.',
  [SEV1]: 'Engineering on-call is paged now; the Head of Customer Success confirms in parallel.',
  [COORD]: 'A CS coordinator reads the item and routes it by hand.',
  [ENG]: 'Engineering triages in the next daily standup.',
  [PRODUCT]: 'Product adds it to the backlog and tags the district.',
  [SUPPORT]: 'Support replies with the matching help article within one business day.',
}

export const OWNER: Record<string, string> = {
  [PRIVACY]: 'Privacy officer',
  [SEV1]: 'Engineering on-call',
  [COORD]: 'CS coordinator',
  [ENG]: 'Engineering',
  [PRODUCT]: 'Product',
  [SUPPORT]: 'Support',
}

export type Status = 'approve' | 'review' | 'escalate'
export const RESULT_STATUS: Record<string, Status> = {
  [SUPPORT]: 'approve',
  [PRODUCT]: 'approve',
  [ENG]: 'review',
  [COORD]: 'review',
  [SEV1]: 'escalate',
  [PRIVACY]: 'escalate',
}

export interface Decision {
  result: string
  rules_fired: string[]
  explanation: string[]
  next_step: string
  cc: string[]
}

export interface Typed {
  issue_type: string
  student_data: string
  teachers_affected: number
  renewal_days: number
}

// ---------- Validation: the only place a field is read ----------

const DIGITS = /^[0-9]+$/

function whole(raw: unknown, lo: number, hi: number): number | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!DIGITS.test(text)) return null
  const value = Number(text)
  return value >= lo && value <= hi ? value : null
}

export function validate(raw: Partial<RawFields>): { typed: Partial<Typed>; errors: FieldKey[] } {
  const typed: Partial<Typed> = {}
  const errors: FieldKey[] = []
  const choices: [FieldKey, readonly string[]][] = [
    ['issue_type', ISSUE_TYPES],
    ['student_data', STUDENT_DATA],
  ]
  for (const [name, options] of choices) {
    const value = typeof raw[name] === 'string' ? (raw[name] as string).trim() : raw[name]
    if (typeof value === 'string' && options.includes(value)) {
      ;(typed as Record<string, unknown>)[name] = value
    } else {
      errors.push(name)
    }
  }
  for (const name of ['teachers_affected', 'renewal_days'] as const) {
    const [lo, hi] = RANGES[name]
    const value = whole(raw[name], lo, hi)
    if (value === null) errors.push(name)
    else typed[name] = value
  }
  return { typed, errors }
}

// ---------- Rules: each a pure function returning {result, ruleId, explanation} ----------

interface Fired {
  result: string | null
  ruleId: string
  explanation: string
}

type Rule = (t: Typed) => Fired | null

const r2: Rule = (t) =>
  t.student_data === 'yes' || t.student_data === 'unsure'
    ? { result: PRIVACY, ruleId: 'R2', explanation: `R2 fired: student data = ${t.student_data} → Privacy officer, same day.` }
    : null

const r3: Rule = (t) =>
  t.issue_type === 'outage' && t.teachers_affected >= SEV1_TEACHERS
    ? {
        result: SEV1,
        ruleId: 'R3',
        explanation: `R3 fired: outage affecting ${t.teachers_affected} teachers ≥ ${SEV1_TEACHERS} → Sev1.`,
      }
    : null

const r4: Rule = (t) =>
  t.issue_type === 'outage' && t.teachers_affected < SEV1_TEACHERS
    ? {
        result: ENG,
        ruleId: 'R4',
        explanation: `R4 fired: outage affecting ${t.teachers_affected} teachers < ${SEV1_TEACHERS} → Engineering queue.`,
      }
    : null

const r5: Rule = (t) =>
  t.issue_type === 'bug' ? { result: ENG, ruleId: 'R5', explanation: 'R5 fired: issue type bug → Engineering queue.' } : null

const r6: Rule = (t) =>
  t.issue_type === 'feature'
    ? { result: PRODUCT, ruleId: 'R6', explanation: 'R6 fired: issue type feature → Product backlog.' }
    : null

const r7: Rule = (t) =>
  t.issue_type === 'how_to'
    ? { result: SUPPORT, ruleId: 'R7', explanation: 'R7 fired: issue type how_to → Support with help article.' }
    : null

const r8: Rule = (t) =>
  t.issue_type === 'needs_review'
    ? { result: COORD, ruleId: 'R8', explanation: 'R8 fired: AI was unsure of the issue type → Coordinator review.' }
    : null

const r9: Rule = (t) =>
  t.renewal_days <= RENEWAL_WINDOW_DAYS
    ? {
        result: null,
        ruleId: 'R9',
        explanation: `R9 fired: renewal in ${t.renewal_days} days ≤ ${RENEWAL_WINDOW_DAYS} → copy the account manager.`,
      }
    : null

const r10 = (r3Fired: boolean): Fired | null =>
  r3Fired
    ? { result: null, ruleId: 'R10', explanation: 'R10 fired: Sev1 outage → page on-call now; Head of CS confirms in parallel.' }
    : null

const r11 = (t: Typed): Fired => ({
  result: COORD,
  ruleId: 'R11',
  explanation: `R11 fired: no routing rule fired (issue type ${t.issue_type}) → Coordinator review.`,
})

const ROUTING_RULES: Rule[] = [r2, r3, r4, r5, r6, r7, r8]

const ruleNum = (id: string) => Number(id.slice(1))

export function decide(raw: Partial<RawFields>): Decision {
  const { typed, errors } = validate(raw)
  if (errors.length) {
    return {
      result: COORD,
      rules_fired: ['R1'],
      explanation: [`R1 fired: missing or invalid ${errors.join(', ')} → Coordinator review.`],
      next_step: NEXT_STEP[COORD],
      cc: [],
    }
  }
  const t = typed as Typed
  let routes = ROUTING_RULES.map((rule) => rule(t)).filter((f): f is Fired => f !== null)
  if (!routes.length) routes = [r11(t)]

  const result = routes
    .map((f) => f.result as string)
    .reduce((best, r) => (RANK.indexOf(r) < RANK.indexOf(best) ? r : best))
  const fired = [...routes]
  const cc: string[] = []
  const f9 = r9(t)
  if (f9) {
    fired.push(f9)
    cc.push('Account manager')
  }
  let next_step = NEXT_STEP[result]
  const f10 = r10(routes.some((f) => f.ruleId === 'R3'))
  if (f10) {
    fired.push(f10)
    if (result !== SEV1) next_step += ' Engineering on-call is also paged now (R10).'
  }
  fired.sort((a, b) => ruleNum(a.ruleId) - ruleNum(b.ruleId))
  return {
    result,
    rules_fired: fired.map((f) => f.ruleId),
    explanation: fired.map((f) => f.explanation),
    next_step,
    cc,
  }
}

// ---------- The rules table, word for word from the spec ----------

export const RULES_TABLE: { id: string; rule: string; output: string }[] = [
  { id: 'R1', rule: 'IF any field is missing or invalid THEN stop', output: 'Coordinator review' },
  {
    id: 'R2',
    rule: 'IF student_data = yes OR student_data = unsure THEN route to the privacy officer, same day',
    output: 'Privacy officer',
  },
  { id: 'R3', rule: 'IF issue_type = outage AND teachers_affected >= 3 THEN Sev1', output: 'Sev1: page engineering on-call' },
  { id: 'R4', rule: 'IF issue_type = outage AND teachers_affected < 3 THEN engineering queue', output: 'Engineering queue' },
  { id: 'R5', rule: 'IF issue_type = bug THEN engineering queue', output: 'Engineering queue' },
  { id: 'R6', rule: 'IF issue_type = feature THEN product backlog', output: 'Product backlog' },
  { id: 'R7', rule: 'IF issue_type = how_to THEN support with help article', output: 'Support' },
  { id: 'R8', rule: 'IF issue_type = needs_review THEN coordinator review', output: 'Coordinator review' },
  {
    id: 'R9',
    rule: 'IF renewal_days <= 90 THEN also copy the account manager',
    output: 'Adds "Account manager" to cc; does not choose a route',
  },
  {
    id: 'R10',
    rule: 'IF R3 fired THEN page engineering on-call now; the Head of Customer Success confirms in parallel',
    output: 'Adds the Sev1 page and checkpoint, even when another route wins',
  },
  { id: 'R11', rule: 'ELSE (no routing rule fired)', output: 'Coordinator review' },
]

// ---------- Test scenarios ----------

export interface Scenario {
  id: string
  name: string
  fields: RawFields
  expected: string
  expectedRules: string[]
}

const sc = (
  id: string,
  name: string,
  issue_type: string,
  student_data: string,
  teachers_affected: string,
  renewal_days: string,
  expected: string,
  expectedRules: string[],
): Scenario => ({ id, name, fields: { issue_type, student_data, teachers_affected, renewal_days }, expected, expectedRules })

export const SCENARIOS: Scenario[] = [
  sc('T1', 'How-to question', 'how_to', 'no', '1', '200', SUPPORT, ['R7']),
  sc('T2', 'Outage at threshold', 'outage', 'no', '3', '200', SEV1, ['R3', 'R10']),
  sc('T3', 'Privacy filed as a feature (worst case)', 'feature', 'yes', '1', '400', PRIVACY, ['R2', 'R6']),
  sc('T4', 'Feature near renewal', 'feature', 'no', '2', '45', PRODUCT, ['R6', 'R9']),
  sc('T5', 'AI unsure of type', 'needs_review', 'no', '1', '200', COORD, ['R8']),
  sc('T6', 'Small outage', 'outage', 'no', '2', '200', ENG, ['R4']),
  sc('T7', 'Bug', 'bug', 'no', '5', '300', ENG, ['R5']),
  sc('T8', 'Other', 'other', 'no', '1', '200', COORD, ['R11']),
  sc('T9', 'Test-day outage, privacy unsure', 'outage', 'unsure', '4', '30', PRIVACY, ['R2', 'R3', 'R9', 'R10']),
  sc('M1', 'Malformed teachers', 'bug', 'no', '1e3', '200', COORD, ['R1']),
  sc('M2', 'Malformed renewal', 'bug', 'no', '5', '12.5', COORD, ['R1']),
]

export const SAMPLE_REQUESTS = {
  clean: {
    name: 'Clean request',
    text: "Training notes, Lincoln Middle: 3 teachers couldn't log in during this morning's session; the whole site was down. No student data involved. District renewal is 200 days out.",
  },
  missing: {
    name: 'Missing Days to district renewal',
    text: 'Focus group, Westfield USD: 2 teachers asked for a way to export reading logs to parents. No student records involved.',
  },
}
export const SAMPLE_REPLY = 'Westfield renews in 45 days.'

// ---------- Draft and question checks (deterministic, never the model) ----------

export interface Check {
  id: string
  name: string
  pass: boolean
  reason: string
}

const NUMBER_RE = /(?<![A-Za-z0-9.])\$?\d[\d,]*(\.\d+)?[kK]?(?![A-Za-z0-9])/g
const DECISION_WORDS = ['approve', 'approved', 'approving', 'reject', 'rejected', 'deny', 'denied', 'guaranteed']

export function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER_RE)].map((m) => normalizeNumber(m[0]))
}

export function normalizeNumber(token: string): number {
  let s = token.replace(/\$/g, '').replace(/,/g, '')
  let mult = 1
  if (/[kK]$/.test(s)) {
    mult = 1000
    s = s.slice(0, -1)
  }
  return Number(s) * mult
}

function decisionWordsIn(text: string): string[] {
  const found: string[] = []
  for (const w of DECISION_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) found.push(w)
  }
  return found
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export function checkDraft(summary: string, typed: Typed, result: string): Check[] {
  const prefix = 'Route: ' + result
  const allowed = [typed.teachers_affected, typed.renewal_days, SEV1_TEACHERS, RENEWAL_WINDOW_DAYS]
  const stray = numbersIn(summary).filter((n) => !allowed.includes(n))
  const words = decisionWordsIn(summary.split(result).join(' '))
  const count = wordCount(summary)
  return [
    {
      id: 'D1',
      name: 'Route named',
      pass: summary.startsWith(prefix),
      reason: summary.startsWith(prefix) ? `starts with "${prefix}"` : `does not start with "${prefix}"`,
    },
    {
      id: 'D2',
      name: 'Numbers match',
      pass: stray.length === 0,
      reason: stray.length ? `numbers not in the fields: ${stray.join(', ')}` : 'every number is a field value or threshold',
    },
    {
      id: 'D3',
      name: 'No decision language',
      pass: words.length === 0,
      reason: words.length ? `uses: ${words.join(', ')}` : 'no decision words',
    },
    { id: 'D4', name: 'Length', pass: count <= 60, reason: `${count} words (limit 60)` },
  ]
}

export function checkQuestion(question: string, failingLabels: string[]): Check[] {
  const lower = question.toLowerCase()
  const absent = failingLabels.filter((l) => !lower.includes(l.toLowerCase()))
  const words = decisionWordsIn(question)
  const count = wordCount(question)
  return [
    {
      id: 'Q1',
      name: 'Names every missing field',
      pass: absent.length === 0,
      reason: absent.length ? `does not name: ${absent.join(', ')}` : 'names every missing field',
    },
    {
      id: 'Q2',
      name: 'No decision language',
      pass: words.length === 0,
      reason: words.length ? `uses: ${words.join(', ')}` : 'no decision words',
    },
    { id: 'Q3', name: 'Length', pass: count <= 40, reason: `${count} words (limit 40)` },
  ]
}

// ---------- Stress Test inputs (fixed seed, same every run) ----------

const EDGE_VALUES = ['', '0', '1', '99', '100', '101', '1000000', '1000001', '-5', '1e3', '0x64', '100.0', '12.5', ' 100 ', '007', 'abc', '+100', '1,000']

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function stressInputs(count = 500, seed = 20261016): RawFields[] {
  const rand = mulberry32(seed)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const inputs: RawFields[] = []
  for (let i = 0; i < count; i++) {
    const choice = (options: readonly string[]) => (rand() < 0.03 ? '' : pick(options))
    const num = (lo: number, hi: number) => {
      if (rand() < 0.03) return ''
      if (rand() < 0.3) return pick(EDGE_VALUES)
      return String(lo + Math.floor(rand() * (hi - lo + 1)))
    }
    inputs.push({
      issue_type: choice(ISSUE_TYPES),
      student_data: choice(STUDENT_DATA),
      teachers_affected: num(1, 12),
      renewal_days: num(0, 400),
    })
  }
  return inputs
}

export const sameRules = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
