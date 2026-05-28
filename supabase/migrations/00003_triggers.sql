-- =============================================================================
-- 00003_triggers.sql
-- Database triggers for automatic record creation and alert generation.
-- Run after 00001_base_schema.sql.
-- All functions use CREATE OR REPLACE so re-running is safe.
-- DROP TRIGGER IF EXISTS before CREATE TRIGGER makes triggers idempotent.
-- =============================================================================

-- =============================================================================
-- TRIGGER 1: Create user_profiles row on new signup
-- Fires: AFTER INSERT ON auth.users
-- Why critical: useAuth.jsx calls loadProfile() immediately after signup.
--   If this trigger doesn't exist, profile is null, role checks fail, and
--   the user is permanently locked out until an admin manually inserts a row.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pharmacist'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- TRIGGER 2: Create facility_staff record when a facility is created
-- Fires: AFTER INSERT ON public.facilities
-- Why critical: useAuth.jsx → useFacility.js queries facility_staff to find
--   the user's facility. Onboarding.jsx inserts a facility then immediately
--   calls refreshFacility(). Without this trigger, that query returns no rows
--   and the user is redirected back to onboarding in an infinite loop.
-- The creating user (created_by) is linked as facility_admin automatically.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_facility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.facility_staff (facility_id, user_id, role, is_active)
    VALUES (NEW.id, NEW.created_by, 'facility_admin', true)
    ON CONFLICT (facility_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_facility_created ON public.facilities;
CREATE TRIGGER on_facility_created
  AFTER INSERT ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_facility();

-- =============================================================================
-- TRIGGER 3: Generate stock alerts on inventory quantity changes
-- Fires: AFTER UPDATE OF quantity_available ON public.inventory_items
--        (only when quantity actually changes — WHEN clause avoids noise)
-- Supports: Alerts.jsx, AppShell.jsx badge count, Dashboard.jsx
-- Note on near-expiry alerts: these are NOT generated here because this
--   trigger only fires on quantity updates. Near-expiry alerts require a
--   scheduled job (pg_cron or a Supabase Edge Function) that runs daily and
--   inserts alerts for items where expiry_date <= now() + threshold days.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_stock_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net_available integer;
  v_med_name      text;
BEGIN
  v_net_available := NEW.quantity_available - NEW.quantity_reserved;

  SELECT generic_name INTO v_med_name
  FROM public.medicines WHERE id = NEW.medicine_id;

  IF NEW.quantity_available = 0 THEN
    -- Out of stock: upsert an out_of_stock alert, resolve any low_stock
    INSERT INTO public.stock_alerts (
      facility_id, inventory_item_id, alert_type, status, message
    )
    VALUES (
      NEW.facility_id, NEW.id, 'out_of_stock', 'active',
      'Out of stock — ' || COALESCE(v_med_name, 'Unknown') ||
      ' (batch ' || NEW.batch_number || ').'
    )
    ON CONFLICT (inventory_item_id, alert_type, status) DO NOTHING;

    UPDATE public.stock_alerts
    SET status = 'resolved', resolved_at = now()
    WHERE inventory_item_id = NEW.id
      AND alert_type = 'low_stock'
      AND status = 'active';

  ELSIF v_net_available < NEW.reorder_level
    AND (OLD.quantity_available - OLD.quantity_reserved) >= NEW.reorder_level
  THEN
    -- Dropped below reorder level: insert low_stock alert
    INSERT INTO public.stock_alerts (
      facility_id, inventory_item_id, alert_type, status, message
    )
    VALUES (
      NEW.facility_id, NEW.id, 'low_stock', 'active',
      'Low stock — ' || COALESCE(v_med_name, 'Unknown') ||
      ' (batch ' || NEW.batch_number || '): ' || v_net_available ||
      ' units remaining (reorder level: ' || NEW.reorder_level || ').'
    )
    ON CONFLICT (inventory_item_id, alert_type, status) DO NOTHING;

  ELSIF v_net_available >= NEW.reorder_level THEN
    -- Restocked above reorder level: resolve active low_stock and out_of_stock
    UPDATE public.stock_alerts
    SET status = 'resolved', resolved_at = now()
    WHERE inventory_item_id = NEW.id
      AND alert_type IN ('low_stock', 'out_of_stock')
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_alerts ON public.inventory_items;
CREATE TRIGGER trg_update_stock_alerts
  AFTER UPDATE OF quantity_available ON public.inventory_items
  FOR EACH ROW
  WHEN (OLD.quantity_available IS DISTINCT FROM NEW.quantity_available)
  EXECUTE FUNCTION public.update_stock_alerts();
