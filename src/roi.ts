// ROI Panel math. All defaults are assumptions the user edits.

export type Scenario = 'Conservative' | 'Base' | 'Stretch'
export const SCENARIO_NAMES: Scenario[] = ['Conservative', 'Base', 'Stretch']

export interface RoiInputs {
  perWeek: number // N: instances per week
  minutesToday: number
  costPerHour: number // C
  weeks: number
  oneTime: number // B
  annualRun: number // R
  scenario: Scenario
  levers: Record<Scenario, { adoption: number; minutesSaved: number }> // adoption as a fraction
}

export const DEFAULT_ROI: RoiInputs = {
  perWeek: 150,
  minutesToday: 20,
  costPerHour: 55,
  weeks: 48,
  oneTime: 1650,
  annualRun: 1200,
  scenario: 'Conservative',
  levers: {
    Conservative: { adoption: 0.16, minutesSaved: 8 },
    Base: { adoption: 0.5, minutesSaved: 10 },
    Stretch: { adoption: 0.84, minutesSaved: 12 },
  },
}

export interface RoiOutputs {
  hours: number
  value: number
  payback: number | null // months; null means no payback
}

export function roiFor(inp: RoiInputs, scenario: Scenario): RoiOutputs {
  const { adoption, minutesSaved } = inp.levers[scenario]
  const hours = ((inp.perWeek * inp.weeks * minutesSaved) / 60) * adoption
  const value = hours * inp.costPerHour
  const monthlyNet = (value - inp.annualRun) / 12
  const payback = monthlyNet > 0 ? 3 + (inp.oneTime + inp.annualRun / 4) / monthlyNet : null
  return { hours, value, payback }
}

// Adoption needed for a 12-month payback at Conservative minutes saved.
export function adoptionForYearPayback(inp: RoiInputs): number | null {
  const { minutesSaved } = inp.levers.Conservative
  const denom = ((inp.perWeek * inp.weeks * minutesSaved) / 60) * inp.costPerHour
  if (denom <= 0) return null
  return (((inp.oneTime + inp.annualRun / 4) / 9) * 12 + inp.annualRun) / denom
}

export type PaybackStatus = 'approve' | 'review' | 'escalate'
export function paybackStatus(months: number | null): PaybackStatus {
  if (months === null || months > 24) return 'escalate'
  return months <= 12 ? 'approve' : 'review'
}

export const fmtMonths = (m: number | null) => (m === null ? 'no payback' : `${m.toFixed(1)} months`)

export function fmtValue(inp: RoiInputs, value: number, hours: number): string {
  if (inp.costPerHour === 1) return `${Math.round(hours).toLocaleString('en-US')} hours`
  return `$${Math.round(value).toLocaleString('en-US')}`
}
