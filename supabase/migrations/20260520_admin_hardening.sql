-- =============================================================
-- Admin hardening: audit log, schema additions, SECURITY DEFINER RPCs
-- Apply via Supabase SQL editor (Dashboard → SQL Editor → Run)
-- =============================================================

-- ---------------------------------------------------------------
-- 1. admin_audit_logs table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid        NOT NULL REFERENCES auth.users(id),
  action_type   text        NOT NULL,
  target_table  text        NOT NULL,
  target_id     uuid,
  facility_id   uuid        REFERENCES public.facilities(id) ON DELETE SET NULL,
  before_state  jsonb,
  after_state   jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx     ON public.admin_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx    ON public.admin_audit_logs (target_table, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx   ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- System admins can read. No direct inserts allowed — RPCs only (SECURITY DEFINER bypasses RLS).
DROP POLICY IF EXISTS "system_admin read audit logs" ON public.admin_audit_logs;
CREATE POLICY "system_admin read audit logs"
  ON public.admin_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- ---------------------------------------------------------------
-- 2. Schema additions: facilities
-- ---------------------------------------------------------------
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS verified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS suspended_at      timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by      uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- ---------------------------------------------------------------
-- 3. Schema additions: inventory_items
-- ---------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS admin_reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_removed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS admin_removed_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_remove_reason text;

-- ---------------------------------------------------------------
-- 4. RPC: admin_verify_facility
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_verify_facility(
  p_facility_id uuid,
  p_notes       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  SELECT to_jsonb(f) INTO v_before FROM facilities f WHERE id = p_facility_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facility not found';
  END IF;

  UPDATE facilities
  SET is_verified = true,
      is_active   = true,
      verified_at = now(),
      verified_by = auth.uid()
  WHERE id = p_facility_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, facility_id, before_state, notes)
  VALUES (auth.uid(), 'verify_facility', 'facilities', p_facility_id, p_facility_id, v_before, p_notes);
END;
$$;

-- ---------------------------------------------------------------
-- 5. RPC: admin_suspend_facility  (with cascade)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_suspend_facility(
  p_facility_id uuid,
  p_reason      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before       jsonb;
  v_active_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;

  SELECT to_jsonb(f) INTO v_before FROM facilities f WHERE id = p_facility_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facility not found'; END IF;

  -- Block suspension if facility has active outbound (supplier) transfers
  SELECT COUNT(*) INTO v_active_count
  FROM transfer_requests
  WHERE supplying_facility_id = p_facility_id
    AND status IN ('pending', 'approved', 'in_transit');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'Cannot suspend: facility has % active outbound transfer(s). Resolve or reassign them first.',
      v_active_count;
  END IF;

  -- Cancel pending inbound (requester) transfers
  UPDATE transfer_requests
  SET status = 'cancelled',
      notes  = COALESCE(notes || E'\n', '') ||
               'Auto-cancelled: requesting facility suspended by admin on ' ||
               to_char(now(), 'YYYY-MM-DD') || '.'
  WHERE requesting_facility_id = p_facility_id
    AND status IN ('pending', 'approved');

  -- Suppress all active inventory from network search
  UPDATE inventory_items
  SET is_active = false
  WHERE facility_id = p_facility_id AND is_active = true;

  -- Suspend the facility
  UPDATE facilities
  SET is_verified       = false,
      is_active         = false,
      suspended_at      = now(),
      suspended_by      = auth.uid(),
      suspension_reason = p_reason
  WHERE id = p_facility_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, facility_id, before_state, notes)
  VALUES (auth.uid(), 'suspend_facility', 'facilities', p_facility_id, p_facility_id, v_before, p_reason);
END;
$$;

-- ---------------------------------------------------------------
-- 6. RPC: admin_review_inventory_item  (clear a flagged batch)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_inventory_item(
  p_item_id uuid,
  p_notes   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before      jsonb;
  v_facility_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;

  SELECT to_jsonb(i), i.facility_id INTO v_before, v_facility_id
  FROM inventory_items i WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;

  UPDATE inventory_items
  SET admin_reviewed_at = now(),
      admin_reviewed_by = auth.uid()
  WHERE id = p_item_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, facility_id, before_state, notes)
  VALUES (auth.uid(), 'review_inventory_item', 'inventory_items', p_item_id, v_facility_id, v_before, p_notes);
END;
$$;

-- ---------------------------------------------------------------
-- 7. RPC: admin_remove_inventory_item
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_remove_inventory_item(
  p_item_id uuid,
  p_reason  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before      jsonb;
  v_facility_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;

  SELECT to_jsonb(i), i.facility_id INTO v_before, v_facility_id
  FROM inventory_items i WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;

  UPDATE inventory_items
  SET is_active           = false,
      admin_removed_at    = now(),
      admin_removed_by    = auth.uid(),
      admin_remove_reason = p_reason
  WHERE id = p_item_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, facility_id, before_state, notes)
  VALUES (auth.uid(), 'remove_inventory_item', 'inventory_items', p_item_id, v_facility_id, v_before, p_reason);
END;
$$;

-- ---------------------------------------------------------------
-- 8. RPC: admin_resolve_dispute
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_request_id uuid,
  p_action     text,    -- 'resolve' → fulfilled  |  'cancel' → cancelled
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before      jsonb;
  v_new_status  text;
  v_facility_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_action NOT IN ('resolve', 'cancel') THEN
    RAISE EXCEPTION 'Invalid action: must be ''resolve'' or ''cancel''';
  END IF;

  SELECT to_jsonb(r), r.requesting_facility_id INTO v_before, v_facility_id
  FROM transfer_requests r WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  v_new_status := CASE p_action WHEN 'resolve' THEN 'fulfilled' ELSE 'cancelled' END;

  UPDATE transfer_requests
  SET status       = v_new_status,
      notes        = COALESCE(notes || E'\n', '') ||
                     'Dispute resolved by admin: marked ' || v_new_status ||
                     COALESCE(' — ' || p_notes, '') || '.',
      fulfilled_at = CASE WHEN v_new_status = 'fulfilled' THEN now() ELSE fulfilled_at END
  WHERE id = p_request_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, facility_id, before_state, notes)
  VALUES (
    auth.uid(), 'resolve_dispute', 'transfer_requests', p_request_id, v_facility_id,
    v_before,
    p_action || COALESCE(': ' || p_notes, '')
  );
END;
$$;

-- ---------------------------------------------------------------
-- 9. RPC: admin_resolve_batch_alert
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_batch_alert(
  p_alert_id uuid,
  p_notes    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;

  SELECT to_jsonb(a) INTO v_before FROM batch_alerts a WHERE id = p_alert_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert not found'; END IF;

  UPDATE batch_alerts
  SET status      = 'resolved',
      resolved_at = now()
  WHERE id = p_alert_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, before_state, notes)
  VALUES (auth.uid(), 'resolve_batch_alert', 'batch_alerts', p_alert_id, v_before, p_notes);
END;
$$;

-- ---------------------------------------------------------------
-- 10. Grant execute to authenticated role
--     (each RPC validates system_admin internally)
-- ---------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_verify_facility(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_facility(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_inventory_item(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_inventory_item(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_batch_alert(uuid, text)     TO authenticated;
