import type { ReactNode } from 'react'

export function Card({
  title,
  right,
  children,
  bodyClass = 'card-body',
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  bodyClass?: string
}) {
  return (
    <section className="card">
      <h2>
        {title}
        {right ? <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{right}</span> : null}
      </h2>
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

/**
 * A numeric input that lets you type freely.
 *
 * Binding a number straight to `value` fights the user: clearing the box to
 * retype gives NaN, and "1." is not a number yet. So the raw string is held
 * locally and only pushed up when it parses, and the local buffer is dropped
 * as soon as the field loses focus.
 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 'any',
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  min?: number
  max?: number
  step?: number | 'any'
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <div className={suffix ? 'input-suffix' : undefined}>
        <input
          type="number"
          value={Number.isFinite(value) ? round(value) : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            const n = Number(raw)
            if (Number.isFinite(n)) onChange(n)
          }}
        />
        {suffix ? <span>{suffix}</span> : null}
      </div>
    </Field>
  )
}

/** Trim float noise so the box does not show 4.6153846153846155. */
function round(v: number) {
  return Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Number(v.toFixed(4))
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'accent' | 'blend'
}) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <div style={{ marginLeft: 'auto' }}>
            <button className="ghost small" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  )
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can race the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
