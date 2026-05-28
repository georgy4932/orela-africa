-- =============================================================================
-- 00009_tighten_rls_policies.sql
-- Corrective RLS hardening before production deployment.
-- Replaces the affected policies from 00002_rls_policies.sql only.
-- All DROP IF EXISTS before CREATE so this file is safe to re-run.
--
-- Issues fixed:
--   1. facilities: insert now enforces created_by = auth.uid()
--   2. facility_staff: FOR ALL replaced with SELECT/INSERT/UPDATE; privilege
--      escalation to system_admin is blocked at the database level
--   3. inventory_items: FOR ALL split into SELECT/INSERT/UPDATE with explicit
--      WITH CHECK so users cannot insert rows for foreign facilities
--   4. transfer_requests: broad FOR ALL replaced with SELECT + INSERT (requesting
--      facility only) + limited UPDATE (dispute / confirm_receipt only)
--   5. batch_alerts: broad "authenticated read" replaced with a targeted policy
--      that allows facility staff to read only alerts matched to their facility
--   6. All EXISTS subqueries across affected policies rewritten with explicit
--      table-qualified column references (e.g. table_name.column_name inside the
--      subquery) to eliminate the fs.facility_id = facility_id ambiguity where
--      the unqualified name can resolve to the inner alias column rather than
--      the outer row, making the condition trivially true and bypassing the check
-- =============================================================================

-- =============================================================================
-- 1. facilities — fix insert WITH CHECK and alias ambiguity in existing policies
-- =============================================================================
DROP POLICY IF EXISTS "facilities: read own"   ON public.facilities;
DROP POLICY IF EXISTS "facilities: insert own" ON public.facilities;
DROP POLICY IF EXISTS "facilities: update own" ON public.facilities;

-- Read own: staff at a facility can always read it regardless of verification
CREATE POLICY "facilities: read own"
  ON public.facilities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facilities.id        -- explicit outer table reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- Insert: authenticated users can create a facility, but must set themselves
-- as the creator. Prevents spoofing another user's created_by.
CREATE POLICY "facilities: insert own"
  ON public.facilities FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Update: facility admins may update their own facility's settings
CREATE POLICY "facilities: update own"
  ON public.facilities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facilities.id        -- explicit outer table reference
        AND fs.user_id     = auth.uid()
        AND fs.role        = 'facility_admin'
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = facilities.id
        AND fs.user_id     = auth.uid()
        AND fs.role        = 'facility_admin'
        AND fs.is_active   = true
    )
  );

-- =============================================================================
-- 2. facility_staff — split FOR ALL; block privilege escalation; fix ambiguity
--
-- The original policy "facility admin manage" used:
--   fs.facility_id = facility_id
-- where both sides resolve to the inner alias column (facility_staff.facility_id)
-- making the EXISTS condition trivially true: any active facility_admin anywhere
-- could manage staff at any facility.
-- =============================================================================
DROP POLICY IF EXISTS "facility_staff: own read"             ON public.facility_staff;
DROP POLICY IF EXISTS "facility_staff: facility admin manage" ON public.facility_staff;

-- Own read: every user can see their own staff record (needed for useAuth.jsx)
CREATE POLICY "facility_staff: own read"
  ON public.facility_staff FOR SELECT
  USING (user_id = auth.uid());

-- Facility admin select: see all staff at own facility (Staff.jsx list)
CREATE POLICY "facility_staff: facility admin select"
  ON public.facility_staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fa
      WHERE fa.facility_id = facility_staff.facility_id  -- explicit outer reference
        AND fa.user_id     = auth.uid()
        AND fa.role        = 'facility_admin'
        AND fa.is_active   = true
    )
  );

-- Facility admin insert: can add staff to their facility.
-- WITH CHECK blocks creating a system_admin row regardless of UI-submitted role.
CREATE POLICY "facility_staff: facility admin insert"
  ON public.facility_staff FOR INSERT
  WITH CHECK (
    role != 'system_admin'                              -- block privilege escalation
    AND EXISTS (
      SELECT 1 FROM public.facility_staff fa
      WHERE fa.facility_id = facility_staff.facility_id  -- explicit outer reference
        AND fa.user_id     = auth.uid()
        AND fa.role        = 'facility_admin'
        AND fa.is_active   = true
    )
  );

-- Facility admin update: can modify staff records at their facility.
-- WITH CHECK prevents reassigning any user to system_admin via direct table write.
CREATE POLICY "facility_staff: facility admin update"
  ON public.facility_staff FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fa
      WHERE fa.facility_id = facility_staff.facility_id  -- explicit outer reference
        AND fa.user_id     = auth.uid()
        AND fa.role        = 'facility_admin'
        AND fa.is_active   = true
    )
  )
  WITH CHECK (
    role != 'system_admin'                              -- block role escalation
  );

