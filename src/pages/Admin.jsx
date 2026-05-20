import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { fmtRelative, fmtDate, fmtNumber } from '../utils/formatters'

// Quantity threshold above which a batch is auto-flagged
const FLAG_QTY_THRESHOLD = 5000

export default function AdminPage() {
  const { profile, signOut } = useAuth()
  const navigate    = useNavigate()
  const [tab,       setTab]       = useState('facilities')
  const [alerts,    setAlerts]    = useState([])
  const [alertForm, setAlertForm] = useState(false)
  const [medicines, setMedicines] = useState([])
  const [facilities, setFacilities] = useState([])
  const [flagged,   setFlagged]   = useState([])
  const [disputes,  setDisputes]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState(null)
  const [toast,     setToast]     = useState(null)

  useEffect(() => {
    if (profile?.role === 'system_admin') loadAll()
  }, [profile])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadFacilities(), loadFlaggedInventory(), loadDisputes(), loadMedicines(), loadAlerts()])
    setLoading(false)
  }

  async function loadMedicines() {
    const { data } = await supabase
      .from('medicines')
      .select('id, generic_name, strength, dosage_form, nafdac_reg_number, atc_code, essential_medicine, is_active')
      .order('generic_name')
    setMedicines(data ?? [])
  }

  async function updateNafdac(id, nafdac_reg_number) {
    const { error } = await supabase
      .from('medicines')
      .update({ nafdac_reg_number })
      .eq('id', id)
    if (!error) { showToast('NAFDAC number updated'); await loadMedicines() }
    else showToast('Failed: ' + error.message, 'error')
  }

  async function loadAlerts() {
    const { data } = await supabase
      .from('batch_alerts')
      .select('*, medicines(generic_name)')
      .order('created_at', { ascending: false })
    setAlerts(data ?? [])
  }

  async function loadFacilities() {
    const { data } = await supabase
      .from('facilities')
      .select('id, name, facility_type, registration_number, city, state_province, country, is_verified, is_active, email, phone, created_at')
      .order('created_at', { ascending: false })
    setFacilities(data ?? [])
  }

  async function loadFlaggedInventory() {
    const { data } = await supabase
      .from('inventory_items')
      .select(`
        id, quantity_available, batch_number, created_at,
        medicines(generic_name, strength),
        facilities(id, name, is_verified)
      `)
      .gte('quantity_available', FLAG_QTY_THRESHOLD)
      .eq('is_active', true)
      .is('admin_reviewed_at', null)
      .order('quantity_available', { ascending: false })
      .limit(50)
    setFlagged(data ?? [])
  }

  async function loadDisputes() {
    const { data } = await supabase
      .from('transfer_requests')
      .select(`
        id, status, urgency, quantity_requested, quantity_approved, created_at, notes, fulfilled_at,
        medicines(generic_name),
        requesting:requesting_facility_id(id, name),
        supplying:supplying_facility_id(id, name)
      `)
      .eq('status', 'disputed')
      .order('created_at', { ascending: false })
    setDisputes(data ?? [])
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function verifyFacility(id) {
    setActing(id)
    const { error } = await supabase.rpc('admin_verify_facility', { p_facility_id: id })
    if (!error) { showToast('Facility verified and added to the network'); await loadFacilities() }
    else showToast('Failed to verify: ' + error.message, 'error')
    setActing(null)
  }

  async function suspendFacility(id) {
    setActing(id)
    const { error } = await supabase.rpc('admin_suspend_facility', {
      p_facility_id: id,
      p_reason: 'Suspended by admin',
    })
    if (!error) { showToast('Facility suspended and removed from network'); await loadFacilities() }
    else showToast('Failed to suspend: ' + error.message, 'error')
    setActing(null)
  }

  async function approveInventory(id) {
    setActing(id)
    const { error } = await supabase.rpc('admin_review_inventory_item', { p_item_id: id })
    if (!error) { showToast('Batch reviewed and cleared'); await loadFlaggedInventory() }
    else showToast('Failed to clear batch: ' + error.message, 'error')
    setActing(null)
  }

  async function removeInventory(id) {
    setActing(id)
    const { error } = await supabase.rpc('admin_remove_inventory_item', {
      p_item_id: id,
      p_reason: 'Removed by admin review',
    })
    if (!error) { showToast('Batch removed from network'); await loadFlaggedInventory() }
    else showToast('Failed to remove: ' + error.message, 'error')
    setActing(null)
  }

  async function resolveDispute(id, action) {
    setActing(id)
    const { error } = await supabase.rpc('admin_resolve_dispute', {
      p_request_id: id,
      p_action: action,
    })
    const label = action === 'resolve' ? 'fulfilled' : 'cancelled'
    if (!error) { showToast(`Dispute resolved — marked as ${label}`); await loadDisputes() }
    else showToast('Failed: ' + error.message, 'error')
    setActing(null)
  }

  async function updatePackSizes(id, sizes) {
    const { error } = await supabase.from('medicines').update({ standard_pack_sizes: sizes }).eq('id', id)
    if (!error) { showToast('Pack sizes updated'); await loadMedicines() }
    else showToast('Failed: ' + error.message, 'error')
  }

  const pending   = facilities.filter(f => !f.is_verified && f.is_active !== false)
  const verified  = facilities.filter(f => f.is_verified)
  const suspended = facilities.filter(f => !f.is_active)

  const missingNafdac = medicines.filter(m => !m.nafdac_reg_number && m.is_active).length
  const TABS = [
    { key: 'facilities', label: 'Facilities',       count: pending.length,  alert: pending.length > 0 },
    { key: 'inventory',  label: 'Flagged inventory', count: flagged.length,  alert: flagged.length > 0 },
    { key: 'disputes',   label: 'Transfer disputes', count: disputes.length, alert: disputes.length > 0 },
    { key: 'medicines',  label: 'Medicine catalog',  count: missingNafdac,   alert: missingNafdac > 0 },
    { key: 'alerts',     label: 'Batch alerts',       count: alerts.filter(a => a.status === 'active').length, alert: alerts.some(a => a.severity === 'critical' && a.status === 'active') },
  ]

  if (!profile || profile.role !== 'system_admin') return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '0 0 80px' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 999,
          padding: '10px 16px', borderRadius: 'var(--r-md)',
          background: toast.type === 'error' ? 'var(--danger-dim)' : 'var(--success-dim)',
          border: `1px solid ${toast.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
          color: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          fontSize: 13, fontWeight: 500,
          boxShadow: 'var(--shadow)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 0' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', marginBottom: 4 }}>
                Orela Nigeria
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 4 }}>
                Admin Control Panel
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Network verification · Inventory review · Dispute resolution
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {pending.length > 0 && (
                <div style={{ padding: '6px 12px', background: 'var(--warning-dim)', border: '1px solid var(--warning-border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>
                  ⚡ {pending.length} pending verification{pending.length !== 1 ? 's' : ''}
                </div>
              )}
              <button
                onClick={async () => { await signOut(); navigate('/auth') }}
                style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '5px 12px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.target.style.color = 'var(--danger)'; e.target.style.borderColor = 'var(--danger-border)' }}
                onMouseLeave={e => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--border)' }}
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 16 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: tab === t.key ? 600 : 400,
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.15s',
              }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    background: t.alert ? 'var(--warning)' : 'var(--bg-active)',
                    color: t.alert ? '#07111f' : 'var(--text-muted)',
                    fontSize: 10, fontWeight: 700, padding: '1px 6px',
                    borderRadius: 99, minWidth: 18, textAlign: 'center',
                  }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 0' }}>

        {/* FACILITIES TAB */}
        {tab === 'facilities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'Total facilities', value: facilities.length, color: 'var(--primary)' },
                { label: 'Pending verification', value: pending.length, color: 'var(--warning)' },
                { label: 'Verified & active', value: verified.length, color: 'var(--success)' },
                { label: 'Suspended', value: suspended.length, color: 'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: '-0.04em', marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pending verification */}
            {pending.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--warning)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚡ Awaiting verification
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.map(f => <FacilityCard key={f.id} facility={f} status="pending" onVerify={verifyFacility} onSuspend={suspendFacility} acting={acting} />)}
                </div>
              </div>
            )}

            {/* Verified */}
            {verified.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--success)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✓ Verified facilities
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {verified.map(f => <FacilityCard key={f.id} facility={f} status="verified" onVerify={verifyFacility} onSuspend={suspendFacility} acting={acting} />)}
                </div>
              </div>
            )}

            {/* Suspended */}
            {suspended.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✗ Suspended
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suspended.map(f => <FacilityCard key={f.id} facility={f} status="suspended" onVerify={verifyFacility} onSuspend={suspendFacility} acting={acting} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* FLAGGED INVENTORY TAB */}
        {tab === 'inventory' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Inventory batches with <strong style={{ color: 'var(--text-primary)' }}>{fmtNumber(FLAG_QTY_THRESHOLD)}+ units</strong> are flagged for review. Verify these are legitimate before they appear in network search results.
              </div>
            </div>

            {flagged.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                No flagged inventory batches. The network looks clean.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Facility</th>
                      <th>Batch</th>
                      <th>Quantity</th>
                      <th>Added</th>
                      <th>Verified?</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.medicines?.generic_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.medicines?.strength}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.facilities?.name}</td>
                        <td><span className="pill">{item.batch_number}</span></td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--warning)' }}>
                            {fmtNumber(item.quantity_available)}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 1 }}>Above threshold</div>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtRelative(item.created_at)}</td>
                        <td>
                          {item.facilities?.is_verified
                            ? <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Yes</span>
                            : <span style={{ fontSize: 11, color: 'var(--warning)' }}>⚠ No</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-success btn-xs" onClick={() => approveInventory(item.id)} disabled={acting === item.id}>
                              Clear
                            </button>
                            <button className="btn btn-danger btn-xs" onClick={() => removeInventory(item.id)} disabled={acting === item.id}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* DISPUTES TAB */}
        {tab === 'disputes' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Transfer disputes occur when a requesting facility reports non-delivery after a supplier marked the transfer fulfilled. Review each case and resolve as fulfilled or cancelled.
              </div>
            </div>

            {disputes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                No active transfer disputes. The network is operating cleanly.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {disputes.map(t => (
                  <div key={t.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--danger-border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                          {t.medicines?.generic_name} — {fmtNumber(t.quantity_approved)} units
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>From </span>{t.supplying?.name}
                          <span style={{ color: 'var(--text-muted)' }}> → </span>{t.requesting?.name}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', borderRadius: 'var(--r-xs)', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Disputed
                      </span>
                    </div>
                    {t.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 'var(--r)', padding: '8px 12px', marginBottom: 12, fontStyle: 'italic' }}>
                        "{t.notes}"
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-success btn-sm" onClick={() => resolveDispute(t.id, 'resolve')} disabled={acting === t.id}>
                        Mark fulfilled
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => resolveDispute(t.id, 'cancel')} disabled={acting === t.id}>
                        Mark cancelled
                      </button>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                        Raised {fmtRelative(t.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MEDICINES TAB */}
        {tab === 'medicines' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Add NAFDAC registration numbers to each medicine in the catalog. Facilities are shown the expected NAFDAC number when adding inventory — helping confirm the physical product matches the digital record.
              </div>
            </div>

            {medicines.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>Loading medicines…</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Strength / Form</th>
                      <th>NAFDAC Reg Number</th>
                      <th>Pack sizes</th>
                      <th>ATC Code</th>
                      <th>Essential</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map(m => (
                      <MedicineRow key={m.id} medicine={m} onUpdate={updateNafdac} onPackSizeUpdate={updatePackSizes} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* BATCH ALERTS TAB */}
        {tab === 'alerts' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 520 }}>
                Publish batch alerts to the network. Affected inventory is automatically suppressed from network search pending facility confirmation.
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setAlertForm(true)}>
                + Publish alert
              </button>
            </div>

            {alertForm && (
              <AlertForm
                medicines={medicines}
                onClose={() => setAlertForm(false)}
                onSuccess={() => { setAlertForm(false); loadAlerts() }}
              />
            )}

            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                No alerts published yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {alerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} onResolve={async (id) => {
                    const { error } = await supabase.rpc('admin_resolve_batch_alert', { p_alert_id: id })
                    if (error) showToast('Failed to resolve alert: ' + error.message, 'error')
                    else loadAlerts()
                  }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AlertCard({ alert: a, onResolve }) {
  const sevColor = { critical: 'var(--danger)', urgent: 'var(--warning)', routine: 'var(--primary)' }[a.severity] ?? 'var(--text-muted)'
  const sevBg    = { critical: 'rgba(220,38,38,0.08)', urgent: 'rgba(234,179,8,0.08)', routine: 'rgba(25,194,181,0.08)' }[a.severity] ?? ''

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid var(--border)`, borderLeft: `3px solid ${sevColor}`, borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sevColor, background: sevBg, padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
              {a.severity}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {a.alert_type?.replace(/_/g, ' ')}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-disabled)' }}>
              {a.alert_reference}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{a.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {a.medicines?.generic_name ?? a.medicine_name_raw} · {a.source} · {a.issuing_authority}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Batches: {a.batch_numbers?.join(', ')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{a.description}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Action: <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{a.recommended_action}</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4,
            background: a.status === 'active' ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.1)',
            color: a.status === 'active' ? 'var(--danger)' : 'var(--success)',
          }}>{a.status}</span>
          {a.status === 'active' && (
            <button className="btn btn-ghost btn-xs" onClick={() => onResolve(a.id)}>Mark resolved</button>
          )}
        </div>
      </div>
    </div>
  )
}

