-- =============================================================================
-- 00009_rls_behaviour_tests.sql
-- Behaviour tests for 00009_tighten_rls_policies.sql
--
-- Runs inside a single transaction rolled back at the end — leaves no data.
-- Must be run after the full migration stack (00001 → 00009).
--
-- Tests:
--   T1   Authenticated users cannot spoof created_by on facilities
--   T1b  Legitimate facility insert (own created_by) succeeds
--   T2a  facility_admin cannot insert staff with system_admin role
--   T2b  facility_admin cannot promote existing staff to system_admin
--   T3   Users cannot insert inventory for a facility they don't belong to
--   T3b  Users can insert inventory at their own facility
--   T4a  Requester cannot set transfer status = fulfilled directly
--   T4b  Requester can set transfer status = disputed (allowed)
--   T4c  Supplying facility cannot mutate transfer notes directly
--   T5   Unauthenticated users only see public_visible = true alerts
--   T5b  Unauthenticated user sees the public alert, not the private one
--   T6a  Authenticated user with no facility sees only public alerts
--   T6b  Authenticated user at a notified facility sees both alerts
--   T6c  Authenticated user at a non-notified facility sees only public alert
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION _rls_pass(label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN RAISE NOTICE 'PASS: %', label; END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — inserted as superuser (bypasses RLS) so we control exact values
-- ──────────────────────────────────────────────────────────────────────────────

-- uid_a = Alice: facility_admin at Facility A
-- uid_b = Bob:   pharmacist at Facility B (requesting facility for transfers)
-- uid_c = Carol: no facility (used in T6a — should see only public alerts)
-- uid_d = Dave:  pharmacist at Facility A (used in T2b — Alice tries to promote)
-- uid_s = SysAdmin
INSERT INTO auth.users (id, email) VALUES
  ('10000001-0000-0000-0000-000000000001', 'alice@a.test'),
  ('10000001-0000-0000-0000-000000000002', 'bob@b.test'),
  ('10000001-0000-0000-0000-000000000003', 'carol@none.test'),
  ('10000001-0000-0000-0000-000000000004', 'sysadmin@orela.test'),
  ('10000001-0000-0000-0000-000000000005', 'dave@a.test');

INSERT INTO public.user_profiles (id, full_name, role) VALUES
  ('10000001-0000-0000-0000-000000000001', 'Alice',    'facility_admin'),
  ('10000001-0000-0000-0000-000000000002', 'Bob',      'pharmacist'),
  ('10000001-0000-0000-0000-000000000003', 'Carol',    'pharmacist'),
  ('10000001-0000-0000-0000-000000000004', 'SysAdmin', 'system_admin'),
  ('10000001-0000-0000-0000-000000000005', 'Dave',     'pharmacist')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

INSERT INTO public.facilities (id, name, country, is_verified, is_active, created_by) VALUES
  ('20000001-0000-0000-0000-000000000001', 'Facility A', 'NG', true, true,
   '10000001-0000-0000-0000-000000000001'),
  ('20000001-0000-0000-0000-000000000002', 'Facility B', 'NG', true, true,
   '10000001-0000-0000-0000-000000000002');

-- handle_new_facility trigger auto-inserts Alice's and Bob's staff rows.
-- Upsert to give them predictable IDs and ensure Bob's row is correct.
INSERT INTO public.facility_staff (id, facility_id, user_id, role, is_active)
VALUES
  ('30000001-0000-0000-0000-000000000001',
   '20000001-0000-0000-0000-000000000001',
   '10000001-0000-0000-0000-000000000001', 'facility_admin', true),
  ('30000001-0000-0000-0000-000000000002',
   '20000001-0000-0000-0000-000000000002',
   '10000001-0000-0000-0000-000000000002', 'pharmacist', true)
ON CONFLICT (facility_id, user_id) DO UPDATE
  SET id = EXCLUDED.id, role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO public.medicines (id, generic_name, dosage_form) VALUES
  ('40000001-0000-0000-0000-000000000001', 'Paracetamol', 'tablet');

INSERT INTO public.inventory_items
  (id, facility_id, medicine_id, batch_number, quantity_available,
   quantity_reserved, is_active, network_suppressed, expiry_date)
VALUES
  ('50000001-0000-0000-0000-000000000001',
   '20000001-0000-0000-0000-000000000001',
   '40000001-0000-0000-0000-000000000001',
   'BATCH-A01', 100, 0, true, false, now() + interval '1 year');

INSERT INTO public.transfer_requests
  (id, requesting_facility_id, supplying_facility_id,
   medicine_id, status, quantity_requested)
VALUES
  ('60000001-0000-0000-0000-000000000001',
   '20000001-0000-0000-0000-000000000002',
   '20000001-0000-0000-0000-000000000001',
   '40000001-0000-0000-0000-000000000001',
   'pending', 10);

INSERT INTO public.batch_alerts
  (id, title, batch_numbers, alert_type, severity, public_visible, status)
VALUES
  ('70000001-0000-0000-0000-000000000001',
   'Public Recall Notice', ARRAY['BATCH-X01'],
   'recall', 'critical', true, 'active'),
  ('70000001-0000-0000-0000-000000000002',
   'Private Safety Warning', ARRAY['BATCH-A01'],
   'safety_warning', 'urgent', false, 'active');

INSERT INTO public.alert_facility_responses
  (id, batch_alert_id, facility_id, matched_batch_number,
   response_status, network_suppressed)
VALUES
  ('80000001-0000-0000-0000-000000000001',
   '70000001-0000-0000-0000-000000000002',
   '20000001-0000-0000-0000-000000000001',
   'BATCH-A01', 'pending', true);

-- Dave's pharmacist row at Facility A — needed for T2b UPDATE test.
-- Carol intentionally has NO facility_staff row (used in T6a).
INSERT INTO public.facility_staff (id, facility_id, user_id, role, is_active)
VALUES ('30000001-0000-0000-0000-000000000099',
        '20000001-0000-0000-0000-000000000001',
        '10000001-0000-0000-0000-000000000005',
        'pharmacist', true)
ON CONFLICT (facility_id, user_id) DO NOTHING;

-- Switch to non-superuser role so RLS policies are enforced for all tests below.
SET ROLE authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- T1: Authenticated users cannot spoof created_by
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';
  BEGIN
    INSERT INTO public.facilities (id, name, country, created_by)
    VALUES ('20000001-0000-0000-0000-000000000099', 'Spoof Facility', 'NG',
            '10000001-0000-0000-0000-000000000002');  -- bob's uid, not alice's
    -- If we reach here the row was inserted; check if row_count is still 0
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = '20000001-0000-0000-0000-000000000099') THEN
      v_blocked := false;
    ELSE
      v_blocked := true;  -- silently suppressed
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T1 unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T1 — facilities: insert with spoofed created_by is blocked');
  ELSE
    RAISE EXCEPTION 'FAIL: T1 — facilities: insert with spoofed created_by was NOT blocked';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T1b: Legitimate facility insert (own created_by) succeeds
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';
  INSERT INTO public.facilities (id, name, country, created_by)
  VALUES ('20000001-0000-0000-0000-000000000098', 'Alice''s 2nd Facility', 'NG',
          '10000001-0000-0000-0000-000000000001');  -- alice's own uid
  PERFORM _rls_pass('T1b — facilities: insert with own created_by succeeds');
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL: T1b — legitimate facility insert blocked (SQLSTATE %): %',
    SQLSTATE, SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T2a: facility_admin cannot insert staff with system_admin role
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';  -- Alice
  BEGIN
    INSERT INTO public.facility_staff (facility_id, user_id, role, is_active)
    VALUES ('20000001-0000-0000-0000-000000000001',
            '10000001-0000-0000-0000-000000000004',  -- sysadmin uid
            'system_admin', true);
    IF EXISTS (
      SELECT 1 FROM public.facility_staff
      WHERE facility_id = '20000001-0000-0000-0000-000000000001'
        AND user_id     = '10000001-0000-0000-0000-000000000004'
        AND role        = 'system_admin'
    ) THEN
      v_blocked := false;
    ELSE
      v_blocked := true;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T2a unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T2a — facility_admin cannot insert system_admin staff');
  ELSE
    RAISE EXCEPTION 'FAIL: T2a — system_admin staff row was inserted by facility_admin';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T2b: facility_admin cannot promote existing staff to system_admin via UPDATE
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';  -- Alice
  BEGIN
    UPDATE public.facility_staff
    SET role = 'system_admin'
    WHERE id = '30000001-0000-0000-0000-000000000099';  -- Dave's row at Facility A
    IF EXISTS (
      SELECT 1 FROM public.facility_staff
      WHERE id   = '30000001-0000-0000-0000-000000000099'
        AND role = 'system_admin'
    ) THEN
      v_blocked := false;  -- escalation succeeded
    ELSE
      v_blocked := true;   -- silently rejected or error
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T2b unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T2b — facility_admin cannot promote staff to system_admin');
  ELSE
    RAISE EXCEPTION 'FAIL: T2b — facility_admin successfully promoted staff to system_admin';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T3: Users cannot insert inventory for a facility they don't belong to
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000002';  -- Bob
  BEGIN
    INSERT INTO public.inventory_items
      (facility_id, medicine_id, batch_number, quantity_available, expiry_date)
    VALUES
      ('20000001-0000-0000-0000-000000000001',   -- Facility A — Bob is NOT staff here
       '40000001-0000-0000-0000-000000000001',
       'BOB-HACK-01', 50, now() + interval '1 year');
    IF EXISTS (SELECT 1 FROM public.inventory_items WHERE batch_number = 'BOB-HACK-01') THEN
      v_blocked := false;
    ELSE
      v_blocked := true;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T3 unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T3 — Bob cannot insert inventory at Facility A');
  ELSE
    RAISE EXCEPTION 'FAIL: T3 — Bob was able to insert inventory at Facility A';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T3b: Users can insert inventory at their own facility
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000002';  -- Bob
  INSERT INTO public.inventory_items
    (facility_id, medicine_id, batch_number, quantity_available, expiry_date)
  VALUES
    ('20000001-0000-0000-0000-000000000002',   -- Facility B — Bob IS staff here
     '40000001-0000-0000-0000-000000000001',
     'BOB-LEGIT-01', 30, now() + interval '1 year');
  PERFORM _rls_pass('T3b — Bob can insert inventory at his own Facility B');
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL: T3b — Bob''s legitimate inventory insert blocked (SQLSTATE %): %',
    SQLSTATE, SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T4a: Requester cannot set transfer status = fulfilled directly
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_blocked boolean := false;
  v_status  text;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000002';  -- Bob
  BEGIN
    UPDATE public.transfer_requests
    SET status = 'fulfilled'
    WHERE id = '60000001-0000-0000-0000-000000000001';
    SELECT status INTO v_status FROM public.transfer_requests
    WHERE id = '60000001-0000-0000-0000-000000000001';
    v_blocked := (v_status IS DISTINCT FROM 'fulfilled');
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T4a unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T4a — Bob cannot set transfer status = fulfilled directly');
  ELSE
    RAISE EXCEPTION 'FAIL: T4a — Bob was able to set status = fulfilled directly';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T4b: Requester can set status = disputed (allowed by WITH CHECK)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_status text;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000002';  -- Bob
  UPDATE public.transfer_requests
  SET status = 'disputed'
  WHERE id = '60000001-0000-0000-0000-000000000001';
  SELECT status INTO v_status FROM public.transfer_requests
  WHERE id = '60000001-0000-0000-0000-000000000001';
  IF v_status = 'disputed' THEN
    PERFORM _rls_pass('T4b — Bob can set transfer status = disputed');
  ELSE
    RAISE EXCEPTION 'FAIL: T4b — Bob could not set status = disputed (status = %)', v_status;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T4c: Supplying facility (Alice) cannot mutate transfer directly
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_blocked boolean := false;
  v_notes   text;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';  -- Alice (supplier)
  BEGIN
    UPDATE public.transfer_requests
    SET notes = 'alice-tamper'
    WHERE id = '60000001-0000-0000-0000-000000000001';
    SELECT notes INTO v_notes FROM public.transfer_requests
    WHERE id = '60000001-0000-0000-0000-000000000001';
    v_blocked := (v_notes IS DISTINCT FROM 'alice-tamper');
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN v_blocked := true;
    WHEN others THEN
      RAISE EXCEPTION 'T4c unexpected error (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
  IF v_blocked THEN
    PERFORM _rls_pass('T4c — Alice (supplier) cannot mutate transfer notes directly');
  ELSE
    RAISE EXCEPTION 'FAIL: T4c — Alice (supplier) was able to mutate transfer notes';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T5: Unauthenticated users only see public_visible = true batch alerts
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
  SET LOCAL app.current_user_id = '';  -- no auth.uid()
  SELECT COUNT(*) INTO v_count FROM public.batch_alerts;
  IF v_count = 1 THEN
    PERFORM _rls_pass('T5 — unauthenticated user sees only 1 alert (the public one)');
  ELSE
    RAISE EXCEPTION 'FAIL: T5 — unauthenticated user sees % alerts (expected 1)', v_count;
  END IF;
