// Self-Test and Stress Test: run fixed inputs through both engines. Never calls the AI.
import { SCENARIOS, decide, sameRules, stressInputs, type RawFields, type Scenario } from './rules'
import { lastLine, pyDecide, pySelfTest, pythonReady } from './python'
import { trimmed } from './engine'

export interface EngineRun {
  result: string
  rules: string[]
}

export interface ScenarioRow {
  scenario: Scenario
  py: EngineRun | null
  ts: EngineRun
  pyPass: boolean
  tsPass: boolean
  agree: boolean | null // null when Python did not run
}

export interface SelfTestResult {
  rows: ScenarioRow[]
  total: number
  pyPassed: number
  tsPassed: number
  agreed: number
  bothRan: number
  pyError: string | null
  pyOwn: { passed: number; total: number } | null
  allPass: boolean
}

const run = (fn: (r: RawFields) => { result: string; rules_fired: string[] }, raw: RawFields): EngineRun => {
  const d = fn(trimmed(raw))
  return { result: d.result, rules: [...d.rules_fired] }
}

export function runSelfTest(): SelfTestResult {
  let pyError: string | null = pythonReady() ? null : 'Python is still loading.'
  const rows: ScenarioRow[] = SCENARIOS.map((s) => {
    const ts = run(decide, s.fields)
    let py: EngineRun | null = null
    if (!pyError) {
      try {
        py = run(pyDecide, s.fields)
      } catch (err) {
        pyError = lastLine(err)
      }
    }
    const matches = (e: EngineRun) => e.result === s.expected && sameRules(e.rules, s.expectedRules)
    return {
      scenario: s,
      py,
      ts,
      pyPass: py ? matches(py) : false,
      tsPass: matches(ts),
      agree: py ? py.result === ts.result && sameRules(py.rules, ts.rules) : null,
    }
  })
  let pyOwn: SelfTestResult['pyOwn'] = null
  if (!pyError) {
    try {
      const own = pySelfTest()
      pyOwn = { passed: own.passed, total: own.total }
    } catch (err) {
      pyError = lastLine(err)
    }
  }
  if (pyError) rows.forEach((r) => ((r.py = null), (r.pyPass = false), (r.agree = null)))
  const pyPassed = rows.filter((r) => r.pyPass).length
  const tsPassed = rows.filter((r) => r.tsPass).length
  const bothRan = rows.filter((r) => r.agree !== null).length
  const agreed = rows.filter((r) => r.agree === true).length
  return {
    rows,
    total: rows.length,
    pyPassed,
    tsPassed,
    agreed,
    bothRan,
    pyError,
    pyOwn,
    allPass: !pyError && pyPassed === rows.length && tsPassed === rows.length,
  }
}

export interface StressResult {
  count: number
  disagreements: { input: RawFields; py: EngineRun; ts: EngineRun }[]
  pyError: string | null
}

export function runStressTest(): StressResult {
  const inputs = stressInputs(500)
  if (!pythonReady()) return { count: 0, disagreements: [], pyError: 'Python is still loading.' }
  const disagreements: StressResult['disagreements'] = []
  try {
    for (const input of inputs) {
      const py = run(pyDecide, input)
      const ts = run(decide, input)
      if (py.result !== ts.result || !sameRules(py.rules, ts.rules)) disagreements.push({ input, py, ts })
    }
  } catch (err) {
    return { count: 0, disagreements: [], pyError: lastLine(err) }
  }
  return { count: inputs.length, disagreements, pyError: null }
}
