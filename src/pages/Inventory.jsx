import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import {
  fmtDate, fmtCurrency, fmtNumber,
  expiryBadgeClass, fmtExpiryLabel, daysUntilExpiry,
  stockStatusClass, stockStatusLabel,
} from '../utils/formatters'
import { Modal, InlineError, EmptyState, Badge, SkeletonRow, ContextCard, CustomSelect } from '../components/shared'

// ---------------------------------------------------------------------------
// GS1 barcode parser — extracts batch number, expiry date, and GTIN
// from GS1-128 and DataMatrix pharmaceutical barcodes.
// ---------------------------------------------------------------------------
function parseGS1Barcode(raw) {
  const result = { raw, batchNumber: '', expiryDate: '', gtin: '' }
  if (!raw) return result

  // Strip scanner prefix codes (e.g. ]C1 = GS1-128, ]d2 = DataMatrix)
  let s = raw.replace(/^\][A-Za-z]\d/, '')

  // Normalize parenthesised AI notation: (01)12345 → 0112345
  s = s.replace(/\((\d{2,4})\)/g, '$1')

  const FNC1 = '\x1d' // GS1 field separator character

  // Fixed-length Application Identifiers (AI → data length after the AI digits)
  const FIXED = { '00':18, '01':14, '02':14, '11':6, '13':6, '15':6, '17':6, '20':2 }
  // Variable-length AIs (data terminated by FNC1 or end of string)
  const VARIABLE = new Set(['10','21','22','30','310','320','710','711','712'])

  let i = 0
  while (i < s.length) {
    if (s[i] === FNC1) { i++; continue }

    // Try 2-digit AI
    const ai2 = s.substr(i, 2)
    if (FIXED[ai2] !== undefined) {
      const val = s.substr(i + 2, FIXED[ai2])
      if ((ai2 === '01' || ai2 === '02') && val.length === 14) result.gtin = val
      if (ai2 === '17' || ai2 === '15') {
        const yy = parseInt(val.substr(0, 2), 10)
        const mm = val.substr(2, 2)
        const rawDay = val.substr(4, 2)
        const dd = rawDay === '00' ? '01' : rawDay
        const yyyy = yy >= 50 ? `19${String(yy).padStart(2,'0')}` : `20${String(yy).padStart(2,'0')}`
        result.expiryDate = `${yyyy}-${mm}-${dd}`
      }
      i += 2 + FIXED[ai2]
      continue
    }
    if (VARIABLE.has(ai2)) {
      i += 2
      const sep = s.indexOf(FNC1, i)
      const val = sep === -1 ? s.substr(i) : s.substr(i, sep - i)
      if (ai2 === '10') result.batchNumber = val
      i = sep === -1 ? s.length : sep + 1
      continue
    }
    // Not a recognised GS1 structure — treat entire raw as batch number
    result.batchNumber = raw
    break
  }

  // Fallback: if nothing matched, use raw value as batch number
  if (!result.batchNumber && !result.gtin && !result.expiryDate) {
    result.batchNumber = raw
  }
  return result
}

// ---------------------------------------------------------------------------
// BarcodeScanner — live camera scanning via @zxing/browser (works on
// iOS Safari, Chrome, Firefox). Loaded dynamically to keep initial bundle small.
// ---------------------------------------------------------------------------
function BarcodeScanner({ onScan, onCancel }) {
  const videoRef     = useRef(null)
  const guidanceTimer = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'scanning' | 'guidance' | 'error'
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    let stopped = false
    let controls = null

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (stopped) return

        const reader = new BrowserMultiFormatReader()
        const cb = (result, _err) => {
          if (stopped || !result) return
          const text = result.getText()
          if (text) {
            stopped = true
            clearTimeout(guidanceTimer.current)
            onScan(text)
          }
        }

        // Prefer rear-facing camera (critical for mobile usability)
        try {
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            videoRef.current, cb
          )
        } catch {
          // Fallback: accept any camera (covers desktop webcams)
          if (stopped) return
          controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, cb)
        }
        if (!stopped) {
          setStatus('scanning')
          // After 8 s without a scan, show helpful guidance
          guidanceTimer.current = setTimeout(() => {
            if (!stopped) setStatus('guidance')
          }, 8000)
        }
      } catch (e) {
        if (stopped) return
        const msg = String(e?.message ?? e)
        if (/permission|denied|not allowed/i.test(msg))
          setErrMsg('Camera permission denied. Allow camera access in browser settings, then try again.')
        else if (/not found|no device|no camera/i.test(msg))
          setErrMsg('No camera found on this device.')
        else
          setErrMsg('Could not start camera.')
        setStatus('error')
      }
    }

    start()
    return () => {
      stopped = true
      clearTimeout(guidanceTimer.current)
      try { controls?.stop() } catch (_) {}
    }
  }, [])

  if (status === 'error') {
    return (
      <div className="scanner-error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <p className="scanner-error-msg">{errMsg}</p>
        <button type="button" className="btn btn-primary" onClick={onCancel} style={{ width: '100%' }}>
          Enter batch details manually →
        </button>
      </div>
    )
  }

  return (
    <div className="scanner-shell">
      {/* Camera viewfinder — fills available width, taller than old 300px cap */}
      <div className="scanner-viewfinder">
        <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />

        {/* Dim border + frame overlay */}
        <div className="scanner-overlay" style={{ pointerEvents: 'none' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.48)', width: '100%' }} />
          <div style={{ display: 'flex', flex: 3 }}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.48)' }} />
            <div className="scanner-frame">
              <div className="scanner-corner scanner-corner-tl" />
              <div className="scanner-corner scanner-corner-tr" />
              <div className="scanner-corner scanner-corner-bl" />
              <div className="scanner-corner scanner-corner-br" />
              {status !== 'loading' && <div className="scanner-scanline" />}
            </div>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.48)' }} />
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.48)', width: '100%' }} />
        </div>

        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner spinner-lg" />
          </div>
        )}
      </div>

      {/* Instructions */}
      <p className="scanner-hint">
        {status === 'loading'
          ? 'Starting camera…'
          : 'Align barcode or QR / DataMatrix code inside the frame — it scans automatically'}
      </p>

      {/* Guidance panel after 8 s timeout */}
      {status === 'guidance' && (
        <div className="inline-alert alert-info" style={{ fontSize: 11 }}>
          <span className="inline-alert-icon">💡</span>
          <div>
            <strong>Still scanning.</strong> Try better lighting or hold the device closer.
            GS1-128, DataMatrix and QR codes on medicine packaging are all supported.
            If the barcode is damaged, use manual entry instead.
          </div>
        </div>
      )}

      {/* Always-visible manual fallback */}
      <button type="button" className="btn btn-ghost" onClick={onCancel} style={{ width: '100%' }}>
        Enter manually instead
      </button>
    </div>
  )
}

