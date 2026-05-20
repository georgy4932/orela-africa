 import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SEV_COLOR = { critical: '#dc2626', urgent: '#d97706', routine: '#19c2b5' }
const SEV_BG    = { critical: 'rgba(220,38,38,0.08)', urgent: 'rgba(217,119,6,0.08)', routine: 'rgba(25,194,181,0.08)' }
const TYPE_LABEL = {
  recall: 'Recall', quality_defect: 'Quality Defect', counterfeit: 'Counterfeit',
  safety_signal: 'Safety Signal', expiry_correction: 'Expiry Correction', falsified: 'Falsified Medicine',
}

export default function AlertsPage() {
  const [alerts,   setAlerts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('batch_alerts')
        .select(`
          id, title, medicine_name_raw, batch_numbers, manufacturer,
          alert_reference, severity, alert_type, status,
          issued_at, source, issuing_authority,
          description, recommended_action, risk_to_patients, expires_at,
          medicines(generic_name, strength, dosage_form)
        `)
        .eq('public_visible', true)
        .neq('status', 'resolved')
        .order('issued_at', { ascending: false })
      setAlerts(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      a.title?.toLowerCase().includes(q) ||
      a.medicine_name_raw?.toLowerCase().includes(q) ||
      a.medicines?.generic_name?.toLowerCase().includes(q) ||
      a.batch_numbers?.some(b => b.toLowerCase().includes(q)) ||
      a.manufacturer?.toLowerCase().includes(q) ||
      a.alert_reference?.toLowerCase().includes(q)
    const matchFilter = filter === 'all' || a.severity === filter
    return matchSearch && matchFilter
  })

  function medicineName(a) {
    if (a.medicines) return `${a.medicines.generic_name} ${a.medicines.strength ?? ''} ${a.medicines.dosage_form ?? ''}`.trim()
    return a.medicine_name_raw ?? '—'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'var(--font-sans)' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', padding: '0 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, gap: 16 }}>
            <a href="/ng" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              <div style={{ width: 26, height: 26, background: '#19c2b5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#04080f" strokeWidth="2.5" width={12} height={12}>
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orela Nigeria</span>
            </a>
            <a href="/ng/auth" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>Sign in →</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#19c2b5', marginBottom: 8 }}>
            Drug Safety · Pharmacovigilance
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 8 }}>
            Medicine Safety Alerts
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 540 }}>
            Active alerts for recalled, substandard, falsified, or otherwise unsafe medicines in the Orela network. Issued in coordination with NAFDAC and other regulatory authorities.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by medicine, batch number, manufacturer..."
            style={{ flex: 1, minWidth: 220 }} />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="all">All severities</option>
            <option value="critical">Critical only</option>
            <option value="urgent">Urgent only</option>
            <option value="routine">Routine only</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {['critical','urgent','routine'].map(s => (
            <div key={s} style={{ padding: '8px 14px', borderRadius: 8, background: SEV_BG[s], border: `1px solid ${SEV_COLOR[s]}30`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[s] }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: SEV_COLOR[s], textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{alerts.filter(a => a.severity === s).length}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-disabled)', alignSelf: 'center', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>Loading alerts...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              {search ? `No alerts found for "${search}"` : 'No active alerts at this time'}
            </div>
            {!search && <div style={{ fontSize: 12, color: 'var(--text-disabled)' }}>This is a good sign — the medicine supply network is clear.</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map(a => {
              const isOpen   = expanded === a.id
              const sevColor = SEV_COLOR[a.severity] ?? '#19c2b5'
              const sevBg    = SEV_BG[a.severity]    ?? 'transparent'
              return (
                <div key={a.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${sevColor}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setExpanded(isOpen ? null : a.id)} style={{ padding: '16px 20px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', background: sevBg, color: sevColor, border: `1px solid ${sevColor}40`, padding: '2px 7px', borderRadius: 3 }}>{a.severity}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 3 }}>{TYPE_LABEL[a.alert_type] ?? a.alert_type}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-disabled)', padding: '2px 4px' }}>{a.alert_reference}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>💊 {medicineName(a)}</span>
                          {a.manufacturer && <span>🏭 {a.manufacturer}</span>}
                          <span>📋 {a.issuing_authority ?? a.source}</span>
                          <span>📅 {new Date(a.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase', background: a.status === 'active' ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.1)', color: a.status === 'active' ? '#dc2626' : '#22c55e' }}>{a.status}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isOpen ? '▲ Less' : '▼ Details'}</span>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-disabled)', marginBottom: 6 }}>Affected batch numbers</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {a.batch_numbers?.map(b => (
                              <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 4, color: 'var(--text-primary)' }}>{b}</span>
                            ))}
                          </div>
                        </div>
                        {a.risk_to_patients && (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-disabled)', marginBottom: 6 }}>Risk to patients</div>
                            <div style={{ fontSize: 12, color: '#dc2626', lineHeight: 1.5 }}>{a.risk_to_patients}</div>
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-disabled)', marginBottom: 6 }}>Description</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{a.description}</div>
                      </div>
                      <div style={{ background: sevBg, border: `1px solid ${sevColor}30`, borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: sevColor, marginBottom: 6 }}>Recommended action</div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, fontWeight: 500 }}>{a.recommended_action}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-disabled)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>Source: {a.source}</span>
                        <span>Ref: {a.alert_reference}</span>
                        {a.expires_at && <span>Expires: {new Date(a.expires_at).toLocaleDateString('en-GB')}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 40, padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>About this page:</strong> Orela publishes medicine safety alerts in coordination with NAFDAC and international regulatory bodies. Alerts reflect information received at time of publication and may be updated as investigations progress. For urgent enquiries contact{' '}
          <a href="mailto:hello@orela.africa" style={{ color: '#19c2b5' }}>hello@orela.africa</a> or NAFDAC directly.
        </div>

        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>© 2026 Orela Network. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['Home', '/ng'], ['Docs', '/ng/docs'], ['Privacy', '/ng/privacy'], ['Status', '/ng/status']].map(([label, href]) => (
              <a key={href} href={href} style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>{label}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
