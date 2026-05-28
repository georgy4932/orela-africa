import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFacility } from '../hooks/useFacility'
import { useAuth } from '../hooks/useAuth'
import { fmtDate, fmtRelative, initials } from '../utils/formatters'
import { Modal, InlineError, EmptyState, Badge, SpinnerCenter, CustomSelect } from '../components/shared'

const ROLE_META = {
  pharmacist:      { label: 'Pharmacist',      badge: 'badge-primary', desc: 'Can manage inventory and view transfers' },
  pharmacy_tech:   { label: 'Pharmacy Tech',   badge: 'badge-info',    desc: 'Can view inventory and log movements' },
  facility_admin:  { label: 'Facility Admin',  badge: 'badge-warning', desc: 'Full access including staff management and pricing' },
}

export default function StaffPage() {
  const { facilityId, isFacilityAdmin: isAdmin } = useFacility()
  const { profile: currentUser } = useAuth()
  const [staff,    setStaff]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => { if (facilityId) load() }, [facilityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('facility_staff')
      .select('*, user_profiles(id, full_name, email, role, created_at)')
      .eq('facility_id', facilityId)
      .order('joined_at', { ascending: true })
    setStaff(data ?? [])
    setLoading(false)
  }

  async function toggleActive(member) {
    if (!isAdmin) return
    if (member.user_profiles?.id === currentUser?.id) return // can't deactivate self
    await supabase.from('facility_staff').update({ is_active: !member.is_active }).eq('id', member.id)
    load()
  }

  async function changeRole(memberId, newRole) {
    if (!isAdmin) return
    await supabase.from('facility_staff').update({ role: newRole }).eq('id', memberId)
    load()
  }

  const activeStaff   = staff.filter(s => s.is_active)
  const inactiveStaff = staff.filter(s => !s.is_active)

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">My Facility · Team</div>
          <div className="page-title">Staff</div>
          <div className="page-subtitle">
            {activeStaff.length} active team member{activeStaff.length !== 1 ? 's' : ''} · manage access to this network node
          </div>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              + Invite staff
            </button>
          )}
        </div>
      </div>

      {loading ? <SpinnerCenter /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Role reference */}
          <div className="card" style={{ marginBottom: 2 }}>
            <div className="card-header">
              <span className="card-title">Role Permissions</span>
            </div>
            <div className="card-pad" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Object.entries(ROLE_META).map(([role, meta]) => (
                <div key={role} style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge className={meta.badge}>{meta.label}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{meta.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active staff */}
          {activeStaff.length === 0 ? (
            <EmptyState
              title="No staff members"
              description="Add team members to manage inventory, monitor shortage signals, and coordinate stock redistribution at this facility."
              actions={isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>Invite staff</button>}
            />
          ) : (
            <div className="section-shell">
              <div className="section-shell-header">
                <span className="section-shell-title">Active</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{activeStaff.length} member{activeStaff.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Joined</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {activeStaff.map(member => (
                      <StaffRow
                        key={member.id}
                        member={member}
                        isAdmin={isAdmin}
                        isSelf={member.user_profiles?.id === currentUser?.id}
                        onToggle={() => toggleActive(member)}
                        onRoleChange={r => changeRole(member.id, r)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inactive staff */}
          {inactiveStaff.length > 0 && (
            <div className="section-shell" style={{ opacity: 0.7 }}>
              <div className="section-shell-header">
                <span className="section-shell-title">Deactivated</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{inactiveStaff.length}</span>
              </div>
              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Joined</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveStaff.map(member => (
                      <StaffRow
                        key={member.id}
                        member={member}
                        isAdmin={isAdmin}
                        isSelf={false}
                        onToggle={() => toggleActive(member)}
                        onRoleChange={r => changeRole(member.id, r)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {inviteOpen && (
        <InviteModal
          facilityId={facilityId}
          onClose={() => setInviteOpen(false)}
          onSuccess={() => { setInviteOpen(false); load() }}
        />
      )}
    </div>
  )
}

function StaffRow({ member, isAdmin, isSelf, onToggle, onRoleChange }) {
  const p = member.user_profiles
  const roleMeta = ROLE_META[member.role] ?? { label: member.role, badge: 'badge-neutral' }

  return (
    <tr style={{ opacity: member.is_active ? 1 : 0.5 }}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--primary)', flexShrink: 0,
          }}>
            {initials(p?.full_name ?? '?')}
          </div>
          <div>
            <div className="td-primary">{p?.full_name ?? '—'}</div>
            <div className="td-muted">{p?.email}</div>
          </div>
        </div>
        {isSelf && (
          <span style={{ fontSize: 9.5, color: 'var(--primary)', marginLeft: 37, fontWeight: 600 }}>You</span>
        )}
      </td>
      <td>
        {isAdmin && !isSelf ? (
          <CustomSelect
            value={member.role}
            onChange={onRoleChange}
            options={Object.entries(ROLE_META).map(([r, m]) => ({ value: r, label: m.label }))}
            style={{ minWidth: 130 }}
          />
        ) : (
          <Badge className={roleMeta.badge}>{roleMeta.label}</Badge>
        )}
      </td>
      <td className="td-muted">{fmtDate(member.joined_at)}</td>
      {isAdmin && (
        <td>
          {!isSelf && (
            <button
              className={`btn btn-xs ${member.is_active ? 'btn-ghost' : 'btn-success'}`}
              onClick={onToggle}
            >
              {member.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
          )}
        </td>
      )}
    </tr>
  )
}

/* ── INVITE MODAL ── */
function InviteModal({ facilityId, onClose, onSuccess }) {
  const [email,   setEmail]   = useState('')
  const [role,    setRole]    = useState('pharmacist')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setLoading(true)

    // Look up user by email in user_profiles
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .limit(1)

    if (!users || users.length === 0) {
      setError('No account found with that email. They must create a Orela account first.')
      setLoading(false); return
    }

    const userId = users[0].id

    // Check not already staff
    const { data: existing } = await supabase
      .from('facility_staff')
      .select('id, is_active')
      .eq('facility_id', facilityId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      if (existing.is_active) {
        setError('This person is already an active staff member.')
        setLoading(false); return
      }
      // Reactivate
      await supabase.from('facility_staff').update({ is_active: true, role }).eq('id', existing.id)
    } else {
      const { error: err } = await supabase.from('facility_staff').insert({
        facility_id: facilityId,
        user_id:     userId,
        role,
        is_active:   true,
      })
      if (err) { setError(err.message); setLoading(false); return }
    }
    onSuccess()
  }

  return (
    <Modal
      title="Add staff member"
      subtitle="The person must already have a Orela account"
      onClose={onClose}
      size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" form="invite-form" type="submit" disabled={loading}>
          {loading ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#07111f' }} /> Adding…</> : 'Add to facility'}
        </button>
      </>}
    >
      <InlineError message={error} />
      <form id="invite-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div className="field">
          <label>Email address *</label>
          <input
            type="email" required
            placeholder="colleague@facility.org"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <div className="field-hint">Must match their registered account email exactly</div>
        </div>
        <div className="field">
          <label>Role *</label>
          <CustomSelect
            value={role}
            onChange={setRole}
            options={Object.entries(ROLE_META).map(([r, m]) => ({ value: r, label: `${m.label} — ${m.desc}` }))}
          />
        </div>
      </form>
    </Modal>
  )
}
