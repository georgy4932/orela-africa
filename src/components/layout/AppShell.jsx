import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useFacility } from '../../hooks/useFacility'
import { supabase } from '../../lib/supabase'

export default function AppShell() {
  const { profile, signOut }              = useAuth()
  const { facility, facilityId }          = useFacility()
  const navigate                          = useNavigate()
  const location                          = useLocation()
  const [alertCount,       setAlertCount]       = useState(0)
  const [drugAlertCount,   setDrugAlertCount]   = useState(0)
  const [transferCount, setTransferCount] = useState(0)
  const [mobileOpen,    setMobileOpen]    = useState(false)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!facilityId) return
    supabase.from('stock_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('facility_id', facilityId).eq('status', 'active')
      .then(({ count }) => setAlertCount(count ?? 0))
    supabase.from('transfer_requests')
      .select('id', { count: 'exact', head: true })
      .or(`requesting_facility_id.eq.${facilityId},supplying_facility_id.eq.${facilityId}`)
      .in('status', ['pending', 'approved', 'in_transit'])
      .then(({ count }) => setTransferCount(count ?? 0))
    supabase.from('alert_facility_responses')
      .select('id', { count: 'exact', head: true })
      .eq('facility_id', facilityId).eq('response_status', 'pending')
      .then(({ count }) => setDrugAlertCount(count ?? 0))
  }, [facilityId])

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  const staffRole = facility?.staffRole ?? profile?.role ?? ''
  const roleLabel = staffRole.replace(/_/g, ' ')

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-product-eyebrow">Orela Nigeria</div>
        <div className="sidebar-product-name">Supply Network</div>
        <div className="sidebar-product-desc">Medicine availability infrastructure</div>
      </div>

      {/* Facility */}
      {facility && (
        <div style={{ padding: '8px 10px 0' }}>
          <div className="sidebar-facility">
            <div className="sidebar-facility-label">Active Facility</div>
            <div className="sidebar-facility-name">{facility.name}</div>
            <div className="sidebar-facility-meta">
              <span className={`fac-dot ${facility.is_verified ? 'fac-dot-verified' : 'fac-dot-unverified'}`} />
              {facility.city}, {facility.country} · {facility.is_verified ? 'Verified' : 'Unverified'}
            </div>
          </div>
        </div>
      )}

      {/* Nav — network-first ordering */}
      <nav className="sidebar-nav">
        <div className="nav-group">
          <span className="nav-group-label">Command Center</span>
          <NavItem to="/dashboard" label="Overview"          icon={<DashIcon />} />
          <NavItem to="/search"    label="Medicine Network"  icon={<NetworkIcon />} />
          <NavItem to="/alerts"        label="Shortage Alerts"   icon={<BellIcon />} badge={alertCount} badgeWarning />
          <NavItem to="/drug-alerts"    label="Drug Safety Alerts" icon={<ShieldIcon />} />
          <NavItem to="/transfers" label="Redistribution"    icon={<ArrowsIcon />} badge={transferCount} />
        </div>
        <div className="nav-group">
          <span className="nav-group-label">My Facility</span>
          <NavItem to="/inventory" label="Inventory"         icon={<BoxIcon />} />
          <NavItem to="/analytics" label="Supply Intelligence" icon={<ChartIcon />} />
          <NavItem to="/staff"     label="Staff"             icon={<UsersIcon />} />
          <NavItem to="/settings"  label="Settings"          icon={<GearIcon />} />
        </div>
      </nav>

      {/* User */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-user-name truncate">{profile?.full_name ?? 'User'}</div>
          <div className="sidebar-user-role">{roleLabel || 'Pharmacist'}</div>
        </div>
        <button className="sidebar-signout" onClick={handleSignOut}>
          <SignOutIcon />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebarContent}</aside>

      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
          <HamburgerIcon />
        </button>
        <div className="mobile-topbar-brand">
          <div className="sidebar-product-eyebrow" style={{ marginBottom: 0 }}>Orela</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {facility?.name ?? 'Supply Network'}
          </div>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="sidebar mobile-drawer">
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' }}>
              <button onClick={() => setMobileOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: 4 }}>
                ×
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      <main className="main-content">
        {drugAlertCount > 0 && (
          <div className="drug-alert-banner">
            <span className="drug-alert-banner-icon">⚠</span>
            <span className="drug-alert-banner-text">
              {drugAlertCount === 1
                ? '1 pending drug safety alert requires your action.'
                : `${drugAlertCount} pending drug safety alerts require your action.`}
            </span>
            <NavLink to="/drug-alerts" className="drug-alert-banner-link">
              Review now →
            </NavLink>
          </div>
        )}
        <div className="page-wrapper fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavItem({ to, label, icon, badge, badgeWarning }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <span className="nav-link-left">
        <span className="nav-link-icon">{icon}</span>
        {label}
      </span>
      {badge > 0 && (
        <span className={`nav-badge ${badgeWarning ? '' : 'nav-badge-neutral'}`}>{badge}</span>
      )}
    </NavLink>
  )
}

const ic = (d, s = {}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 14, height: 14, ...s }}>{d}</svg>
)
const DashIcon     = () => ic(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>)
const NetworkIcon  = () => ic(<><circle cx="12" cy="12" r="3"/><circle cx="3" cy="6" r="2"/><circle cx="21" cy="6" r="2"/><circle cx="3" cy="18" r="2"/><circle cx="21" cy="18" r="2"/><path d="M5 6h4m6 0h4M5 18h4m6 0h4M12 9v2m0 2v2"/></>)
const ShieldIcon   = () => ic(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>)
const BellIcon     = () => ic(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>)
const ArrowsIcon   = () => ic(<><path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/></>)
const BoxIcon      = () => ic(<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>)
const ChartIcon    = () => ic(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>)
const UsersIcon    = () => ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>)
const GearIcon     = () => ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>)
const SignOutIcon  = () => ic(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>, { width: 13, height: 13 })
const HamburgerIcon = () => ic(<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>, { width: 18, height: 18 })
