import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { InlineError } from '../components/shared'

const FACILITY_TYPES = [
  { value: 'pharmacy',             label: 'Independent Pharmacy' },
  { value: 'hospital_pharmacy',    label: 'Hospital Pharmacy' },
  { value: 'clinic',               label: 'Clinic' },
  { value: 'primary_health_center',label: 'Primary Health Center' },
  { value: 'wholesaler',           label: 'Wholesaler / Distributor' },
  { value: 'government_store',     label: 'Government Medical Store' },
]

const CURRENCIES = ['NGN','GHS','KES','ZAR','UGX','TZS','ETB','USD']

const STEPS = [
  { key: 'identity',   label: 'Facility Identity' },
  { key: 'location',   label: 'Location' },
  { key: 'operations', label: 'Operations' },
]

export default function OnboardingPage() {
  const { session, refreshFacility } = useAuth()
  const navigate   = useNavigate()
  const [step,     setStep]    = useState(0)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState(null)
  const [form, setForm] = useState({
    name: '', facility_type: 'pharmacy', registration_number: '',
    address_line1: '', city: '', state_province: '', country: 'NG',
    phone: '', email: '',
    default_currency: 'NGN', near_expiry_threshold_days: 90,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function next(e) {
    e.preventDefault()
    setError(null)
    if (step < STEPS.length - 1) { setStep(s => s + 1) }
    else handleSubmit()
  }

  async function handleSubmit() {
    setLoading(true); setError(null)
    const { error: err } = await supabase.from('facilities').insert({
      ...form,
      near_expiry_threshold_days: Number(form.near_expiry_threshold_days),
      created_by: session.user.id,
      is_verified: false,
    })
    if (err) { setError(err.message); setLoading(false); return }
    await refreshFacility()
    navigate('/dashboard')
  }

  return (
    <div className="onboarding-layout">
      <div className="onboarding-card">

        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-brand">
            <div className="onboarding-brand-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#07111f" strokeWidth="2.5" style={{width:14,height:14}}>
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
              </svg>
            </div>
            <span className="onboarding-brand-text">Orela Nigeria</span>
          </div>
          <div className="onboarding-title">Set up your facility</div>
          <div className="onboarding-subtitle">
            Configure your facility profile to start tracking medicine availability, stock risk, and transfers.
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            {STEPS.map((s, i) => (
              <div key={s.key} style={{ flex: 1 }}>
                <div style={{
                  height: 3, borderRadius: 99,
                  background: i <= step ? 'var(--primary)' : 'var(--border)',
                  transition: 'background 0.3s ease',
                }} />
                <div style={{
                  fontSize: 10, marginTop: 4, fontWeight: 600,
                  color: i === step ? 'var(--primary)' : i < step ? 'var(--success)' : 'var(--text-disabled)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {i < step ? '✓ ' : ''}{s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="onboarding-body">
          <InlineError message={error} />

          <form onSubmit={next} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Step 0 — Identity */}
            {step === 0 && (
              <>
                <div className="field">
                  <label>Facility name *</label>
                  <input required placeholder="e.g. Eko Central Pharmacy"
                    value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Facility type *</label>
                    <select required value={form.facility_type} onChange={e => set('facility_type', e.target.value)}>
                      {FACILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Registration number *</label>
                    <input required placeholder="PCN / NAFDAC / PPB"
                      value={form.registration_number} onChange={e => set('registration_number', e.target.value)} />
                    <div className="field-hint">Required for network verification. Unverified facilities are hidden from medicine search results until verified.</div>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Phone</label>
                    <input type="tel" placeholder="+234…"
                      value={form.phone} onChange={e => set('phone', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Facility email</label>
                    <input type="email"
                      value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* Step 1 — Location */}
            {step === 1 && (
              <>
                <div className="field">
                  <label>Street address *</label>
                  <input required placeholder="14 Broad Street"
                    value={form.address_line1} onChange={e => set('address_line1', e.target.value)} />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>City *</label>
                    <input required value={form.city} onChange={e => set('city', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>State / Province *</label>
                    <input required value={form.state_province} onChange={e => set('state_province', e.target.value)} />
                  </div>
                </div>
                <div className="field" style={{ maxWidth: 200 }}>
                  <label>Country code *</label>
                  <input required placeholder="NG" value={form.country} onChange={e => set('country', e.target.value)} />
                  <div className="field-hint">2-letter ISO code, e.g. NG, GH, KE</div>
                </div>
              </>
            )}

            {/* Step 2 — Operations */}
            {step === 2 && (
              <>
                <div className="inline-alert alert-info">
                  <span className="inline-alert-icon">ℹ</span>
                  <span>These settings control how stock alerts and pricing are displayed. You can change them in Settings at any time.</span>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Default currency</label>
                    <select value={form.default_currency} onChange={e => set('default_currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Near-expiry alert (days)</label>
                    <input type="number" min={7} max={365}
                      value={form.near_expiry_threshold_days}
                      onChange={e => set('near_expiry_threshold_days', e.target.value)} />
                    <div className="field-hint">Alert when medicines expire within this many days</div>
                  </div>
                </div>
              </>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              {step > 0
                ? <button type="button" className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
                : <div />
              }
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 140 }}>
                {loading
                  ? <><div className="spinner spinner-sm" style={{borderTopColor:'#07111f'}}/> Creating…</>
                  : step < STEPS.length - 1
                    ? 'Continue →'
                    : 'Create facility →'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
