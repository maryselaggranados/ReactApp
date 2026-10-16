// Loads rules.py in the browser with Pyodide, once, without blocking the page.
import { RULES_PY } from './rulesPy'
import type { Decision, RawFields } from './rules'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    loadPyodide?: (opts?: Record<string, unknown>) => Promise<any>
  }
}

export type PyState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; error: string }

let pyodide: any = null
let loading: Promise<PyState> | null = null

export function lastLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  const lines = text.trim().split('\n').filter((l) => l.trim())
  return lines[lines.length - 1] || text
}

async function waitForLoader(timeoutMs = 30000) {
  const start = Date.now()
  while (!window.loadPyodide) {
    if (Date.now() - start > timeoutMs) throw new Error('Pyodide script did not load')
    await new Promise((r) => setTimeout(r, 100))
  }
  return window.loadPyodide
}

export function loadPython(): Promise<PyState> {
  if (!loading) {
    loading = (async (): Promise<PyState> => {
      try {
        const load = await waitForLoader()
        pyodide = await load()
        pyodide.runPython(RULES_PY)
        return { status: 'ready' }
      } catch (err) {
        pyodide = null
        return { status: 'failed', error: lastLine(err) }
      }
    })()
  }
  return loading
}

export const pythonReady = () => pyodide !== null

function callPy(name: string, ...args: unknown[]) {
  if (!pyodide) throw new Error('Python is not loaded')
  const fn = pyodide.globals.get(name)
  const pyArgs = args.map((a) => pyodide.toPy(a))
  try {
    const out = fn(...pyArgs)
    if (out && typeof out.toJs === 'function') {
      const js = out.toJs({ dict_converter: Object.fromEntries })
      out.destroy()
      return js
    }
    return out
  } finally {
    pyArgs.forEach((p) => p.destroy?.())
    fn.destroy()
  }
}

export function pyDecide(raw: RawFields): Decision {
  return callPy('decide', raw) as Decision
}

export function pySelfTest(): { passed: number; total: number; failures: unknown[] } {
  return callPy('self_test')
}

export function pyDeterminism(raw: RawFields, runs = 25): number {
  return callPy('determinism_check', raw, runs) as number
}
