-- =============================================================================
-- 00001_base_schema.sql
-- Base table definitions for Orela Network.
-- Covers all tables queried by the React frontend.
-- Run this first, before any other migration files.
-- The admin hardening migration (20260520_admin_hardening.sql) adds additional
-- columns to facilities, inventory_items, and batch_alerts via ALTER TABLE IF
-- NOT EXISTS — those statements are safe to run after this file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_profiles
-- Created by trigger on auth.users INSERT (see 00003_triggers.sql).
-- Read by: useAuth.jsx (loadProfile), Admin.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text,
  role          text NOT NULL DEFAULT 'pharmacist'
                  CHECK (role IN ('pharmacist','pharmacy_tech','facility_admin','system_admin')),
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- facilities
-- Created by: Onboarding.jsx (direct insert).
-- Read by: useAuth.jsx, Settings.jsx, Admin.jsx, AppShell.jsx, Search.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facilities (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  facility_type               text NOT NULL DEFAULT 'pharmacy'
                                CHECK (facility_type IN (
                                  'pharmacy','hospital_pharmacy','clinic',
                                  'primary_health_center','wholesaler','government_store'
                                )),
  registration_number         text,
  address_line1               text,
  city                        text,
  state_province              text,
  country                     text NOT NULL DEFAULT 'NG',
  phone                       text,
  email                       text,
  is_verified                 boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT true,
  default_currency            text NOT NULL DEFAULT 'NGN',
  near_expiry_threshold_days  integer NOT NULL DEFAULT 90,
  created_by                  uuid REFERENCES auth.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  -- Columns added by 20260520_admin_hardening.sql (safe to include here for
  -- fresh-install completeness; ALTER TABLE IF NOT EXISTS is idempotent)
  verified_at                 timestamptz,
  verified_by                 uuid REFERENCES auth.users(id),
  suspended_at                timestamptz,
  suspended_by                uuid REFERENCES auth.users(id),
  suspension_reason           text
);
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- facility_staff
-- Created by trigger on facilities INSERT (see 00003_triggers.sql).
-- Read by: useAuth.jsx (loadProfile), Staff.jsx, useFacility.js
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facility_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'pharmacist'
                CHECK (role IN ('pharmacist','pharmacy_tech','facility_admin')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, user_id)
);
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- medicines
-- Global catalogue managed by system_admin.
-- Read by: Inventory.jsx (MedicineSearch dropdown), Search.jsx, Admin.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name        text NOT NULL,
  dosage_form         text,
  strength            text,
  therapeutic_class   text,
  essential_medicine  boolean NOT NULL DEFAULT false,
  nafdac_reg_number   text,
  atc_code            text,
  standard_pack_sizes integer[],
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- suppliers
-- Per-facility supplier records.
-- Read by: Inventory.jsx (AddModal, EditModal supplier dropdown)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- inventory_items
-- Core inventory batches. network_suppressed controls network search visibility.
-- IMPORTANT: network_suppressed = true hides items from search — it does NOT
-- deactivate the record. Suspending a facility sets network_suppressed on its
-- items, not is_active = false. These are distinct operations.
-- Read/written by: Inventory.jsx, Dashboard.jsx, Admin.jsx, DrugAlerts.jsx
-- Queried indirectly by: medicine_availability_view, medicine_search RPC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  medicine_id         uuid NOT NULL REFERENCES public.medicines(id),
  supplier_id         uuid REFERENCES public.suppliers(id),
  batch_number        text NOT NULL,
  quantity_available  integer NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved   integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  reorder_level       integer NOT NULL DEFAULT 10,
  expiry_date         date,
  manufacture_date    date,
  brand_name          text,
  pack_size           integer,
  dispensing_unit     text NOT NULL DEFAULT 'tablet',
  unit_cost           numeric(12,2),
  selling_price       numeric(12,2),
  storage_condition   text NOT NULL DEFAULT 'room_temperature',
  storage_location    text,
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  network_suppressed  boolean NOT NULL DEFAULT false,
  -- Admin review columns (also added by 20260520_admin_hardening.sql)
  admin_reviewed_at   timestamptz,
  admin_reviewed_by   uuid REFERENCES auth.users(id),
  admin_removed_at    timestamptz,
  admin_removed_by    uuid REFERENCES auth.users(id),
  admin_remove_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inventory_items_searchable
  ON public.inventory_items (medicine_id, facility_id)
  WHERE is_active = true AND network_suppressed = false;

CREATE INDEX IF NOT EXISTS idx_inventory_items_flagged
  ON public.inventory_items (quantity_available)
  WHERE is_active = true AND admin_reviewed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_movements
