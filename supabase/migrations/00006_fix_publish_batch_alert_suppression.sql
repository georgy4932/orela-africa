-- =============================================================================
-- 00006_fix_publish_batch_alert_suppression.sql
-- Fixes a critical bug in publish_batch_alert: the function was creating
-- alert_facility_responses records but NOT setting network_suppressed=true
-- on the matched inventory_items. This meant batch recalls had no effect
-- on network search visibility.
--
-- This file replaces the function from 20260520d_drug_alert_protocol.sql.
-- Run AFTER 20260520d_drug_alert_protocol.sql.
-- =============================================================================

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

  -- 2. Match active inventory items by batch number.
  --    For each match: suppress the inventory item from network search,
  --    then create a facility response record for the owning facility to act on.
  FOR v_item IN
    SELECT
      ii.id              AS item_id,
      ii.facility_id,
      ii.batch_number,
      ii.quantity_available
    FROM inventory_items ii
    WHERE ii.batch_number = ANY(p_batch_numbers)
      AND ii.is_active = true
  LOOP
    -- Suppress from network search. Does NOT deactivate the record —
    -- suppression is lifted by respond_to_alert when the facility confirms
    -- action taken (not_affected, already_dispensed, returned_removed).
    UPDATE inventory_items
    SET network_suppressed = true
    WHERE id = v_item.item_id;

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
    ' (' || v_match_count || ' inventory items suppressed)'
  );

  RETURN v_alert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_batch_alert(
  text, text, uuid, text, text[], text, text, text,
  text, text, text, text, text, timestamptz, boolean
) TO authenticated;

-- =============================================================================
-- Fix respond_to_alert: also update inventory_items.network_suppressed
-- The original function in 20260520d_drug_alert_protocol.sql updated only
-- alert_facility_responses.network_suppressed, leaving inventory_items.
-- network_suppressed unchanged. This meant lifting a response (not_affected,
-- already_dispensed, returned_removed) had no effect on search visibility.
-- =============================================================================
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

  IF p_status NOT IN ('quarantined', 'not_affected', 'already_dispensed', 'returned_removed') THEN
    RAISE EXCEPTION 'Invalid response status: %', p_status;
  END IF;

  -- Lift suppression when facility confirms situation is resolved:
  --   not_affected        → item never matched, restore visibility
  --   already_dispensed   → stock gone, nothing left to suppress
  --   returned_removed    → stock physically removed, nothing left to suppress
  --   quarantined         → keep suppressed until admin resolves the alert
  v_lift := p_status IN ('not_affected', 'already_dispensed', 'returned_removed');

  -- Update the response record
  UPDATE alert_facility_responses
  SET response_status    = p_status,
      network_suppressed = NOT v_lift,
      responded_at       = now(),
      notes              = p_notes
  WHERE id = p_response_id;

  -- Propagate to the actual inventory item
  IF v_response.inventory_item_id IS NOT NULL THEN
    UPDATE inventory_items
    SET network_suppressed = NOT v_lift
    WHERE id = v_response.inventory_item_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_alert(uuid, text, text) TO authenticated;
