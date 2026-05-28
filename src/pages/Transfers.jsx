import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import {
  fmtDate, fmtRelative, fmtNumber,
  transferStatusClass, transferStatusLabel, urgencyClass,
} from '../utils/formatters'
import { Modal, InlineError, EmptyState, Badge, SpinnerCenter, TransferPipeline, ContextCard, CustomSelect } from '../components/shared'
import UnverifiedGate from '../components/shared/UnverifiedGate'

const TABS = [
  { key: 'all',      label: 'All requests' },
  { key: 'incoming', label: 'Incoming'     },
  { key: 'outgoing', label: 'Outgoing'     },
  { key: 'active',   label: 'Active'       },
]

export default function TransfersPage() {
  const { facilityId, facility } = useFacility()
  const location                 = useLocation()
  const prefill                  = location.state?.prefill ?? null
  const [transfers, setTransfers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('all')
  const [newOpen,   setNewOpen]   = useState(!!prefill)
  const [action,    setAction]    = useState(null)

  useEffect(() => { if (facilityId) load() }, [facilityId, tab])

  if (facility && !facility.is_verified) {
    return <UnverifiedGate page="Redistribution" reason="Stock transfers are restricted to verified facilities. Verification ensures all parties in a transfer are legitimate healthcare providers." />
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('transfer_requests')
      .select(`id,status,urgency,quantity_requested,quantity_approved,quantity_fulfilled,reason,notes,created_at,fulfilled_at,receipt_confirmed,
        medicine_id,
        medicines(generic_name,strength),
        requesting:requesting_facility_id(id,name,city,phone),
        supplying:supplying_facility_id(id,name,city,phone)`)
      .or(`requesting_facility_id.eq.${facilityId},supplying_facility_id.eq.${facilityId}`)
      .order('created_at', { ascending: false })
    if (tab === 'incoming') q = q.eq('supplying_facility_id', facilityId)
    if (tab === 'outgoing') q = q.eq('requesting_facility_id', facilityId)
    if (tab === 'active')   q = q.in('status', ['pending','approved','in_transit'])
    const { data } = await q
    setTransfers(data ?? [])
    setLoading(false)
  }

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">Supply Network · Redistribution</div>
          <div className="page-title">Stock Redistribution</div>
          <div className="page-subtitle">
            Prevent stockouts by coordinating medicine transfers across the facility network
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ Request stock</button>
        </div>
      </div>

      {/* Framing banner — hidden on mobile to get content above fold */}
      <div className="transfers-howto card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { icon: '🔍', label: 'Find supply', desc: 'Search the network for available medicines from trusted facilities nearby.' },
          { icon: '↔', label: 'Request transfer', desc: 'Submit a stock request. The supplying facility reviews and approves.' },
          { icon: '⚡', label: 'Prevent stockout', desc: 'Receive approved stock before patients are affected by shortages.' },
          { icon: '♻', label: 'Redistribute surplus', desc: 'Offer near-expiry stock to other facilities rather than wasting it.' },
        ].map(step => (
          <div key={step.label} style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{step.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{step.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="filter-chips" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`chip ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <SpinnerCenter /> : transfers.length === 0 ? (
        <EmptyState
          title="No redistribution requests"
          description="Search the medicine network to find trusted supply nearby, or create a request when your facility faces a shortage risk."
          actions={<button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>Request stock</button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {transfers.map(t => (
            <TransferCard
              key={t.id}
              transfer={t}
              facilityId={facilityId}
              onAction={act => setAction({ type: act, transfer: t })}
            />
          ))}
        </div>
      )}

      {newOpen && (
        <NewTransferModal
          facilityId={facilityId}
          prefill={prefill}
          onClose={() => setNewOpen(false)}
          onSuccess={() => { setNewOpen(false); load() }}
        />
      )}

      {action && (
        <ActionModal
          action={action}
          facilityId={facilityId}
          onClose={() => setAction(null)}
          onSuccess={() => { setAction(null); load() }}
        />
      )}
    </div>
  )
}

function TransferCard({ transfer: t, facilityId, onAction }) {
  const isRequesting = t.requesting?.id === facilityId
  const isSupplying  = t.supplying?.id  === facilityId

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge className={transferStatusClass(t.status)} dot>{transferStatusLabel(t.status)}</Badge>
          {t.urgency !== 'routine' && <Badge className={urgencyClass(t.urgency)}>{t.urgency}</Badge>}
          {isRequesting && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', padding: '1px 6px' }}>Outgoing</span>}
          {isSupplying  && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', padding: '1px 6px' }}>Incoming</span>}
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fmtRelative(t.created_at)}</span>
        </div>
        <TransferPipeline status={t.status} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t.medicines?.generic_name} · {t.medicines?.strength}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>
            <span style={{ color: 'var(--text-disabled)' }}>From </span>
            <strong style={{ color: 'var(--text-secondary)' }}>{t.supplying?.name}</strong>
            {/* Show supplier phone to the requester so they can contact */}
            {isRequesting && t.supplying?.phone && (
              <a href={`tel:${t.supplying.phone}`}
                style={{ marginLeft: 8, fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                {t.supplying.phone}
              </a>
            )}
          </span>
          <span style={{ color: 'var(--text-disabled)' }}>→</span>
          <span>
            <span style={{ color: 'var(--text-disabled)' }}>To </span>
            <strong style={{ color: 'var(--text-secondary)' }}>{t.requesting?.name}</strong>
            {/* Show requester phone to supplier so they can coordinate delivery */}
            {isSupplying && t.requesting?.phone && (
              <a href={`tel:${t.requesting.phone}`}
                style={{ marginLeft: 8, fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                {t.requesting.phone}
              </a>
            )}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, fontSize: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--text-muted)' }}>Requested </span><strong style={{ fontFamily: 'var(--font-mono)' }}>{fmtNumber(t.quantity_requested)}</strong></span>
        {t.quantity_approved  && <span><span style={{ color: 'var(--text-muted)' }}>Approved </span><strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{fmtNumber(t.quantity_approved)}</strong></span>}
        {t.quantity_fulfilled && <span><span style={{ color: 'var(--text-muted)' }}>Fulfilled </span><strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{fmtNumber(t.quantity_fulfilled)}</strong></span>}
      </div>

      {t.reason && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, fontStyle: 'italic' }}>"{t.reason}"</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Supplying facility actions */}
        {isSupplying && t.status === 'pending' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => onAction('approve')}>Approve transfer</button>
            <button className="btn btn-danger btn-sm"  onClick={() => onAction('reject')}>Decline</button>
          </>
        )}
        {isSupplying && t.status === 'approved' && (
          <button className="btn btn-primary btn-sm" onClick={() => onAction('in_transit')}>Mark dispatched →</button>
        )}
        {isSupplying && t.status === 'in_transit' && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '6px 0' }}>
            Stock dispatched — waiting for receiving facility to confirm receipt
          </div>
        )}

        {/* Requesting facility actions */}
        {isRequesting && ['pending','approved'].includes(t.status) && (
          <button className="btn btn-ghost btn-sm" onClick={() => onAction('cancel')}>Cancel request</button>
        )}

        {/* Requesting facility: confirm receipt when stock is in transit — this adds stock to inventory */}
        {isRequesting && t.status === 'in_transit' && (
          <div className="tr-action-panel tr-action-panel-primary">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 3 }}>
              📦 Has the stock arrived?
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Confirm when the stock physically arrives. This will add it to your inventory.
            </div>
            <div className="tr-action-btns">
              <button className="btn btn-primary btn-sm" onClick={() => onAction('fulfill')}>
                ✓ Stock received — add to inventory
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onAction('cancel')}>
                Cancel request
              </button>
            </div>
          </div>
        )}

        {/* Requesting facility: legacy receipt confirmation for already-fulfilled transfers */}
        {isRequesting && t.status === 'fulfilled' && !t.receipt_confirmed && (() => {
          const fulfilledAt  = t.fulfilled_at ? new Date(t.fulfilled_at) : null
          const hoursLeft    = fulfilledAt ? Math.max(0, 48 - Math.floor((Date.now() - fulfilledAt) / 3600000)) : 48
          const autoCloseIn  = hoursLeft > 0 ? `${hoursLeft}h` : 'soon'
          const autoClosing  = hoursLeft === 0
          return (
            <div className="tr-action-panel">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Did you receive this stock?
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 10 }}>
                {autoClosing
                  ? 'The 48-hour window has passed. This transfer will auto-confirm shortly.'
                  : <>The supplier has marked this as delivered. Confirm receipt or report non-delivery within <strong style={{color:'var(--text-secondary)'}}>{autoCloseIn}</strong>.</>
                }
              </div>
              <div className="tr-action-btns">
                <button className="btn btn-success btn-sm" onClick={() => onAction('confirm_receipt')}>
                  ✓ Confirm receipt
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onAction('dispute')}>
                  Report non-delivery
                </button>
              </div>
            </div>
          )
        })()}

        {isRequesting && t.status === 'fulfilled' && t.receipt_confirmed && (
          <div style={{ fontSize: 11.5, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
            Receipt confirmed
          </div>
        )}
      </div>
    </div>
  )
}

function NewTransferModal({ facilityId, prefill, onClose, onSuccess }) {
  const [medicines,          setMedicines]          = useState([])
  const [supplyingFacilities,setSupplyingFacilities] = useState([])
  const [loadingFacilities,  setLoadingFacilities]  = useState(false)
  const [loading,            setLoading]            = useState(false)
  const [error,              setError]              = useState(null)
  const [duplicateWarning,   setDuplicateWarning]   = useState(false)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const [f, setF] = useState({
    supplying_facility_id: prefill?.supplying_facility_id ?? '',
    medicine_id:           prefill?.medicine_id           ?? '',
    quantity_requested:    '',
    urgency:               'routine',
    reason:                '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from('medicines').select('id,generic_name,strength').eq('is_active', true).order('generic_name')
      .then(({ data }) => setMedicines(data ?? []))
  }, [])

  // When medicine changes, load only facilities that have this medicine in stock
  useEffect(() => {
    if (!f.medicine_id) { setSupplyingFacilities([]); return }
    setLoadingFacilities(true)
    supabase
      .from('medicine_availability_view')
      .select('facility_id,facility_name,facility_type,city,state_province')
      .eq('medicine_id', f.medicine_id)
      .gt('quantity_available', 0)
      .then(({ data }) => {
        // Deduplicate by facility_id, exclude own facility
        const seen = new Set([facilityId])
        const unique = []
        for (const row of (data ?? [])) {
          if (!seen.has(row.facility_id)) {
            seen.add(row.facility_id)
            unique.push({ id: row.facility_id, name: row.facility_name, city: row.city })
          }
        }
        setSupplyingFacilities(unique)
        setLoadingFacilities(false)
      })
  }, [f.medicine_id, facilityId])

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)

    // Duplicate detection: warn if active request already exists for same medicine + supplier
    if (!duplicateConfirmed && f.supplying_facility_id && f.medicine_id) {
      const { data: existing } = await supabase
        .from('transfer_requests')
        .select('id')
        .eq('requesting_facility_id', facilityId)
        .eq('supplying_facility_id',  f.supplying_facility_id)
        .eq('medicine_id',            f.medicine_id)
        .in('status', ['pending','approved','in_transit'])
        .limit(1)
      if (existing?.length > 0) {
        setDuplicateWarning(true)
        return
      }
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('transfer_requests').insert({
      requesting_facility_id: facilityId,
      supplying_facility_id:  f.supplying_facility_id,
      medicine_id:            f.medicine_id,
      quantity_requested:     Number(f.quantity_requested),
      urgency:                f.urgency,
      reason:                 f.reason || null,
      requested_by:           user.id,
      status:                 'pending',
    })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Request stock transfer" subtitle="The supplying facility will be notified and must approve before stock is reserved" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" form="new-tr-form" type="submit" disabled={loading}>
          {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }}/> Submitting…</> : 'Submit request'}
        </button>
      </>}
    >
      {prefill && (
        <div className="inline-alert alert-info">
          <span className="inline-alert-icon">ℹ</span>
          <span>
            {prefill.supplying_name
              ? <>Requesting from <strong>{prefill.supplying_name}</strong></>
              : prefill.medicine_name
                ? <>Finding stock for <strong>{prefill.medicine_name}</strong> — select a facility below</>
                : 'Select the medicine and a supplying facility'}
          </span>
        </div>
      )}
      {duplicateWarning && (
        <div className="inline-alert alert-warning">
          <span className="inline-alert-icon">⚠</span>
          <div>
            <strong>Possible duplicate:</strong> You already have an active request for this medicine from this facility.
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-warning btn-sm"
                onClick={() => { setDuplicateConfirmed(true); setDuplicateWarning(false) }}>
                Submit anyway — it's intentional
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDuplicateWarning(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <InlineError message={error} />
      <form id="new-tr-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Medicine first so facility dropdown can filter by it */}
        <div className="field">
          <label>Medicine *</label>
          <CustomSelect
            value={f.medicine_id}
            onChange={v => { set('medicine_id', v); set('supplying_facility_id', '') }}
            placeholder="Select medicine…"
            options={medicines.map(m => ({ value: m.id, label: `${m.generic_name} · ${m.strength}` }))}
            searchable
          />
        </div>

        <div className="field">
          <label>Supplying facility *</label>
          {!f.medicine_id ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '8px 0' }}>
              Select a medicine first to see which facilities have it in stock.
            </div>
          ) : loadingFacilities ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '8px 0' }}>
              Loading facilities with available stock…
            </div>
          ) : supplyingFacilities.length === 0 ? (
            <div className="inline-alert alert-warning">
              <span className="inline-alert-icon">⚠</span>
              <span>No other facilities in the network currently have this medicine available. Try the Medicine Network search for alternatives.</span>
            </div>
          ) : (
            <CustomSelect
              value={f.supplying_facility_id}
              onChange={v => set('supplying_facility_id', v)}
              placeholder="Select facility…"
              options={supplyingFacilities.map(x => ({ value: x.id, label: `${x.name} — ${x.city}` }))}
              searchable={supplyingFacilities.length > 5}
            />
          )}
          <div className="field-hint">Only showing facilities that currently have this medicine in stock</div>
        </div>

        <div className="form-row-2">
          <div className="field">
            <label>Quantity needed *</label>
            <input
              type="number"
              required
              min={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={f.quantity_requested}
              onChange={e => set('quantity_requested', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Urgency</label>
            <CustomSelect
              value={f.urgency}
              onChange={v => set('urgency', v)}
              options={[
                { value: 'routine',  label: 'Routine' },
                { value: 'urgent',   label: 'Urgent — stockout imminent' },
                { value: 'critical', label: 'Critical — patients affected' },
              ]}
            />
          </div>
        </div>
        <div className="field">
          <label>Reason for request</label>
          <textarea value={f.reason} onChange={e => set('reason', e.target.value)}
            placeholder="e.g. Stockout — no supply from distributor for 2 weeks. 40 patients on this medication." />
          <div className="field-hint">A clear reason increases approval rate from supplying facilities</div>
        </div>
      </form>
    </Modal>
  )
}

function ActionModal({ action: { type, transfer }, facilityId, onClose, onSuccess }) {
  const [inventoryItems, setInventoryItems] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  // Pre-populate quantity for 'fulfill' with approved quantity so receiver can just confirm
  const [f,       setF]       = useState({ inventory_item_id: '', quantity: type === 'fulfill' ? String(transfer.quantity_approved || '') : '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (type === 'approve') {
      if (!transfer.medicine_id) {
        setError('Transfer is missing medicine_id — please reload the page and try again.')
        return
      }
      setLoadingBatches(true)
      supabase.from('inventory_items')
        .select('id,batch_number,quantity_available,quantity_reserved,expiry_date')
        .eq('facility_id', facilityId)
        .eq('medicine_id', transfer.medicine_id)
        .eq('is_active', true)
        .then(({ data, error: qErr }) => {
          if (qErr) { setError(qErr.message); setLoadingBatches(false); return }
          const eligible = (data ?? []).filter(i => i.quantity_available - i.quantity_reserved > 0)
          setInventoryItems(eligible)
          setLoadingBatches(false)
        })
    }
  }, [type])

  const TITLES = {
    approve:         'Approve transfer request',
    reject:          'Decline transfer request',
    cancel:          'Cancel transfer request',
    in_transit:      'Mark stock as dispatched',
    fulfill:         'Confirm stock received',
    dispute:         'Report non-delivery',
    confirm_receipt: 'Confirm stock received',
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(null)
    if (type === 'approve' && !f.inventory_item_id) {
      setError('Please select a batch to reserve before approving.')
      return
    }
    setLoading(true)
    let err

    if (type === 'approve') {
      const res = await supabase.rpc('approve_transfer_request', {
        p_request_id:         transfer.id,
        p_quantity_approved:  Number(f.quantity),
        p_inventory_item_id:  f.inventory_item_id,
      })
      err = res.error

    } else if (type === 'reject') {
      const res = await supabase.rpc('reject_transfer_request', { p_request_id: transfer.id, p_notes: f.notes || null })
      err = res.error

    } else if (type === 'cancel') {
      const res = await supabase.rpc('cancel_transfer_request', { p_request_id: transfer.id, p_notes: f.notes || null })
      err = res.error

    } else if (type === 'in_transit') {
      const res = await supabase.rpc('mark_transfer_in_transit', { p_request_id: transfer.id, p_notes: f.notes || null })
      err = res.error

    } else if (type === 'fulfill') {
      // Requesting facility confirms receipt — this calls the RPC which:
      // 1. Validates requesting facility auth
      // 2. Creates/updates an inventory_items row at the requesting facility
      // 3. Inserts a transfer_in movement
      // 4. Sets status = fulfilled + receipt_confirmed = true
      const res = await supabase.rpc('fulfill_transfer_request', {
        p_request_id:         transfer.id,
        p_quantity_fulfilled: Number(f.quantity),
        p_notes:              f.notes || null,
      })
      err = res.error

    } else if (type === 'confirm_receipt') {
      // Legacy path: transfer was fulfilled by supplier-side action (older flow)
      // but inventory was not added. Add stock directly as compensation.
      const qty = transfer.quantity_fulfilled || transfer.quantity_approved
      if (qty && transfer.medicine_id) {
        await supabase.from('inventory_items').insert({
          facility_id:       facilityId,
          medicine_id:       transfer.medicine_id,
          batch_number:      'TRANSFER-' + new Date().toISOString().slice(0,10).replace(/-/g,''),
          quantity_available: qty,
          dispensing_unit:   'tablet',
          is_active:         true,
          network_suppressed: false,
        })
        // Insert a movement record for audit trail
        // (ignore errors — the main action is the receipt_confirmed update)
      }
      const res = await supabase
        .from('transfer_requests')
        .update({ receipt_confirmed: true })
        .eq('id', transfer.id)
      err = res.error

    } else if (type === 'dispute') {
      const res = await supabase
        .from('transfer_requests')
        .update({ status: 'disputed', notes: f.notes || 'Requesting facility reports stock was not received.' })
        .eq('id', transfer.id)
      err = res.error
    }

    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  const BTN = {
    approve:         { label: 'Approve transfer',      cls: 'btn-primary'   },
    reject:          { label: 'Decline request',        cls: 'btn-danger'    },
    cancel:          { label: 'Cancel request',         cls: 'btn-danger'    },
    in_transit:      { label: 'Mark dispatched',        cls: 'btn-secondary' },
    fulfill:         { label: 'Add to my inventory',    cls: 'btn-primary'   },
    dispute:         { label: 'Report non-delivery',    cls: 'btn-danger'    },
    confirm_receipt: { label: 'Confirm receipt',        cls: 'btn-success'   },
  }

  return (
    <Modal title={TITLES[type]} onClose={onClose} size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Back</button>
        <button
          className={`btn ${BTN[type].cls}`}
          form="action-form"
          type="submit"
          disabled={loading || (type === 'approve' && (loadingBatches || !f.inventory_item_id || inventoryItems.length === 0))}
        >
          {loading ? <><div className="spinner spinner-sm"/> Processing…</> : BTN[type].label}
        </button>
      </>}
    >
      <ContextCard
        title={`${transfer.medicines?.generic_name} · ${transfer.medicines?.strength}`}
        meta={`Requested: ${fmtNumber(transfer.quantity_requested)} units${transfer.quantity_approved ? ` · Approved: ${fmtNumber(transfer.quantity_approved)}` : ''}`}
      />
      <InlineError message={error} />

      {type === 'fulfill' && (
        <div className="inline-alert alert-info">
          <span className="inline-alert-icon">ℹ</span>
          <span>
            Confirming receipt will add the stock to your inventory and close the transfer.
            Contact <strong>{transfer.supplying?.name}</strong>
            {transfer.supplying?.phone && <> at <a href={`tel:${transfer.supplying.phone}`} style={{ color: 'var(--primary)' }}>{transfer.supplying.phone}</a></>}
            {' '}if you have questions.
          </span>
        </div>
      )}
      {type === 'confirm_receipt' && (
        <div className="inline-alert alert-info">
          <span className="inline-alert-icon">ℹ</span>
          <span>Confirming receipt from <strong>{transfer.supplying?.name}</strong>. Stock will be added to your inventory.</span>
        </div>
      )}
      {type === 'in_transit' && (
        <div className="inline-alert alert-info">
          <span className="inline-alert-icon">ℹ</span>
          <span>
            Contact <strong>{transfer.requesting?.name}</strong>
            {transfer.requesting?.phone && <> at <a href={`tel:${transfer.requesting.phone}`} style={{ color: 'var(--primary)' }}>{transfer.requesting.phone}</a></>}
            {' '}to coordinate handoff.
          </span>
        </div>
      )}

      <form id="action-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {type === 'approve' && (
          <>
            <div className="field">
              <label>Select batch to reserve *</label>
              {loadingBatches ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading eligible batches…</div>
              ) : inventoryItems.length === 0 ? (
                <div className="inline-alert alert-warning">
                  <span className="inline-alert-icon">⚠</span>
                  <span>No eligible inventory available for this medicine at your facility. Add stock in Inventory before approving.</span>
                </div>
              ) : (
                <CustomSelect
                  value={f.inventory_item_id}
                  onChange={v => setF(p => ({ ...p, inventory_item_id: v }))}
                  placeholder="Choose batch…"
                  options={inventoryItems.map(i => ({
                    value: i.id,
                    label: `Batch ${i.batch_number} · ${fmtNumber(i.quantity_available - i.quantity_reserved)} available · exp ${fmtDate(i.expiry_date)}`,
                  }))}
                />
              )}
            </div>
            <div className="field">
              <label>Quantity to approve *</label>
              <input type="number" required min={1} max={transfer.quantity_requested}
                inputMode="numeric" pattern="[0-9]*"
                value={f.quantity} onChange={e => setF(p => ({ ...p, quantity: e.target.value }))} />
              <div className="field-hint">Max: {transfer.quantity_requested} units requested</div>
            </div>
          </>
        )}

        {type === 'fulfill' && (
          <div className="field">
            <label>Quantity actually received *</label>
            <input type="number" required min={1} max={transfer.quantity_approved}
              inputMode="numeric" pattern="[0-9]*"
              value={f.quantity} onChange={e => setF(p => ({ ...p, quantity: e.target.value }))} />
            <div className="field-hint">
              Approved: {fmtNumber(transfer.quantity_approved)} units — adjust down if partial delivery
            </div>
          </div>
        )}

        {['reject','cancel','in_transit','dispute','fulfill'].includes(type) && (
          <div className="field">
            <label>Notes {type === 'reject' ? '(reason) *' : '(optional)'}</label>
            <textarea value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
              placeholder={type === 'reject' ? 'Explain why this request cannot be fulfilled' : 'Any notes for the other facility'} />
          </div>
        )}
      </form>
    </Modal>
  )
}
