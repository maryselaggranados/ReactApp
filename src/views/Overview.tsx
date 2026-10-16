import type { Shared } from '../App'
import { fmtMonths, roiFor } from '../roi'
import { Badge, DECIDER_BORDER, PrimaryButton, type Decider } from '../ui'

const STEPS: { decider: Decider; title: string; text: string }[] = [
  {
    decider: 'ai',
    title: 'Probabilistic: AI.',
    text: 'AI reads each ticket or set of notes, proposes the fields, names the issue type, and drafts the routing note. Its wording varies from run to run.',
  },
  {
    decider: 'rules',
    title: 'Deterministic: your rules.',
    text: 'Your rules check everything the AI produces and decide where each item goes and who is copied. Same input, same answer, every time.',
  },
  {
    decider: 'person',
    title: 'Accountable: a person.',
    text: 'The coordinator confirms the fields; the privacy officer reviews every student-data case; the Head of Customer Success confirms every Sev1 page.',
  },
]

export default function Overview({ s }: { s: Shared }) {
  const conservative = roiFor(s.roi, 'Conservative')
  const tiles = [
    { value: '2,400', label: 'hours a year' },
    { value: '$132,000', label: 'a year' },
    { value: '15%', label: 'misrouted' },
    { value: fmtMonths(conservative.payback), label: 'Conservative payback' },
  ]
  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-[44rem]">
        <h1>Escalations take 20 minutes each and 15% get misrouted</h1>
        <p className="mt-2">
          Customer Success coordinators spend 20 minutes triaging each of about 150 teacher and district escalations a week.
        </p>
      </div>

      <div className="grid grid-cols-2 rounded-[6px] bg-card shadow-card md:grid-cols-4">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`p-4 ${i % 2 === 1 ? 'border-l border-muted/20' : ''} ${i >= 2 ? 'border-t border-muted/20 md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''}`}
          >
            <div className="tabular text-[1.75rem] font-bold leading-tight">{t.value}</div>
            <div className="text-[0.8rem]">{t.label}</div>
            <div className="text-xs text-muted">(ASSUMED)</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4">How each case is decided</h2>
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-1 flex-col gap-4 md:flex-row md:items-start">
              <div className={`flex-1 border-t-[3px] pt-3 ${DECIDER_BORDER[step.decider]}`}>
                <div className="mb-2">
                  <Badge decider={step.decider}>{step.title}</Badge>
                </div>
                <p>{step.text}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div aria-hidden="true" className="self-center text-muted md:pt-6">
                  <span className="hidden md:inline">→</span>
                  <span className="md:hidden">↓</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="max-w-[44rem]">
        <button className="text-left text-accent underline underline-offset-2" onClick={() => s.go('rules', 'rules-readout')}>
          Your expert rules, extracted into code: 11 rules, 11 tests, and a check on every AI step.
        </button>
      </p>

      <div>
        <PrimaryButton onClick={() => s.go('app')}>Open the tool</PrimaryButton>
      </div>
    </div>
  )
}