-- =============================================================================
-- 3. suppliers — fix alias ambiguity (fs.facility_id = facility_id was ambiguous)
-- =============================================================================
DROP POLICY IF EXISTS "suppliers: facility staff all" ON public.suppliers;

CREATE POLICY "suppliers: facility staff all"
  ON public.suppliers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = suppliers.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = suppliers.facility_id
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- =============================================================================
-- 4. inventory_items — split FOR ALL, add explicit WITH CHECK, fix ambiguity
-- =============================================================================
DROP POLICY IF EXISTS "inventory_items: own facility all" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items: network read"     ON public.inventory_items;

-- Own facility: staff see all their items (including suppressed and inactive)
CREATE POLICY "inventory_items: own facility select"
  ON public.inventory_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_items.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- Insert: staff may only create rows for their own facility
CREATE POLICY "inventory_items: own facility insert"
  ON public.inventory_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_items.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- Update: staff may update rows only within their own facility
CREATE POLICY "inventory_items: own facility update"
  ON public.inventory_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_items.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_items.facility_id  -- prevent reassigning to another facility
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- Network read: any authenticated user can see active, non-suppressed items at
-- verified active facilities (powers medicine_availability_view)
CREATE POLICY "inventory_items: network read"
  ON public.inventory_items FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active              = true
    AND network_suppressed     = false
    AND EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id          = inventory_items.facility_id  -- explicit outer reference
        AND f.is_verified = true
        AND f.is_active   = true
    )
  );

-- =============================================================================
-- 5. inventory_movements — fix alias ambiguity
-- =============================================================================
DROP POLICY IF EXISTS "inventory_movements: facility staff" ON public.inventory_movements;

CREATE POLICY "inventory_movements: facility staff"
  ON public.inventory_movements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_movements.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = inventory_movements.facility_id
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- =============================================================================
-- 6. stock_alerts — fix alias ambiguity in read and update policies
-- =============================================================================
DROP POLICY IF EXISTS "stock_alerts: facility staff read"   ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts: facility staff update" ON public.stock_alerts;

CREATE POLICY "stock_alerts: facility staff read"
  ON public.stock_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = stock_alerts.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

CREATE POLICY "stock_alerts: facility staff update"
  ON public.stock_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = stock_alerts.facility_id  -- explicit outer reference
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = stock_alerts.facility_id
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- =============================================================================
-- 7. transfer_requests — restrict participant writes
--
-- The frontend uses direct table writes for exactly two operations:
--   a) INSERT new request  (Transfers.jsx NewRequestModal)
--   b) UPDATE to set status='disputed' (Transfers.jsx ActionModal — dispute)
--   c) UPDATE to set receipt_confirmed=true (Transfers.jsx ActionModal — confirm)
-- All other status transitions (approve, reject, cancel, in_transit, fulfill)
-- go through SECURITY DEFINER RPCs that bypass row security.
-- Removing the broad FOR ALL prevents participants from arbitrarily setting
-- any status value via direct table writes.
-- =============================================================================
DROP POLICY IF EXISTS "transfer_requests: participant access" ON public.transfer_requests;

-- SELECT: both requesting and supplying participants may read
CREATE POLICY "transfer_requests: participant select"
  ON public.transfer_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.user_id   = auth.uid()
        AND fs.is_active = true
        AND (
          fs.facility_id = transfer_requests.requesting_facility_id
          OR fs.facility_id = transfer_requests.supplying_facility_id
        )
    )
  );

-- INSERT: requesting facility only; requesting_facility_id must match the
-- caller's facility so they cannot create requests on behalf of others
CREATE POLICY "transfer_requests: requester insert"
  ON public.transfer_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.user_id     = auth.uid()
        AND fs.facility_id = transfer_requests.requesting_facility_id
        AND fs.is_active   = true
    )
  );

-- UPDATE: requesting facility may only transition to 'disputed' (report
-- non-delivery) or set receipt_confirmed = true. All other status transitions
-- must go through SECURITY DEFINER RPCs. WITH CHECK enforces this at the row
-- level regardless of what the client sends.
CREATE POLICY "transfer_requests: requester limited update"
  ON public.transfer_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.user_id     = auth.uid()
        AND fs.facility_id = transfer_requests.requesting_facility_id
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    status = 'disputed'        -- dispute: requester reports stock was not received
    OR receipt_confirmed = true  -- confirm_receipt: requester confirms delivery
  );