function AlertForm({ medicines, onClose, onSuccess }) {
  const [f, setF] = useState({
    alert_reference: '', title: '', medicine_id: '', medicine_name_raw: '',
    batch_numbers: '', manufacturer: '', alert_type: 'recall', severity: 'urgent',
    source: 'NAFDAC', issuing_authority: 'NAFDAC', description: '',
    recommended_action: '', risk_to_patients: '', public_visible: true,
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!f.alert_reference || !f.title || !f.batch_numbers || !f.description || !f.recommended_action) {
      setError('Please fill in all required fields'); return
    }
    setLoading(true); setError(null)
    const batches = f.batch_numbers.split(',').map(b => b.trim()).filter(Boolean)
    const { data, error: err } = await supabase.rpc('publish_batch_alert', {
      p_alert_reference:    f.alert_reference,
      p_title:              f.title,
      p_medicine_id:        f.medicine_id || null,
      p_medicine_name_raw:  f.medicine_name_raw || null,
      p_batch_numbers:      batches,
      p_manufacturer:       f.manufacturer || null,
      p_alert_type:         f.alert_type,
      p_severity:           f.severity,
      p_source:             f.source,
      p_issuing_authority:  f.issuing_authority || null,
      p_description:        f.description,
      p_recommended_action: f.recommended_action,
      p_risk_to_patients:   f.risk_to_patients || null,
      p_expires_at:         null,
      p_public_visible:     f.public_visible,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    onSuccess(data)
  }

  const row = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }
  const lbl = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: 'var(--text-primary)' }}>Publish batch alert</div>

      {error && <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--danger)', marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={row}>
          <label style={lbl}>Alert reference *</label>
          <input value={f.alert_reference} onChange={e => set('alert_reference', e.target.value)} placeholder="NAFDAC-2026-001" />
        </div>
        <div style={row}>
          <label style={lbl}>Severity *</label>
          <select value={f.severity} onChange={e => set('severity', e.target.value)}>
            <option value="critical">Critical</option>
            <option value="urgent">Urgent</option>
            <option value="routine">Routine</option>
          </select>
        </div>
      </div>

      <div style={row}>
        <label style={lbl}>Alert title *</label>
        <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Urgent recall — Amoxicillin 500mg counterfeit batch" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={row}>
          <label style={lbl}>Alert type *</label>
          <select value={f.alert_type} onChange={e => set('alert_type', e.target.value)}>
            <option value="recall">Recall</option>
            <option value="quality_defect">Quality defect</option>
            <option value="counterfeit">Counterfeit / Falsified</option>
            <option value="safety_signal">Safety signal</option>
            <option value="expiry_correction">Expiry correction</option>
            <option value="falsified">Falsified medicine</option>
          </select>
        </div>
        <div style={row}>
          <label style={lbl}>Source *</label>
          <select value={f.source} onChange={e => set('source', e.target.value)}>
            <option value="NAFDAC">NAFDAC</option>
            <option value="WHO">WHO</option>
            <option value="Manufacturer">Manufacturer</option>
            <option value="Orela">Orela</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={row}>
          <label style={lbl}>Medicine (from catalog)</label>
          <select value={f.medicine_id} onChange={e => set('medicine_id', e.target.value)}>
            <option value="">— Select if in catalog —</option>
            {medicines.map(m => <option key={m.id} value={m.id}>{m.generic_name} {m.strength}</option>)}
          </select>
        </div>
        <div style={row}>
          <label style={lbl}>Or enter medicine name</label>
          <input value={f.medicine_name_raw} onChange={e => set('medicine_name_raw', e.target.value)} placeholder="e.g. Amoxicillin 500mg capsule" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={row}>
          <label style={lbl}>Batch numbers * <span style={{ fontSize: 10, fontWeight: 400 }}>(comma separated)</span></label>
          <input value={f.batch_numbers} onChange={e => set('batch_numbers', e.target.value)} placeholder="e.g. BT-2024-001, BT-2024-002" />
        </div>
        <div style={row}>
          <label style={lbl}>Manufacturer</label>
          <input value={f.manufacturer} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. Fidson Healthcare Plc" />
        </div>
      </div>

      <div style={row}>
        <label style={lbl}>Description *</label>
        <textarea rows={3} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Describe the nature of the defect or risk..." style={{ resize: 'vertical' }} />
      </div>

      <div style={row}>
        <label style={lbl}>Recommended action *</label>
        <textarea rows={2} value={f.recommended_action} onChange={e => set('recommended_action', e.target.value)} placeholder="e.g. Immediately quarantine all affected stock. Do not dispense. Contact NAFDAC on 0800-NAFDAC." style={{ resize: 'vertical' }} />
      </div>

      <div style={row}>
        <label style={lbl}>Risk to patients</label>
        <input value={f.risk_to_patients} onChange={e => set('risk_to_patients', e.target.value)} placeholder="e.g. Subpotent product may lead to treatment failure" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <input type="checkbox" id="pub_vis" checked={f.public_visible} onChange={e => set('public_visible', e.target.checked)} />
        <label htmlFor="pub_vis" style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Publish to public alert page (orela.africa/ng/alerts)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={loading}>
          {loading ? 'Publishing...' : 'Publish alert'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function PackSizesCell({ medicine: m, onSave }) {
  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')
  const sizes = m.standard_pack_sizes ?? []

  function startEdit() {
    setInput(sizes.join(', '))
    setEditing(true)
  }

  async function save() {
    const parsed = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    await onSave(m.id, parsed.length > 0 ? parsed : null)
    setEditing(false)
  }

  if (editing) return (
    <div style={{display:'flex', gap:4, alignItems:'center', flexWrap:'wrap'}}>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="28, 56, 84"
        style={{
          background:'var(--bg-surface)', border:'1px solid var(--primary)',
          borderRadius:'var(--r-sm)', color:'var(--text-primary)',
          padding:'3px 7px', fontSize:11, fontFamily:'var(--font-mono)',
          width:100, outline:'none',
        }}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
      />
      <button className="btn btn-success btn-xs" onClick={save}>Save</button>
      <button className="btn btn-ghost btn-xs" onClick={() => setEditing(false)}>Cancel</button>
    </div>
  )

  return (
    <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
      {sizes.length > 0
        ? sizes.map(s => (
            <span key={s} style={{
              fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600,
              background:'var(--bg-primary)', border:'1px solid var(--border)',
              borderRadius:'var(--r-xs)', padding:'1px 6px', color:'var(--text-secondary)',
            }}>{s}</span>
          ))
        : <span style={{fontSize:11, color:'var(--warning)'}}>Not set</span>
      }
      <button className="btn btn-ghost btn-xs" onClick={startEdit}>{sizes.length > 0 ? 'Edit' : 'Add'}</button>
    </div>
  )
}

function MedicineRow({ medicine: m, onUpdate, onPackSizeUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(m.nafdac_reg_number ?? '')
  const [saving, setSaving]   = useState(false)

  async function save() {
    setSaving(true)
    await onUpdate(m.id, val.trim() || null)
    setSaving(false)
    setEditing(false)
  }

  return (
    <tr>
      <td className="td-primary">{m.generic_name}</td>
      <td className="td-muted">{m.strength} · {m.dosage_form}</td>
      <td>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder="e.g. A4-0007"
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--primary)',
                borderRadius: 'var(--r-sm)', color: 'var(--text-primary)',
                padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
                width: 130, outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
            />
            <button className="btn btn-success btn-xs" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : m.nafdac_reg_number ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--success)' }}>{m.nafdac_reg_number}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => { setVal(m.nafdac_reg_number); setEditing(true) }}>Edit</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--warning)' }}>Not set</span>
            <button className="btn btn-warning btn-xs" onClick={() => setEditing(true)}>Add</button>
          </div>
        )}
      </td>
      <td>
        <PackSizesCell medicine={m} onSave={onPackSizeUpdate} />
      </td>
      <td>{m.essential_medicine ? <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>✓ Essential</span> : <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>}</td>
      <td><span style={{ fontSize: 11, color: m.is_active ? 'var(--success)' : 'var(--text-disabled)' }}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
    </tr>
  )
}

