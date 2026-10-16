import type { Shared } from '../App'
import { SCENARIO_NAMES, fmtMonths, fmtValue, paybackStatus, roiFor, type RoiInputs } from '../roi'
import { Card, STATUS_TEXT } from '../ui'

type NumKey = 'perWeek' | 'minutesToday' | 'costPerHour' | 'weeks' | 'oneTime' | 'annualRun'

const INPUTS: [NumKey, string][] = [
  ['perWeek', 'Instances per week'],
  ['minutesToday', 'Minutes each today'],
  ['costPerHour', 'Loaded cost per hour'],
  ['weeks', 'Working weeks'],
  ['oneTime', 'One-time cost'],
  ['annualRun', 'Annual run cost'],
]

function NumberInput({ value, onChange, step }: { value: number; onChange: (n: number) => void; step?: string }) {
  return (
    <input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className="tabular h-9 w-full rounded-[4px] border border-muted/40 bg-card px-2 text-right"
    />
  )
}

export default function RoiPanel({ s }: { s: Shared }) {
  const roi = s.roi
  const set = (patch: Partial<RoiInputs>) => s.setRoi({ ...roi, ...patch })
  const lever = roi.levers[roi.scenario]
  const setLever = (patch: Partial<typeof lever>) =>
    set({ levers: { ...roi.levers, [roi.scenario]: { ...lever, ...patch } } })
  const out = roiFor(roi, roi.scenario)
  const hoursOnly = roi.costPerHour === 1

  return (
    <Card>
      <h2 className="mb-4">ROI panel</h2>
      <div className="mb-4 inline-flex rounded-[4px] border border-primary" role="group">
        {SCENARIO_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => set({ scenario: name })}
            className={`px-3 py-1 font-semibold ${roi.scenario === name ? 'bg-primary text-white' : 'text-primary'}`}
            aria-pressed={roi.scenario === name}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INPUTS.map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="font-semibold">{label}</span>
              <NumberInput value={roi[key]} onChange={(n) => set({ [key]: n } as Partial<RoiInputs>)} />
              <span className="text-xs text-muted">assumption; edit me</span>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Adoption (%)</span>
            <NumberInput value={Math.round(lever.adoption * 1000) / 10} onChange={(n) => setLever({ adoption: n / 100 })} />
            <span className="text-xs text-muted">assumption; edit me</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Minutes saved</span>
            <NumberInput value={lever.minutesSaved} onChange={(n) => setLever({ minutesSaved: n })} />
            <span className="text-xs text-muted">assumption; edit me</span>
          </label>
        </div>
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-xs font-semibold text-muted">Annual hours saved</dt>
            <dd className="tabular text-[1.75rem] font-bold">{Math.round(out.hours).toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Annual value</dt>
            <dd className="tabular text-[1.75rem] font-bold">{fmtValue(roi, out.value, out.hours)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Payback</dt>
            <dd className={`tabular text-[1.75rem] font-bold ${STATUS_TEXT[paybackStatus(out.payback)]}`}>
              {hoursOnly ? 'Not priced (hours only)' : fmtMonths(out.payback)}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  )
}
