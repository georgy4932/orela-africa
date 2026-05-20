import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import {
  fmtRelative, fmtNumber, daysUntilExpiry,
  alertTypeLabel, alertTypeClass, alertDotClass,
  transferStatusClass, transferStatusLabel,
} from '../utils/formatters'
import { Badge } from '../components/shared'
import { appUrl } from '../lib/appUrl'

export default function DashboardPage() {
  const { facility, facilityId } = useFacility()
  const expiryThreshold = facility?.near_expiry_threshold_days ?? 90
  const [stats,     setStats]     = useState(null)
  const [alerts,    setAlerts]    = useState([])
  const [batchAlerts, setBatchAlerts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { if (facilityId) loadAll() }, [facilityId])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStats(), loadAlerts(), loadBatchAlerts(), loadTransfers(), loadMovements()])
    setLoading(false)
  }

  async function loadStats() {
    const { data } = await supabase
      .from('inventory_items')
      .select('quantity_available, quantity_reserved, reorder_level, expiry_date, medicines(essential_medicine)')
      .eq('facility_id', facilityId).eq('is_active', true)
    if (!data) return
    const u = i => i.quantity_available - i.quantity_reserved
    const nearExpiry = data.filter(i => {
      const d = daysUntilExpiry(i.expiry_date)
      return d !== null && d >= 0 && d <= expiryThreshold
    })
    setStats({
      total:       data.length,
      units:       data.reduce((s, i) => s + u(i), 0),
      lowStock:    data.filter(i => u(i) > 0 && u(i) < i.reorder_level).length,
      outOfStock:  data.filter(i => i.quantity_available === 0).length,
      nearExpiry:  nearExpiry.length,
      redistributable: nearExpiry.filter(i => u(i) > 0).length,
    })
  }

  async function loadBatchAlerts() {
    if (!facilityId) return
    const { data } = await supabase
      .from('alert_facility_responses')
      .select(`
        id, facility_id, inventory_item_id, matched_batch_number,
        units_at_time_of_alert, network_suppressed, response_status,
        responded_at, notes, created_at,
        batch_alerts(
          title, severity, alert_type, alert_reference,
          description, recommended_action, batch_numbers,
          source, issuing_authority
        )
      `)
      .eq('facility_id', facilityId)
      .eq('response_status', 'pending')
      .order('created_at', { ascending: false })
    setBatchAlerts(data ?? [])
  }

  async function loadAlerts() {
    const { data } = await supabase
      .from('stock_alerts')
      .select('id, alert_type, status, message, created_at, medicines(generic_name)')
      .eq('facility_id', facilityId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(5)
    setAlerts(data ?? [])
  }

  async function loadTransfers() {
    const { data } = await supabase
      .from('transfer_requests')
      .select('id,status,urgency,quantity_requested,created_at,medicines(generic_name),requesting:requesting_facility_id(name),supplying:supplying_facility_id(name)')
      .or(`requesting_facility_id.eq.${facilityId},supplying_facility_id.eq.${facilityId}`)
      .in('status', ['pending', 'approved', 'in_transit'])
      .order('created_at', { ascending: false }).limit(5)
    setTransfers(data ?? [])
  }

  async function loadMovements() {
    const { data } = await supabase
      .from('inventory_movements')
      .select('id,movement_type,quantity_change,performed_at,inventory_items(medicines(generic_name))')
      .eq('facility_id', facilityId)
      .order('performed_at', { ascending: false }).limit(6)
    setMovements(data ?? [])
  }

  const hasInventory = stats && stats.total > 0
  const atRisk       = (stats?.lowStock ?? 0) + (stats?.outOfStock ?? 0)

  return (
    <div>
      {/* Page header */}
      <div className="page-top">
        <div>
          <div className="page-eyebrow">Supply Network · Command Center</div>
          <div className="page-title">
            {facility?.name ?? 'Overview'}
            {facility?.is_verified && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--success)', marginLeft: 12 }}>
                ✓ Verified facility
              </span>
            )}
          </div>
          <div className="page-subtitle">
            {facility?.city}, {facility?.country} · {facility?.facility_type?.replace(/_/g, ' ')} · {expiryThreshold}-day expiry window
          </div>
        </div>
        <div className="page-actions">
          <Link to="/search"    className="btn btn-primary">Search network</Link>
          <Link to="/inventory" className="btn btn-ghost">+ Add stock</Link>
        </div>
      </div>

      {/* Verification banner — shown to unverified facilities */}
      {!facility?.is_verified && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
          padding: '14px 18px', marginBottom: 16,
          background: 'rgba(245,165,36,0.06)',
          border: '1px solid rgba(245,165,36,0.2)',
          borderRadius: 'var(--r-lg)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" style={{flexShrink:0, marginTop:1}}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600, color:'var(--warning)', marginBottom:3}}>
              Verification pending
            </div>
            <div style={{fontSize:12, color:'var(--text-secondary)', lineHeight:1.6}}>
              Your facility is not yet visible in the medicine availability network. Other facilities cannot find your stock or request transfers until verification is complete.
              {facility?.registration_number
                ? <span> Your registration number <strong style={{color:'var(--text-primary)'}}>{facility.registration_number}</strong> has been submitted and is under review.</span>
                : <span> Please add your PCN/NAFDAC registration number in <a href={appUrl('/settings')} style={{color:'var(--warning)'}}>Settings → Network Identity</a> to begin verification.</span>
              }
            </div>
            <div style={{fontSize:11, color:'var(--text-muted)', marginTop:6}}>
              To expedite: email <a href="mailto:hello@orela.africa" style={{color:'var(--warning)'}}>hello@orela.africa</a> with your facility name and registration number.
            </div>
          </div>
          <div style={{
            flexShrink:0, padding:'3px 10px',
            background:'rgba(245,165,36,0.12)',
            border:'1px solid rgba(245,165,36,0.25)',
            borderRadius:'var(--r-xs)',
            fontSize:10, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.08em', color:'var(--warning)',
          }}>Unverified</div>
        </div>
      )}

      {/* Zero state — network framing */}
      {!hasInventory && !loading && (
        <div className="card card-pad" style={{ marginBottom: 20, borderColor: 'var(--primary-border)', background: 'var(--primary-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Make your facility visible in the medicine availability network
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Add inventory to power local medicine availability intelligence. Other verified facilities and clinics in your area will be able to locate medicines at your facility and request transfers when they face shortages.
              </div>
            </div>
            <Link to="/inventory" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>Add first batch →</Link>
          </div>
        </div>
      )}

      {/* KPI cards — network framing */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Facility Availability"
          value={loading ? '—' : hasInventory ? fmtNumber(stats.total) : '0'}
          sub={loading ? '' : hasInventory ? `${fmtNumber(stats.units)} units available to network` : 'No stock published to network'}
          accent="ac-teal"
        />
        <StatCard
          label="Stockout Risk"
          value={loading ? '—' : fmtNumber(atRisk)}
          sub={`${stats?.lowStock ?? 0} low stock · ${stats?.outOfStock ?? 0} out of stock`}
          accent={atRisk > 0 ? 'ac-warning' : ''}
        />
        <StatCard
          label="Expiry Redistribution"
          value={loading ? '—' : fmtNumber(stats?.redistributable ?? 0)}
          sub={`Batches expiring within ${expiryThreshold} days with available stock`}
          accent={stats?.redistributable > 0 ? 'ac-orange' : ''}
        />
        <StatCard
          label="Active Transfers"
          value={loading ? '—' : fmtNumber(transfers.length)}
          sub="Pending · approved · in transit"
          accent={transfers.length > 0 ? 'ac-purple' : ''}
        />
      </div>

      {/* Two column */}
      <div className="grid-2" style={{ marginBottom: 16 }}>

        {/* BATCH ALERTS — critical regulatory alerts from NAFDAC */}
        {batchAlerts.length > 0 && (
          <div style={{
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)',
            borderLeft: '4px solid #dc2626', borderRadius: 'var(--r-lg)',
            padding: '16px 20px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', letterSpacing: '-0.01em' }}>
                {batchAlerts.length} active medicine safety alert{batchAlerts.length > 1 ? 's' : ''} — action required
              </span>
            </div>
            {batchAlerts.map(r => (
              <BatchAlertRow key={r.id} response={r} onRespond={async (id, status) => {
                await supabase.rpc('respond_to_alert', { p_response_id: id, p_status: status })
                loadBatchAlerts()
              }} />
            ))}
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(220,38,38,0.7)' }}>
              Affected stock has been removed from network search pending your confirmation.
            </div>
          </div>
        )}

        {/* Shortage alerts */}
        <div className="section-shell">
          <div className="section-shell-header">
            <span className="section-shell-title">Shortage Alerts</span>
            <Link to="/alerts" className="btn btn-xs btn-ghost">View all</Link>
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 3 }}>✓ No active shortage signals</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Alerts fire automatically when stock falls below reorder level or approaches expiry.
              </div>
            </div>
          ) : alerts.map(a => (
            <div key={a.id} className="activity-item">
              <div className={`activity-dot ${alertDotClass(a.alert_type)}`} />
              <div className="activity-text" style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                  {a.medicines?.generic_name}
                </span>
                {' '}
                <Badge className={alertTypeClass(a.alert_type)}>{alertTypeLabel(a.alert_type)}</Badge>
                {a.message && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>{a.message}</div>}
              </div>
              <div className="activity-time">{fmtRelative(a.created_at)}</div>
            </div>
          ))}
        </div>

        {/* Redistribution pipeline */}
        <div className="section-shell">
          <div className="section-shell-header">
            <span className="section-shell-title">Redistribution Pipeline</span>
            <Link to="/transfers" className="btn btn-xs btn-ghost">View all</Link>
          </div>
          {transfers.length === 0 ? (
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>No active redistribution requests</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
                Search the network to locate trusted medicine supply nearby, or offer surplus stock to prevent shortages at other facilities.
              </div>
              <Link to="/search" className="btn btn-primary btn-sm">Search network →</Link>
            </div>
          ) : transfers.map(t => (
            <div key={t.id} className="activity-item">
              <div className="activity-dot" />
              <div className="activity-text" style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                  {t.medicines?.generic_name}
                </span>
                {' '}
                <Badge className={transferStatusClass(t.status)}>{transferStatusLabel(t.status)}</Badge>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                  {t.requesting?.name} → {t.supplying?.name}
                  {t.urgency !== 'normal' && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {t.urgency}</span>}
                </div>
              </div>
              <div className="activity-time">{fmtRelative(t.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Network actions — contextual */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <ActionCard
          to="/search"
          icon="🔍"
          title="Search medicine network"
          desc="Find trusted medicine supply from verified facilities nearby. Locate availability before shortages affect patients."
          cta="Search now"
          accent="var(--primary)"
        />
        <ActionCard
          to="/transfers"
          icon="↔"
          title="Request or offer stock"
          desc="Prevent stockouts by requesting from network facilities. Redistribute near-expiry stock before it is wasted."
          cta="Manage redistribution"
          accent="var(--purple)"
        />
        <ActionCard
          to="/alerts"
          icon="⚡"
          title="Monitor shortage signals"
          desc="Track emerging stock risks at your facility. Act before stockouts affect patient care."
          cta={`${alerts.length > 0 ? `${alerts.length} active alerts` : 'View alerts'}`}
          accent={alerts.length > 0 ? 'var(--warning)' : 'var(--text-muted)'}
        />
      </div>

      {/* Recent stock movement */}
      {movements.length > 0 && (
        <div className="section-shell">
          <div className="section-shell-header">
            <span className="section-shell-title">Recent Stock Movement</span>
            <Link to="/inventory" className="btn btn-xs btn-ghost">Inventory</Link>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Movement</th>
                <th>Quantity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => {
                const isIn = m.quantity_change > 0
                return (
                  <tr key={m.id}>
                    <td className="td-primary">{m.inventory_items?.medicines?.generic_name ?? '—'}</td>
                    <td><span className="pill" style={{ textTransform: 'capitalize' }}>{m.movement_type?.replace(/_/g, ' ')}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600, color: isIn ? 'var(--success)' : 'var(--danger)' }}>
                      {isIn ? '+' : ''}{fmtNumber(m.quantity_change)}
                    </td>
                    <td className="td-muted">{fmtRelative(m.performed_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sublabel">{sub}</div>}
    </div>
  )
}

function ActionCard({ to, icon, title, desc, cta, accent }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div className="card card-pad" style={{
        cursor: 'pointer', transition: 'border-color var(--t)',
        height: '100%', display: 'flex', flexDirection: 'column', gap: 8,
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{ fontSize: 20 }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, flex: 1 }}>{desc}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: accent, marginTop: 4 }}>{cta} →</div>
      </div>
    </Link>
  )
}

function BatchAlertRow({ response: r, onRespond }) {
  const a = r.batch_alerts
  const [acting, setActing] = useState(null)
  const sevColor = { critical: '#dc2626', urgent: '#d97706', routine: '#19c2b5' }[a?.severity] ?? '#dc2626'

  async function respond(status) {
    setActing(status)
    await onRespond(r.id, status)
    setActing(null)
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(220,38,38,0.2)',
      borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: sevColor, background: `${sevColor}15`, padding: '2px 6px', borderRadius: 3 }}>
              {a?.severity}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
              {a?.alert_reference}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{a?.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Matched batch: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 600 }}>{r.matched_batch_number}</span>
            {r.units_at_time_of_alert && <span> · {r.units_at_time_of_alert} units at time of alert</span>}
          </div>
          <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.5 }}>{a?.recommended_action}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          className="btn btn-danger btn-xs"
          onClick={() => respond('quarantined')}
          disabled={!!acting}
          style={{ fontSize: 11 }}
        >
          {acting === 'quarantined' ? 'Confirming...' : '🔒 Quarantine stock'}
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => respond('not_affected')}
          disabled={!!acting}
          style={{ fontSize: 11 }}
        >
          {acting === 'not_affected' ? '...' : '✓ Not in our stock'}
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => respond('already_dispensed')}
          disabled={!!acting}
          style={{ fontSize: 11 }}
        >
          {acting === 'already_dispensed' ? '...' : '↗ Already dispensed'}
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => respond('returned_removed')}
          disabled={!!acting}
          style={{ fontSize: 11 }}
        >
          {acting === 'returned_removed' ? '...' : '↩ Returned/removed'}
        </button>
      </div>
    </div>
  )
}