function FacilityCard({ facility: f, status, onVerify, onSuspend, acting }) {
  const statusColor = { pending: 'var(--warning)', verified: 'var(--success)', suspended: 'var(--danger)' }[status]
  const statusLabel = { pending: 'Pending', verified: 'Verified', suspended: 'Suspended' }[status]

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      {/* Status dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

      {/* Identity */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{f.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {f.facility_type?.replace(/_/g, ' ')} · {f.city}, {f.state_province}, {f.country}
        </div>
      </div>

      {/* Registration number */}
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Reg number</div>
        {f.registration_number ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{f.registration_number}</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--danger)' }}>Not provided</span>
        )}
      </div>

      {/* Contact */}
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Contact</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.email || f.phone || '—'}</div>
      </div>

      {/* Registered */}
      <div style={{ minWidth: 100 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Registered</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtRelative(f.created_at)}</div>
      </div>

      {/* Status badge */}
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}30`, borderRadius: 'var(--r-xs)', padding: '2px 8px', flexShrink: 0 }}>
        {statusLabel}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {status === 'pending' && (
          <>
            <button className="btn btn-success btn-sm" onClick={() => onVerify(f.id)} disabled={acting === f.id || !f.registration_number}>
              {acting === f.id ? '…' : '✓ Verify'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onSuspend(f.id)} disabled={acting === f.id}>
              Suspend
            </button>
          </>
        )}
        {status === 'verified' && (
          <button className="btn btn-danger btn-sm" onClick={() => onSuspend(f.id)} disabled={acting === f.id}>
            Suspend
          </button>
        )}
        {status === 'suspended' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onVerify(f.id)} disabled={acting === f.id}>
            Reinstate
          </button>
        )}
      </div>
    </div>
  )
}
