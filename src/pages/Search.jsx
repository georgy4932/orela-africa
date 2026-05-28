import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import { fmtDate, fmtNumber, facilityTypeLabel } from '../utils/formatters'
import { EmptyState, Badge, CustomSelect, InlineError } from '../components/shared'
import UnverifiedGate from '../components/shared/UnverifiedGate'

const DOSAGE_FORMS = ['','tablet','capsule','syrup','suspension','injection','infusion','cream','ointment','drops','inhaler','suppository','patch','powder','other']

export default function SearchPage() {
  const { facilityId, facility } = useFacility()
  const navigate = useNavigate()
  const [query,    setQuery]    = useState('')
  const [country,  setCountry]  = useState(facility?.country ?? '')
  const [state,    setState]    = useState('')
  const [city,     setCity]     = useState('')
  const [dosage,   setDosage]   = useState('')
  const [results,  setResults]  = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)
  const [error,    setError]    = useState(null)

  if (facility && !facility.is_verified) {
    return <UnverifiedGate page="Medicine Network" reason="Search is restricted to verified facilities to maintain network integrity and protect facility data." />
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim() && !state.trim() && !city.trim()) return
    setLoading(true); setSearched(true); setError(null)

    // Query medicine_availability_view directly — the live view has per-batch
    // rows (quantity_available, expiry_date, brand_names, etc.) not pre-aggregated
    // totals, so the medicine_search RPC which references those aggregated column
    // names fails against the live DB. We aggregate here instead.
    let q = supabase
      .from('medicine_availability_view')
      .select('facility_id,facility_name,facility_type,city,state_province,medicine_id,generic_name,brand_names,dosage_form,strength,dispensing_unit,quantity_available,expiry_date')
      .gt('quantity_available', 0)
      .limit(500)

    if (query.trim())  q = q.ilike('generic_name', `%${query.trim()}%`)
    if (state.trim())  q = q.ilike('state_province', `%${state.trim()}%`)
    if (city.trim())   q = q.ilike('city', `%${city.trim()}%`)
    if (dosage)        q = q.eq('dosage_form', dosage)

    const { data, error: viewErr } = await q
    if (viewErr) { setError(viewErr.message); setResults([]); setLoading(false); return }

    // Aggregate per-batch rows → one row per (facility × medicine)
    // to match the shape ResultTable expects: total_available, batch_count,
    // earliest_expiry_date, brand_name, facility_is_verified
    const byKey = {}
    for (const row of (data ?? [])) {
      const key = `${row.facility_id}:${row.medicine_id}`
      if (!byKey[key]) {
        byKey[key] = {
          facility_id:          row.facility_id,
          facility_name:        row.facility_name,
          facility_type:        row.facility_type,
          city:                 row.city,
          state_province:       row.state_province,
          medicine_id:          row.medicine_id,
          generic_name:         row.generic_name,
          // brand_names may be text[] or text; normalise to a display string
          brand_name:           Array.isArray(row.brand_names)
                                  ? (row.brand_names[0] ?? null)
                                  : (row.brand_names || null),
          dosage_form:          row.dosage_form,
          strength:             row.strength,
          dispensing_unit:      row.dispensing_unit,
          facility_is_verified: true, // view only surfaces verified facility stock
          total_available:      0,
          batch_count:          0,
          earliest_expiry_date: null,
        }
      }
      byKey[key].total_available += (row.quantity_available ?? 0)
      byKey[key].batch_count     += 1
      if (row.expiry_date) {
        if (!byKey[key].earliest_expiry_date || row.expiry_date < byKey[key].earliest_expiry_date) {
          byKey[key].earliest_expiry_date = row.expiry_date
        }
      }
    }

    setResults(Object.values(byKey).sort((a, b) => b.total_available - a.total_available))
    setLoading(false)
  }

  function requestTransfer(result) {
    navigate('/transfers', {
      state: {
        prefill: {
          medicine_id:           result.medicine_id,
          medicine_name:         result.generic_name,
          supplying_facility_id: result.facility_id,
          supplying_name:        result.facility_name,
        }
      }
    })
  }

  const ownResults   = results?.filter(r => r.facility_id === facilityId) ?? []
  const otherResults = results?.filter(r => r.facility_id !== facilityId) ?? []

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">Supply Network</div>
          <div className="page-title">Medicine Availability Network</div>
          <div className="page-subtitle">
            Search real-time medicine availability across all verified facilities in the network
          </div>
        </div>
      </div>

      {/* Hero search */}
      <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-soft)', padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
            Search the network
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="search-field" style={{ width: '100%' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by medicine name — e.g. Amoxicillin, Artemether, Metformin, ORS…"
                style={{ paddingLeft: 36, fontSize: 14, padding: '10px 14px 10px 36px', borderRadius: 'var(--r-md)' }}
              />
            </div>
            <div className="grid-4">
              <div className="field">
                <label>Country</label>
                <input value={country} onChange={e => setCountry(e.target.value)} placeholder="NG" />
              </div>
              <div className="field">
                <label>State / Province</label>
                <input value={state} onChange={e => setState(e.target.value)} placeholder="Lagos" />
              </div>
              <div className="field">
                <label>City</label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ikeja" />
              </div>
              <div className="field">
                <label>Dosage form</label>
                <CustomSelect
                  value={dosage}
                  onChange={setDosage}
                  options={DOSAGE_FORMS.map(f => ({ value: f, label: f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Any form' }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Only verified facilities appear in search results. Unverified facilities are hidden from the network until their registration is confirmed.
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 160, flexShrink: 0 }}>
                {loading
                  ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }}/> Searching network…</>
                  : 'Search availability'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div style={{ padding: '0 24px 16px' }}>
            <InlineError message={error} />
          </div>
        )}

        {/* Network stats */}
        {!searched && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {[
                { label: 'What this search does', desc: 'Queries real-time medicine availability across all facilities that have published stock to the Orela network.' },
                { label: 'What is shown', desc: 'Available quantity (excluding reserved stock), earliest expiry date, number of batches, and facility verification status.' },
                { label: 'What is protected', desc: 'Supplier details, cost pricing, batch-level data, reserved quantities, and facility contact information are not exposed.' },
              ].map(item => (
                <div key={item.label} style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {searched && !loading && !error && results?.length === 0 && (
        <EmptyState
          title="No availability found"
          description="No facilities in the network have this medicine available in the searched area. Try broadening your location or checking an alternative medicine name."
        />
      )}

      {results && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} found across the network
              {otherResults.length > 0 && (
                <span style={{ color: 'var(--primary)', marginLeft: 8 }}>
                  · {otherResults.length} facilities you can request from
                </span>
              )}
            </div>
          </div>

          {ownResults.length > 0 && (
            <div className="section-shell">
              <div className="section-shell-header">
                <span className="section-shell-title">Your Facility</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Stock you are contributing to the network</span>
              </div>
              <ResultTable results={ownResults} onRequest={null} />
            </div>
          )}

          {otherResults.length > 0 && (
            <div className="section-shell">
              <div className="section-shell-header">
                <span className="section-shell-title">Available from Network Facilities</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  Request a transfer to prevent stockout at your facility
                </span>
              </div>
              <ResultTable results={otherResults} onRequest={requestTransfer} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultTable({ results, onRequest }) {
  return (
    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
      <table>
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Facility</th>
            <th>Location</th>
            <th>Available</th>
            <th>Earliest Expiry</th>
            <th>Batches</th>
            <th>Trust</th>
            {onRequest && <th></th>}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td>
                <div className="td-primary">{r.generic_name}</div>
                <div className="td-muted">{r.brand_name ? `${r.brand_name} · ` : ''}{r.strength} {r.dosage_form}</div>
              </td>
              <td>
                <div className="td-primary truncate" style={{ maxWidth: 160 }}>{r.facility_name}</div>
                <div className="td-muted">{facilityTypeLabel(r.facility_type)}</div>
              </td>
              <td className="td-muted">{r.city}, {r.state_province}</td>
              <td>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--primary)' }}>
                  {fmtNumber(r.total_available)}
                </span>
                <div className="td-muted">
                  {r.dispensing_unit ? `${r.dispensing_unit}s` : 'units'} available
                </div>
              </td>
              <td className="td-muted">{fmtDate(r.earliest_expiry_date)}</td>
              <td><span className="pill">{r.batch_count}</span></td>
              <td>
                {r.facility_is_verified
                  ? <Badge className="badge-success" dot>Verified</Badge>
                  : <Badge className="badge-neutral">Unverified</Badge>
                }
              </td>
              {onRequest && (
                <td>
                  <button className="btn btn-primary btn-sm" onClick={() => onRequest(r)}>
                    Request stock →
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
