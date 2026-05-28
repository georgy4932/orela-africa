-- 00010_tighten_base_schema_constraints.sql
-- Adds missing CHECK constraints to inventory_items that were absent from
-- the base schema. All changes are additive and data-safe.
--
-- NOTE: movement_type CHECK (transfer_out/transfer_in) and
--       approved_inventory_item_id on transfer_requests were already
--       applied in 00007_tighten_core_rpc_integrity.sql — not repeated here.
--
-- Changes:
--   1. quantity_reserved <= quantity_available  (named constraint)
--   2. pack_size IS NULL OR pack_size > 0
--   3. reorder_level >= 0

DO $$
DECLARE
  v_bad_count integer;
  v_sample    text;
BEGIN

  -- -------------------------------------------------------------------------
  -- Pre-flight: reject migration if any rows already violate the new
  -- quantity_reserved <= quantity_available invariant.
  -- -------------------------------------------------------------------------
  SELECT
    COUNT(*),
    string_agg(
      format('id=%s fac=%s qty_avail=%s qty_res=%s',
             id, facility_id, quantity_available, quantity_reserved),
      '; '
      ORDER BY id
    )
  INTO v_bad_count, v_sample
  FROM public.inventory_items
  WHERE quantity_reserved > quantity_available;

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % inventory_item row(s) violate quantity_reserved <= '
      'quantity_available. Fix the data before applying this migration. '
      'Offending rows (up to 5): %',
      v_bad_count,
      left(v_sample, 500);
  END IF;

  -- -------------------------------------------------------------------------
  -- 1. quantity_reserved <= quantity_available
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_reserved_lte_available_chk'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_reserved_lte_available_chk
      CHECK (quantity_reserved <= quantity_available);
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. pack_size IS NULL OR pack_size > 0
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_pack_size_positive_chk'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_pack_size_positive_chk
      CHECK (pack_size IS NULL OR pack_size > 0);
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. reorder_level >= 0
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_reorder_level_nonneg_chk'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_reorder_level_nonneg_chk
      CHECK (reorder_level >= 0);
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- Behaviour tests
-- Each block attempts an INSERT that should be rejected and asserts the
-- expected constraint fires. Tests roll back automatically via SAVEPOINT.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fac_id  uuid;
  v_med_id  uuid;
  v_ok      boolean;
BEGIN

  -- Use any real facility + medicine pair, or skip if table is empty
  SELECT id INTO v_fac_id FROM public.facilities LIMIT 1;
  SELECT id INTO v_med_id FROM public.medicines  LIMIT 1;

  IF v_fac_id IS NULL OR v_med_id IS NULL THEN
    RAISE NOTICE 'Behaviour tests skipped: no facilities/medicines in DB yet.';
    RETURN;
  END IF;

  -- Test 1: quantity_reserved > quantity_available must be rejected
  v_ok := false;
  BEGIN
    SAVEPOINT t1;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-001', 10, 11, 'tablet', 'room_temperature');
    ROLLBACK TO SAVEPOINT t1;
    RAISE EXCEPTION 'TEST 1 FAILED: reserved > available was not rejected';
  EXCEPTION
    WHEN check_violation THEN
      v_ok := true;
      ROLLBACK TO SAVEPOINT t1;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 1 PASSED: quantity_reserved > quantity_available correctly rejected';
  END IF;

  -- Test 2: pack_size = 0 must be rejected
  v_ok := false;
  BEGIN
    SAVEPOINT t2;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, pack_size, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-002', 10, 0, 0, 'tablet', 'room_temperature');
    ROLLBACK TO SAVEPOINT t2;
    RAISE EXCEPTION 'TEST 2 FAILED: pack_size = 0 was not rejected';
  EXCEPTION
    WHEN check_violation THEN
      v_ok := true;
      ROLLBACK TO SAVEPOINT t2;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 2 PASSED: pack_size = 0 correctly rejected';
  END IF;

  -- Test 3: pack_size < 0 must be rejected
  v_ok := false;
  BEGIN
    SAVEPOINT t3;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, pack_size, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-003', 10, 0, -1, 'tablet', 'room_temperature');
    ROLLBACK TO SAVEPOINT t3;
    RAISE EXCEPTION 'TEST 3 FAILED: pack_size < 0 was not rejected';
  EXCEPTION
    WHEN check_violation THEN
      v_ok := true;
      ROLLBACK TO SAVEPOINT t3;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 3 PASSED: pack_size < 0 correctly rejected';
  END IF;

  -- Test 4: pack_size NULL must be allowed
  v_ok := false;
  BEGIN
    SAVEPOINT t4;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, pack_size, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-004', 10, 0, NULL, 'tablet', 'room_temperature');
    v_ok := true;
    ROLLBACK TO SAVEPOINT t4;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK TO SAVEPOINT t4;
      RAISE EXCEPTION 'TEST 4 FAILED: pack_size NULL was incorrectly rejected: %', SQLERRM;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 4 PASSED: pack_size NULL correctly allowed';
  END IF;

  -- Test 5: reorder_level < 0 must be rejected
  v_ok := false;
  BEGIN
    SAVEPOINT t5;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, reorder_level, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-005', 10, 0, -1, 'tablet', 'room_temperature');
    ROLLBACK TO SAVEPOINT t5;
    RAISE EXCEPTION 'TEST 5 FAILED: reorder_level < 0 was not rejected';
  EXCEPTION
    WHEN check_violation THEN
      v_ok := true;
      ROLLBACK TO SAVEPOINT t5;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 5 PASSED: reorder_level < 0 correctly rejected';
  END IF;

  -- Test 6: reorder_level = 0 must be allowed
  v_ok := false;
  BEGIN
    SAVEPOINT t6;
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number,
       quantity_available, quantity_reserved, reorder_level, dispensing_unit, storage_condition)
    VALUES
      (v_fac_id, v_med_id, 'TEST-CHK-006', 10, 0, 0, 'tablet', 'room_temperature');
    v_ok := true;
    ROLLBACK TO SAVEPOINT t6;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK TO SAVEPOINT t6;
      RAISE EXCEPTION 'TEST 6 FAILED: reorder_level = 0 was incorrectly rejected: %', SQLERRM;
  END;
  IF v_ok THEN
    RAISE NOTICE 'TEST 6 PASSED: reorder_level = 0 correctly allowed';
  END IF;

  RAISE NOTICE 'All constraint behaviour tests completed.';

END $$;
