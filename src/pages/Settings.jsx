import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import { useAuth } from '../hooks/useAuth'
import { InlineError, InlineSuccess, Badge } from '../components/shared'
import { fmtDate } from '../utils/formatters'

const FACILITY_TYPES = [
  { value: 'pharmacy',             label: 'Independent Pharmacy' },
  { value: 'hospital_pharmacy',    label: 'Hospital Pharmacy' },
  { value: 'clinic',               label: 'Clinic' },
  { value: 'primary_health_center',label: 'Primary Health Center' },
  { value: 'wholesaler',           label: 'Wholesaler / Distributor' },
  { value: 'government_store',     label: 'Government Medical Store' },
]
const CURRENCIES = ['NGN','GHS','KES','ZAR','UGX','TZS','ETB','USD']

export default function SettingsPage() {
  const { facility, refreshFacility, profile } = useAuth()
  const { facilityId, isFacilityAdmin: isAdmin } = useFacility()

  const [facTab,  setFacTab]  = useState('profile')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(null)

  // Profile form state
  const [profForm, setProfForm] = useState({ full_name: '', email: '' })
  const [profSaving, setProfSaving] = useState(false)
  const [profError,  setProfError]  = useState(null)
  const [profSuccess,setProfSuccess]= useState(null)

  // Facility form
  const [facForm, setFacForm] = useState(null)

  useEffect(() => {
    if (profile) setProfForm({ full_name: profile.full_name ?? '', email: profile.email ?? '' })
  }, [profile])

  useEffect(() => {
    if (facility) setFacForm({
      name:                     facility.name ?? '',
      facility_type:            facility.facility_type ?? 'pharmacy',
      address_line1:            facility.address_line1 ?? '',
      city:                     facility.city ?? '',
      state_province:           facility.state_province ?? '',
      country:                  facility.country ?? '',
      phone:                    facility.phone ?? '',
      email:                    facility.email ?? '',
      registration_number:      facility.registration_number ?? '',
      default_currency:         facility.default_currency ?? 'NGN',
      near_expiry_threshold_days: facility.near_expiry_threshold_days ?? 90,
    })
  }, [facility])

  async function saveFacility(e) {
    e.preventDefault(); setError(null); setSuccess(null); setSaving(true)
    const { error: err } = await supabase.from('facilities').update({
      ...facForm,
      near_expiry_threshold_days: Number(facForm.near_expiry_threshold_days),
    }).eq('id', facilityId)
    if (err) setError(err.message)
    else { setSuccess('Facility settings saved.'); refreshFacility?.() }
    setSaving(false)
  }

  async function saveProfile(e) {
    e.preventDefault(); setProfError(null); setProfSuccess(null); setProfSaving(true)
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ full_name: profForm.full_name })
      .eq('id', profile.id)
    if (err) setProfError(err.message)
    else setProfSuccess('Profile updated.')
    setProfSaving(false)
  }

  const setF = (k, v) => setFacForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">My Facility · Configuration</div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure your facility network node — identity, visibility, and operational thresholds</div>
        </div>
      </div>

      <div className="settings-layout">
        {/* Left nav */}
        <div className="card card-pad settings-nav-card">
          <div className="settings-nav-inner">
            {[
              { key: 'profile',    label: 'Network Identity' },
              { key: 'operations', label: 'Network Settings' },
              { key: 'account',    label: 'My Account' },
              { key: 'danger',     label: 'Danger Zone' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFacTab(t.key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 9px', borderRadius: 'var(--r)',
                  fontSize: 12.5, fontWeight: facTab === t.key ? 600 : 400,
                  background: facTab === t.key ? 'var(--primary-dim)' : 'transparent',
                  color: facTab === t.key ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                  transition: 'all var(--t)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {facTab === 'profile' && facForm && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Network Identity</div>
                  <div className="card-subtitle">How your facility appears in the MediChain medicine availability network</div>
                </div>
                {facility?.is_verified
                  ? <Badge className="badge-success" dot>Verified</Badge>
                  : <Badge className="badge-warning" dot>Unverified</Badge>
                }
              </div>
              <div className="card-pad">
                <InlineError message={error} />
                <InlineSuccess message={success} />
                {!isAdmin && (
                  <div className="inline-alert alert-info" style={{ marginBottom: 14 }}>
                    <span className="inline-alert-icon">ℹ</span>
                    <span>Only facility admins can edit these settings.</span>
                  </div>
                )}
                <form onSubmit={saveFacility} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="form-section">
                    <div className="form-section-title">Identity</div>
                    <div className="field">
                      <label>Facility name *</label>
                      <input required value={facForm.name} onChange={e => setF('name', e.target.value)} disabled={!isAdmin} />
                    </div>
                    <div className="grid-2">
                      <div className="field">
                        <label>Facility type</label>
                        <select value={facForm.facility_type} onChange={e => setF('facility_type', e.target.value)} disabled={!isAdmin}>
                          {FACILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Registration number</label>
                        <input value={facForm.registration_number} onChange={e => setF('registration_number', e.target.value)} disabled={!isAdmin} placeholder="PCN / NAFDAC / PPB" />
                      </div>
                    </div>
                  </div>
                  <div className="form-section">
                    <div className="form-section-title">Location</div>
                    <div className="field">
                      <label>Street address</label>
                      <input value={facForm.address_line1} onChange={e => setF('address_line1', e.target.value)} disabled={!isAdmin} />
                    </div>
                    <div className="grid-3">
                      <div className="field"><label>City</label><input value={facForm.city} onChange={e => setF('city', e.target.value)} disabled={!isAdmin} /></div>
                      <div className="field"><label>State / Province</label><input value={facForm.state_province} onChange={e => setF('state_province', e.target.value)} disabled={!isAdmin} /></div>
                      <div className="field"><label>Country</label><input value={facForm.country} onChange={e => setF('country', e.target.value)} disabled={!isAdmin} /></div>
                    </div>
                  </div>
                  <div className="form-section">
                    <div className="form-section-title">Contact</div>
                    <div className="grid-2">
                      <div className="field"><label>Phone</label><input type="tel" value={facForm.phone} onChange={e => setF('phone', e.target.value)} disabled={!isAdmin} /></div>
                      <div className="field"><label>Facility email</label><input type="email" value={facForm.email} onChange={e => setF('email', e.target.value)} disabled={!isAdmin} /></div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }} /> Saving…</> : 'Save network identity'}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {facTab === 'operations' && facForm && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Network Settings</div>
                  <div className="card-subtitle">Stock alert thresholds and currency settings that control how your facility participates in the network</div>
                </div>
              </div>
              <div className="card-pad">
                <InlineError message={error} />
                <InlineSuccess message={success} />
                {!isAdmin && (
                  <div className="inline-alert alert-info" style={{ marginBottom: 14 }}>
                    <span className="inline-alert-icon">ℹ</span>
                    <span>Only facility admins can edit operational settings.</span>
                  </div>
                )}
                <form onSubmit={saveFacility} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="form-section">
                    <div className="form-section-title">Financial</div>
                    <div className="field" style={{ maxWidth: 220 }}>
                      <label>Default currency</label>
                      <select value={facForm.default_currency} onChange={e => setF('default_currency', e.target.value)} disabled={!isAdmin}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="field-hint">Used for pricing displayed in inventory and transfer records</div>
                    </div>
                  </div>
                  <div className="form-section">
                    <div className="form-section-title">Alert Thresholds</div>
                    <div className="field" style={{ maxWidth: 220 }}>
                      <label>Near-expiry threshold (days)</label>
                      <input type="number" min={7} max={365} value={facForm.near_expiry_threshold_days} onChange={e => setF('near_expiry_threshold_days', e.target.value)} disabled={!isAdmin} />
                      <div className="field-hint">
                        Batches expiring within <strong>{facForm.near_expiry_threshold_days}</strong> days will trigger near-expiry alerts
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }} /> Saving…</> : 'Save network settings'}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {facTab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">My Account</div>
                    <div className="card-subtitle">Personal profile information</div>
                  </div>
                </div>
                <div className="card-pad">
                  <InlineError message={profError} />
                  <InlineSuccess message={profSuccess} />
                  <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    <div className="field">
                      <label>Full name</label>
                      <input value={profForm.full_name} onChange={e => setProfForm(f => ({ ...f, full_name: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label>Email address</label>
                      <input value={profForm.email} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                      <div className="field-hint">Email cannot be changed here. Contact support if needed.</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={profSaving}>
                        {profSaving ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }} /> Saving…</> : 'Update profile'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Account info */}
              <div className="card">
                <div className="card-header"><span className="card-title">Account Details</span></div>
                <div className="card-pad">
                  <div className="info-row">
                    <span className="info-row-label">Account created</span>
                    <span className="info-row-value">{fmtDate(profile?.created_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row-label">System role</span>
                    <span className="info-row-value" style={{ textTransform: 'capitalize' }}>{profile?.role?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row-label">Facility role</span>
                    <span className="info-row-value" style={{ textTransform: 'capitalize' }}>{facility?.staffRole?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {facTab === 'danger' && (
            <div className="card" style={{ borderColor: 'var(--danger-border)' }}>
              <div className="card-header" style={{ borderColor: 'var(--danger-border)' }}>
                <div>
                  <div className="card-title" style={{ color: 'var(--danger)' }}>Danger Zone</div>
                  <div className="card-subtitle">Irreversible actions — proceed with caution</div>
                </div>
              </div>
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: 16, padding: '14px 16px',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--r)', flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Deactivate facility</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 400 }}>
                      Deactivating this facility removes it from the medicine availability network. Your facility will no longer appear in network searches and no new transfers can be initiated. All existing data is preserved and the facility can be reactivated by system administrators.
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={!isAdmin}
                    onClick={() => window.alert('Contact support to deactivate your facility.')}
                  >
                    Deactivate facility
                  </button>
                </div>

                {!isAdmin && (
                  <div className="inline-alert alert-info">
                    <span className="inline-alert-icon">ℹ</span>
                    <span>Only facility admins can perform these actions.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
