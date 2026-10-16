// Runs both engines on the same raw input. Python decides once loaded;
// TypeScript cross-checks it, and decides only while Python is unavailable.
import { COORD, NEXT_STEP, decide, sameRules, type Decision, type RawFields } from './rules'
import { lastLine, pyDecide, pythonReady } from './python'

export interface Outcome {
  decision: Decision
  source: 'python' | 'typescript'
  mismatch: boolean
  ts: Decision
  py: Decision | null
  pyError: string | null
}

export function trimmed(raw: RawFields): RawFields {
  return {
    issue_type: raw.issue_type.trim(),
    student_data: raw.student_data.trim(),
    teachers_affected: raw.teachers_affected.trim(),
    renewal_days: raw.renewal_days.trim(),
  }
}

export function decideBoth(raw: RawFields): Outcome {
  const input = trimmed(raw)
  const ts = decide(input)
  let py: Decision | null = null
  let pyError: string | null = null
  if (pythonReady()) {
    try {
      py = pyDecide(input)
    } catch (err) {
      pyError = lastLine(err)
    }
  }
  if (!py) return { decision: ts, source: 'typescript', mismatch: false, ts, py, pyError }
  const agree = py.result === ts.result && sameRules(py.rules_fired, ts.rules_fired)
  if (agree) return { decision: py, source: 'python', mismatch: false, ts, py, pyError }
  return {
    decision: {
      result: COORD,
      rules_fired: [],
      explanation: ['Engine mismatch: the Python and JavaScript rules disagree, so a coordinator routes this item.'],
      next_step: NEXT_STEP[COORD],
      cc: [],
    },
    source: 'python',
    mismatch: true,
    ts,
    py,
    pyError,
  }
}
