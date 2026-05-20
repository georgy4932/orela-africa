-- =============================================================
-- P8: Drug Alert Protocol — complete backend implementation
-- Covers: alert_facility_responses schema, publish_batch_alert
-- (with facility matching + suppression + audit), respond_to_alert
-- (with suppression lifting).
--
-- Apply order: _hardening.sql → this file → _verify_rls.sql
-- This file supersedes 20260520b_publish_alert_audit.sql — apply
-- ONLY this one, not both.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Ensure alert_facility_responses has all required columns
-- ---------------------------------------------------------------
ALTER TABLE public.alert_facility_responses
  ADD COLUMN IF NOT EXISTS inventory_item_id     uuid        REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_batch_number  text,
  ADD COLUMN IF NOT EXISTS units_at_time_of_alert integer,
  ADD COLUMN IF NOT EXISTS network_suppressed    boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS responded_at          timestamptz,
  ADD COLUMN IF NOT EXISTS notes                 text;

-- Index for fast facility lookups and suppression checks
CREATE INDEX IF NOT EXISTS afr_facility_status_idx
  ON public.alert_facility_responses (facility_id, response_status);

CREATE INDEX IF NOT EXISTS afr_inventory_suppressed_idx
  ON public.alert_facility_responses (inventory_item_id, network_suppressed);

-- RLS: facilities see only their own responses; system_admin sees all
ALTER TABLE public.alert_facility_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facility read own responses"  ON public.alert_facility_responses;
DROP POLICY IF EXISTS "system_admin read responses"  ON public.alert_facility_responses;

CREATE POLICY "facility read own responses"
  ON public.alert_facility_responses FOR SELECT
  USING (
    facility_id IN (
      SELECT fs.facility_id FROM facility_staff fs
      WHERE fs.user_id = auth.uid() AND fs.is_active = true
    )
  );

CREATE POLICY "system_admin read responses"
  ON public.alert_facility_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- ---------------------------------------------------------------
-- 2. publish_batch_alert — complete implementation
--    Replaces the previous version (in 20260520b if applied).
--    Steps: insert alert → match inventory by batch number →
--           create facility responses → suppress matched items →
--           write audit log
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_batch_alert(
  p_alert_reference    text,
  p_title              text,
  p_medicine_id        uuid        DEFAULT NULL,
  p_medicine_name_raw  text        DEFAULT NULL,
  p_batch_numbers      text[]      DEFAULT '{}',
  p_manufacturer       text        DEFAULT NULL,
  p_alert_type         text        DEFAULT 'recall',
  p_severity           text        DEFAULT 'urgent',
  p_source             text        DEFAULT 'NAFDAC',
  p_issuing_authority  text        DEFAULT NULL,
  p_description        text        DEFAULT '',
  p_recommended_action text        DEFAULT '',
  p_risk_to_patients   text        DEFAULT NULL,
  p_expires_at         timestamptz DEFAULT NULL,
  p_public_visible     boolean     DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id    uuid;
  v_item        record;
  v_match_count int := 0;
BEGIN
  -- Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  -- 1. Insert the alert
  INSERT INTO batch_alerts (
    alert_reference, title, medicine_id, medicine_name_raw,
    batch_numbers, manufacturer, alert_type, severity,
    source, issuing_authority, description, recommended_action,
    risk_to_patients, expires_at, public_visible,
    status, issued_at, created_at
  ) VALUES (
    p_alert_reference, p_title, p_medicine_id, p_medicine_name_raw,
    p_batch_numbers, p_manufacturer, p_alert_type, p_severity,
    p_source, p_issuing_authority, p_description, p_recommended_action,
    p_risk_to_patients, p_expires_at, p_public_visible,
    'active', now(), now()
  )
  RETURNING id INTO v_alert_id;

  -- 2. Match active inventory items by batch number
  --    For each match: create a facility response and suppress the item
  FOR v_item IN
    SELECT
      ii.id            AS item_id,
      ii.facility_id,
      ii.batch_number,
      ii.quantity_available
    FROM inventory_items ii
    WHERE ii.batch_number = ANY(p_batch_numbers)
      AND ii.is_active = true
  LOOP
    -- Create the facility response record
    INSERT INTO alert_facility_responses (
      batch_alert_id,
      facility_id,
      inventory_item_id,
      matched_batch_number,
      units_at_time_of_alert,
      network_suppressed,
      response_status,
      created_at
    ) VALUES (
      v_alert_id,
      v_item.facility_id,
      v_item.item_id,
      v_item.batch_number,
      v_item.quantity_available,
      true,
      'pending',
      now()
    )
    ON CONFLICT DO NOTHING;

    v_match_count := v_match_count + 1;
  END LOOP;

  -- 3. Audit log
  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, notes)
  VALUES (
    auth.uid(),
    'publish_batch_alert',
    'batch_alerts',
    v_alert_id,
    p_alert_reference || ' — ' || p_title ||
    ' (' || v_match_count || ' facilities matched)'
  );

  RETURN v_alert_id;
END;
$$;

-- ---------------------------------------------------------------
-- 3. respond_to_alert — lifts network suppression on response
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_alert(
  p_response_id uuid,
  p_status      text,
  p_notes       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response    record;
  v_lift        boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch and validate ownership
  SELECT * INTO v_response FROM alert_facility_responses WHERE id = p_response_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Response not found';
  END IF;

  -- Caller must be active staff at the owning facility
  IF NOT EXISTS (
    SELECT 1 FROM facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_response.facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised to respond on behalf of this facility';
  END IF;

  -- Validate status value
  IF p_status NOT IN ('quarantined', 'not_affected', 'already_dispensed', 'returned_removed') THEN
    RAISE EXCEPTION 'Invalid response status: %', p_status;
  END IF;

  -- Lift suppression when facility confirms the situation is resolved:
  --   not_affected        → item never matched, restore visibility
  --   already_dispensed   → item gone, nothing left to suppress
  --   returned_removed    → item physically removed, nothing left to suppress
  --   quarantined         → keep suppressed until resolved by admin
  v_lift := p_status IN ('not_affected', 'already_dispensed', 'returned_removed');

  UPDATE alert_facility_responses
  SET response_status   = p_status,
      network_suppressed = NOT v_lift,
      responded_at      = now(),
      notes             = p_notes
  WHERE id = p_response_id;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.publish_batch_alert(
  text, text, uuid, text, text[], text, text, text,
  text, text, text, text, text, timestamptz, boolean
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.respond_to_alert(uuid, text, text) TO authenticated;
