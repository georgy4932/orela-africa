-- =============================================================================
-- 00007_tighten_core_rpc_integrity.sql
-- Tightens core RPC integrity before production Supabase deployment.
--
-- Schema changes (idempotent):
--   A. Extend inventory_movements.movement_type CHECK to allow transfer_out
--      and transfer_in (previously only receipt/dispensed/adjustment/
--      expired_removal/return were accepted).
--   B. Add approved_inventory_item_id to transfer_requests so the exact
--      source batch is recorded at approval time and used by all downstream
--      transfer functions.
--
-- Function changes (CREATE OR REPLACE — safe to re-run):
--   1. create_inventory_item   — reject p_quantity = 0
--   2. approve_transfer_request — write approved_inventory_item_id
--   3. cancel_transfer_request  — release reservation from exact batch only
--   4. mark_transfer_in_transit — deduct from exact batch, check rows,
--                                  write transfer_out movement
--   5. fulfill_transfer_request — copy batch metadata from source item,
--                                  match receiving batch on batch_number +
--                                  expiry_date, write transfer_in movement
--
-- Run AFTER 00006_fix_publish_batch_alert_suppression.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Extend inventory_movements.movement_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN (
    'receipt', 'dispensed', 'adjustment', 'expired_removal', 'return',
    'transfer_out', 'transfer_in'
  ));

-- ---------------------------------------------------------------------------
-- B. Batch traceability column on transfer_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_requests
  ADD COLUMN IF NOT EXISTS approved_inventory_item_id uuid
  REFERENCES public.inventory_items(id);

