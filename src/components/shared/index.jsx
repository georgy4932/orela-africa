import { useEffect, useState, useRef } from 'react'

/* ── MODAL ── */
export function Modal({ title, subtitle, size = '', onClose, children, footer }) {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle && <div className="modal-header-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/* ── INLINE ALERTS ── */
export function InlineError({ message }) {
  if (!message) return null
  return (
    <div className="inline-alert alert-error">
      <span className="inline-alert-icon">⚠</span>
      <span>{message}</span>
    </div>
  )
}

export function InlineSuccess({ message }) {
  if (!message) return null
  return (
    <div className="inline-alert alert-success">
      <span className="inline-alert-icon">✓</span>
      <span>{message}</span>
    </div>
  )
}

export function InlineInfo({ message }) {
  if (!message) return null
  return (
    <div className="inline-alert alert-info">
      <span className="inline-alert-icon">ℹ</span>
      <span>{message}</span>
    </div>
  )
}

/* ── EMPTY STATE ── */
export function EmptyState({ title, description, actions }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" />
        </svg>
      </div>
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  )
}

/* ── SKELETON ── */
export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <div className="skeleton skeleton-text" style={{ width: `${60 + (i * 13) % 35}%` }} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonCard() {
  return (
    <div className="stat-card">
      <div className="skeleton" style={{ width: '55%', height: 22, marginBottom: 8 }} />
      <div className="skeleton skeleton-text" style={{ width: '40%', height: 10 }} />
      <div className="skeleton skeleton-text" style={{ width: '70%', height: 10, marginTop: 4 }} />
    </div>
  )
}

/* ── SPINNER ── */
export function Spinner({ size = '' }) {
  return <div className={`spinner ${size}`} />
}

export function SpinnerCenter() {
  return <div className="spinner-center"><div className="spinner spinner-lg" /></div>
}

/* ── BADGE ── */
export function Badge({ className = '', children, dot = false }) {
  return (
    <span className={`badge ${dot ? 'badge-dot' : ''} ${className}`}>
      {children}
    </span>
  )
}

/* ── CONTEXT CARD ── */
export function ContextCard({ title, meta, children }) {
  return (
    <div className="context-card">
      {title && <div className="context-card-title">{title}</div>}
      {meta  && <div className="context-card-sub">{meta}</div>}
      {children}
    </div>
  )
}

/* ── INFO ROWS ── */
export function InfoRows({ rows }) {
  return (
    <div>
      {rows.map(([label, value], i) => (
        <div key={i} className="info-row">
          <span className="info-row-label">{label}</span>
          <span className="info-row-value">{value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

/* ── SECTION SHELL ── */
export function SectionShell({ title, action, children }) {
  return (
    <div className="section-shell">
      <div className="section-shell-header">
        <span className="section-shell-title">{title}</span>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

/* ── CUSTOM SELECT ── */
// Replaces native <select> to avoid OS-native pickers on mobile (especially iOS).
// options: [{value, label}] or ['string', ...]
// searchable: shows a filter input for long lists (>10 options)
export function CustomSelect({ value, onChange, options, placeholder = 'Select…', searchable = false, style = {} }) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const ref                 = useRef(null)

  const normalised = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  const filtered   = searchable && query
    ? normalised.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : normalised
  const selected   = normalised.find(o => o.value === value)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    function esc(e)   { if (e.key === 'Escape') { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r)',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 13, cursor: 'pointer', textAlign: 'left', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 200, overflow: 'hidden',
        }}>
          {searchable && (
            <div style={{ padding: '8px 8px 4px' }}>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
              />
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No results</div>
            ) : filtered.map(opt => (
              <div
                key={opt.value}
                onMouseDown={() => { onChange(opt.value); setOpen(false); setQuery('') }}
                style={{
                  padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                  color: opt.value === value ? 'var(--primary)' : 'var(--text-primary)',
                  background: opt.value === value ? 'rgba(25,194,181,0.08)' : 'transparent',
                  borderBottom: '1px solid var(--border-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = 'var(--bg-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = opt.value === value ? 'rgba(25,194,181,0.08)' : 'transparent' }}
              >
                {opt.label}
                {opt.value === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── STAT CARD ── */
export function StatCard({ label, value, desc, accent = '' }) {
  return (
    <div className={`stat-card ${accent ? `ac-${accent}` : ''}`}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {desc && <div className="stat-sublabel">{desc}</div>}
    </div>
  )
}

/* ── TRANSFER PIPELINE ── */
const PIPELINE = ['Pending', 'Approved', 'In Transit', 'Fulfilled']
const STATUS_IDX = { pending: 0, approved: 1, in_transit: 2, fulfilled: 3 }

export function TransferPipeline({ status }) {
  const idx = STATUS_IDX[status] ?? -1
  if (['rejected', 'cancelled'].includes(status)) {
    return (
      <div className="pipeline-steps">
        <span className="pipeline-step" style={{ color: 'var(--danger)' }}>
          {status === 'rejected' ? 'Rejected' : 'Cancelled'}
        </span>
      </div>
    )
  }
  return (
    <div className="pipeline-steps">
      {PIPELINE.map((step, i) => (
        <span key={step}>
          <span className={`pipeline-step ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}`}>
            {i < idx ? '✓ ' : ''}{step}
          </span>
          {i < PIPELINE.length - 1 && <span className="pipeline-sep">›</span>}
        </span>
      ))}
    </div>
  )
}
