import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth }  from '../hooks/useAuth'
import { PUBLIC_NG_URL } from '../lib/appUrl'

const SEV_COLOR = { critical: '#dc2626', urgent: '#d97706', routine: '#19c2b5' }
const SEV_BG    = { critical: 'rgba(220,38,38,0.08)', urgent: 'rgba(217,119,6,0.08)', routine: 'rgba(25,194,181,0.08)' }

const STATUS_LABEL = {
  pending:          { label: 'Action required',   color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  quarantined:      { label: 'Quarantined',        color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  not_affected:     { label: 'Not affected',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)'  },
  already_dispensed:{ label: 'Already dispensed',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  returned_removed: { label: 'Returned / removed', color: '#22c55e', bg: 'rgba(34,197,94,0.08)'  },
}

export default function DrugAlertsPage() {
  const { facility } = useAuth()
  const facilityId = facility?.id
  const [responses, setResponses] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('pending')
  const [acting,    setActing]    = useState(null)

  useEffect(() => {
    if (facilityId) load()
    else setLoading(false)
  }, [facilityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('alert_facility_responses')
      .select(`
        id, facility_id, inventory_item_id, matched_batch_number,
        units_at_time_of_alert, network_suppressed, response_status,
        responded_at, notes, created_at,
        batch_alerts (
          title, severity, alert_type, alert_reference,
          description, recommended_action, batch_numbers,
          source, issuing_authority, risk_to_patients,
          issued_at, status
        )
      `)
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false })
    setResponses(data ?? [])
    setLoading(false)
  }

  async function respond(responseId, status) {
    setActing(responseId + status)
    await supabase.rpc('respond_to_alert', {
      p_response_id: responseId,
      p_status:      status,
    })
    await load()
    setActing(null)
  }

  const filtered = filter === 'all'
    ? responses
    : responses.filter(r => r.response_status === filter)

  const pendingCount = responses.filter(r => r.response_status === 'pending').length

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">My Facility</div>
          <h1 className="page-title">Drug Safety Alerts</h1>
          <p className="page-subtitle">
            Regulatory alerts matched to your facility's inventory. Affected stock is removed from network search until you confirm action taken.
          </p>
        </div>
        <a
          href={`${PUBLIC_NG_URL}/alerts`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ flexShrink: 0 }}
        >
          View public alerts ↗
        </a>
      </div>

      {/* Pending banner */}
      {pendingCount > 0 && (
        <div style={{
          background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)',
          borderLeft: '4px solid #dc2626', borderRadius: 'var(--r-lg)',
          padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
            {pendingCount} alert{pendingCount > 1 ? 's' : ''} require your action — affected stock is currently hidden from the network
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'pending',     label: 'Action required' },
          { key: 'quarantined', label: 'Quarantined' },
          { key: 'all',         label: 'All alerts' },
        ].map(f => (
          <button
            key={f.key}
            className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && (
              <span style={{ marginLeft: 6, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="empty-state-title">
            {filter === 'pending' ? 'No pending alerts' : 'No alerts found'}
          </div>
          <div className="empty-state-desc">
            {filter === 'pending'
              ? 'Your facility has no unresolved drug safety alerts. All matched stock has been accounted for.'
              : 'No drug safety alerts have been matched to your facility yet.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(r => {
            const a        = r.batch_alerts
            const sev      = a?.severity ?? 'urgent'
            const sevColor = SEV_COLOR[sev] ?? '#d97706'
            const sevBg    = SEV_BG[sev]    ?? 'transparent'
            const status   = STATUS_LABEL[r.response_status] ?? STATUS_LABEL.pending
            const isPending = r.response_status === 'pending'

            return (
              <div key={r.id} style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${isPending ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
                borderLeft: `4px solid ${sevColor}`,
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      {/* Severity + type badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.12em',
                          background: sevBg, color: sevColor,
                          border: `1px solid ${sevColor}40`,
                          padding: '2px 7px', borderRadius: 3,
                        }}>{sev}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9,
                          textTransform: 'uppercase', letterSpacing: '0.1em',
                          color: 'var(--text-muted)', background: 'var(--bg-primary)',
                          border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 3,
                        }}>{a?.alert_type?.replace(/_/g, ' ')}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-disabled)', padding: '2px 4px' }}>
                          {a?.alert_reference}
                        </span>
                      </div>

                      {/* Title */}
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
                        {a?.title}
                      </div>

                      {/* Facility match info */}
                      <div style={{
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 10,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-disabled)', marginBottom: 6 }}>
                          Matched inventory
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Batch: </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {r.matched_batch_number}
                            </span>
                          </div>
                          {r.units_at_time_of_alert != null && (
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Units at time of alert: </span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {r.units_at_time_of_alert}
                              </span>
                            </div>
                          )}
                          {r.network_suppressed && r.response_status === 'pending' && (
                            <div style={{ color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Hidden from network search
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                        {a?.description}
                      </div>

                      {/* Recommended action */}
                      {a?.recommended_action && (
                        <div style={{
                          background: sevBg, border: `1px solid ${sevColor}25`,
                          borderRadius: 6, padding: '8px 12px', marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: sevColor }}>
                            Required action:{' '}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{a.recommended_action}</span>
                        </div>
                      )}

                      {/* Risk to patients */}
                      {a?.risk_to_patients && (
                        <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Risk: {a.risk_to_patients}
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <div style={{ flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 5,
                        background: status.bg, color: status.color,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        display: 'block', whiteSpace: 'nowrap',
                      }}>{status.label}</span>
                      {r.responded_at && (
                        <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 4, textAlign: 'right' }}>
                          {new Date(r.responded_at).toLocaleDateString('en-GB')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — only for pending */}
                  {isPending && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => respond(r.id, 'quarantined')}
                        disabled={!!acting}
                        style={{ fontSize: 12 }}
                      >
                        {acting === r.id + 'quarantined' ? 'Confirming...' : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 5, verticalAlign: 'middle'}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Quarantine stock</>}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => respond(r.id, 'not_affected')}
                        disabled={!!acting}
                        style={{ fontSize: 12 }}
                      >
                        {acting === r.id + 'not_affected' ? '...' : '✓ Not in our stock'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => respond(r.id, 'already_dispensed')}
                        disabled={!!acting}
                        style={{ fontSize: 12 }}
                      >
                        {acting === r.id + 'already_dispensed' ? '...' : '↗ Already dispensed'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => respond(r.id, 'returned_removed')}
                        disabled={!!acting}
                        style={{ fontSize: 12 }}
                      >
                        {acting === r.id + 'returned_removed' ? '...' : '↩ Returned / removed'}
                      </button>
                    </div>
                  )}

                  {/* Resolved note */}
                  {!isPending && r.notes && (
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Note: {r.notes}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop: 32, padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>About drug safety alerts:</strong> Alerts are published by Orela in coordination with NAFDAC. When an alert matches a batch number in your inventory, the affected stock is automatically hidden from the network search as a precautionary measure. You must confirm the action taken to restore visibility or permanently remove the stock from the network.{' '}
        <a href={`${PUBLIC_NG_URL}/alerts`} target="_blank" rel="noreferrer" style={{ color: '#19c2b5' }}>View public alert bulletin ↗</a>
      </div>
    </div>
  )
}