-- =============================================================================
-- 1. create_inventory_item — reject zero quantity
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_inventory_item(
  p_facility_id       uuid,
  p_medicine_id       uuid,
  p_batch_number      text,
  p_quantity          integer,
  p_dispensing_unit   text        DEFAULT 'tablet',
  p_pack_size         integer     DEFAULT NULL,
  p_reorder_level     integer     DEFAULT 10,
  p_expiry_date       date        DEFAULT NULL,
  p_manufacture_date  date        DEFAULT NULL,
  p_brand_name        text        DEFAULT NULL,
  p_supplier_id       uuid        DEFAULT NULL,
  p_unit_cost         numeric     DEFAULT NULL,
  p_selling_price     numeric     DEFAULT NULL,
  p_storage_condition text        DEFAULT 'room_temperature',
  p_storage_location  text        DEFAULT NULL,
  p_notes             text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id   = auth.uid()
      AND facility_id = p_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at this facility';
  END IF;

  -- Reject zero and negative quantities (zero stock entry has no meaning)
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  INSERT INTO public.inventory_items (
    facility_id, medicine_id, batch_number,
    quantity_available, reorder_level,
    expiry_date, manufacture_date,
    brand_name, pack_size, dispensing_unit,
    supplier_id, unit_cost, selling_price,
    storage_condition, storage_location, notes
  )
  VALUES (
    p_facility_id, p_medicine_id, p_batch_number,
    p_quantity, p_reorder_level,
    p_expiry_date, p_manufacture_date,
    p_brand_name, p_pack_size, p_dispensing_unit,
    p_supplier_id, p_unit_cost, p_selling_price,
    p_storage_condition, p_storage_location, p_notes
  )
  RETURNING id INTO v_item_id;

  INSERT INTO public.inventory_movements (
    inventory_item_id, facility_id,
    movement_type, quantity_change,
    quantity_before, quantity_after,
    performed_by, notes
  )
  VALUES (
    v_item_id, p_facility_id,
    'receipt', p_quantity,
    0, p_quantity,
    auth.uid(), 'Initial stock entry'
  );

  RETURN v_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_item(
  uuid, uuid, text, integer, text, integer, integer,
  date, date, text, uuid, numeric, numeric, text, text, text
) TO authenticated;

-- =============================================================================
-- 2. approve_transfer_request — record the exact source inventory item
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_transfer_request(
  p_request_id        uuid,
  p_quantity_approved integer,
  p_inventory_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_item    record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer request is not pending (status: %)', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id    = auth.uid()
      AND facility_id = v_request.supplying_facility_id
      AND is_active  = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the supplying facility';
  END IF;

  IF p_quantity_approved <= 0 THEN
    RAISE EXCEPTION 'Approved quantity must be positive';
  END IF;

  SELECT * INTO v_item
  FROM public.inventory_items
  WHERE id          = p_inventory_item_id
    AND facility_id = v_request.supplying_facility_id
    AND medicine_id = v_request.medicine_id
    AND is_active   = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found at supplying facility for this medicine';
  END IF;

  IF (v_item.quantity_available - v_item.quantity_reserved) < p_quantity_approved THEN
    RAISE EXCEPTION
      'Insufficient stock: % available, % requested',
      (v_item.quantity_available - v_item.quantity_reserved),
      p_quantity_approved;
  END IF;

  UPDATE public.inventory_items
  SET quantity_reserved = quantity_reserved + p_quantity_approved
  WHERE id = p_inventory_item_id;

  UPDATE public.transfer_requests
  SET status                     = 'approved',
      quantity_approved          = p_quantity_approved,
      approved_inventory_item_id = p_inventory_item_id,
      updated_at                 = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_transfer_request(uuid, integer, uuid) TO authenticated;

-- =============================================================================
-- 3. cancel_transfer_request — release reservation from the exact batch only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_transfer_request(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  IF v_request.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Cannot cancel: transfer is already %', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id    = auth.uid()
      AND facility_id = v_request.requesting_facility_id
      AND is_active  = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the requesting facility';
  END IF;

  -- Release reservation only from the exact approved batch.
  -- Refuse to proceed if the batch link is missing on an approved transfer —
  -- a broad facility+medicine release could affect the wrong batch.
  IF v_request.status = 'approved' AND v_request.quantity_approved IS NOT NULL THEN
    IF v_request.approved_inventory_item_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot cancel: transfer is approved but approved_inventory_item_id is not set. '
        'A batch-level reservation release cannot be performed safely.';
    END IF;

    UPDATE public.inventory_items
    SET quantity_reserved = GREATEST(0, quantity_reserved - v_request.quantity_approved)
    WHERE id = v_request.approved_inventory_item_id;
  END IF;

  UPDATE public.transfer_requests
  SET status     = 'cancelled',
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_transfer_request(uuid, text) TO authenticated;

-- =============================================================================
-- 4. mark_transfer_in_transit — deduct from exact batch; enforce row count
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_transfer_in_transit(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request  record;
  v_item     record;
  v_rows     integer;
  v_qty_before integer;
  v_qty_after  integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  IF v_request.status != 'approved' THEN
    RAISE EXCEPTION
      'Transfer must be approved before marking in-transit (status: %)',
      v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id    = auth.uid()
      AND facility_id = v_request.supplying_facility_id
      AND is_active  = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the supplying facility';
  END IF;

  -- Refuse to proceed without a traceable batch link
  IF v_request.approved_inventory_item_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot dispatch: approved_inventory_item_id is not set on this transfer. '
      'The batch to deduct from cannot be determined safely.';
  END IF;

  -- Load the source item for movement record quantities
  SELECT quantity_available, quantity_reserved
    INTO v_item
    FROM public.inventory_items
   WHERE id = v_request.approved_inventory_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved inventory item no longer exists';
  END IF;

  v_qty_before := v_item.quantity_available;
  v_qty_after  := GREATEST(0, v_qty_before - v_request.quantity_approved);

  -- Deduct stock and release reservation from the exact approved batch
  UPDATE public.inventory_items
  SET quantity_available = v_qty_after,
      quantity_reserved  = GREATEST(0, quantity_reserved - v_request.quantity_approved)
  WHERE id = v_request.approved_inventory_item_id
    AND quantity_reserved >= v_request.quantity_approved;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- If zero rows updated the quantity_reserved condition was not met —
  -- reservation is inconsistent. Do not mark in-transit.
  IF v_rows != 1 THEN
    RAISE EXCEPTION
      'Stock deduction failed: inventory item % does not have % units reserved '
      '(expected reservation from approval step). Transfer not dispatched.',
      v_request.approved_inventory_item_id,
      v_request.quantity_approved;
  END IF;

  -- Record the dispatch movement
  INSERT INTO public.inventory_movements (
    inventory_item_id, facility_id,
    movement_type, quantity_change,
    quantity_before, quantity_after,
    performed_by, notes
  )
  VALUES (
    v_request.approved_inventory_item_id,
    v_request.supplying_facility_id,
    'transfer_out',
    -v_request.quantity_approved,
    v_qty_before,
    v_qty_after,
    auth.uid(),
    'Dispatched for transfer request ' || p_request_id
  );

  UPDATE public.transfer_requests
  SET status     = 'in_transit',
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_transfer_in_transit(uuid, text) TO authenticated;

-- =============================================================================
-- 5. fulfill_transfer_request — preserve batch metadata from source item
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fulfill_transfer_request(
  p_request_id         uuid,
  p_quantity_fulfilled integer,
  p_notes              text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request    record;
  v_src        record;   -- source inventory item batch metadata
  v_src_found  boolean := false;
  v_item_id    uuid;
  v_qty_before integer;
  v_qty_after  integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  IF v_request.status != 'in_transit' THEN
    RAISE EXCEPTION
      'Transfer must be in_transit to fulfill (status: %)', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id    = auth.uid()
      AND facility_id = v_request.requesting_facility_id
      AND is_active  = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the requesting facility';
  END IF;

  IF p_quantity_fulfilled <= 0 THEN
    RAISE EXCEPTION 'Fulfilled quantity must be positive';
  END IF;

  -- Load source batch metadata. The item may have qty=0 now (stock deducted at
  -- dispatch), but batch_number / expiry_date / brand etc. are still valid.
  -- Use FOUND rather than IS NOT NULL on the record: a record with any NULL
  -- column would incorrectly pass an IS NOT NULL check as false in PL/pgSQL.
  IF v_request.approved_inventory_item_id IS NOT NULL THEN
    SELECT * INTO v_src
    FROM public.inventory_items
    WHERE id = v_request.approved_inventory_item_id;
    v_src_found := FOUND;
  END IF;

  -- Find an existing receiving batch matching source batch_number + expiry_date.
  -- Only merge into an identical batch — never guess by "latest created".
  IF v_src_found THEN
    SELECT id INTO v_item_id
    FROM public.inventory_items
    WHERE facility_id  = v_request.requesting_facility_id
      AND medicine_id  = v_request.medicine_id
      AND batch_number = v_src.batch_number
      AND expiry_date  IS NOT DISTINCT FROM v_src.expiry_date
      AND is_active    = true
    LIMIT 1;
  END IF;

  IF v_item_id IS NOT NULL THEN
    -- Matching batch already at the receiver — add to it
    SELECT quantity_available INTO v_qty_before
    FROM public.inventory_items WHERE id = v_item_id;

    v_qty_after := v_qty_before + p_quantity_fulfilled;

    UPDATE public.inventory_items
    SET quantity_available = v_qty_after,
        updated_at         = now()
    WHERE id = v_item_id;

  ELSIF v_src_found THEN
    -- No matching batch at receiver yet — create one copying source metadata
    INSERT INTO public.inventory_items (
      facility_id, medicine_id,
      batch_number, quantity_available,
      expiry_date, manufacture_date,
      brand_name, pack_size, dispensing_unit,
      storage_condition,
      unit_cost, selling_price,
      reorder_level
    )
    VALUES (
      v_request.requesting_facility_id,
      v_request.medicine_id,
      v_src.batch_number,
      p_quantity_fulfilled,
      v_src.expiry_date,
      v_src.manufacture_date,
      v_src.brand_name,
      v_src.pack_size,
      v_src.dispensing_unit,
      v_src.storage_condition,
      v_src.unit_cost,
      v_src.selling_price,
      v_src.reorder_level
    )
    RETURNING id INTO v_item_id;

    v_qty_before := 0;
    v_qty_after  := p_quantity_fulfilled;

  ELSE
    -- No source metadata (transfer approved before 00007 migration).
    -- Fall back to a datestamped batch rather than merging into an arbitrary existing one.
    INSERT INTO public.inventory_items (
      facility_id, medicine_id, batch_number,
      quantity_available, dispensing_unit
    )
    VALUES (
      v_request.requesting_facility_id,
      v_request.medicine_id,
      'TRANSFER-' || to_char(now(), 'YYYYMMDD'),
      p_quantity_fulfilled,
      'tablet'
    )
    RETURNING id INTO v_item_id;

    v_qty_before := 0;
    v_qty_after  := p_quantity_fulfilled;
  END IF;

  -- Record the receipt movement at the receiving facility
  INSERT INTO public.inventory_movements (
    inventory_item_id, facility_id,
    movement_type, quantity_change,
    quantity_before, quantity_after,
    performed_by, notes
  )
  VALUES (
    v_item_id,
    v_request.requesting_facility_id,
    'transfer_in',
    p_quantity_fulfilled,
    v_qty_before,
    v_qty_after,
    auth.uid(),
    'Transfer received — request ' || p_request_id
      || ', source facility ' || v_request.supplying_facility_id
  );

  UPDATE public.transfer_requests
  SET status             = 'fulfilled',
      quantity_fulfilled = p_quantity_fulfilled,
      receipt_confirmed  = true,
      fulfilled_at       = now(),
      notes              = COALESCE(p_notes, notes),
      updated_at         = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfill_transfer_request(uuid, integer, text) TO authenticated;
