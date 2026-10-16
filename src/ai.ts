// AI calls go only through the local server (/api/ai). Every AI output is
// checked by deterministic code before anything uses it.
import {
  AI_ISSUE_OUTCOMES,
  AI_MIN_CONFIDENCE,
  FIELDS,
  FIELD_LABELS,
  checkDraft,
  checkQuestion,
  normalizeNumber,
  numbersIn,
  validate,
  type Check,
  type Decision,
  type FieldKey,
  type RawFields,
  type Typed,
} from './rules'

// ---------- Prompts, verbatim from the spec ----------

export const PERSONA = `You are the routing-note writer for an ed tech Customer Success team. Your narrow job is to write a short internal note that tells the receiving team what a teacher or district reported and where the business rules sent it. You never decide outcomes that belong to business rules; those are decided by business rules and by people.

### Tone
Plain, calm, and specific, like a coordinator handing off to a colleague.

### Vocabulary to use
teacher, district, school, classroom, routed to, reported, affected, next step, privacy officer, on-call

### Vocabulary to avoid
approved, rejected, denied, guaranteed, urgent!!!, ASAP, unfortunately, we apologize

### Never
Decide outcomes that belong to business rules; decide anything outside your allowed outcomes; invent facts, names, or numbers; fill a missing field with a guess (return \`needs_review: true\` instead).`

export const READ_INSTRUCTION =
  'You read one teacher or district escalation (a support ticket, focus-group notes, or teacher-training notes) and propose values for these fields: issue_type (one of how_to, bug, feature, outage, other; how_to is a question about using the product, bug is something broken for a few users, feature is a request for something new, outage is people unable to use the product at all, other is anything else), student_data (yes if the text mentions student records, grades, names, or information shown to the wrong person; unsure if it might; no only if clearly not), teachers_affected (whole number), and renewal_days (whole number of days until the district renews). Copy numbers exactly as written; never guess a missing value, and never use 0 for an unknown: leave it null and list it in `missing`. You decide the issue type; when you are not confident, give it a low confidence. You propose; the business rules check your values and a person confirms them. Reply with only a JSON object.'

export const QUESTION_INSTRUCTION =
  'You write one short, polite question to the person who submitted this teacher or district item, asking for the details it is missing. Name each missing field exactly as given. Do not guess values, do not repeat numbers from the request, and never say whether it will be approved. Reply with only a JSON object.'

// ---------- Transport ----------

export type AICall = 'read' | 'question' | 'draft'
export type AIResult = { ok: true; json: any } | { ok: false; message: string } // eslint-disable-line @typescript-eslint/no-explicit-any

export const AI_TIMEOUT_MS = 30000

export function aiErrorMessage(status: number | 'timeout' | 'network'): string {
  if (status === 'timeout') return 'AI unavailable: timeout. Your rules still work.'
  if (status === 'network') return 'AI unavailable: no server. Start it with npm run dev. Your rules still work.'
  if (status === 401) return 'AI unavailable: add ANTHROPIC_API_KEY to .env. Your rules still work.'
  if (status === 429) return 'AI limit reached; your rules still work.'
  return `AI unavailable: ${status}`
}

export async function callAI(call: AICall, system: string, message: string): Promise<AIResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, system, message }),
      signal: controller.signal,
    })
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      body = await res.json()
    } catch {
      body = null
    }
    if (!res.ok || !body || !('json' in body)) {
      const status = typeof body?.status === 'number' ? body.status : res.status
      return { ok: false, message: aiErrorMessage(status || 'network') }
    }
    return { ok: true, json: body.json }
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, message: aiErrorMessage('timeout') }
    return { ok: false, message: aiErrorMessage('network') }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- The read: AI proposes, evidence checks and validation decide ----------

export type FieldNote = 'ok' | 'not_in_request' | 'missing' | 'invalid'

export interface ReadCheck {
  values: RawFields
  confidence: Record<FieldKey, number>
  notes: Record<FieldKey, FieldNote>
  failing: FieldKey[]
  aiIssue: string | null
}

export const clampConfidence = (raw: unknown): number => {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(10, Math.max(1, Math.round(n)))
}

const NUMBER_TOKEN = /^\$?\d[\d,]*(\.\d+)?[kK]?$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkRead(json: any, requestText: string): ReadCheck {
  const fields = json && typeof json.fields === 'object' && json.fields ? json.fields : {}
  const conf = json && typeof json.confidence === 'object' && json.confidence ? json.confidence : {}
  const missing: string[] = Array.isArray(json?.missing) ? json.missing.map(String) : []
  const inText = numbersIn(requestText)

  const values = { issue_type: '', student_data: '', teachers_affected: '', renewal_days: '' } as RawFields
  const confidence = {} as Record<FieldKey, number>
  const notes = {} as Record<FieldKey, FieldNote>

  for (const key of FIELDS) {
    confidence[key] = clampConfidence(conf[key])
    const raw = fields[key]
    // E2: null, empty, or listed in `missing` stays blank, never 0.
    if (raw === null || raw === undefined || missing.includes(key) || String(raw).trim() === '') {
      notes[key] = 'missing'
      continue
    }
    const text = String(raw).trim()
    if (key === 'teachers_affected' || key === 'renewal_days') {
      // E1: every proposed number must appear in the pasted text.
      if (!NUMBER_TOKEN.test(text)) {
        notes[key] = 'not_in_request'
        continue
      }
      const n = normalizeNumber(text)
      if (!inText.includes(n)) {
        notes[key] = 'not_in_request'
        continue
      }
      values[key] = Number.isInteger(n) ? String(n) : text
    } else {
      values[key] = text
    }
    notes[key] = 'ok'
  }

  const { errors } = validate(values)
  for (const key of errors) {
    if (notes[key] === 'ok') {
      notes[key] = 'invalid'
      values[key] = ''
    }
  }
  const failing = FIELDS.filter((k) => notes[k] !== 'ok')
  return { values, confidence, notes, failing, aiIssue: values.issue_type || null }
}

