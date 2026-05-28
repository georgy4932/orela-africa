-- =============================================================================
-- 00007_tighten_alert_response_suppression.sql
-- Tightens respond_to_alert so it cannot unsuppress recalled inventory while
-- stock is still available.
--
-- Problem with the version in 00006:
--   already_dispensed  → lifted suppression unconditionally, even if
--                         quantity_available > 0 (stock still present)
--   returned_removed   → lifted suppression unconditionally, even if
--                         quantity_available > 0 AND is_active = true
--
-- This meant a facility could mark a recalled batch "already dispensed" or
-- "returned/removed" while physically holding recalled stock, making it
-- searchable on the network again.
--
-- New rules:
--   not_affected       → lift suppression (item never matched; safe)
--   quarantined        → keep suppression (admin must resolve)
--   already_dispensed  → lift only if quantity_available <= 0;
--                         raise exception if stock remains
--   returned_removed   → lift only if quantity_available <= 0 OR
--                         is_active = false (item deactivated);
--                         raise exception if stock remains and item is active
--
-- Function name, signature, auth checks, and ownership checks are unchanged.
-- Run AFTER 00006_fix_publish_batch_alert_suppression.sql.
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
  v_response  record;
  v_item      record;
  v_lift      boolean;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load the response record
  SELECT * INTO v_response FROM alert_facility_responses WHERE id = p_response_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Response not found';
  END IF;

  -- Caller must be active staff at the owning facility
  IF NOT EXISTS (
    SELECT 1 FROM facility_staff
    WHERE user_id    = auth.uid()
      AND facility_id = v_response.facility_id
      AND is_active  = true
  ) THEN
    RAISE EXCEPTION 'Not authorised to respond on behalf of this facility';
  END IF;

  -- Validate status
  IF p_status NOT IN ('quarantined','not_affected','already_dispensed','returned_removed') THEN
    RAISE EXCEPTION 'Invalid response status: %', p_status;
  END IF;

  -- Load the matched inventory item (may be NULL if item was later deleted)
  IF v_response.inventory_item_id IS NOT NULL THEN
    SELECT quantity_available, is_active
      INTO v_item
      FROM inventory_items
     WHERE id = v_response.inventory_item_id;
  END IF;

  -- Determine whether suppression should be lifted, enforcing stock-presence rules.
  IF p_status = 'not_affected' THEN
    -- Item was never part of the recall; safe to restore search visibility.
    v_lift := true;

  ELSIF p_status = 'quarantined' THEN
    -- Stock is being held; keep suppressed until admin resolves the alert.
    v_lift := false;

  ELSIF p_status = 'already_dispensed' THEN
    -- Claimed the stock has been fully dispensed out — only credible if none remains.
    IF v_item IS NOT NULL AND v_item.quantity_available > 0 THEN
      RAISE EXCEPTION
        'Cannot mark as already_dispensed: % unit(s) of recalled stock still recorded as available. '
        'Adjust inventory to zero before using this response.',
        v_item.quantity_available;
    END IF;
    v_lift := true;

  ELSIF p_status = 'returned_removed' THEN
    -- Claimed the stock has been physically removed — only credible if none remains
    -- OR the item has been deactivated (admin_removed_at set / is_active = false).
    IF v_item IS NOT NULL
       AND v_item.quantity_available > 0
       AND v_item.is_active = true
    THEN
      RAISE EXCEPTION
        'Cannot mark as returned_removed: % unit(s) of recalled stock still recorded as available and active. '
        'Remove or deactivate the inventory item before using this response.',
        v_item.quantity_available;
    END IF;
    v_lift := true;
  END IF;

  -- Update the response record
  UPDATE alert_facility_responses
     SET response_status    = p_status,
         network_suppressed = NOT v_lift,
         responded_at       = now(),
         notes              = p_notes
   WHERE id = p_response_id;

  -- Propagate suppression state to the actual inventory item
  IF v_response.inventory_item_id IS NOT NULL THEN
    UPDATE inventory_items
       SET network_suppressed = NOT v_lift
     WHERE id = v_response.inventory_item_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_alert(uuid, text, text) TO authenticated;
