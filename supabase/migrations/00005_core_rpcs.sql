-- =============================================================================
-- 00005_core_rpcs.sql
-- Core SECURITY DEFINER RPCs for all authenticated user flows.
-- Run after 00001_base_schema.sql, 00002_rls_policies.sql, 00004_views.sql.
-- All functions use CREATE OR REPLACE — safe to re-run.
--
-- RPCs covered here (admin RPCs are in 20260520_admin_hardening.sql,
-- drug alert RPCs are in 20260520d_drug_alert_protocol.sql):
--   1. medicine_search         — Search.jsx
--   2. create_inventory_item   — Inventory.jsx AddModal
--   3. update_inventory_quantity — Inventory.jsx quantity adjustments
--   4. approve_transfer_request  — Transfers.jsx
--   5. reject_transfer_request   — Transfers.jsx
--   6. cancel_transfer_request   — Transfers.jsx
--   7. mark_transfer_in_transit  — Transfers.jsx
--   8. fulfill_transfer_request  — Transfers.jsx
-- =============================================================================

-- =============================================================================
-- 1. medicine_search
-- Full-text + filter search across medicine_availability_view.
-- Called by: Search.jsx
-- Parameters mirror the search form filters in Search.jsx exactly.
-- Returns one row per (medicine × facility) combination, sorted by
-- total_available DESC so highest-stock results appear first.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.medicine_search(
  p_query       text    DEFAULT NULL,
  p_country     text    DEFAULT NULL,
  p_state       text    DEFAULT NULL,
  p_city        text    DEFAULT NULL,
  p_dosage_form text    DEFAULT NULL,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  medicine_id          uuid,
  generic_name         text,
  brand_name           text,
  dosage_form          text,
  strength             text,
  therapeutic_class    text,
  facility_id          uuid,
  facility_name        text,
  facility_type        text,
  city                 text,
  state_province       text,
  country              text,
  facility_is_verified boolean,
  total_available      bigint,
  earliest_expiry_date date,
  batch_count          bigint,
  dispensing_unit      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    v.medicine_id,
    v.generic_name,
    v.brand_name,
    v.dosage_form,
    v.strength,
    v.therapeutic_class,
    v.facility_id,
    v.facility_name,
    v.facility_type,
    v.city,
    v.state_province,
    v.country,
    v.facility_is_verified,
    v.total_available,
    v.earliest_expiry_date,
    v.batch_count,
    v.dispensing_unit
  FROM public.medicine_availability_view v
  WHERE
    -- Text search: matches generic_name or brand_name (case-insensitive)
    (
      p_query IS NULL
      OR v.generic_name ILIKE '%' || p_query || '%'
      OR v.brand_name   ILIKE '%' || p_query || '%'
    )
    AND (p_country     IS NULL OR v.country        ILIKE p_country)
    AND (p_state       IS NULL OR v.state_province ILIKE '%' || p_state || '%')
    AND (p_city        IS NULL OR v.city           ILIKE '%' || p_city  || '%')
    AND (p_dosage_form IS NULL OR v.dosage_form    ILIKE p_dosage_form)
  ORDER BY v.total_available DESC, v.generic_name ASC
  LIMIT LEAST(COALESCE(p_limit, 50), 200)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.medicine_search(text, text, text, text, text, integer, integer) TO authenticated;

-- =============================================================================
-- 2. create_inventory_item
-- Inserts a new inventory batch for a facility. Validates that the caller is
-- active staff at the given facility before inserting.
-- Called by: Inventory.jsx AddModal on form submit.
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

  -- Caller must be active staff at this facility
  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = p_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at this facility';
  END IF;

  -- Validate quantity
  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  INSERT INTO public.inventory_items (
    facility_id, medicine_id, batch_number,
    quantity_available, reorder_level,
    expiry_date, manufacture_date,
    brand_name, pack_size, dispensing_unit,
    supplier_id, unit_cost, selling_price,
    storage_condition, storage_location,
    notes
  )
  VALUES (
    p_facility_id, p_medicine_id, p_batch_number,
    p_quantity, p_reorder_level,
    p_expiry_date, p_manufacture_date,
    p_brand_name, p_pack_size, p_dispensing_unit,
    p_supplier_id, p_unit_cost, p_selling_price,
    p_storage_condition, p_storage_location,
    p_notes
  )
  RETURNING id INTO v_item_id;

  -- Record the initial receipt movement
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
-- 3. update_inventory_quantity
-- Adjusts inventory quantity and records the movement. Validates caller
-- is staff at the owning facility. Prevents quantity going below zero.
-- Called by: Inventory.jsx (dispense, restock, adjustment buttons).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_inventory_quantity(
  p_inventory_item_id uuid,
  p_quantity_change   integer,
  p_movement_type     text,
  p_notes             text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          record;
  v_qty_before    integer;
  v_qty_after     integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the row to prevent concurrent updates
  SELECT * INTO v_item
  FROM public.inventory_items
  WHERE id = p_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  -- Caller must be active staff at the owning facility
  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_item.facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at this facility';
  END IF;

  -- Validate movement_type
  IF p_movement_type NOT IN (
    'receipt', 'dispensed', 'adjustment', 'expired_removal', 'return'
  ) THEN
    RAISE EXCEPTION 'Invalid movement_type: %', p_movement_type;
  END IF;

  v_qty_before := v_item.quantity_available;
  v_qty_after  := v_qty_before + p_quantity_change;

  IF v_qty_after < 0 THEN
    RAISE EXCEPTION
      'Quantity cannot go below zero (current: %, change: %)',
      v_qty_before, p_quantity_change;
  END IF;

  -- Update quantity (this fires the trg_update_stock_alerts trigger)
  UPDATE public.inventory_items
  SET quantity_available = v_qty_after
  WHERE id = p_inventory_item_id;

  -- Record movement
  INSERT INTO public.inventory_movements (
    inventory_item_id, facility_id,
    movement_type, quantity_change,
    quantity_before, quantity_after,
    performed_by, notes
  )
  VALUES (
    p_inventory_item_id, v_item.facility_id,
    p_movement_type, p_quantity_change,
    v_qty_before, v_qty_after,
    auth.uid(), p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_inventory_quantity(uuid, integer, text, text) TO authenticated;

-- =============================================================================
-- 4. approve_transfer_request
-- Approves a pending transfer. Caller must be active staff at the supplying
-- facility. Validates the inventory item belongs to the supplying facility
-- and has sufficient available stock.
-- Called by: Transfers.jsx ActionModal (type='approve').
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_transfer_request(
  p_request_id         uuid,
  p_quantity_approved  integer,
  p_inventory_item_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request   record;
  v_item      record;
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

  -- Caller must be active staff at the supplying facility
  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_request.supplying_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the supplying facility';
  END IF;

  IF p_quantity_approved <= 0 THEN
    RAISE EXCEPTION 'Approved quantity must be positive';
  END IF;

  -- Validate the selected inventory item belongs to the supplying facility
  SELECT * INTO v_item
  FROM public.inventory_items
  WHERE id = p_inventory_item_id
    AND facility_id = v_request.supplying_facility_id
    AND medicine_id = v_request.medicine_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found at supplying facility for this medicine';
  END IF;

  IF (v_item.quantity_available - v_item.quantity_reserved) < p_quantity_approved THEN
    RAISE EXCEPTION
      'Insufficient stock: % available, % requested',
      (v_item.quantity_available - v_item.quantity_reserved),
      p_quantity_approved;
  END IF;

  -- Reserve the stock
  UPDATE public.inventory_items
  SET quantity_reserved = quantity_reserved + p_quantity_approved
  WHERE id = p_inventory_item_id;

  UPDATE public.transfer_requests
  SET status             = 'approved',
      quantity_approved  = p_quantity_approved,
      updated_at         = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_transfer_request(uuid, integer, uuid) TO authenticated;

-- =============================================================================
-- 5. reject_transfer_request
-- Rejects a pending transfer. Caller must be staff at the supplying facility.
-- Called by: Transfers.jsx ActionModal (type='reject').
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reject_transfer_request(
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

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer request is not pending (status: %)', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_request.supplying_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the supplying facility';
  END IF;

  UPDATE public.transfer_requests
  SET status     = 'rejected',
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_transfer_request(uuid, text) TO authenticated;

-- =============================================================================
-- 6. cancel_transfer_request
-- Cancels a pending or approved transfer. Caller must be staff at the
-- requesting facility. If approved, releases the reserved stock.
-- Called by: Transfers.jsx ActionModal (type='cancel').
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
    RAISE EXCEPTION
      'Cannot cancel: transfer is already % ', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_request.requesting_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the requesting facility';
  END IF;

  -- Release any reserved stock if the transfer was approved
  IF v_request.status = 'approved' AND v_request.quantity_approved IS NOT NULL THEN
    UPDATE public.inventory_items
    SET quantity_reserved = GREATEST(0, quantity_reserved - v_request.quantity_approved)
    WHERE facility_id = v_request.supplying_facility_id
      AND medicine_id = v_request.medicine_id
      AND is_active = true;
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
-- 7. mark_transfer_in_transit
-- Marks an approved transfer as dispatched. Caller must be staff at the
-- supplying facility. Deducts the quantity from inventory.
-- Called by: Transfers.jsx ActionModal (type='in_transit').
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
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  IF v_request.status != 'approved' THEN
    RAISE EXCEPTION 'Transfer must be approved before marking in-transit (status: %)', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_request.supplying_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the supplying facility';
  END IF;

  -- Deduct from supplying facility inventory and release the reservation
  UPDATE public.inventory_items
  SET quantity_available = GREATEST(0, quantity_available - v_request.quantity_approved),
      quantity_reserved  = GREATEST(0, quantity_reserved  - v_request.quantity_approved)
  WHERE facility_id = v_request.supplying_facility_id
    AND medicine_id = v_request.medicine_id
    AND is_active = true
    AND quantity_reserved >= v_request.quantity_approved;

  UPDATE public.transfer_requests
  SET status     = 'in_transit',
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_transfer_in_transit(uuid, text) TO authenticated;

-- =============================================================================
-- 8. fulfill_transfer_request
-- Confirms receipt at the requesting facility. Adds stock to receiving
-- facility inventory. Caller must be staff at the requesting facility.
-- Called by: Transfers.jsx ActionModal (type='fulfill').
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
  v_request   record;
  v_item      record;
  v_item_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer request not found'; END IF;

  IF v_request.status != 'in_transit' THEN
    RAISE EXCEPTION 'Transfer must be in_transit to fulfill (status: %)', v_request.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.facility_staff
    WHERE user_id = auth.uid()
      AND facility_id = v_request.requesting_facility_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised: you are not active staff at the requesting facility';
  END IF;

  IF p_quantity_fulfilled <= 0 THEN
    RAISE EXCEPTION 'Fulfilled quantity must be positive';
  END IF;

  -- Try to find an existing batch for this medicine at the receiving facility
  -- to add the incoming stock to. If none exists, create a new batch.
  SELECT id INTO v_item_id
  FROM public.inventory_items
  WHERE facility_id = v_request.requesting_facility_id
    AND medicine_id = v_request.medicine_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_item_id IS NOT NULL THEN
    UPDATE public.inventory_items
    SET quantity_available = quantity_available + p_quantity_fulfilled,
        updated_at         = now()
    WHERE id = v_item_id;

    INSERT INTO public.inventory_movements (
      inventory_item_id, facility_id, movement_type,
      quantity_change, quantity_before, quantity_after,
      performed_by, notes
    )
    SELECT
      v_item_id, v_request.requesting_facility_id, 'receipt',
      p_quantity_fulfilled,
      quantity_available - p_quantity_fulfilled,
      quantity_available,
      auth.uid(),
      'Transfer received (request ' || p_request_id || ')'
    FROM public.inventory_items WHERE id = v_item_id;
  ELSE
    -- No existing batch — create one (bare minimum fields)
    INSERT INTO public.inventory_items (
      facility_id, medicine_id, batch_number, quantity_available, dispensing_unit
    )
    VALUES (
      v_request.requesting_facility_id, v_request.medicine_id,
      'TRANSFER-' || to_char(now(), 'YYYYMMDD'),
      p_quantity_fulfilled, 'tablet'
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.inventory_movements (
      inventory_item_id, facility_id, movement_type,
      quantity_change, quantity_before, quantity_after,
      performed_by, notes
    )
    VALUES (
      v_item_id, v_request.requesting_facility_id, 'receipt',
      p_quantity_fulfilled, 0, p_quantity_fulfilled,
      auth.uid(), 'Transfer received (request ' || p_request_id || ')'
    );
  END IF;

  UPDATE public.transfer_requests
  SET status               = 'fulfilled',
      quantity_fulfilled   = p_quantity_fulfilled,
      receipt_confirmed    = true,
      fulfilled_at         = now(),
      notes                = COALESCE(p_notes, notes),
      updated_at           = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfill_transfer_request(uuid, integer, text) TO authenticated;