export function readRetryMessage(requestText: string, check: ReadCheck): string {
  const problems = check.failing.map((k) => {
    const why =
      check.notes[k] === 'not_in_request'
        ? 'the number you proposed is not in the request'
        : check.notes[k] === 'invalid'
          ? 'the value is not one of the allowed values'
          : 'missing'
    return `${k}: ${why}`
  })
  return `${requestText}\n\nYour previous reply failed these checks:\n${problems.join('\n')}\nRead the request again. Copy numbers exactly as written. If a value is not in the request, leave it null and list it in missing.`
}

export interface ReadRun {
  ok: boolean
  error?: string
  check?: ReadCheck
  retried: boolean
}

export async function readWithRetry(requestText: string, onStep?: (label: string) => void): Promise<ReadRun> {
  onStep?.('Reading the request...')
  const first = await callAI('read', READ_INSTRUCTION, requestText)
  if (!first.ok) return { ok: false, error: first.message, retried: false }
  const check1 = checkRead(first.json, requestText)
  if (!check1.failing.length) return { ok: true, check: check1, retried: false }
  onStep?.('Reading the request...')
  const second = await callAI('read', READ_INSTRUCTION, readRetryMessage(requestText, check1))
  if (!second.ok) return { ok: false, error: second.message, check: check1, retried: true }
  return { ok: true, check: checkRead(second.json, requestText), retried: true }
}

// Step (0): the issue type is the AI-DECIDES call.
export function acceptIssueType(value: string, confidence: number): string {
  return (AI_ISSUE_OUTCOMES as readonly string[]).includes(value) && confidence >= AI_MIN_CONFIDENCE ? value : 'needs_review'
}

// ---------- The requester question ----------

export interface QuestionRun {
  ok: boolean
  error?: string
  question?: string
  checks?: Check[]
  retried: boolean
}

export async function askRequester(requestText: string, failing: FieldKey[]): Promise<QuestionRun> {
  const labels = failing.map((k) => FIELD_LABELS[k])
  const base = `Request:\n${requestText}\n\nMissing fields:\n${labels.join('\n')}`
  let message = base
  let retried = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callAI('question', QUESTION_INSTRUCTION, message)
    if (!res.ok) return { ok: false, error: res.message, retried }
    const question = typeof res.json?.question === 'string' ? res.json.question : ''
    const checks = checkQuestion(question, labels)
    if (checks.every((c) => c.pass)) return { ok: true, question, checks, retried }
    if (attempt === 1) return { ok: false, question, checks, retried }
    retried = true
    message = `${base}\n\nYour previous question failed these checks:\n${checks
      .filter((c) => !c.pass)
      .map((c) => `${c.id} ${c.name}: ${c.reason}`)
      .join('\n')}`
  }
  return { ok: false, retried }
}

// ---------- The draft ----------

export interface DraftRun {
  ok: boolean
  error?: string
  summary?: string
  needsReview?: boolean
  confidence?: number
  checks?: Check[]
  retried: boolean
  held: boolean
}

export function draftMessage(typed: Typed, decision: Decision): string {
  return [
    'Field values:',
    `issue_type: ${typed.issue_type}`,
    `student_data: ${typed.student_data}`,
    `teachers_affected: ${typed.teachers_affected}`,
    `renewal_days: ${typed.renewal_days}`,
    '',
    `Result: ${decision.result}`,
    `Rule IDs fired: ${decision.rules_fired.join(', ')}`,
    'Explanations:',
    ...decision.explanation,
    decision.cc.length ? `Copy: ${decision.cc.join(', ')}` : '',
    '',
    `Start the summary with "Route: ${decision.result}". Use no numbers except the field values and the thresholds 3 and 90.`,
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n')
}

export async function draftWithChecks(typed: Typed, decision: Decision): Promise<DraftRun> {
  const base = draftMessage(typed, decision)
  let message = base
  let retried = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callAI('draft', PERSONA, message)
    if (!res.ok) return { ok: false, error: res.message, retried, held: false }
    const summary = typeof res.json?.summary === 'string' ? res.json.summary : ''
    const needsReview = res.json?.needs_review === true
    const confidence = clampConfidence(res.json?.confidence)
    const checks = checkDraft(summary, typed, decision.result)
    if (checks.every((c) => c.pass)) return { ok: true, summary, needsReview, confidence, checks, retried, held: false }
    if (attempt === 1) return { ok: true, summary, needsReview, confidence, checks, retried, held: true }
    retried = true
    message = `${base}\n\nYour previous summary failed these checks:\n${checks
      .filter((c) => !c.pass)
      .map((c) => `${c.id} ${c.name}: ${c.reason}`)
      .join('\n')}\nWrite it again.`
  }
  return { ok: false, retried, held: false }
}