-- =============================================================================
-- 8. batch_alerts — restrict non-public alerts to facility participants and admin
--
-- Decision: remove the broad "authenticated read" policy that allowed any
-- logged-in user to read ALL batch alerts (including non-public ones).
--
-- Replacement: facility staff may read alerts where their facility has a
-- matching response (alert_facility_responses). This covers DrugAlerts.jsx
-- which reads batch_alerts via the PostgREST embed:
--   .from('alert_facility_responses').select('..., batch_alerts(...)')
--
-- Public alerts (public_visible = true) remain readable by unauthenticated
-- users — this covers MedicineAlerts.jsx which uses .eq('public_visible', true).
-- Admin access is preserved via the existing "batch_alerts: admin write" FOR ALL.
--
-- Non-public alerts that do not involve a user's facility are no longer
-- visible to that user. This is the intended behaviour.
-- =============================================================================
DROP POLICY IF EXISTS "batch_alerts: authenticated read" ON public.batch_alerts;

CREATE POLICY "batch_alerts: facility with response"
  ON public.batch_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.alert_facility_responses afr
        JOIN public.facility_staff fs
          ON fs.facility_id = afr.facility_id
         AND fs.user_id     = auth.uid()
         AND fs.is_active   = true
       WHERE afr.batch_alert_id = batch_alerts.id
    )
  );

-- =============================================================================
-- 9. alert_facility_responses — fix alias ambiguity
-- =============================================================================
DROP POLICY IF EXISTS "alert_facility_responses: facility read"   ON public.alert_facility_responses;
DROP POLICY IF EXISTS "alert_facility_responses: facility update" ON public.alert_facility_responses;

CREATE POLICY "alert_facility_responses: facility read"
  ON public.alert_facility_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = alert_facility_responses.facility_id  -- explicit outer ref
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

CREATE POLICY "alert_facility_responses: facility update"
  ON public.alert_facility_responses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = alert_facility_responses.facility_id  -- explicit outer ref
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_staff fs
      WHERE fs.facility_id = alert_facility_responses.facility_id
        AND fs.user_id     = auth.uid()
        AND fs.is_active   = true
    )
  );

-- =============================================================================
-- 10. user_profiles — fix infinite recursion in admin read policy
--
-- The "user_profiles: admin read" policy from 00002 contains a self-referential
-- EXISTS subquery on user_profiles, which causes PostgreSQL to raise
-- "infinite recursion detected in policy for relation user_profiles" whenever
-- any table with a FOR ALL admin policy (facilities, inventory_items, etc.)
-- is accessed by an authenticated user.
--
-- Fix: extract the admin check into a SECURITY DEFINER function that queries
-- user_profiles as the function owner (bypassing RLS), eliminating the
-- recursive policy evaluation loop.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id   = auth.uid()
      AND role = 'system_admin'
  )
$$;

DROP POLICY IF EXISTS "user_profiles: admin read" ON public.user_profiles;

CREATE POLICY "user_profiles: admin read"
  ON public.user_profiles FOR SELECT
  USING (public.is_system_admin());

-- =============================================================================
-- 11. facility_staff — fix infinite recursion in facility admin select policy
--
-- The "facility_staff: facility admin select" policy from Section 2 contains a
-- self-referential EXISTS subquery on facility_staff: to determine whether the
-- current user is a facility_admin at a given facility, it queries facility_staff
-- — the very table whose policy is being evaluated — causing infinite recursion
-- whenever any query touches facility_staff (directly or via an EXISTS subquery
-- in another table's policy).
--
-- Since virtually every other table's USING clause queries facility_staff to
-- verify staff membership, this recursion affects inserts, updates, and selects
-- across inventory_items, suppliers, transfer_requests, stock_alerts, and more.
--
-- Fix: introduce a SECURITY DEFINER helper function that performs the admin
-- membership check as the function owner (bypassing RLS on facility_staff),
-- and rewrite all three facility-admin policies to call it instead of using
-- an inline EXISTS on the same table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_facility_admin_at(p_facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE facility_id = p_facility_id
      AND user_id     = auth.uid()
      AND role        = 'facility_admin'
      AND is_active   = true
  )
$$;

-- Re-create the three facility-admin policies using the SECURITY DEFINER helper.
-- Section 2 already dropped the old policies; these recreations replace the
-- versions created in Section 2 with recursion-free equivalents.
DROP POLICY IF EXISTS "facility_staff: facility admin select" ON public.facility_staff;
DROP POLICY IF EXISTS "facility_staff: facility admin insert" ON public.facility_staff;
DROP POLICY IF EXISTS "facility_staff: facility admin update" ON public.facility_staff;

CREATE POLICY "facility_staff: facility admin select"
  ON public.facility_staff FOR SELECT
  USING (public.is_facility_admin_at(facility_staff.facility_id));

CREATE POLICY "facility_staff: facility admin insert"
  ON public.facility_staff FOR INSERT
  WITH CHECK (
    role != 'system_admin'
    AND public.is_facility_admin_at(facility_staff.facility_id)
  );

CREATE POLICY "facility_staff: facility admin update"
  ON public.facility_staff FOR UPDATE
  USING  (public.is_facility_admin_at(facility_staff.facility_id))
  WITH CHECK (role != 'system_admin');
