import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useFacility } from '../../hooks/useFacility'
import { supabase } from '../../lib/supabase'

export default function AppShell() {
  const { profile, signOut }            = useAuth()
  const { facility, facilityId }        = useFacility()
  const navigate                        = useNavigate()
  const location                        = useLocation()
  const [alertCount,     setAlertCount]     = useState(0)
  const [drugAlertCount, setDrugAlertCount] = useState(0)
  const [transferCount,  setTransferCount]  = useState(0)
  const [accountOpen,    setAccountOpen]    = useState(false)

  // Close sheet on navigation
  useEffect(() => { setAccountOpen(false) }, [location.pathname])

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
    setAccountOpen(false)
    await signOut()
    navigate('/auth')
  }

  const staffRole  = facility?.staffRole ?? profile?.role ?? ''
  const roleLabel  = staffRole.replace(/_/g, ' ')
  const alertBadge = alertCount + drugAlertCount

  // ── Desktop sidebar nav (unchanged) ──────────────────────────────────────
  const desktopSidebar = (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-product-eyebrow">Orela Nigeria</div>
        <div className="sidebar-product-name">Supply Network</div>
        <div className="sidebar-product-desc">Medicine availability infrastructure</div>
      </div>

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

      <nav className="sidebar-nav">
        <div className="nav-group">
          <span className="nav-group-label">Command Center</span>
          <NavItem to="/dashboard"   label="Overview"           icon={<DashIcon />} />
          <NavItem to="/search"      label="Medicine Network"   icon={<NetworkIcon />} />
          <NavItem to="/alerts"      label="Shortage Alerts"    icon={<BellIcon />}   badge={alertCount}     badgeWarning />
          <NavItem to="/drug-alerts" label="Drug Safety Alerts" icon={<ShieldIcon />} badge={drugAlertCount} badgeWarning />
          <NavItem to="/transfers"   label="Redistribution"     icon={<ArrowsIcon />} badge={transferCount} />
        </div>
        <div className="nav-group">
          <span className="nav-group-label">My Facility</span>
          <NavItem to="/inventory" label="Inventory"          icon={<BoxIcon />} />
          <NavItem to="/analytics" label="Supply Intelligence" icon={<ChartIcon />} />
          <NavItem to="/staff"     label="Staff"              icon={<UsersIcon />} />
          <NavItem to="/settings"  label="Settings"           icon={<GearIcon />} />
        </div>
      </nav>

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
    </aside>
  )

  return (
    <div className="app-shell">

      {/* ── Desktop sidebar — hidden on mobile ── */}
      {desktopSidebar}

      {/* ── Mobile top bar — hidden on desktop ── */}
      <div className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <div className="mobile-topbar-eyebrow">Orela Nigeria</div>
          <div className="mobile-topbar-facility">{facility?.name ?? 'Supply Network'}</div>
        </div>
        <button
          className="mobile-account-btn"
          onClick={() => setAccountOpen(v => !v)}
          aria-label="Account and settings"
        >
          <PersonIcon />
          {alertBadge > 0 && (
            <span className="mobile-account-badge">{alertBadge > 9 ? '9+' : alertBadge}</span>
          )}
        </button>
      </div>

      {/* ── Main content ── */}
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

      {/* ── Mobile bottom navigation — hidden on desktop ── */}
      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        <MobileNavTab to="/dashboard"  label="Overview"   icon={<DashIcon />} />
        <MobileNavTab to="/inventory"  label="Inventory"  icon={<BoxIcon />} />
        <MobileNavTab to="/search"     label="Network"    icon={<NetworkIcon />} />
        <MobileNavTab to="/transfers"  label="Transfers"  icon={<ArrowsIcon />} badge={transferCount} />
        <button
          className={`mobile-bottom-tab${accountOpen ? ' active' : ''}`}
          onClick={() => setAccountOpen(v => !v)}
          aria-label="Menu"
        >
          <span className="mobile-bottom-tab-icon"><MenuGridIcon /></span>
          <span className="mobile-bottom-tab-label">Menu</span>
          {alertBadge > 0 && (
            <span className="mobile-tab-badge">{alertBadge > 9 ? '9+' : alertBadge}</span>
          )}
        </button>
      </nav>

      {/* ── Account / menu bottom sheet — mobile only ── */}
      {accountOpen && (
        <>
          <div className="mobile-sheet-overlay" onClick={() => setAccountOpen(false)} />
          <div className="mobile-account-sheet" role="dialog" aria-label="Account menu">
            <div className="mobile-sheet-handle" />

            {/* User + facility identity */}
            <div className="mobile-sheet-identity">
              <div className="mobile-sheet-identity-name">{profile?.full_name ?? 'User'}</div>
              <div className="mobile-sheet-identity-meta">
                <span className={`fac-dot ${facility?.is_verified ? 'fac-dot-verified' : 'fac-dot-unverified'}`}
                  style={{ width: 6, height: 6 }} />
                {facility?.name ?? 'No facility'}
                {facility?.is_verified ? ' · Verified' : ' · Unverified'}
              </div>
            </div>

            {/* Secondary navigation */}
            <div className="mobile-sheet-nav">
              <SheetNavItem to="/alerts"      label="Shortage Alerts"    icon={<BellIcon />}    badge={alertCount}     badgeWarning onClick={() => setAccountOpen(false)} />
              <SheetNavItem to="/drug-alerts" label="Drug Safety Alerts" icon={<ShieldIcon />}  badge={drugAlertCount} badgeWarning onClick={() => setAccountOpen(false)} />
              <SheetNavItem to="/analytics"   label="Supply Intelligence" icon={<ChartIcon />}  onClick={() => setAccountOpen(false)} />
              <SheetNavItem to="/staff"       label="Staff"              icon={<UsersIcon />}   onClick={() => setAccountOpen(false)} />
              <SheetNavItem to="/settings"    label="Settings"           icon={<GearIcon />}    onClick={() => setAccountOpen(false)} />
            </div>

            {/* Sign out — prominent */}
            <div className="mobile-sheet-footer">
              <button className="mobile-sheet-signout" onClick={handleSignOut}>
                <SignOutIcon />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function MobileNavTab({ to, label, icon, badge }) {
  return (
    <NavLink to={to} className={({ isActive }) => `mobile-bottom-tab${isActive ? ' active' : ''}`}>
      <span className="mobile-bottom-tab-icon">{icon}</span>
      <span className="mobile-bottom-tab-label">{label}</span>
      {badge > 0 && <span className="mobile-tab-badge">{badge}</span>}
    </NavLink>
  )
}

function SheetNavItem({ to, label, icon, badge, badgeWarning, onClick }) {
  return (
    <NavLink to={to} className={({ isActive }) => `mobile-sheet-item${isActive ? ' active' : ''}`} onClick={onClick}>
      <span className="mobile-sheet-item-icon">{icon}</span>
      <span className="mobile-sheet-item-label">{label}</span>
      {badge > 0 && (
        <span className={`nav-badge ${badgeWarning ? '' : 'nav-badge-neutral'}`}>{badge}</span>
      )}
    </NavLink>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const ic = (d, s = {}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    style={{ width: 14, height: 14, ...s }}>{d}</svg>
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
const PersonIcon   = () => ic(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>, { width: 18, height: 18 })
const MenuGridIcon = () => ic(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>, { width: 18, height: 18 })