const STORAGE_CONDS = ['room_temperature','cool','refrigerated','frozen','controlled_room','protect_from_light','protect_from_moisture']
const MOVEMENT_TYPES = [
  { value: 'receipt',         label: 'Receipt — stock received from supplier' },
  { value: 'dispensed',       label: 'Dispensed — issued to patient or facility' },
  { value: 'adjustment',      label: 'Manual adjustment' },
  { value: 'expired_removal', label: 'Expired removal' },
  { value: 'return',          label: 'Return to supplier' },
]
const FILTER_OPTIONS = [
  { key: 'all',      label: 'All stock' },
  { key: 'low',      label: 'Low stock',    chip: 'chip-warning' },
  { key: 'out',      label: 'Out of stock', chip: 'chip-danger'  },
  { key: 'expiring', label: 'Near expiry',  chip: 'chip-warning' },
  { key: 'reserved', label: 'Reserved'                           },
]

export default function InventoryPage() {
  const { facilityId, facility, isFacilityAdmin: isAdmin } = useFacility()
  const navigate = useNavigate()
  const [items,     setItems]     = useState([])
  const [medicines, setMedicines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const [addOpen,   setAddOpen]   = useState(false)
  const [adjItem,    setAdjItem]    = useState(null)
  const [editItem,   setEditItem]   = useState(null)
  const [expireItem, setExpireItem] = useState(null)
  const expiryThreshold = facility?.near_expiry_threshold_days ?? 90

  function isNearExpiry(expiry_date) {
    const d = daysUntilExpiry(expiry_date)
    return d !== null && d >= 0 && d <= expiryThreshold
  }

  function goRedistribute(item) {
    navigate('/transfers', {
      state: {
        prefill: item.medicine_id ? {
          medicine_id: item.medicine_id,
          medicine_name: item.medicines?.generic_name,
        } : null,
      },
    })
  }

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    const { data } = await supabase
      .from('inventory_items')
      .select(`
        id, batch_number, quantity_available, quantity_reserved, reorder_level,
        expiry_date, manufacture_date, brand_name, pack_size, dispensing_unit,
        unit_cost, selling_price, storage_condition, storage_location,
        notes, is_active, supplier_id, medicine_id, facility_id, created_at,
        network_suppressed,
        medicines(generic_name, dosage_form, strength, therapeutic_class, essential_medicine),
        suppliers(name)
      `)
      .eq('facility_id', facilityId).eq('is_active', true)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [facilityId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('medicines').select('id, generic_name, dosage_form, strength, nafdac_reg_number, atc_code, standard_pack_sizes').eq('is_active', true).order('generic_name')
      .then(({ data }) => setMedicines(data ?? []))
    if (facilityId)
      supabase.from('suppliers').select('id, name').eq('facility_id', facilityId)
        .then(({ data }) => setSuppliers(data ?? []))
  }, [facilityId])

  const filtered = items.filter(i => {
    const u = i.quantity_available - i.quantity_reserved
    const days = daysUntilExpiry(i.expiry_date)
    const q = search.toLowerCase()
    const matchSearch = !q || [i.medicines?.generic_name, i.brand_name, i.batch_number, i.nafdac_number].some(v => v?.toLowerCase().includes(q))
    if (!matchSearch) return false
    if (filter === 'low')      return u > 0 && u < i.reorder_level
    if (filter === 'out')      return i.quantity_available === 0
    if (filter === 'expiring') return days !== null && days >= 0 && days <= (facility?.near_expiry_threshold_days ?? 90)
    if (filter === 'reserved') return i.quantity_reserved > 0
    return true
  })

  const counts = {
    all:      items.length,
    low:      items.filter(i => { const u = i.quantity_available - i.quantity_reserved; return u > 0 && u < i.reorder_level }).length,
    out:      items.filter(i => i.quantity_available === 0).length,
    expiring: items.filter(i => { const d = daysUntilExpiry(i.expiry_date); return d !== null && d >= 0 && d <= (facility?.near_expiry_threshold_days ?? 90) }).length,
    reserved: items.filter(i => i.quantity_reserved > 0).length,
  }

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">My Facility · Inventory</div>
          <div className="page-title">Facility Inventory</div>
          <div className="page-subtitle">
            Your inventory powers local medicine availability intelligence — stock you add becomes visible to the network
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add stock</button>
        </div>
      </div>

      {/* Network framing banner */}
      {items.length > 0 && (
        <div className="inline-alert alert-info" style={{ marginBottom: 16 }}>
          <span className="inline-alert-icon">ℹ</span>
          <div style={{ fontSize: 12 }}>
            <strong>{items.length} active batch{items.length !== 1 ? 'es' : ''}</strong> published to the medicine availability network.
            Other verified facilities can locate and request this stock when facing shortages.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              placeholder="Search medicine, brand, batch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-chips">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.key}
                className={`chip ${f.chip ?? ''} ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {counts[f.key] > 0 && filter !== f.key && (
                  <span style={{ background: 'var(--bg-elevated)', borderRadius: 99, padding: '0 5px', fontSize: 10, marginLeft: 2 }}>
                    {counts[f.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table — hidden on mobile, replaced by cards below */}
      <div className="table-container inv-desktop">
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Status</th>
              <th title="Excludes stock reserved for pending transfers">Available</th>
              <th>Reorder at</th>
              <th>Expiry</th>
              <th>Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => <SkeletonRow key={i} cols={8} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title="No inventory items"
                    description="Add inventory to make your facility visible in the medicine availability network. Other verified facilities and clinics will be able to locate medicines at your facility and request transfers when they face shortages."
                    actions={<>
                      <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>Add stock batch</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>Clear filters</button>
                    </>}
                  />
                </td>
              </tr>
            ) : filtered.map(item => {
              const available = item.quantity_available - item.quantity_reserved
              return (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="td-primary truncate" style={{ maxWidth: 170 }}>
                        {item.medicines?.generic_name}
                      </div>
                      {item.medicines?.essential_medicine && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', borderRadius: 'var(--r-xs)', padding: '1px 4px', flexShrink: 0 }}>
                          ESSENTIAL
                        </span>
                      )}
                    </div>
                    <div className="td-muted">
                      {item.brand_name ? `${item.brand_name} · ` : ''}
                      {item.medicines?.strength} {item.medicines?.dosage_form}
                    </div>
                  </td>
                  <td><span className="pill">{item.batch_number}</span></td>
                  <td>
                    <Badge className={stockStatusClass(available, item.reorder_level)} dot>
                      {stockStatusLabel(available, item.reorder_level)}
                    </Badge>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                      title="Excludes stock reserved for pending transfers">
                      {fmtNumber(available)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>
                      {item.dispensing_unit ? `${item.dispensing_unit}s` : 'units'}
                    </span>
                    {item.pack_size > 1 && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {Math.floor(available / item.pack_size)} packs of {item.pack_size}
                      </div>
                    )}
                    {item.quantity_reserved > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 1 }}>
                        {item.quantity_reserved} reserved for transfer
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: available < item.reorder_level ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {item.reorder_level}
                    </span>
                  </td>
                  <td>
                    <Badge className={expiryBadgeClass(item.expiry_date)}>
                      {fmtExpiryLabel(item.expiry_date)}
                    </Badge>
                  </td>
                  <td className="td-muted">
                    {item.selling_price
                      ? fmtCurrency(item.selling_price, facility?.default_currency)
                      : <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>Not set</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {isNearExpiry(item.expiry_date) && available > 0 && (
                        <button
                          className="btn btn-xs"
                          style={{ color: 'var(--warning)', borderColor: 'var(--warning-border)', background: 'var(--warning-dim)' }}
                          onClick={() => goRedistribute(item)}
                          title="Offer this near-expiry stock to other facilities"
                        >
                          ♻ Redistribute
                        </button>
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => setAdjItem(item)}>Adjust</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditItem(item)}>Edit</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => setExpireItem(item)}>Expire</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — hidden on desktop, shown on ≤640px */}
      <div className="inv-mobile-list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No inventory items"
            description="Add inventory to make your facility visible in the medicine availability network."
            actions={<>
              <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>Add stock batch</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>Clear filters</button>
            </>}
          />
        ) : filtered.map(item => {
          const available = item.quantity_available - item.quantity_reserved
          return (
            <div key={item.id} className="inv-card">
              <div className="inv-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="inv-card-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="truncate">{item.medicines?.generic_name}</span>
                    {item.medicines?.essential_medicine && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', borderRadius: 'var(--r-xs)', padding: '1px 4px', flexShrink: 0 }}>ESS</span>
                    )}
                  </div>
                  <div className="inv-card-meta">
                    {item.brand_name ? `${item.brand_name} · ` : ''}
                    {item.medicines?.strength} {item.medicines?.dosage_form}
                  </div>
                </div>
                <Badge className={stockStatusClass(available, item.reorder_level)} dot>
                  {stockStatusLabel(available, item.reorder_level)}
                </Badge>
              </div>
              <div className="inv-card-stats">
                <div className="inv-stat">
                  <span className="inv-stat-lbl">Available</span>
                  <span className="inv-stat-val" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                    {fmtNumber(available)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.dispensing_unit ? `${item.dispensing_unit}s` : 'units'}</span>
                  </span>
                </div>
                <div className="inv-stat">
                  <span className="inv-stat-lbl">Reorder at</span>
                  <span className="inv-stat-val" style={{ fontFamily: 'var(--font-mono)', color: available < item.reorder_level ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {item.reorder_level}
                  </span>
                </div>
                <div className="inv-stat">
                  <span className="inv-stat-lbl">Expiry</span>
                  <Badge className={expiryBadgeClass(item.expiry_date)}>{fmtExpiryLabel(item.expiry_date)}</Badge>
                </div>
                {item.selling_price && (
                  <div className="inv-stat">
                    <span className="inv-stat-lbl">Price</span>
                    <span className="inv-stat-val">{fmtCurrency(item.selling_price, facility?.default_currency)}</span>
                  </div>
                )}
              </div>
              {item.quantity_reserved > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 8 }}>
                  {item.quantity_reserved} reserved for pending transfer
                </div>
              )}
              {item.network_suppressed && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 8 }}>
                  Hidden from network search
                </div>
              )}

              {/* Near-expiry redistribution prompt */}
              {isNearExpiry(item.expiry_date) && available > 0 && (
                <div style={{
                  margin: '6px 0 8px',
                  background: 'rgba(245,165,36,0.06)',
                  border: '1px solid rgba(245,165,36,0.22)',
                  borderRadius: 'var(--r-md)',
                  padding: '9px 11px',
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', marginBottom: 5 }}>
                    ⏱ Near expiry — {available} units available to redistribute
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-sm btn-full"
                      style={{ background: 'rgba(245,165,36,0.12)', color: 'var(--warning)', borderColor: 'rgba(245,165,36,0.3)', fontSize: 11 }}
                      onClick={() => goRedistribute(item)}
                    >
                      ♻ Offer to network →
                    </button>
                  </div>
                </div>
              )}

              <div className="inv-card-foot">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {item.batch_number}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => setAdjItem(item)}>Adjust</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditItem(item)}>Edit</button>
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => setExpireItem(item)}>Expire</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {addOpen    && <AddModal key={Date.now()} facilityId={facilityId} medicines={medicines} suppliers={suppliers} currency={facility?.default_currency} onClose={() => setAddOpen(false)}    onSuccess={() => { setAddOpen(false);    load() }} />}
      {adjItem    && <AdjModal    item={adjItem}    onClose={() => setAdjItem(null)}    onSuccess={() => { setAdjItem(null);    load() }} />}
      {editItem   && <EditModal   item={editItem}   isAdmin={isAdmin} suppliers={suppliers} currency={facility?.default_currency} onClose={() => setEditItem(null)}   onSuccess={() => { setEditItem(null);   load() }} />}
      {expireItem && <ExpireModal item={expireItem} onClose={() => setExpireItem(null)} onSuccess={() => { setExpireItem(null); load() }} />}
    </div>
  )
}

function MedicineSearch({ medicines, value, onChange }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const inputRef = useRef(null)

  const selected = medicines.find(m => m.id === value)

  const filtered = query.trim().length === 0
    ? medicines
    : medicines.filter(m =>
        `${m.generic_name} ${m.strength} ${m.dosage_form}`.toLowerCase().includes(query.toLowerCase())
      )

  // Group by therapeutic class
  const groups = filtered.reduce((acc, m) => {
    const cls = m.therapeutic_class || 'Other'
    if (!acc[cls]) acc[cls] = []
    acc[cls].push(m)
    return acc
  }, {})

  function select(id) {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  function handleFocus() {
    setOpen(true)
    if (selected) setQuery('')
  }

  function handleBlur(e) {
    // Delay so click on option registers first
    setTimeout(() => setOpen(false), 180)
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Input shows selected medicine or search query */}
      <input
        ref={inputRef}
        type="text"
        required={!value}
        placeholder="Type to search medicines…"
        value={open ? query : selected ? `${selected.generic_name} — ${selected.strength} (${selected.dosage_form})` : query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      {/* Hidden input for form validation */}
      <input type="hidden" required value={value} />

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow)',
          zIndex: 999,
          maxHeight: 280,
          overflowY: 'auto',
          marginTop: 4,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              No medicines found for "{query}"
            </div>
          ) : (
            Object.entries(groups).sort().map(([cls, meds]) => (
              <div key={cls}>
                <div style={{
                  padding: '6px 12px',
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'var(--text-muted)',
                  background: 'var(--bg-primary)',
                  position: 'sticky', top: 0,
                }}>
                  {cls}
                </div>
                {meds.map(m => (
                  <div
                    key={m.id}
                    onMouseDown={() => select(m.id)}
                    style={{
                      padding: '9px 14px',
                      fontSize: 12.5,
                      color: m.id === value ? 'var(--primary)' : 'var(--text-primary)',
                      background: m.id === value ? 'var(--teal-dim)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-soft)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
                    onMouseLeave={e => e.currentTarget.style.background = m.id === value ? 'var(--teal-dim)' : 'transparent'}
                  >
                    <span style={{ fontWeight: m.id === value ? 600 : 400 }}>
                      {m.generic_name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {m.strength} · {m.dosage_form}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function AddModal({ facilityId, medicines, suppliers, currency, onClose, onSuccess }) {
  const [f, setF] = useState({
    medicine_id: '', nafdac_number: '', batch_number: '', expiry_date: '', quantity: '', reorder_level: 10,
    dispensing_unit: 'tablet', pack_size: '', quantity_type: 'units',
    brand_name: '', supplier_id: '', manufacture_date: '', unit_cost: '', selling_price: '',
    storage_condition: 'room_temperature', storage_location: '', notes: '',
  })
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [fieldErrors,  setFieldErrors]  = useState({})
  const [entryMode,    setEntryMode]    = useState('manual')  // 'manual' | 'scan'
  const [lastScan,     setLastScan]     = useState(null)
  const [showOptional, setShowOptional] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const clearFE = k => setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })

  function handleScan(raw) {
    const parsed = parseGS1Barcode(raw)
    setF(prev => ({
      ...prev,
      batch_number: parsed.batchNumber || prev.batch_number,
      expiry_date:  parsed.expiryDate  || prev.expiry_date,
    }))
    setLastScan(parsed)
    setEntryMode('manual')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const fe = {}
    if (!f.medicine_id)        fe.medicine_id  = 'Select a medicine'
    if (!f.batch_number.trim()) fe.batch_number = 'Batch number is required'
    if (!f.expiry_date)        fe.expiry_date  = 'Expiry date is required'
    const rawQty = Number(f.quantity)
    if (!rawQty || rawQty <= 0) fe.quantity = 'Quantity must be greater than zero'
    if (f.quantity_type === 'packs') {
      if (!f.pack_size || f.pack_size === '' || f.pack_size === 'custom')
        fe.pack_size = 'Select or enter a pack size'
      else if (Number(f.pack_size) <= 0)
        fe.pack_size = 'Pack size must be greater than zero'
    }
    if (Object.keys(fe).length > 0) { setFieldErrors(fe); setError('Please fix the errors highlighted below.'); return }

    setLoading(true)
    const { error: err } = await supabase.rpc('create_inventory_item', {
      p_facility_id:      facilityId,
      p_medicine_id:      f.medicine_id,
      p_batch_number:     f.batch_number,
      p_expiry_date:      f.expiry_date,
      p_quantity:         f.quantity_type === 'packs' && f.pack_size && f.pack_size !== '' && f.pack_size !== 'custom'
                          ? Number(f.quantity) * Number(f.pack_size)
                          : Number(f.quantity),
      p_dispensing_unit:  f.dispensing_unit,
      p_pack_size:        f.pack_size && f.pack_size !== 'custom' ? Number(f.pack_size) : null,
      p_reorder_level:    Number(f.reorder_level),
      p_brand_name:       f.brand_name       || null,
      p_supplier_id:      f.supplier_id      || null,
      p_manufacture_date: f.manufacture_date || null,
      p_unit_cost:        f.unit_cost        ? Number(f.unit_cost)    : null,
      p_selling_price:    f.selling_price    ? Number(f.selling_price): null,
      p_storage_condition:f.storage_condition,
      p_storage_location: f.storage_location || null,
      p_notes:            f.notes            || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  const selectedMed = medicines.find(m => m.id === f.medicine_id)

  return (
    <Modal title="Add stock batch" subtitle="Stock you add becomes visible to the medicine availability network" onClose={onClose} size="modal-lg"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        {entryMode === 'manual' && (
          <button className="btn btn-primary" form="add-form" type="submit" disabled={loading}>
            {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }}/> Adding…</> : 'Add to network'}
          </button>
        )}
      </>}
    >
      {/* Entry mode toggle */}
      <div className="entry-mode-toggle">
        {[
          { key: 'scan',   label: 'Scan barcode',   icon: '📷' },
          { key: 'manual', label: 'Enter manually',  icon: '✏️' },
        ].map(({ key, label, icon }) => (
          <button key={key} type="button" onClick={() => setEntryMode(key)}
            className={`entry-mode-btn ${entryMode === key ? 'active' : ''}`}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Scanner — takes up the full modal body when active */}
      {entryMode === 'scan' && (
        <BarcodeScanner onScan={handleScan} onCancel={() => setEntryMode('manual')} />
      )}

      {/* Manual entry form */}
      <div style={{ display: entryMode === 'scan' ? 'none' : 'contents' }}>

        {/* Scan confirmation */}
        {lastScan && (
          <div className="inline-alert alert-success" style={{ fontSize: 11.5 }}>
            <span className="inline-alert-icon">✓</span>
            <div>
              <strong>Barcode scanned.</strong> Please confirm the medicine and enter the quantity.
              {lastScan.batchNumber && <> Batch <code style={{ fontFamily: 'var(--font-mono)' }}>{lastScan.batchNumber}</code></>}
              {lastScan.expiryDate  && <> and expiry date have been auto-filled.</>}
              {!lastScan.batchNumber && !lastScan.expiryDate && <> Raw code: <code style={{ fontFamily: 'var(--font-mono)' }}>{lastScan.raw}</code></>}
            </div>
          </div>
        )}

        <InlineError message={error} />

        <form id="add-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── ESSENTIAL FIELDS ── */}

          {/* 1. Medicine */}
          <div className="field">
            <label>Medicine *</label>
            <MedicineSearch
              medicines={medicines}
              value={f.medicine_id}
              onChange={id => { setF(p => ({ ...p, medicine_id: id, nafdac_number: '', pack_size: '', quantity_type: 'units' })); clearFE('medicine_id') }}
            />
            {fieldErrors.medicine_id && <div className="field-error">{fieldErrors.medicine_id}</div>}
          </div>

          {/* 2. Batch # + Expiry — side by side on desktop, stacked on mobile */}
          <div className="form-row-2">
            <div className="field">
              <label>Batch number *</label>
              <input
                required
                value={f.batch_number}
                onChange={e => { set('batch_number', e.target.value); clearFE('batch_number') }}
                placeholder="e.g. BT-2024-001"
                autoCapitalize="characters"
                autoCorrect="off"
              />
              {fieldErrors.batch_number && <div className="field-error">{fieldErrors.batch_number}</div>}
            </div>
            <div className="field">
              <label>Expiry date *</label>
              <input
                type="date"
                required
                value={f.expiry_date}
                onChange={e => { set('expiry_date', e.target.value); clearFE('expiry_date') }}
              />
              {fieldErrors.expiry_date && <div className="field-error">{fieldErrors.expiry_date}</div>}
            </div>
          </div>

          {/* 3. Quantity */}
          <div className="field">
            <label>Quantity *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="number"
                required
                min={0}
                inputMode="numeric"
                pattern="[0-9]*"
                value={f.quantity}
                onChange={e => { set('quantity', e.target.value); clearFE('quantity') }}
                placeholder="0"
                style={{ flex: '1 1 90px', minWidth: 80 }}
              />
              <div style={{ flex: '1 1 140px' }}>
                <CustomSelect
                  value={f.quantity_type}
                  onChange={v => setF(p => ({ ...p, quantity_type: v, pack_size: '' }))}
                  options={[
                    { value: 'units', label: 'Individual units' },
                    { value: 'packs', label: 'Packs' },
                  ]}
                />
              </div>
            </div>
            {fieldErrors.quantity && <div className="field-error">{fieldErrors.quantity}</div>}

            {/* Pack size — only when type is packs */}
            {f.quantity_type === 'packs' && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, marginBottom: 4, display: 'block', color: 'var(--text-secondary)' }}>Pack size *</label>
                {(() => {
                  const sizes = selectedMed?.standard_pack_sizes?.length > 0 ? selectedMed.standard_pack_sizes : null
                  const sizeList = sizes ?? [7, 10, 14, 28, 30, 56, 60, 84, 100, 120, 500]
                  return (
                    <CustomSelect
                      value={String(f.pack_size)}
                      onChange={v => { set('pack_size', v); clearFE('pack_size') }}
                      placeholder="— Select pack size —"
                      options={[
                        ...sizeList.map(s => ({ value: String(s), label: `${s} ${f.dispensing_unit}s per pack` })),
                        { value: 'custom', label: 'Other (enter below)' },
                      ]}
                    />
                  )
                })()}
                {String(f.pack_size) === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    style={{ marginTop: 6, width: '100%' }}
                    placeholder="e.g. 28, 56, 100"
                    onBlur={e => { if (e.target.value) set('pack_size', e.target.value) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.target.value) set('pack_size', e.target.value) } }}
                    autoFocus
                  />
                )}
                {fieldErrors.pack_size && <div className="field-error">{fieldErrors.pack_size}</div>}
                {f.quantity && f.pack_size && f.pack_size !== '' && f.pack_size !== 'custom' && Number(f.pack_size) > 1 && Number(f.quantity) > 0 && (
                  <div className="pack-total-preview">
                    {Number(f.quantity)} × {Number(f.pack_size)} = <strong>{(Number(f.quantity) * Number(f.pack_size)).toLocaleString()} {f.dispensing_unit}s</strong>
                  </div>
                )}
                <div className="field-hint">Check the count printed on the outer packaging</div>
              </div>
            )}
          </div>

          {/* 4. Dispensing unit + Reorder level */}
          <div className="form-row-2">
            <div className="field">
              <label>Dispensing unit</label>
              <CustomSelect
                value={f.dispensing_unit}
                onChange={v => set('dispensing_unit', v)}
                options={['tablet','capsule','vial','sachet','bottle','ampoule','tube','patch','unit'].map(u => ({ value: u, label: u.charAt(0).toUpperCase() + u.slice(1) }))}
              />
              <div className="field-hint">Smallest unit dispensed to patient</div>
            </div>
            <div className="field">
              <label>Reorder level</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                pattern="[0-9]*"
                value={f.reorder_level}
                onChange={e => set('reorder_level', e.target.value)}
              />
              <div className="field-hint">Alert fires below this quantity</div>
            </div>
          </div>

          {/* ── OPTIONAL FIELDS ── */}
          <div className="optional-section">
            <button type="button" className="optional-section-toggle" onClick={() => setShowOptional(v => !v)}>
              <span>{showOptional ? '▾' : '▸'} Optional details</span>
              <span className="optional-section-hint">NAFDAC · brand · supplier · cost · storage</span>
            </button>

            {showOptional && (
              <div className="optional-section-body">
                {/* NAFDAC */}
                <div className="field">
                  <label>NAFDAC registration number</label>
                  <input
                    value={f.nafdac_number}
                    onChange={e => set('nafdac_number', e.target.value)}
                    placeholder="e.g. A4-0007"
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                  {(() => {
                    if (!selectedMed?.nafdac_reg_number) return <div className="field-hint">Enter from packaging to verify product identity</div>
                    const entered = f.nafdac_number.trim().length > 0
                    const matches = f.nafdac_number.trim().toUpperCase() === selectedMed.nafdac_reg_number.toUpperCase()
                    if (!entered) return <div className="field-hint">Expected: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedMed.nafdac_reg_number}</strong></div>
                    return matches
                      ? <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3 }}>✓ Matches catalog</div>
                      : <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 3 }}>⚠ Does not match catalog number for {selectedMed.generic_name}</div>
                  })()}
                </div>

                <div className="field">
                  <label>Brand name</label>
                  <input value={f.brand_name} onChange={e => set('brand_name', e.target.value)} placeholder="Optional" />
                </div>

                <div className="form-row-2">
                  <div className="field">
                    <label>Unit cost ({currency})</label>
                    <input type="number" min={0} step="0.01" inputMode="decimal" value={f.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Selling price ({currency})</label>
                    <input type="number" min={0} step="0.01" inputMode="decimal" value={f.selling_price} onChange={e => set('selling_price', e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Supplier</label>
                  <CustomSelect
                    value={f.supplier_id}
                    onChange={v => set('supplier_id', v)}
                    placeholder="None / unknown"
                    options={[{ value: '', label: 'None / unknown' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                  />
                </div>

                <div className="form-row-2">
                  <div className="field">
                    <label>Storage condition</label>
                    <CustomSelect
                      value={f.storage_condition}
                      onChange={v => set('storage_condition', v)}
                      options={STORAGE_CONDS.map(c => ({ value: c, label: c.replace(/_/g, ' ') }))}
                    />
                  </div>
                  <div className="field">
                    <label>Storage location</label>
                    <input value={f.storage_location} onChange={e => set('storage_location', e.target.value)} placeholder="e.g. Shelf B2" />
                  </div>
                </div>

                <div className="field">
                  <label>Manufacture date</label>
                  <input type="date" value={f.manufacture_date} onChange={e => set('manufacture_date', e.target.value)} />
                </div>

                <div className="field">
                  <label>Notes</label>
                  <textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes about this batch" />
                </div>
              </div>
            )}
          </div>

        </form>
      </div>
    </Modal>
  )
}

function AdjModal({ item, onClose, onSuccess }) {
  const [movType, setMovType] = useState('receipt')
  const [qty,     setQty]     = useState('')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const isOut    = ['dispensed','expired_removal','return'].includes(movType)
  const available = item.quantity_available - item.quantity_reserved

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    const n = Math.abs(Number(qty))
    if (!n || n <= 0) { setError('Quantity must be greater than zero.'); return }
    if (isOut && n > available) {
      setError(`Cannot remove ${n} units — only ${available} available (excluding reserved stock).`); return
    }
    setLoading(true)
    const delta = isOut ? -n : n
    const { error: err } = await supabase.rpc('update_inventory_quantity', {
      p_inventory_item_id: item.id,
      p_quantity_change:   delta,
      p_movement_type:     movType,
      p_notes:             notes || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Adjust stock quantity" subtitle="All movements are logged to the inventory audit trail" onClose={onClose} size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" form="adj-form" type="submit" disabled={loading}>
          {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }}/> Saving…</> : 'Save movement'}
        </button>
      </>}
    >
      <ContextCard title={item.medicines?.generic_name} meta={`Batch ${item.batch_number} · ${fmtNumber(available)} units available`} />
      <InlineError message={error} />
      <form id="adj-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Movement type *</label>
          <CustomSelect
            value={movType}
            onChange={setMovType}
            options={MOVEMENT_TYPES}
          />
        </div>
        <div className="field">
          <label>Quantity *</label>
          <input type="number" required min={1} value={qty} onChange={e => setQty(e.target.value)} placeholder={isOut ? 'Units going out' : 'Units coming in'} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reference or reason for this movement" />
        </div>
      </form>
    </Modal>
  )
}

function ExpireModal({ item, onClose, onSuccess }) {
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const available = item.quantity_available - item.quantity_reserved

  async function handleConfirm() {
    setLoading(true); setError(null)
    if (available > 0) {
      const { error: adjErr } = await supabase.rpc('update_inventory_quantity', {
        p_inventory_item_id: item.id,
        p_quantity_change:   -available,
        p_movement_type:     'expired_removal',
        p_notes:             notes || `Expired batch removed on ${new Date().toISOString().slice(0, 10)}`,
      })
      if (adjErr) { setError(adjErr.message); setLoading(false); return }
    }
    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({ is_active: false })
      .eq('id', item.id)
    if (updateErr) { setError(updateErr.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal
      title="Remove expired stock"
      subtitle="The batch will be logged as an expired removal and removed from the network"
      onClose={onClose}
      size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn"
          style={{ background: 'var(--danger)', color: '#fff' }}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#fff' }}/> Removing…</> : 'Confirm expired removal'}
        </button>
      </>}
    >
      <ContextCard
        title={item.medicines?.generic_name}
        meta={`Batch ${item.batch_number} · Expires ${fmtDate(item.expiry_date)}`}
      />
      <InlineError message={error} />
      <div className="inline-alert alert-warning" style={{ fontSize: 12 }}>
        <span className="inline-alert-icon">⚠</span>
        <div>
          This will log an <strong>expired removal</strong> of <strong>{fmtNumber(available)} units</strong> and
          deactivate the batch from the medicine availability network. The movement is recorded in the audit trail.
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional: reason or reference for this removal"
        />
      </div>
    </Modal>
  )
}

function EditModal({ item, isAdmin, suppliers, currency, onClose, onSuccess }) {
  const [f, setF] = useState({
    brand_name:        item.brand_name       ?? '',
    reorder_level:     item.reorder_level,
    expiry_date:       item.expiry_date,
    manufacture_date:  item.manufacture_date ?? '',
    supplier_id:       item.supplier_id      ?? '',
    storage_condition: item.storage_condition,
    storage_location:  item.storage_location ?? '',
    notes:             item.notes            ?? '',
    is_active:         item.is_active,
    unit_cost:         item.unit_cost        ?? '',
    selling_price:     item.selling_price    ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setLoading(true)
    const payload = {
      brand_name:       f.brand_name       || null,
      reorder_level:    Number(f.reorder_level),
      expiry_date:      f.expiry_date,
      manufacture_date: f.manufacture_date || null,
      supplier_id:      f.supplier_id      || null,
      storage_condition:f.storage_condition,
      storage_location: f.storage_location || null,
      notes:            f.notes            || null,
      is_active:        f.is_active,
      ...(isAdmin ? {
        unit_cost:    f.unit_cost    ? Number(f.unit_cost)    : null,
        selling_price:f.selling_price? Number(f.selling_price): null,
      } : {}),
    }
    const { error: err } = await supabase.from('inventory_items').update(payload).eq('id', item.id)
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Edit batch details" subtitle="Medicine identity and batch number cannot be changed after creation" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" form="edit-form" type="submit" disabled={loading}>
          {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }}/> Saving…</> : 'Save changes'}
        </button>
      </>}
    >
      <InlineError message={error} />
      <form id="edit-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid-2">
          <div className="field"><label>Brand name</label><input value={f.brand_name} onChange={e => set('brand_name', e.target.value)} /></div>
          <div className="field"><label>Supplier</label>
            <CustomSelect
              value={f.supplier_id}
              onChange={v => set('supplier_id', v)}
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
            />
          </div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Expiry date</label><input type="date" value={f.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></div>
          <div className="field"><label>Reorder level</label><input type="number" min={0} value={f.reorder_level} onChange={e => set('reorder_level', e.target.value)} /></div>
        </div>
        {isAdmin && (
          <div className="grid-2">
            <div className="field"><label>Unit cost ({currency})</label><input type="number" min={0} step="0.01" value={f.unit_cost} onChange={e => set('unit_cost', e.target.value)} /></div>
            <div className="field"><label>Selling price ({currency})</label><input type="number" min={0} step="0.01" value={f.selling_price} onChange={e => set('selling_price', e.target.value)} /></div>
          </div>
        )}
        <div className="field"><label>Storage location</label><input value={f.storage_location} onChange={e => set('storage_location', e.target.value)} placeholder="Shelf, room, etc." /></div>
        <div className="field"><label>Notes</label><textarea value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <label className="checkbox-row">
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} />
          <span>Batch is active and visible in the medicine network</span>
        </label>
      </form>
    </Modal>
  )
}
