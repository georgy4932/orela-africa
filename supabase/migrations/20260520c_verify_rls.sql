-- =============================================================
-- RLS verification script — run in SQL editor, read the output
-- This does NOT modify anything. Safe to run at any time.
-- =============================================================

-- 1. Confirm RLS is enabled on all critical tables
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'facilities', 'facility_staff', 'inventory_items',
    'transfer_requests', 'user_profiles', 'medicines',
    'batch_alerts', 'stock_alerts', 'alert_facility_responses',
    'inventory_movements', 'suppliers', 'admin_audit_logs'
  )
ORDER BY tablename;

-- 2. List all RLS policies on those tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'facilities', 'facility_staff', 'inventory_items',
    'transfer_requests', 'user_profiles', 'medicines',
    'batch_alerts', 'stock_alerts', 'alert_facility_responses',
    'inventory_movements', 'suppliers', 'admin_audit_logs'
  )
ORDER BY tablename, cmd, policyname;

-- 3. Confirm admin RPCs exist and are SECURITY DEFINER
SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_verify_facility',
    'admin_suspend_facility',
    'admin_review_inventory_item',
    'admin_remove_inventory_item',
    'admin_resolve_dispute',
    'admin_resolve_batch_alert',
    'publish_batch_alert',
    'create_inventory_item',
    'update_inventory_quantity',
    'approve_transfer_request',
    'reject_transfer_request',
    'cancel_transfer_request',
    'mark_transfer_in_transit',
    'fulfill_transfer_request',
    'respond_to_alert',
    'medicine_search'
  )
ORDER BY p.proname;

-- 4. Confirm admin_audit_logs schema additions landed
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_audit_logs'
ORDER BY ordinal_position;

-- 5. Confirm facilities schema additions landed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'facilities'
  AND column_name IN ('verified_at','verified_by','suspended_at','suspended_by','suspension_reason')
ORDER BY column_name;

-- 6. Confirm inventory_items schema additions landed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'inventory_items'
  AND column_name IN ('admin_reviewed_at','admin_reviewed_by','admin_removed_at','admin_removed_by','admin_remove_reason')
ORDER BY column_name;
