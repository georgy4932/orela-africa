import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import {
  fmtDate, fmtNumber, fmtCurrency,
  daysUntilExpiry, expiryBadgeClass, fmtExpiryLabel,
} from '../utils/formatters'
import { EmptyState, Badge } from '../components/shared'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  format, subDays, startOfWeek, addWeeks, parseISO, isAfter,
} from 'date-fns'
import { useIsMobile } from '../hooks/useIsMobile'

const C = {
  primary: '#19c2b5',
  success: '#3fb950',
  warning: '#f5a524',
  danger:  '#e5534b',
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AnalyticsPage() {
  const isMobile = useIsMobile()
  const { facility, facilityId } = useFacility()
  const [period,    setPeriod]    = useState(30)  // days for chart/filters
  const [items,     setItems]     = useState(null)
  const [movements, setMovements] = useState(null)
  const [transfers, setTransfers] = useState(null)
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    // Always load 90d so period toggling needs no extra round trips
    const since = subDays(new Date(), 90).toISOString()

    const [{ data: inv }, { data: mov }, { data: trx }] = await Promise.all([
      supabase
        .from('inventory_items')
        .select(`
          id, batch_number, quantity_available, quantity_reserved,
          reorder_level, expiry_date, unit_cost, medicine_id, dispensing_unit,
          medicines(generic_name, dosage_form, strength, therapeutic_class)
        `)
        .eq('facility_id', facilityId)
        .eq('is_active', true),

      supabase
        .from('inventory_movements')
        .select('id, movement_type, quantity_change, performed_at, inventory_item_id')
        .eq('facility_id', facilityId)
        .gte('performed_at', since)
        .order('performed_at', { ascending: true }),

      supabase
        .from('transfer_requests')
        .select(`
          id, status, urgency, quantity_requested, quantity_approved,
          quantity_fulfilled, created_at, fulfilled_at,
          requesting_facility_id, supplying_facility_id,
          medicines(generic_name)
        `)
        .or(`requesting_facility_id.eq.${facilityId},supplying_facility_id.eq.${facilityId}`)
        .gte('created_at', since),
    ])

    setItems(inv ?? [])
    setMovements(mov ?? [])
    setTransfers(trx ?? [])
    setLoading(false)
  }, [facilityId])

  useEffect(() => { load() }, [load])

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div>
        <Header facility={facility} period={period} setPeriod={setPeriod} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="card" style={{ height: 88, background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <div className="card card-pad" style={{ height: 260, background: 'var(--bg-elevated)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (!items?.length) {
    return (
      <div>
        <Header facility={facility} period={period} setPeriod={setPeriod} />
        <EmptyState
          title="No inventory data yet"
          description="Supply intelligence reports populate once your facility has recorded inventory and transfer activity."
          actions={<a href="/inventory" className="btn btn-primary btn-sm">Add stock</a>}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Derived analytics — all computed from raw data, no extra fetches
  // -------------------------------------------------------------------------
  const avail         = i => i.quantity_available - i.quantity_reserved
  const expiryThr     = facility?.near_expiry_threshold_days ?? 90
  const cutoff        = subDays(new Date(), period)
  const movInPeriod   = (movements ?? []).filter(m => isAfter(parseISO(m.performed_at), cutoff))

  // KPI stats
  const kpi = (() => {
    const lowStock   = items.filter(i => avail(i) > 0 && avail(i) < i.reorder_level).length
    const outOfStock = items.filter(i => i.quantity_available === 0).length
    const expiring   = items.filter(i => { const d = daysUntilExpiry(i.expiry_date); return d !== null && d >= 0 && d <= expiryThr }).length
    const totalValue = items.reduce((s, i) => s + (i.unit_cost ?? 0) * i.quantity_available, 0)
    return {
      batches:    items.length,
      units:      items.reduce((s, i) => s + avail(i), 0),
      atRisk:     lowStock + outOfStock,
      lowStock,
      outOfStock,
      expiring,
      value:      totalValue,
      hasValue:   items.some(i => i.unit_cost),
    }
  })()

  // Stock status pie
  const pieData = [
    { name: 'In stock',     value: items.filter(i => avail(i) >= i.reorder_level && avail(i) > 0).length, color: C.success  },
    { name: 'Low stock',    value: kpi.lowStock,   color: C.warning },
    { name: 'Out of stock', value: kpi.outOfStock, color: C.danger  },
  ].filter(d => d.value > 0)

  // Weekly movement chart
  const weeklyData = buildWeeklyData(movInPeriod, period)

  // Period movement totals (for summary row)
  const movTotals = movInPeriod.reduce(
    (acc, m) => {
      const abs = Math.abs(m.quantity_change)
      if (m.movement_type === 'receipt')          acc.receipt   += abs
      if (m.movement_type === 'dispensed')        acc.dispensed += abs
      if (m.movement_type === 'expired_removal')  acc.expired   += abs
      return acc
    },
    { receipt: 0, dispensed: 0, expired: 0 }
  )

  // Per-medicine aggregation (for top-medicines table)
  const byMed = {}
  for (const item of items) {
    const mid = item.medicine_id
    if (!byMed[mid]) {
      byMed[mid] = {
        name:        item.medicines?.generic_name ?? 'Unknown',
        form:        [item.medicines?.strength, item.medicines?.dosage_form].filter(Boolean).join(' '),
        unit:        item.dispensing_unit,
        available:   0,
        reorderLevel:0,
        batches:     0,
        minExpiry:   null,
        dispensed:   0,
      }
    }
    byMed[mid].available    += avail(item)
    byMed[mid].reorderLevel  = Math.max(byMed[mid].reorderLevel, item.reorder_level)
    byMed[mid].batches      += 1
    if (item.expiry_date) {
      if (!byMed[mid].minExpiry || item.expiry_date < byMed[mid].minExpiry)
        byMed[mid].minExpiry = item.expiry_date
    }
  }
  // Map inventory_item_id → medicine_id for dispensed lookup
  const itemMedMap = {}
  for (const item of items) itemMedMap[item.id] = item.medicine_id
  for (const m of movInPeriod) {
    if (m.movement_type === 'dispensed') {
      const mid = itemMedMap[m.inventory_item_id]
      if (mid && byMed[mid]) byMed[mid].dispensed += Math.abs(m.quantity_change)
    }
  }
  for (const med of Object.values(byMed)) {
    const avgDaily = med.dispensed / period
    med.avgDaily    = avgDaily
    med.daysOfStock = avgDaily > 0.01 ? Math.round(med.available / avgDaily) : null
  }

  const topMedicines = Object.values(byMed)
    .sort((a, b) => b.available - a.available)
    .slice(0, 10)
  const maxAvail = topMedicines[0]?.available || 1

  // Expiry risk list
  const expiryRisk = items
    .filter(i => { const d = daysUntilExpiry(i.expiry_date); return d !== null && d <= expiryThr })
    .sort((a, b) => {
      const da = daysUntilExpiry(a.expiry_date) ?? 9999
      const db = daysUntilExpiry(b.expiry_date) ?? 9999
      return da - db
    })

  // Transfer summary
  const trxAll     = transfers ?? []
  const trxSent    = trxAll.filter(t => t.requesting_facility_id === facilityId)
  const trxReceived= trxAll.filter(t => t.supplying_facility_id  === facilityId)
  const trxClosed  = trxAll.filter(t => ['fulfilled','rejected','cancelled'].includes(t.status)).length
  const trxFilled  = trxAll.filter(t => t.status === 'fulfilled').length
  const trxPending = trxAll.filter(t => ['pending','approved','in_transit'].includes(t.status)).length
  const fillRate   = trxClosed > 0 ? Math.round(trxFilled / trxClosed * 100) : null

  // ── Mobile: no charts, operational summary only ────────────────────────────
  if (isMobile) {
    return (
      <MobileAnalytics
        kpi={kpi}
        movTotals={movTotals}
        expiryRisk={expiryRisk}
        trxPending={trxPending}
        period={period}
        setPeriod={setPeriod}
        expiryThr={expiryThr}
        facility={facility}
      />
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div>
      <Header facility={facility} period={period} setPeriod={setPeriod} />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Active batches"   value={fmtNumber(kpi.batches)} />
        <KpiCard label="Units on hand"    value={fmtNumber(kpi.units)} />
        <KpiCard
          label="At-risk items"
          value={kpi.atRisk}
          color={kpi.atRisk > 0 ? C.warning : undefined}
          sub={kpi.atRisk > 0 ? `${kpi.outOfStock} out · ${kpi.lowStock} low` : 'All stocked'}
        />
        <KpiCard
          label="Expiring soon"
          value={kpi.expiring}
          color={kpi.expiring > 0 ? C.danger : undefined}
          sub={`within ${expiryThr} days`}
        />
        {kpi.hasValue && (
          <KpiCard
            label="Stock value"
            value={fmtCurrency(kpi.value, facility?.default_currency)}
            sub="at unit cost"
          />
        )}
      </div>

      {/* ── Movement chart + Status pie ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(240px, 320px)', gap: 16, marginBottom: 20 }}>

        {/* Movement bar chart */}
        <div className="card">
          <SectionHead title="Stock movements" sub={`Last ${period} days`} />
          <div style={{ padding: '4px 8px 0' }}>
            {weeklyData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                No movements recorded in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={8} barGap={2}>
                  <XAxis dataKey="week" tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="receipt"   name="Received" fill={C.success} radius={[3,3,0,0]} />
                  <Bar dataKey="dispensed" name="Dispensed" fill={C.primary} radius={[3,3,0,0]} />
                  <Bar dataKey="expired"   name="Expired"   fill={C.danger}  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Movement totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--border-soft)', marginTop: 8 }}>
            {[
              { label: 'Received',  val: movTotals.receipt,  color: C.success },
              { label: 'Dispensed', val: movTotals.dispensed, color: C.primary },
              { label: 'Expired',   val: movTotals.expired,  color: C.danger  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ padding: '10px 16px', textAlign: 'center', borderRight: '1px solid var(--border-soft)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>{fmtNumber(val)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock status donut */}
        <div className="card">
          <SectionHead title="Stock status" sub={`${kpi.batches} batches`} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ width: '100%', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pieData.map(d => (
                <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    {d.name}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top medicines table ─────────────────────────────────────────── */}
      {topMedicines.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <SectionHead title="Stock by medicine" sub={`Top ${topMedicines.length} by available quantity`} />
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Available</th>
                  <th style={{ minWidth: 100 }}>Relative</th>
                  <th title={`Average units dispensed per day (last ${period}d)`}>Avg / day</th>
                  <th title="Estimated days until stockout at current consumption rate">Days of stock</th>
                  <th>Earliest expiry</th>
                </tr>
              </thead>
              <tbody>
                {topMedicines.map((med, i) => (
                  <tr key={i}>
                    <td>
                      <div className="td-primary">{med.name}</div>
                      <div className="td-muted">{med.form}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: C.primary }}>
                        {fmtNumber(med.available)}
                      </span>
                      <div className="td-muted">{med.unit}s</div>
                    </td>
                    <td>
                      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                        <div style={{
                          width: `${Math.max(2, Math.round(med.available / maxAvail * 100))}%`,
                          height: '100%',
                          background: med.available < med.reorderLevel ? C.warning : C.primary,
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </td>
                    <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {med.avgDaily > 0.01 ? med.avgDaily.toFixed(1) : '—'}
                    </td>
                    <td>
                      {med.daysOfStock !== null
                        ? <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: med.daysOfStock < 14 ? C.danger : med.daysOfStock < 30 ? C.warning : 'var(--text-primary)' }}>
                            {med.daysOfStock}d
                          </span>
                        : <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>No data</span>
                      }
                    </td>
                    <td>
                      {med.minExpiry
                        ? <Badge className={expiryBadgeClass(med.minExpiry)}>{fmtExpiryLabel(med.minExpiry)}</Badge>
                        : <span className="td-muted">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Expiry risk + Transfer summary ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(240px, 320px)', gap: 16 }}>

        {/* Expiry risk */}
        <div className="card">
          <SectionHead
            title="Expiry risk"
            sub={expiryRisk.length > 0
              ? `${expiryRisk.length} batch${expiryRisk.length !== 1 ? 'es' : ''} expiring within ${expiryThr} days`
              : `No batches expiring within ${expiryThr} days`}
          />
          {expiryRisk.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              All batches are within a safe expiry window.
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryRisk.map(item => {
                    const a = avail(item)
                    const days = daysUntilExpiry(item.expiry_date)
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="td-primary">{item.medicines?.generic_name}</div>
                          <div className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{item.batch_number}</div>
                        </td>
                        <td>
                          <Badge className={expiryBadgeClass(item.expiry_date)}>{fmtExpiryLabel(item.expiry_date)}</Badge>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{fmtNumber(a)}</span>
                          {a > 0 && days !== null && days >= 0 && (
                            <div style={{ fontSize: 10, color: C.primary, marginTop: 1 }}>Redistributable</div>
                          )}
                          {(days === null || days < 0) && a > 0 && (
                            <div style={{ fontSize: 10, color: C.danger, marginTop: 1 }}>Expired — remove</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transfer activity */}
        <div className="card">
          <SectionHead title="Transfer activity" sub="Last 90 days" />
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <TrxStat label="Requests sent"     value={trxSent.length}     sub="You requested stock from others"   />
            <TrxStat label="Requests received" value={trxReceived.length} sub="Others requested stock from you"   />
            <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />
            <TrxStat
              label="Fulfillment rate"
              value={fillRate !== null ? `${fillRate}%` : '—'}
              sub={fillRate !== null ? `${trxFilled} fulfilled of ${trxClosed} closed` : 'No closed requests yet'}
              color={fillRate !== null && fillRate < 60 ? C.warning : undefined}
            />
            <TrxStat
              label="Active requests"
              value={trxPending}
              sub="Pending, approved, or in transit"
              color={trxPending > 0 ? C.primary : undefined}
            />
            {trxAll.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 12, lineHeight: 1.6 }}>
                No transfer activity in the last 90 days.
                Use the network search to request stock from other facilities.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Header({ facility, period, setPeriod }) {
  return (
    <div className="page-top">
      <div>
        <div className="page-eyebrow">My Facility · Supply Intelligence</div>
        <div className="page-title">Supply Intelligence</div>
        <div className="page-subtitle">Operational analytics for {facility?.name ?? 'your facility'}</div>
      </div>
      <div className="page-actions">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            className={`btn btn-sm ${period === d ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod(d)}
          >
            {d}d
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionHead({ title, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: '1px solid var(--border-soft)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      {sub && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function TrxStat({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--text-disabled)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-primary)', flexShrink: 0, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildWeeklyData(movements, periodDays) {
  if (!movements.length) return []

  const now   = new Date()
  const since = subDays(now, periodDays)
  const weekStarts = []
  let w = startOfWeek(since, { weekStartsOn: 1 })
  while (w <= now) {
    weekStarts.push(new Date(w))
    w = addWeeks(w, 1)
  }

  const data = weekStarts.map(ws => ({ week: format(ws, 'MMM d'), receipt: 0, dispensed: 0, expired: 0 }))

  for (const m of movements) {
    const date = parseISO(m.performed_at)
    let idx = -1
    for (let j = weekStarts.length - 1; j >= 0; j--) {
      if (!isAfter(weekStarts[j], date)) { idx = j; break }
    }
    if (idx < 0 || idx >= data.length) continue
    const abs = Math.abs(m.quantity_change)
    if (m.movement_type === 'receipt')           data[idx].receipt   += abs
    else if (m.movement_type === 'dispensed')    data[idx].dispensed += abs
    else if (m.movement_type === 'expired_removal') data[idx].expired += abs
  }

  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE ANALYTICS — numbers and lists, zero charts
// ─────────────────────────────────────────────────────────────────────────────
function MobileAnalytics({ kpi, movTotals, expiryRisk, trxPending, period, setPeriod, expiryThr }) {
  return (
    <div className="mob-dash">

      {/* Compact header + period toggle */}
      <div className="mob-analytics-header">
        <div className="mob-analytics-title">Supply Intelligence</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              className={`chip${period === d ? ' active' : ''}`}
              onClick={() => setPeriod(d)}
              style={{ padding: '3px 8px', fontSize: 11 }}
            >{d}d</button>
          ))}
        </div>
      </div>

      {/* KPI grid — 2×2, no charts */}
      <div className="mob-kpi-grid">
        <div className="mob-kpi-card">
          <div className="mob-kpi-val" style={{ color: 'var(--primary)' }}>{fmtNumber(kpi.batches)}</div>
          <div className="mob-kpi-lbl">Active batches</div>
        </div>
        <div className="mob-kpi-card">
          <div className="mob-kpi-val">{fmtNumber(kpi.units)}</div>
          <div className="mob-kpi-lbl">Units on hand</div>
        </div>
        <div className={`mob-kpi-card${kpi.atRisk > 0 ? ' mob-kpi-warn' : ''}`}>
          <div className="mob-kpi-val" style={{ color: kpi.atRisk > 0 ? 'var(--warning)' : undefined }}>
            {fmtNumber(kpi.atRisk)}
          </div>
          <div className="mob-kpi-lbl">At-risk items</div>
          {kpi.atRisk > 0 && (
            <div className="mob-kpi-sub">{kpi.outOfStock} out · {kpi.lowStock} low</div>
          )}
        </div>
        <div className={`mob-kpi-card${kpi.expiring > 0 ? ' mob-kpi-danger' : ''}`}>
          <div className="mob-kpi-val" style={{ color: kpi.expiring > 0 ? 'var(--danger)' : undefined }}>
            {fmtNumber(kpi.expiring)}
          </div>
          <div className="mob-kpi-lbl">Expiring ≤{expiryThr}d</div>
        </div>
      </div>

      {/* Movement summary — last N days */}
      <div className="mob-section">
        <div className="mob-section-head">
          <span className="mob-section-title">Movements · last {period} days</span>
        </div>
        <div className="mob-movement-row">
          <div className="mob-movement-item">
            <div className="mob-movement-num" style={{ color: 'var(--success)' }}>{fmtNumber(movTotals.receipt)}</div>
            <div className="mob-movement-lbl">Received</div>
          </div>
          <div className="mob-movement-sep" />
          <div className="mob-movement-item">
            <div className="mob-movement-num" style={{ color: 'var(--primary)' }}>{fmtNumber(movTotals.dispensed)}</div>
            <div className="mob-movement-lbl">Dispensed</div>
          </div>
          <div className="mob-movement-sep" />
          <div className="mob-movement-item">
            <div className="mob-movement-num" style={{ color: movTotals.expired > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
              {fmtNumber(movTotals.expired)}
            </div>
            <div className="mob-movement-lbl">Expired</div>
          </div>
        </div>
      </div>

      {/* Transfer pipeline */}
      {trxPending > 0 && (
        <Link to="/transfers" className="mob-section mob-section-link-block">
          <div className="mob-section-head">
            <span className="mob-section-title">Active transfers</span>
            <span className="mob-section-link">Manage →</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingTop: 4 }}>
            {trxPending} transfer{trxPending > 1 ? 's' : ''} pending action
          </div>
        </Link>
      )}

      {/* Expiry risk list */}
      {expiryRisk.length > 0 && (
        <div className="mob-section">
          <div className="mob-section-head">
            <span className="mob-section-title">Expiry risk</span>
            <Link to="/inventory" className="mob-section-link">Manage →</Link>
          </div>
          {expiryRisk.slice(0, 10).map(item => {
            const d = daysUntilExpiry(item.expiry_date)
            const isExp   = d !== null && d < 0
            const isUrgent = d !== null && d <= 30
            return (
              <div key={item.id} className="mob-expiry-row">
                <div className="mob-expiry-left">
                  <div className="mob-expiry-name">{item.medicines?.generic_name ?? '—'}</div>
                  <div className="mob-expiry-meta">
                    {item.batch_number && <span>{item.batch_number}</span>}
                    <span>{fmtNumber((item.quantity_available ?? 0) - (item.quantity_reserved ?? 0))} units</span>
                  </div>
                </div>
                <div className={`mob-expiry-days${isExp ? ' expired' : isUrgent ? ' urgent' : ''}`}>
                  {isExp ? 'EXPIRED' : d !== null ? `${d}d` : fmtDate(item.expiry_date)}
                </div>
              </div>
            )
          })}
          {expiryRisk.length > 10 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0 0', textAlign: 'center' }}>
              +{expiryRisk.length - 10} more — view full list on desktop
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 11, color: 'var(--text-disabled)' }}>
        Charts and full reports on desktop
      </div>
    </div>
  )
}
