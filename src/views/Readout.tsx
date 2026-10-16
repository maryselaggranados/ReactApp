import type { Shared } from '../App'
import { adoptionForYearPayback, fmtMonths, fmtValue, paybackStatus, roiFor } from '../roi'
import { Card, Divider, PrimaryButton, STATUS_TEXT } from '../ui'

export default function Readout({ s }: { s: Shared }) {
  const roi = s.roi
  const rows = (['Conservative', 'Base'] as const).map((name) => ({ name, ...roiFor(roi, name) }))
  const needed = adoptionForYearPayback(roi)
  const conservativeAdoption = roi.levers.Conservative.adoption
  const st = s.selfTest
  const conservativePayback = rows[0].payback

  return (
    <Card className="max-w-[44rem]">
      <h1>Escalations take 20 minutes each and 15% get misrouted</h1>
      <p className="mt-2">
        Customer Success coordinators spend 20 minutes triaging each of about 150 teacher and district escalations a week.
      </p>
      <p className="mt-4 font-semibold">Recommendation: Set in the business case.</p>

      <Divider />
      <table className="tabular w-full">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="h-9 font-semibold" />
            <th className="h-9 text-right font-semibold">Annual value</th>
            <th className="h-9 text-right font-semibold">Payback</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-muted/20">
              <td className="h-9">{r.name}</td>
              <td className="h-9 text-right">{fmtValue(roi, r.value, r.hours)}</td>
              <td className={`h-9 text-right font-semibold ${STATUS_TEXT[paybackStatus(r.payback)]}`}>{fmtMonths(r.payback)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />
      <h2 className="mb-2">What has to be true</h2>
      <p>
        Adoption needed for a 12-month payback at {roi.levers.Conservative.minutesSaved} minutes saved:{' '}
        <span className="tabular font-semibold">{needed === null ? 'not computable' : `${(needed * 100).toFixed(1)}%`}</span>, beside
        Conservative's <span className="tabular">{Math.round(conservativeAdoption * 1000) / 10}%</span>.
      </p>

      <Divider />
      <h2 className="mb-2">Quality bar</h2>
      <ul className="flex flex-col gap-2">
        <li>
          <span className="font-semibold">Explainable:</span> every result shows the rules that decided it.
        </li>
        <li>
          <span className="font-semibold">Tested:</span>{' '}
          {st === null ? (
            <span className="text-muted">Self-Test has not run yet.</span>
          ) : (
            <span
              className={`rounded-[4px] px-2 py-1 font-semibold ${st.allPass ? 'bg-approve/10 text-approve' : 'bg-escalate/10 text-escalate'}`}
            >
              Self-Test {Math.min(st.pyPassed, st.tsPassed)} / {st.total} {st.allPass ? 'pass in both' : st.pyError ? '· one check did not run' : '· failing'}
            </span>
          )}
        </li>
        <li>
          <span className="font-semibold">Reviewed:</span> not yet
        </li>
        <li>
          <span className="font-semibold">Priced:</span>{' '}
          <span className={`tabular font-semibold ${STATUS_TEXT[paybackStatus(conservativePayback)]}`}>
            Conservative payback {fmtMonths(conservativePayback)}
          </span>
        </li>
      </ul>

      <Divider />
      <p>
        <span className="font-semibold">Top risks:</span> Set in the business case.
      </p>
      <p className="mt-2">
        <span className="font-semibold">The ask:</span> Set in the business case.
      </p>

      <div className="no-print mt-6">
        <PrimaryButton onClick={() => window.print()}>Print or Save as PDF</PrimaryButton>
      </div>
    </Card>
  )
}
