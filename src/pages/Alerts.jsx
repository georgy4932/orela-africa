import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase }          from '../lib/supabase'
import { useFacility }       from '../hooks/useFacility'
import {
  alertTypeLabel, alertTypeClass, alertDotClass,
  fmtDate, fmtRelative, daysUntilExpiry,
} from '../utils/formatters'
import { EmptyState } from '../components/shared'

const FILTER_OPTS = [
  { key: 'all',        label: 'All'         },
  { key: 'low_stock',  label: 'Low stock'   },
  { key: 'out_of_stock', label: 'Out of stock' },
  { key: 'near_expiry',  label: 'Near expiry'  },
  { key: 'overstock',    label: 'Overstock'    },
]

export default function AlertsPage() {
  const { facilityId } = useFacility()
  const navigate = useNavigate()
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    if (facilityId) load()
    else setLoading(false)
  }, [facilityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('stock_alerts')
      .select('id, alert_type, status, message, created_at, medicine_id, inventory_item_id, inventory_items(batch_number, expiry_date, quantity_available, quantity_reserved, medicines(generic_name, strength, dosage_form))')
      .eq('facility_id', facilityId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setAlerts(data ?? [])
    setLoading(false)
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.alert_type === filter)

  const counts = FILTER_OPTS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? alerts.length : alerts.filter(a => a.alert_type === f.key).length
    return acc
  }, {})

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">My Facility · Monitoring</div>
          <div className="page-title">Shortage Alerts</div>
          <div className="page-subtitle">
            Automated stock risk signals — take action before patients are affected
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="filter-chips" style={{ marginBottom: 16 }}>
        {FILTER_OPTS.map(f => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {counts[f.key] > 0 && filter !== f.key && (
              <span style={{ background: 'var(--bg-elevated)', borderRadius: 99, padding: '0 5px', fontSize: 10, marginLeft: 3 }}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading alerts…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No active alerts' : `No ${FILTER_OPTS.find(f => f.key === filter)?.label?.toLowerCase()} alerts`}
          description={
            filter === 'all'
              ? 'Alerts fire automatically when stock falls below reorder level or approaches expiry. Your stock levels look healthy.'
              : 'No alerts of this type are currently active.'
          }
          actions={
            filter !== 'all'
              ? <button className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>View all alerts</button>
              : null
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(a => <AlertCard key={a.id} alert={a} facilityId={facilityId} navigate={navigate} />)}
        </div>
      )}
    </div>
  )
}

function AlertCard({ alert: a, facilityId, navigate }) {
  const item = a.inventory_items
  const med  = item?.medicines
  const available = item ? (item.quantity_available ?? 0) - (item.quantity_reserved ?? 0) : null
  const daysLeft  = item?.expiry_date ? daysUntilExpiry(item.expiry_date) : null

  // Urgency colour based on type + days
  const isUrgent = a.alert_type === 'out_of_stock'
    || (a.alert_type === 'near_expiry' && daysLeft !== null && daysLeft <= 30)

  function goToTransfers() {
    navigate('/transfers', {
      state: {
        prefill: a.medicine_id ? {
          medicine_id: a.medicine_id,
          medicine_name: med?.generic_name,
        } : null,
      },
    })
  }

  return (
    <div className="alert-card" style={{
      borderLeft: `4px solid ${isUrgent ? 'var(--danger)' : 'var(--warning)'}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <div className={`activity-dot ${alertDotClass(a.alert_type)}`} style={{ flexShrink: 0 }} />
          <span className={`badge ${alertTypeClass(a.alert_type)}`}>
            {alertTypeLabel(a.alert_type)}
          </span>
          {isUrgent && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--danger)', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-xs)', padding: '1px 5px' }}>
              Urgent
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {fmtRelative(a.created_at)}
        </span>
      </div>

      {/* Medicine info */}
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {med?.generic_name ?? '—'}
        {med?.strength && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>{med.strength} {med.dosage_form}</span>}
      </div>

      {/* Stock detail */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 6 }}>
        {item?.batch_number && (
          <span>Batch <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{item.batch_number}</span></span>
        )}
        {available !== null && (
          <span style={{ color: available <= 0 ? 'var(--danger)' : available < 10 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {available <= 0 ? 'No stock remaining' : `${available} units remaining`}
          </span>
        )}
        {item?.expiry_date && (
          <span style={{ color: daysLeft !== null && daysLeft <= 30 ? 'var(--danger)' : daysLeft !== null && daysLeft <= 90 ? 'var(--warning)' : 'var(--text-muted)' }}>
            Expires {fmtDate(item.expiry_date)}
            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && ` (${daysLeft}d)`}
            {daysLeft !== null && daysLeft < 0 && ' — EXPIRED'}
          </span>
        )}
      </div>

      {a.message && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{a.message}</div>
      )}

      {/* ── Action paths — operationally actionable ── */}
      <div className="alert-card-actions">
        {(a.alert_type === 'low_stock' || a.alert_type === 'out_of_stock') && (
          <>
            <button className="btn btn-primary btn-sm" onClick={goToTransfers}>
              Request stock from network →
            </button>
            <Link to="/search" className="btn btn-ghost btn-sm">Search network</Link>
          </>
        )}

        {a.alert_type === 'near_expiry' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={goToTransfers}>
              Redistribute to network →
            </button>
            <Link to="/inventory" className="btn btn-ghost btn-sm">Manage in inventory</Link>
          </>
        )}

        {a.alert_type === 'overstock' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={goToTransfers}>
              Offer surplus to network →
            </button>
            <Link to="/search" className="btn btn-ghost btn-sm">Find shortage facilities</Link>
          </>
        )}
      </div>
    </div>
  )
}
