import { useEffect, useState, type ReactNode } from 'react'
import type { Status } from './rules'

export type Decider = 'rules' | 'ai' | 'person'

const DECIDER_CLASS: Record<Decider, string> = {
  rules: 'text-primary bg-primary/10',
  ai: 'text-accent bg-accent/10',
  person: 'text-secondary bg-secondary/10',
}
export const DECIDER_BORDER: Record<Decider, string> = {
  rules: 'border-primary',
  ai: 'border-accent',
  person: 'border-secondary',
}
export const STATUS_TEXT: Record<Status, string> = {
  approve: 'text-approve',
  review: 'text-review',
  escalate: 'text-escalate',
}

export function Badge({ decider, children }: { decider: Decider; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-[4px] px-2 py-1 text-xs font-semibold leading-none ${DECIDER_CLASS[decider]}`}>
      {children}
    </span>
  )
}

// Check outcome words, styled the same way everywhere.
export function StatusWord({ word }: { word: string }) {
  let cls = 'text-muted font-semibold'
  if (word === 'Skipped') cls = 'text-muted italic'
  else if (word === 'Asked the requester') cls = 'text-accent font-semibold'
  else if (
    word.startsWith('Fail') ||
    word === 'Not in the request' ||
    word.startsWith('Held for a person') ||
    word === 'Sent to a person' ||
    word === 'Needs a person' ||
    word.startsWith('Missing')
  )
    cls = 'text-escalate font-semibold'
  return <span className={cls}>{word}</span>
}

export function Loading({ label, startedAt }: { label: string; startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <div className="flex items-center gap-2 text-accent" role="status">
      <span>{label}</span>
      <span aria-hidden="true" className="flex gap-1">
        <span className="pulse-dot h-1 w-1 rounded-full bg-accent" />
        <span className="pulse-dot h-1 w-1 rounded-full bg-accent" />
        <span className="pulse-dot h-1 w-1 rounded-full bg-accent" />
      </span>
      <span className="tabular text-muted">{secs}s</span>
    </div>
  )
}

export const Divider = () => <hr className="my-4 border-0 border-t border-muted/20" />

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-semibold text-muted">{children}</div>
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-[6px] bg-card p-4 shadow-card ${className}`}>
      {children}
    </section>
  )
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`rounded-[4px] bg-primary px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  )
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`rounded-[4px] border border-primary bg-card px-4 py-2 font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  )
}

export function LinkButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return <button {...rest} className={`text-accent underline underline-offset-2 hover:no-underline ${className}`} />
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>
}

export const timeNow = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
