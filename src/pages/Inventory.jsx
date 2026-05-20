import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import {
  fmtDate, fmtCurrency, fmtNumber,
  expiryBadgeClass, fmtExpiryLabel, daysUntilExpiry,
  stockStatusClass, stockStatusLabel,
} from '../utils/formatters'
import { Modal, InlineError, EmptyState, Badge, SkeletonRow, ContextCard } from '../components/shared'

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
  const videoRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'scanning' | 'error'
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
          if (text) { stopped = true; onScan(text) }
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
        if (!stopped) setStatus('scanning')
      } catch (e) {
        if (stopped) return
        const msg = String(e?.message ?? e)
        if (/permission|denied|not allowed/i.test(msg))
          setErrMsg('Camera permission denied. Allow camera access in browser settings, then try again.')
        else if (/not found|no device|no camera/i.test(msg))
          setErrMsg('No camera found on this device.')
        else
          setErrMsg('Could not start camera. Enter the batch number manually instead.')
        setStatus('error')
      }
    }

    start()
    return () => {
      stopped = true
      try { controls?.stop() } catch (_) {}
    }
  }, [])

  if (status === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
        </svg>
        <div style={{ fontSize: 12.5, color: 'var(--danger)', maxWidth: 280, lineHeight: 1.55 }}>{errMsg}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Enter manually instead</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Camera viewfinder */}
      <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: '4/3', maxHeight: 300 }}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          muted playsInline autoPlay
        />
        {/* Overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.52) 100%)' }} />
          {/* Target rectangle */}
          <div style={{ position: 'relative', width: '78%', height: '42%', border: '2px solid rgba(25,194,181,0.9)', borderRadius: 'var(--r)', zIndex: 1 }}>
            {/* Animated scan line */}
            {status === 'scanning' && (
              <div style={{
                position: 'absolute', left: 4, right: 4, height: 2,
                background: 'linear-gradient(90deg, transparent, var(--primary) 50%, transparent)',
                animation: 'scanLine 2s ease-in-out infinite',
              }} />
            )}
            {/* Corner marks */}
            {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i) => (
              <div key={i} style={{
                position:'absolute', width:12, height:12,
                [r ? 'bottom' : 'top']: -2, [c ? 'right' : 'left']: -2,
                borderColor: 'var(--primary)', borderStyle: 'solid',
                borderTopWidth: r ? 0 : 3, borderBottomWidth: r ? 3 : 0,
                borderLeftWidth: c ? 0 : 3, borderRightWidth: c ? 3 : 0,
                borderRadius: r ? (c ? '0 0 3px 0':'0 0 0 3px') : (c ? '0 3px 0 0':'3px 0 0 0'),
              }}/>
            ))}
          </div>
        </div>
        {status === 'loading' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div className="spinner spinner-lg" />
          </div>
        )}
      </div>
      <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
        {status === 'scanning'
          ? 'Align the barcode inside the frame — it will scan automatically'
          : 'Starting camera…'}
      </p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} style={{ width: '100%' }}>
        Cancel — enter manually
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
  const [items,     setItems]     = useState([])
  const [medicines, setMedicines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const [addOpen,   setAddOpen]   = useState(false)
  const [adjItem,   setAdjItem]   = useState(null)
  const [editItem,  setEditItem]  = useState(null)

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
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setAdjItem(item)}>Adjust</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditItem(item)}>Edit</button>
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
              <div className="inv-card-foot">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {item.batch_number}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => setAdjItem(item)}>Adjust</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditItem(item)}>Edit</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {addOpen  && <AddModal key={Date.now()} facilityId={facilityId} medicines={medicines} suppliers={suppliers} currency={facility?.default_currency} onClose={() => setAddOpen(false)}  onSuccess={() => { setAddOpen(false);  load() }} />}
      {adjItem  && <AdjModal  item={adjItem}  onClose={() => setAdjItem(null)}  onSuccess={() => { setAdjItem(null);  load() }} />}
      {editItem && <EditModal item={editItem} isAdmin={isAdmin} suppliers={suppliers} currency={facility?.default_currency} onClose={() => setEditItem(null)} onSuccess={() => { setEditItem(null); load() }} />}
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
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [entryMode,  setEntryMode]  = useState('manual')   // 'manual' | 'scan'
  const [lastScan,   setLastScan]   = useState(null)        // parsed GS1 result
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

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
    e.preventDefault(); setError(null); setLoading(true)
    const { error: err } = await supabase.rpc('create_inventory_item', {
      p_facility_id:      facilityId,
      p_medicine_id:      f.medicine_id,
      p_batch_number:     f.batch_number,
      p_expiry_date:      f.expiry_date,
      p_quantity:         f.quantity_type === 'packs' && f.pack_size && f.pack_size !== '' && f.pack_size !== 'custom'
                          ? Number(f.quantity) * Number(f.pack_size)
                          : Number(f.quantity),
      p_dispensing_unit:  f.dispensing_unit,
      p_pack_size:        Number(f.pack_size),
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
      <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: 'var(--r-md)', padding: 3, gap: 3 }}>
        {[
          { key: 'manual', label: 'Enter manually', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
          { key: 'scan',   label: 'Scan barcode',  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setEntryMode(key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer', transition: 'all var(--t)',
              background: entryMode === key ? 'var(--bg-elevated)' : 'transparent',
              color: entryMode === key ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: entryMode === key ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Scan mode */}
      {entryMode === 'scan' && (
        <BarcodeScanner onScan={handleScan} onCancel={() => setEntryMode('manual')} />
      )}

      {/* Scan success notice */}
      {entryMode === 'manual' && lastScan && (
        <div className="inline-alert alert-success" style={{ fontSize: 11.5 }}>
          <span className="inline-alert-icon">✓</span>
          <div>
            <strong>Barcode scanned</strong>
            {lastScan.batchNumber && <span> · Batch: <code style={{ fontFamily: 'var(--font-mono)' }}>{lastScan.batchNumber}</code></span>}
            {lastScan.expiryDate  && <span> · Expiry auto-filled</span>}
            {!lastScan.batchNumber && !lastScan.expiryDate && <span> · Raw: <code style={{ fontFamily: 'var(--font-mono)' }}>{lastScan.raw}</code></span>}
            <span style={{ color: 'var(--success)', opacity: 0.75 }}> — select the medicine below</span>
          </div>
        </div>
      )}

      {/* Manual entry form — hidden while scanner is active */}
      <div style={{ display: entryMode === 'scan' ? 'none' : 'contents' }}>
      <InlineError message={error} />
      <form id="add-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="form-section-title">Medicine Identity</div>
          <div className="form-section" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Medicine *</label>
              <MedicineSearch
                medicines={medicines}
                value={f.medicine_id}
                onChange={id => setF(p => ({ ...p, medicine_id: id, nafdac_number: '', pack_size: '', quantity_type: 'units' }))}
              />
            </div>
            {/* NAFDAC validation field */}
            <div className="field">
              <label>NAFDAC registration number</label>
              <input
                value={f.nafdac_number}
                onChange={e => set('nafdac_number', e.target.value)}
                placeholder="e.g. A4-0007"
                style={{fontFamily:'var(--font-mono)', letterSpacing:'0.03em'}}
              />
              {(() => {
                const selected = medicines.find(m => m.id === f.medicine_id)
                if (!selected?.nafdac_reg_number) return (
                  <div className="field-hint">Enter the NAFDAC number from the medicine packaging to verify product identity</div>
                )
                const entered = f.nafdac_number.trim().length > 0
                const matches = f.nafdac_number.trim().toUpperCase() === selected.nafdac_reg_number.toUpperCase()
                if (!entered) return (
                  <div className="field-hint">
                    Expected for {selected.generic_name}:{' '}
                    <strong style={{color:'var(--text-primary)',fontFamily:'var(--font-mono)'}}>{selected.nafdac_reg_number}</strong>
                    {' '}— enter this from the packaging to confirm product identity
                  </div>
                )
                return matches
                  ? <div style={{fontSize:11,color:'var(--success)',marginTop:3}}>✓ Matches catalog — product identity confirmed</div>
                  : <div style={{fontSize:11,color:'var(--warning)',marginTop:3}}>⚠ Does not match the catalog number for {selected.generic_name}. Double-check the packaging.</div>
              })()}
            </div>
            <div className="grid-2">
              <div className="field"><label>Batch number *</label><input required value={f.batch_number} onChange={e => set('batch_number', e.target.value)} placeholder="e.g. BT-2024-001" /></div>
              <div className="field"><label>Brand name</label><input value={f.brand_name} onChange={e => set('brand_name', e.target.value)} placeholder="Optional" /></div>
            </div>
          </div>
        </div>
        <div>
          <div className="form-section-title">Stock & Dates</div>
          <div className="form-section" style={{ marginTop: 12 }}>
            <div className="grid-2">
              <div className="field">
                <label>Initial quantity *</label>
                <div style={{display:'flex', gap:8, alignItems:'flex-start', flexWrap:'wrap'}}>
                  <div style={{flex:1, minWidth:80}}>
                    <input type="number" required min={0} value={f.quantity}
                      onChange={e => set('quantity', e.target.value)}
                      style={{width:'100%'}}
                    />
                  </div>
                  <div style={{minWidth:110}}>
                    <select value={f.quantity_type} onChange={e => {
                      const newType = e.target.value
                      setF(p => ({ ...p, quantity_type: newType, pack_size: '' }))
                    }}>
                      <option value="units">Individual units</option>
                      <option value="packs">Packs</option>
                    </select>
                  </div>
                </div>
                {f.quantity_type === 'packs' && (
                  <div style={{display:'flex', gap:8, alignItems:'center', marginTop:6}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:11,marginBottom:4,display:'block'}}>Pack size</label>
                      {(() => {
                        const selected = medicines.find(m => m.id === f.medicine_id)
                        const sizes = selected?.standard_pack_sizes?.length > 0
                          ? selected.standard_pack_sizes
                          : null
                        return sizes ? (
                          <select value={f.pack_size} onChange={e => set('pack_size', e.target.value)}>
                            <option value="">— Select pack size —</option>
                            {sizes.map(s => (
                              <option key={s} value={s}>{s} {f.dispensing_unit}s per pack</option>
                            ))}
                            <option value="custom">Other (enter manually)</option>
                          </select>
                        ) : (
                          <select value={f.pack_size} onChange={e => set('pack_size', e.target.value)}>
                            <option value="">— Select pack size —</option>
                            {[7,10,14,28,30,56,60,84,100,120,500].map(s => (
                              <option key={s} value={s}>{s} {f.dispensing_unit}s per pack</option>
                            ))}
                            <option value="custom">Other (enter manually)</option>
                          </select>
                        )
                      })()}
                      {String(f.pack_size) === 'custom' && (
                        <input type="number" min={1}
                          style={{marginTop:6, width:'100%'}}
                          placeholder="Enter pack size e.g. 28, 56, 84, 100"
                          onBlur={e => { if (e.target.value) set('pack_size', e.target.value) }}
                          onKeyDown={e => { if (e.key === 'Enter' && e.target.value) set('pack_size', e.target.value) }}
                          autoFocus
                        />
                      )}
                      <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>
                        Check the number of {f.dispensing_unit}s printed on the packaging
                      </div>
                    </div>
                  </div>
                )}
                {f.quantity_type === 'packs' && f.quantity && f.pack_size && f.pack_size !== '' && f.pack_size !== 'custom' && Number(f.pack_size) > 1 && Number(f.quantity) > 0 && (
                  <div style={{marginTop:8, padding:'10px 14px', background:'rgba(25,194,181,0.08)', border:'1px solid rgba(25,194,181,0.2)', borderRadius:'var(--r-md)', fontSize:13, color:'var(--primary)', fontFamily:'var(--font-mono)', fontWeight:700}}>
                    {Number(f.quantity)} packs × {Number(f.pack_size)} {f.dispensing_unit}s = {(Number(f.quantity) * Number(f.pack_size)).toLocaleString()} {f.dispensing_unit}s total
                  </div>
                )}
                <div style={{marginTop:6}}>
                  <label style={{fontSize:11,marginBottom:4,display:'block'}}>Dispensing unit</label>
                  <select value={f.dispensing_unit} onChange={e => set('dispensing_unit', e.target.value)}>
                    <option value="tablet">Tablet</option>
                    <option value="capsule">Capsule</option>
                    <option value="vial">Vial</option>
                    <option value="sachet">Sachet</option>
                    <option value="bottle">Bottle</option>
                    <option value="ampoule">Ampoule</option>
                    <option value="tube">Tube</option>
                    <option value="patch">Patch</option>
                    <option value="unit">Unit</option>
                  </select>
                </div>
                <div className="field-hint">Units received — published to availability network</div>
              </div>
              <div className="field">
                <label>Reorder level</label>
                <input type="number" min={0} value={f.reorder_level} onChange={e => set('reorder_level', e.target.value)} />
                <div className="field-hint">Shortage alert fires below this quantity</div>
              </div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Expiry date *</label><input type="date" required value={f.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></div>
              <div className="field"><label>Manufacture date</label><input type="date" value={f.manufacture_date} onChange={e => set('manufacture_date', e.target.value)} /></div>
            </div>
          </div>
        </div>
        <div>
          <div className="form-section-title">Supply Chain</div>
          <div className="form-section" style={{ marginTop: 12 }}>
            <div className="grid-2">
              <div className="field"><label>Unit cost ({currency})</label><input type="number" min={0} step="0.01" value={f.unit_cost} onChange={e => set('unit_cost', e.target.value)} /></div>
              <div className="field"><label>Selling price ({currency})</label><input type="number" min={0} step="0.01" value={f.selling_price} onChange={e => set('selling_price', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Supplier</label>
                <select value={f.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                  <option value="">None / unknown</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Storage condition</label>
                <select value={f.storage_condition} onChange={e => set('storage_condition', e.target.value)}>
                  {STORAGE_CONDS.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Storage location</label><input value={f.storage_location} onChange={e => set('storage_location', e.target.value)} placeholder="e.g. Shelf B2, Cold Room 1" /></div>
          </div>
        </div>
      </form>
      </div>{/* end manual entry wrapper */}
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
    e.preventDefault(); setError(null); setLoading(true)
    const delta = isOut ? -Math.abs(Number(qty)) : Math.abs(Number(qty))
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
          <select required value={movType} onChange={e => setMovType(e.target.value)}>
            {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
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
            <select value={f.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
              <option value="">None</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
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