END $$;

DO $$
DECLARE v_title text;
BEGIN
  SET LOCAL app.current_user_id = '';
  SELECT title INTO v_title FROM public.batch_alerts LIMIT 1;
  IF v_title = 'Public Recall Notice' THEN
    PERFORM _rls_pass('T5b — unauthenticated user sees the public alert, not the private one');
  ELSE
    RAISE EXCEPTION 'FAIL: T5b — unauthenticated user sees alert: %', v_title;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- T6: Non-admin authenticated users cannot read restricted batch alerts
--     unless their facility has an alert_facility_responses row
-- ──────────────────────────────────────────────────────────────────────────────

-- T6a: Carol — authenticated but no facility
DO $$
DECLARE v_count integer;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000003';  -- Carol
  SELECT COUNT(*) INTO v_count FROM public.batch_alerts;
  IF v_count = 1 THEN
    PERFORM _rls_pass('T6a — Carol (no facility) sees only 1 alert (the public one)');
  ELSE
    RAISE EXCEPTION 'FAIL: T6a — Carol sees % alerts (expected 1)', v_count;
  END IF;
END $$;

-- T6b: Alice — facility_admin at Facility A, which HAS a response record
DO $$
DECLARE v_count integer;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000001';  -- Alice
  SELECT COUNT(*) INTO v_count FROM public.batch_alerts;
  IF v_count = 2 THEN
    PERFORM _rls_pass('T6b — Alice (Facility A with response) sees both alerts');
  ELSE
    RAISE EXCEPTION 'FAIL: T6b — Alice sees % alerts (expected 2)', v_count;
  END IF;
END $$;

-- T6c: Bob — pharmacist at Facility B, which has NO response record
DO $$
DECLARE v_count integer;
BEGIN
  SET LOCAL app.current_user_id = '10000001-0000-0000-0000-000000000002';  -- Bob
  SELECT COUNT(*) INTO v_count FROM public.batch_alerts;
  IF v_count = 1 THEN
    PERFORM _rls_pass('T6c — Bob (Facility B, no response) sees only 1 alert (the public one)');
  ELSE
    RAISE EXCEPTION 'FAIL: T6c — Bob sees % alerts (expected 1)', v_count;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- All tests passed — roll back to leave no test data
-- ──────────────────────────────────────────────────────────────────────────────
ROLLBACK;
