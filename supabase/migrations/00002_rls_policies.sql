-- =============================================================================
-- 00002_rls_policies.sql
-- Row Level Security policies for all tables.
-- Run after 00001_base_schema.sql.
-- All policies are idempotent: DROP IF EXISTS before CREATE.
-- =============================================================================

-- =============================================================================
-- user_profiles
-- Users read/update their own profile only.
-- System admin can read all profiles (needed for Admin.jsx staff lookup).
-- =============================================================================
DROP POLICY IF EXISTS "user_profiles: own read"   ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles: own update" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles: admin read" ON public.user_profiles;

CREATE POLICY "user_profiles: own read"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles: own update"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles: admin read"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- facilities
-- - Any authenticated user can read verified + active facilities (medicine
--   network search must display facility name/city to all logged-in users).
-- - Staff can always read their own facility regardless of verification status
--   (needed for Settings.jsx and AppShell.jsx facility card after onboarding).
-- - Any authenticated user can INSERT (onboarding flow in Onboarding.jsx).
-- - Facility admins can UPDATE their own facility (Settings.jsx).
-- - System admin has full access.
-- =============================================================================
DROP POLICY IF EXISTS "facilities: read verified" ON public.facilities;
DROP POLICY IF EXISTS "facilities: read own"      ON public.facilities;
DROP POLICY IF EXISTS "facilities: insert own"    ON public.facilities;
DROP POLICY IF EXISTS "facilities: update own"    ON public.facilities;
DROP POLICY IF EXISTS "facilities: admin all"     ON public.facilities;

CREATE POLICY "facilities: read verified"
  ON public.facilities FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_verified = true
    AND is_active = true
  );

CREATE POLICY "facilities: read own"
  ON public.facilities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "facilities: insert own"
  ON public.facilities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "facilities: update own"
  ON public.facilities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = id
        AND fs.user_id = auth.uid()
        AND fs.role = 'facility_admin'
        AND fs.is_active = true
    )
  );

CREATE POLICY "facilities: admin all"
  ON public.facilities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- facility_staff
-- - Users can read their own staff record (useAuth.jsx loadProfile).
-- - Facility admins manage their own facility's staff (Staff.jsx).
-- - System admin has full access.
-- =============================================================================
DROP POLICY IF EXISTS "facility_staff: own read"             ON public.facility_staff;
DROP POLICY IF EXISTS "facility_staff: facility admin manage" ON public.facility_staff;
DROP POLICY IF EXISTS "facility_staff: sysadmin all"         ON public.facility_staff;

CREATE POLICY "facility_staff: own read"
  ON public.facility_staff FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "facility_staff: facility admin manage"
  ON public.facility_staff FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.role = 'facility_admin'
        AND fs.is_active = true
    )
  );

CREATE POLICY "facility_staff: sysadmin all"
  ON public.facility_staff FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- medicines
-- All authenticated users can read active medicines (Inventory.jsx AddModal
-- medicine dropdown, Search.jsx result display).
-- Only system_admin can insert/update/delete.
-- =============================================================================
DROP POLICY IF EXISTS "medicines: authenticated read" ON public.medicines;
DROP POLICY IF EXISTS "medicines: admin write"        ON public.medicines;

CREATE POLICY "medicines: authenticated read"
  ON public.medicines FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "medicines: admin write"
  ON public.medicines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- suppliers
-- Facility staff have full access to their own facility's suppliers.
-- =============================================================================
DROP POLICY IF EXISTS "suppliers: facility staff all" ON public.suppliers;

CREATE POLICY "suppliers: facility staff all"
  ON public.suppliers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

-- =============================================================================
-- inventory_items
-- - Own facility staff: full access including inactive/suppressed items
--   (Inventory.jsx must show all items to the owning facility).
-- - Network read: any authenticated user can SELECT active, non-suppressed
--   items from verified facilities (powers medicine_availability_view and
--   medicine_search RPC). This is intentional: the network is a shared
--   availability layer visible to all logged-in users.
-- - System admin: full access.
-- =============================================================================
DROP POLICY IF EXISTS "inventory_items: own facility all" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items: network read"     ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items: admin all"        ON public.inventory_items;

CREATE POLICY "inventory_items: own facility all"
  ON public.inventory_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "inventory_items: network read"
  ON public.inventory_items FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND network_suppressed = false
    AND EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id
        AND f.is_verified = true
        AND f.is_active = true
    )
  );

