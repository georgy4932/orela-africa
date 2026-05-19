import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'
import { useAuth }             from '../hooks/useAuth'
import { alertTypeLabel, alertTypeClass, alertDotClass, fmtDate } from '../utils/formatters'

export default function AlertsPage() {
  const { facility } = useAuth()
  const facilityId = facility?.id
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
      .select('*, inventory_items(batch_number, expiry_date, quantity_available, medicines(generic_name, strength, dosage_form))')
      .eq('facility_id', facilityId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setAlerts(data ?? [])
    setLoading(false)
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.alert_type === filter)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">My Facility</div>
          <h1 className="page-title">Shortage Alerts</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all','low_stock','expiring_soon','out_of_stock'].map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)', fontSize: 13 }}>Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-title">{filter === 'all' ? 'No active alerts' : 'No alerts of this type'}</div>
          <div className="empty-state-desc">
            Alerts fire automatically when stock falls below reorder level or approaches expiry.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(a => {
            const item = a.inventory_items
            const med  = item?.medicines
            return (
              <div key={a.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div className={`activity-dot ${alertDotClass(a.alert_type)}`} style={{ marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span className={`badge ${alertTypeClass(a.alert_type)}`}>{alertTypeLabel(a.alert_type)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {med?.generic_name} {med?.strength} {med?.dosage_form}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Batch: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{item?.batch_number ?? '—'}</span>
                    {item?.quantity_available != null && <span> · {item.quantity_available} units remaining</span>}
                    {item?.expiry_date && <span> · Expires {fmtDate(item.expiry_date)}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.message}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-disabled)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                  {fmtDate(a.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