-- Audit trail for all quantity changes. Written by update_inventory_quantity RPC.
-- Read by: Dashboard.jsx (recent stock movement table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  facility_id       uuid NOT NULL REFERENCES public.facilities(id),
  movement_type     text NOT NULL
                      CHECK (movement_type IN (
                        'receipt','dispensed','adjustment','expired_removal','return'
                      )),
  quantity_change   integer NOT NULL,
  quantity_before   integer NOT NULL,
  quantity_after    integer NOT NULL,
  performed_by      uuid REFERENCES auth.users(id),
  performed_at      timestamptz NOT NULL DEFAULT now(),
  notes             text
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- stock_alerts
-- Low-stock, out-of-stock, and near-expiry alerts per facility.
-- Generated by trigger on inventory_items UPDATE (see 00003_triggers.sql).
-- Near-expiry alerts require a scheduled function (pg_cron or Edge Function).
-- Read by: Alerts.jsx, AppShell.jsx (badge count), Dashboard.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id       uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  alert_type        text NOT NULL
                      CHECK (alert_type IN ('low_stock','out_of_stock','near_expiry')),
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','resolved')),
  message           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  UNIQUE (inventory_item_id, alert_type, status)
);
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- transfer_requests
-- Inter-facility stock redistribution requests.
-- Read/written by: Transfers.jsx, Admin.jsx, Dashboard.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_facility_id  uuid NOT NULL REFERENCES public.facilities(id),
  supplying_facility_id   uuid NOT NULL REFERENCES public.facilities(id),
  medicine_id             uuid NOT NULL REFERENCES public.medicines(id),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending','approved','rejected','cancelled',
                              'in_transit','fulfilled','disputed'
                            )),
  urgency                 text NOT NULL DEFAULT 'routine'
                            CHECK (urgency IN ('routine','urgent','critical')),
  quantity_requested      integer NOT NULL CHECK (quantity_requested > 0),
  quantity_approved       integer,
  quantity_fulfilled      integer,
  reason                  text,
  notes                   text,
  receipt_confirmed       boolean NOT NULL DEFAULT false,
  fulfilled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_transfer_requests_updated_at ON public.transfer_requests;
CREATE TRIGGER trg_transfer_requests_updated_at
  BEFORE UPDATE ON public.transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- batch_alerts
-- Regulatory/safety alerts (NAFDAC recalls, quality warnings).
-- Read by: MedicineAlerts.jsx (public), DrugAlerts.jsx (private), Admin.jsx
-- Written by: publish_batch_alert RPC (admin only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_reference     text UNIQUE,
  title               text NOT NULL,
  medicine_name_raw   text,
  medicine_id         uuid REFERENCES public.medicines(id),
  batch_numbers       text[] NOT NULL DEFAULT '{}',
  manufacturer        text,
  alert_type          text NOT NULL DEFAULT 'quality_defect'
                        CHECK (alert_type IN (
                          'recall','quality_defect','falsified','substandard',
                          'safety_warning','market_withdrawal'
                        )),
  severity            text NOT NULL DEFAULT 'urgent'
                        CHECK (severity IN ('critical','urgent','routine')),
  source              text,
  issuing_authority   text,
  risk_to_patients    text,
  description         text,
  recommended_action  text,
  public_visible      boolean NOT NULL DEFAULT true,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','resolved')),
  issued_at           timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolved_by         uuid REFERENCES auth.users(id)
);
ALTER TABLE public.batch_alerts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- alert_facility_responses
-- Per-facility response to a batch alert matched to their inventory.
-- Written by: publish_batch_alert RPC, respond_to_alert RPC.
-- Read by: DrugAlerts.jsx, Dashboard.jsx
-- Column name batch_alert_id matches the FK expected by publish_batch_alert RPC.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_facility_responses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_alert_id          uuid NOT NULL REFERENCES public.batch_alerts(id) ON DELETE CASCADE,
  facility_id             uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  inventory_item_id       uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  matched_batch_number    text,
  units_at_time_of_alert  integer,
  response_status         text NOT NULL DEFAULT 'pending'
                            CHECK (response_status IN (
                              'pending','quarantined','not_affected',
                              'already_dispensed','returned_removed'
                            )),
  network_suppressed      boolean NOT NULL DEFAULT true,
  responded_at            timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_alert_id, facility_id, inventory_item_id)
);
ALTER TABLE public.alert_facility_responses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS afr_facility_status_idx
  ON public.alert_facility_responses (facility_id, response_status);

CREATE INDEX IF NOT EXISTS afr_inventory_suppressed_idx
  ON public.alert_facility_responses (inventory_item_id, network_suppressed);

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- Append-only audit trail for all admin actions. Written by SECURITY DEFINER
-- RPCs only — no direct INSERT is permitted via RLS.
-- Read by: Admin.jsx
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action_type   text NOT NULL,
  target_table  text NOT NULL,
  target_id     uuid,
  facility_id   uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  before_state  jsonb,
  after_state   jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx   ON public.admin_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx  ON public.admin_audit_logs (target_table, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