CREATE POLICY "inventory_items: admin all"
  ON public.inventory_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- inventory_movements
-- Facility staff can read and insert movements for their own facility.
-- Written by update_inventory_quantity RPC (SECURITY DEFINER) — but direct
-- insert must also be permitted so the RPC's SET search_path = public works.
-- =============================================================================
DROP POLICY IF EXISTS "inventory_movements: facility staff" ON public.inventory_movements;

CREATE POLICY "inventory_movements: facility staff"
  ON public.inventory_movements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

-- =============================================================================
-- stock_alerts
-- Facility staff read their own facility's alerts (Alerts.jsx, AppShell badge).
-- Written only by DB trigger (update_stock_alerts) — no end-user INSERT.
-- Facility staff may UPDATE to resolve (Alerts.jsx resolve button).
-- =============================================================================
DROP POLICY IF EXISTS "stock_alerts: facility staff read"   ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts: facility staff update" ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts: admin all"             ON public.stock_alerts;

CREATE POLICY "stock_alerts: facility staff read"
  ON public.stock_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "stock_alerts: facility staff update"
  ON public.stock_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "stock_alerts: admin all"
  ON public.stock_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- transfer_requests
-- Both requesting and supplying facility staff can read and write.
-- This covers: Transfers.jsx (both sides), Dashboard.jsx, Admin.jsx.
-- =============================================================================
DROP POLICY IF EXISTS "transfer_requests: participant access" ON public.transfer_requests;
DROP POLICY IF EXISTS "transfer_requests: admin all"          ON public.transfer_requests;

CREATE POLICY "transfer_requests: participant access"
  ON public.transfer_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.user_id = auth.uid()
        AND fs.is_active = true
        AND (
          fs.facility_id = requesting_facility_id
          OR fs.facility_id = supplying_facility_id
        )
    )
  );

CREATE POLICY "transfer_requests: admin all"
  ON public.transfer_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- batch_alerts
-- - Public read (no auth required) for public_visible = true alerts.
--   This powers MedicineAlerts.jsx which is accessible without login at
--   orela.africa/ng/alerts.
-- - All authenticated users can read all alerts (DrugAlerts.jsx, Admin.jsx).
-- - System admin can write.
-- =============================================================================
DROP POLICY IF EXISTS "batch_alerts: public read"        ON public.batch_alerts;
DROP POLICY IF EXISTS "batch_alerts: authenticated read" ON public.batch_alerts;
DROP POLICY IF EXISTS "batch_alerts: admin write"        ON public.batch_alerts;

CREATE POLICY "batch_alerts: public read"
  ON public.batch_alerts FOR SELECT
  USING (public_visible = true);

CREATE POLICY "batch_alerts: authenticated read"
  ON public.batch_alerts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "batch_alerts: admin write"
  ON public.batch_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- alert_facility_responses
-- - Facility staff read their own facility's responses (DrugAlerts.jsx,
--   Dashboard.jsx).
-- - Facility staff can UPDATE their own responses (respond_to_alert RPC also
--   does this via SECURITY DEFINER, but direct update is needed for the RLS
--   check inside the RPC to pass).
-- - System admin has full access.
-- - No direct INSERT for end users — publish_batch_alert RPC handles inserts.
-- =============================================================================
DROP POLICY IF EXISTS "alert_facility_responses: facility read"   ON public.alert_facility_responses;
DROP POLICY IF EXISTS "alert_facility_responses: facility update" ON public.alert_facility_responses;
DROP POLICY IF EXISTS "alert_facility_responses: admin all"       ON public.alert_facility_responses;

CREATE POLICY "alert_facility_responses: facility read"
  ON public.alert_facility_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "alert_facility_responses: facility update"
  ON public.alert_facility_responses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facility_id
        AND fs.user_id = auth.uid()
        AND fs.is_active = true
    )
  );

CREATE POLICY "alert_facility_responses: admin all"
  ON public.alert_facility_responses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );

-- =============================================================================
-- admin_audit_logs
-- System admins can read. No direct INSERT — SECURITY DEFINER RPCs only.
-- =============================================================================
DROP POLICY IF EXISTS "admin_audit_logs: sysadmin read" ON public.admin_audit_logs;

CREATE POLICY "admin_audit_logs: sysadmin read"
  ON public.admin_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'system_admin'
    )
  );
