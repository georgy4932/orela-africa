import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import InstallPrompt from './components/InstallPrompt'
import { IS_APP_HOST } from './lib/appUrl'

import AdminPage     from './pages/Admin'
import PrivacyPage   from './pages/Privacy'
import StatusPage    from './pages/Status'
import LandingPage    from './pages/Landing'
import DocsPage       from './pages/Docs'
import AuthPage       from './pages/Auth'
import ResetPasswordPage from './pages/ResetPassword'
import OnboardingPage from './pages/Onboarding'
import AppShell       from './components/layout/AppShell'
import DashboardPage  from './pages/Dashboard'
import InventoryPage  from './pages/Inventory'
import AlertsPage          from './pages/Alerts'
import DrugAlertsPage      from './pages/DrugAlerts'
import MedicineAlertsPage from './pages/MedicineAlerts'
import SearchPage     from './pages/Search'
import TransfersPage  from './pages/Transfers'
import StaffPage      from './pages/Staff'
import AnalyticsPage  from './pages/Analytics'
import SettingsPage   from './pages/Settings'

function GlobalSpinner() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div className="spinner spinner-lg" />
    </div>
  )
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <GlobalSpinner />
  if (!session) return <Navigate to="/auth" replace />
  return children
}

function RequireFacility({ children }) {
  const { facility, loading } = useAuth()
  if (loading) return <GlobalSpinner />
  if (!facility) return <Navigate to="/onboarding" replace />
  return children
}

function RequireAdmin({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <GlobalSpinner />
  if (!profile) return <Navigate to="/auth" replace />
  if (profile.role !== 'system_admin') return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  const { session, facility, profile, loading } = useAuth()
  if (loading) return <GlobalSpinner />

  const isSysAdmin = profile?.role === 'system_admin'

  return (
    <Routes>
      {/* Admin panel — system_admin only */}
      <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

      {/* Public pages — no auth required */}
      <Route path="/docs"            element={<DocsPage />} />
      <Route path="/privacy"         element={<PrivacyPage />} />
      <Route path="/status"          element={<StatusPage />} />
      <Route path="/medicine-alerts" element={<MedicineAlertsPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* Public landing page — no auth required */}
      <Route
        path="/"
        element={
          session
            ? isSysAdmin
              ? <Navigate to="/admin" replace />
              : <Navigate to={facility ? '/dashboard' : '/onboarding'} replace />
            : IS_APP_HOST
              ? <Navigate to="/auth" replace />
              : <LandingPage />
        }
      />

      <Route
        path="/auth"
        element={
          session
            ? isSysAdmin
              ? <Navigate to="/admin" replace />
              : <Navigate to={facility ? '/dashboard' : '/onboarding'} replace />
            : <AuthPage />
        }
      />

      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            {isSysAdmin
              ? <Navigate to="/admin" replace />
              : facility
                ? <Navigate to="/dashboard" replace />
                : <OnboardingPage />
            }
          </RequireAuth>
        }
      />

      {/* Top-level app routes with auth + facility guard */}
      <Route element={<RequireAuth><RequireFacility><AppShell /></RequireFacility></RequireAuth>}>
        <Route path="dashboard"  element={<DashboardPage />} />
        <Route path="inventory"  element={<InventoryPage />} />
        <Route path="alerts"        element={<AlertsPage />} />
        <Route path="drug-alerts"    element={<DrugAlertsPage />} />
        <Route path="search"     element={<SearchPage />} />
        <Route path="transfers"  element={<TransfersPage />} />
        <Route path="staff"      element={<StaffPage />} />
        <Route path="analytics"  element={<AnalyticsPage />} />
        <Route path="settings"   element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <InstallPrompt />
    </AuthProvider>
  )
}
