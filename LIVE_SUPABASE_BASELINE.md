# Live Supabase Baseline Report

**Project:** Orela Africa — Medicine Availability Network  
**Supabase project:** `skfmmptdrmiwhvziyvcz.supabase.co`  
**Report date:** 2026-05-28  
**Produced by:** Static analysis of migration files + confirmed live-DB observations from this session  

---

## Method and Confidence

This report was produced by:

1. **Reading all migration files** in `supabase/migrations/` (18 files)
2. **Reading all frontend source files** that make Supabase calls (14 files)
3. **Live DB observations** made during this session — the shape of `medicine_availability_view` was confirmed by querying it from the browser and receiving actual rows

The container cannot reach the Supabase REST API directly (network policy + placeholder anon key in `.env`). Any items marked **[CONFIRMED LIVE]** reflect actual runtime behaviour observed. Items marked **[FROM MIGRATIONS]** are what the migration stack defines and may or may not match the live DB if some migrations were not applied.

> **Source of truth is the live Supabase database.** Where this report flags a divergence, do not assume the migrations are correct.

---

## 1. Tables and Columns

### 1.1 `public.user_profiles`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | nullable |
| `role` | text | NOT NULL, DEFAULT `'pharmacist'`, CHECK IN (`'pharmacist'`, `'pharmacy_tech'`, `'facility_admin'`, `'system_admin'`) |
| `avatar_url` | text | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

**Created by trigger** on `auth.users` INSERT (see §4).  
RLS: enabled.

---

### 1.2 `public.facilities`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() |
| `name` | text | NOT NULL |
| `facility_type` | text | NOT NULL, DEFAULT `'pharmacy'`, CHECK IN (`'pharmacy'`, `'hospital_pharmacy'`, `'clinic'`, `'primary_health_center'`, `'wholesaler'`, `'government_store'`) |
| `registration_number` | text | nullable |
| `address_line1` | text | nullable |
| `city` | text | nullable |
| `state_province` | text | nullable |
| `country` | text | NOT NULL, DEFAULT `'NG'` |
| `phone` | text | nullable |
| `email` | text | nullable |
| `is_verified` | boolean | NOT NULL, DEFAULT false |
| `is_active` | boolean | NOT NULL, DEFAULT true |
| `default_currency` | text | NOT NULL, DEFAULT `'NGN'` |
| `near_expiry_threshold_days` | integer | NOT NULL, DEFAULT 90 |
| `created_by` | uuid | FK → `auth.users(id)` |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |
| `verified_at` | timestamptz | nullable [FROM MIGRATIONS — admin_hardening] |
| `verified_by` | uuid | FK → `auth.users(id)` [FROM MIGRATIONS] |
| `suspended_at` | timestamptz | nullable [FROM MIGRATIONS] |
| `suspended_by` | uuid | FK → `auth.users(id)` [FROM MIGRATIONS] |
| `suspension_reason` | text | nullable [FROM MIGRATIONS] |

RLS: enabled. Trigger: `on_facility_created` fires after INSERT.

---

### 1.3 `public.facility_staff`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` ON DELETE CASCADE |
| `user_id` | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | text | NOT NULL, DEFAULT `'pharmacist'`, CHECK IN (`'pharmacist'`, `'pharmacy_tech'`, `'facility_admin'`) |
| `is_active` | boolean | NOT NULL, DEFAULT true |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

UNIQUE: `(facility_id, user_id)`. RLS: enabled.

---

### 1.4 `public.medicines`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `generic_name` | text | NOT NULL |
| `dosage_form` | text | nullable |
| `strength` | text | nullable |
| `therapeutic_class` | text | nullable |
| `essential_medicine` | boolean | NOT NULL, DEFAULT false |
| `nafdac_reg_number` | text | nullable |
| `atc_code` | text | nullable |
| `standard_pack_sizes` | integer[] | nullable |
| `is_active` | boolean | NOT NULL, DEFAULT true |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

Seeded with 82 medicines via `00010_seed_medicines.sql`. RLS: enabled.

---

### 1.5 `public.suppliers`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` ON DELETE CASCADE |
| `name` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

RLS: enabled.

---

### 1.6 `public.inventory_items`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` ON DELETE CASCADE |
| `medicine_id` | uuid | NOT NULL, FK → `medicines(id)` |
| `supplier_id` | uuid | FK → `suppliers(id)` |
| `batch_number` | text | NOT NULL |
| `quantity_available` | integer | NOT NULL, DEFAULT 0, CHECK >= 0 |
| `quantity_reserved` | integer | NOT NULL, DEFAULT 0, CHECK >= 0 |
| `reorder_level` | integer | NOT NULL, DEFAULT 10 |
| `expiry_date` | date | nullable |
| `manufacture_date` | date | nullable |
| `brand_name` | text | nullable |
| `pack_size` | integer | nullable |
| `dispensing_unit` | text | NOT NULL, DEFAULT `'tablet'` |
| `unit_cost` | numeric(12,2) | nullable |
| `selling_price` | numeric(12,2) | nullable |
| `storage_condition` | text | NOT NULL, DEFAULT `'room_temperature'` |
| `storage_location` | text | nullable |
| `notes` | text | nullable |
| `is_active` | boolean | NOT NULL, DEFAULT true |
| `network_suppressed` | boolean | NOT NULL, DEFAULT false [FROM MIGRATIONS — admin_hardening] |
| `admin_reviewed_at` | timestamptz | nullable [FROM MIGRATIONS] |
| `admin_reviewed_by` | uuid | FK → `auth.users(id)` [FROM MIGRATIONS] |
| `admin_removed_at` | timestamptz | nullable [FROM MIGRATIONS] |
| `admin_removed_by` | uuid | FK → `auth.users(id)` [FROM MIGRATIONS] |
| `admin_remove_reason` | text | nullable [FROM MIGRATIONS] |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() |

**Named CHECK constraints** [FROM MIGRATIONS — `00010_tighten_base_schema_constraints.sql`, applied this session, not yet live]:
- `inventory_items_reserved_lte_available_chk`: `quantity_reserved <= quantity_available`
- `inventory_items_pack_size_positive_chk`: `pack_size IS NULL OR pack_size > 0`
- `inventory_items_reorder_level_nonneg_chk`: `reorder_level >= 0`

**Indexes:**
- `idx_inventory_items_searchable` ON `(medicine_id, facility_id)` WHERE `is_active = true AND network_suppressed = false`
- `idx_inventory_items_flagged` ON `(quantity_available)` WHERE `is_active = true AND admin_reviewed_at IS NULL`

Triggers: `trg_inventory_items_updated_at` (set_updated_at), `trg_update_stock_alerts` (after quantity_available changes). RLS: enabled.

---

### 1.7 `public.inventory_movements`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `inventory_item_id` | uuid | NOT NULL, FK → `inventory_items(id)` ON DELETE CASCADE |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` |
| `movement_type` | text | NOT NULL, CHECK IN (`'receipt'`, `'dispensed'`, `'adjustment'`, `'expired_removal'`, `'return'`, `'transfer_out'`, `'transfer_in'`) [last two added by `00007_tighten_core_rpc_integrity.sql`] |
| `quantity_change` | integer | NOT NULL |
| `quantity_before` | integer | NOT NULL |
| `quantity_after` | integer | NOT NULL |
| `performed_by` | uuid | FK → `auth.users(id)` |
| `performed_at` | timestamptz | NOT NULL, DEFAULT now() |
| `notes` | text | nullable |

RLS: enabled.

> **⚠ UNCERTAINTY:** Whether the live DB's `movement_type` CHECK was extended to include `'transfer_out'` and `'transfer_in'` depends on whether migration `00007_tighten_core_rpc_integrity.sql` was applied. If not, the `mark_transfer_in_transit` RPC's internal `update_inventory_quantity` call with `movement_type = 'transfer_out'` will be rejected by the constraint.

---

### 1.8 `public.stock_alerts`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` ON DELETE CASCADE |
| `inventory_item_id` | uuid | FK → `inventory_items(id)` ON DELETE CASCADE |
| `alert_type` | text | NOT NULL, CHECK IN (`'low_stock'`, `'out_of_stock'`, `'near_expiry'`) |
| `status` | text | NOT NULL, DEFAULT `'active'`, CHECK IN (`'active'`, `'resolved'`) |
| `message` | text | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |
| `resolved_at` | timestamptz | nullable |

UNIQUE: `(inventory_item_id, alert_type, status)`. RLS: enabled.

Near-expiry alerts require a scheduled job (pg_cron / Edge Function) — **no such job is confirmed active on the live DB.** Near-expiry alerts may not auto-generate.

---

### 1.9 `public.transfer_requests`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `requesting_facility_id` | uuid | NOT NULL, FK → `facilities(id)` |
| `supplying_facility_id` | uuid | NOT NULL, FK → `facilities(id)` |
| `medicine_id` | uuid | NOT NULL, FK → `medicines(id)` |
| `status` | text | NOT NULL, DEFAULT `'pending'`, CHECK IN (`'pending'`, `'approved'`, `'rejected'`, `'cancelled'`, `'in_transit'`, `'fulfilled'`, `'disputed'`) |
| `urgency` | text | NOT NULL, DEFAULT `'routine'`, CHECK IN (`'routine'`, `'urgent'`, `'critical'`) |
| `quantity_requested` | integer | NOT NULL, CHECK > 0 |
| `quantity_approved` | integer | nullable |
| `quantity_fulfilled` | integer | nullable |
| `reason` | text | nullable |
| `notes` | text | nullable |
| `receipt_confirmed` | boolean | NOT NULL, DEFAULT false |
| `fulfilled_at` | timestamptz | nullable |
| `approved_inventory_item_id` | uuid | FK → `inventory_items(id)` [FROM MIGRATIONS — `00007_tighten_core_rpc_integrity.sql`] |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() |

Trigger: `trg_transfer_requests_updated_at`. RLS: enabled.

> **⚠ UNCERTAINTY:** `approved_inventory_item_id` exists only if `00007_tighten_core_rpc_integrity.sql` was applied to the live DB. The `approve_transfer_request`, `cancel_transfer_request`, and `mark_transfer_in_transit` RPCs all reference this column. If it is absent, those RPCs will fail at runtime.

---

### 1.10 `public.batch_alerts`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `alert_reference` | text | UNIQUE |
| `title` | text | NOT NULL |
| `medicine_name_raw` | text | nullable |
| `medicine_id` | uuid | FK → `medicines(id)` |
| `batch_numbers` | text[] | NOT NULL, DEFAULT `'{}'` |
| `manufacturer` | text | nullable |
| `alert_type` | text | NOT NULL, DEFAULT `'quality_defect'`, CHECK IN (`'recall'`, `'quality_defect'`, `'falsified'`, `'substandard'`, `'safety_warning'`, `'market_withdrawal'`) |
| `severity` | text | NOT NULL, DEFAULT `'urgent'`, CHECK IN (`'critical'`, `'urgent'`, `'routine'`) |
| `source` | text | nullable |
| `issuing_authority` | text | nullable |
| `risk_to_patients` | text | nullable |
| `description` | text | nullable |
| `recommended_action` | text | nullable |
| `public_visible` | boolean | NOT NULL, DEFAULT true |
| `status` | text | NOT NULL, DEFAULT `'active'`, CHECK IN (`'active'`, `'resolved'`) |
| `issued_at` | timestamptz | nullable |
| `expires_at` | timestamptz | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |
| `resolved_at` | timestamptz | nullable |
| `resolved_by` | uuid | FK → `auth.users(id)` [FROM MIGRATIONS — admin_hardening] |

RLS: enabled.

---

### 1.11 `public.alert_facility_responses`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `batch_alert_id` | uuid | NOT NULL, FK → `batch_alerts(id)` ON DELETE CASCADE |
| `facility_id` | uuid | NOT NULL, FK → `facilities(id)` ON DELETE CASCADE |
| `inventory_item_id` | uuid | FK → `inventory_items(id)` ON DELETE SET NULL |
| `matched_batch_number` | text | nullable |
| `units_at_time_of_alert` | integer | nullable |
| `response_status` | text | NOT NULL, DEFAULT `'pending'`, CHECK IN (`'pending'`, `'quarantined'`, `'not_affected'`, `'already_dispensed'`, `'returned_removed'`) |
| `network_suppressed` | boolean | NOT NULL, DEFAULT true |
| `responded_at` | timestamptz | nullable |
| `notes` | text | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

UNIQUE: `(batch_alert_id, facility_id, inventory_item_id)`.  
Indexes: `afr_facility_status_idx`, `afr_inventory_suppressed_idx`. RLS: enabled.

---

### 1.12 `public.admin_audit_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `actor_user_id` | uuid | NOT NULL, FK → `auth.users(id)` |
| `action_type` | text | NOT NULL |
| `target_table` | text | NOT NULL |
| `target_id` | uuid | nullable |
| `facility_id` | uuid | FK → `facilities(id)` ON DELETE SET NULL |
| `before_state` | jsonb | nullable |
| `after_state` | jsonb | nullable |
| `notes` | text | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

Written only by SECURITY DEFINER RPCs. No direct INSERT permitted via RLS.  
Indexes: `admin_audit_logs_actor_idx`, `admin_audit_logs_target_idx`, `admin_audit_logs_created_idx`.

---

### 1.13 Differences From Reconstructed Migrations

| Area | Migration defines | Live DB observation | Risk |
|------|------------------|---------------------|------|
| `medicine_availability_view` shape | Aggregated — one row per facility×medicine. Columns: `total_available`, `earliest_expiry_date`, `batch_count`, `brand_name`/`dispensing_unit`, `country`, `facility_is_verified` | **Per-batch rows** — one row per `inventory_item`. Columns include `inventory_item_id`, `brand_names` (text[]), `quantity_available` (per batch), `expiry_date` (per batch), `batch_number`, `availability_status`. Missing `total_available`, `batch_count`, `country`, `facility_is_verified` | **CONFIRMED. HIGH. Was root cause of search returning no results.** |
| `medicine_search` RPC | Queries `medicine_availability_view` using aggregated column names | Would reference non-existent columns on the live view → runtime error or empty results | **CONFIRMED. HIGH. Frontend now bypasses this RPC entirely.** |
| `transfer_requests.approved_inventory_item_id` | Added by `00007_tighten_core_rpc_integrity.sql` | Unknown — if absent, approve/cancel/in_transit RPCs will fail | UNCERTAIN. MEDIUM. |
| `inventory_movements.movement_type` CHECK | Extended to include `'transfer_out'`, `'transfer_in'` by `00007` | Unknown — if original CHECK is live, transfer dispatch recording will fail | UNCERTAIN. MEDIUM. |
| Named CHECK constraints on `inventory_items` | Added by `00010_tighten_base_schema_constraints.sql` (written this session) | Not applied to live DB | LOW — migration not yet pushed live. |
| `facilities.verified_at` / `suspended_at` etc. | Added by `20260520_admin_hardening.sql` | Unknown — admin RPCs that write these will fail if columns absent | UNCERTAIN. MEDIUM. |

---

## 2. Views

### 2.1 `public.medicine_availability_view`

#### As defined by migrations (`00004_views.sql` + `00008_fix_view_consistency.sql`)

**Type:** Aggregated — one row per `(facility_id, medicine_id)`

**Columns:**

| Column | Source | Type |
|--------|--------|------|
| `medicine_id` | `medicines.id` | uuid |
| `generic_name` | `medicines.generic_name` | text |
| `dosage_form` | `medicines.dosage_form` | text |
| `strength` | `medicines.strength` | text |
| `therapeutic_class` | `medicines.therapeutic_class` | text |
| `facility_id` | `facilities.id` | uuid |
| `facility_name` | `facilities.name` | text |
| `facility_type` | `facilities.facility_type` | text |
| `city` | `facilities.city` | text |
| `state_province` | `facilities.state_province` | text |
| `country` | `facilities.country` | text |
| `facility_is_verified` | `facilities.is_verified` | boolean |
| `total_available` | `SUM(quantity_available - quantity_reserved)` | bigint |
| `earliest_expiry_date` | `MIN(expiry_date)` | date |
| `batch_count` | `COUNT(id)` | bigint |
| `last_updated` | `MAX(updated_at)` | timestamptz |
| `dispensing_unit` | subquery from batch with most net-available stock | text |

**Filters:** `is_active = true`, `network_suppressed = false`, `facilities.is_verified = true`, `facilities.is_active = true`, `(quantity_available - quantity_reserved) > 0`

#### **[CONFIRMED LIVE]** — Actual live DB shape

**Type: PER-BATCH** — one row per `inventory_item`. Not aggregated.

**Live columns (confirmed):**

| Column | Notes |
|--------|-------|
| `inventory_item_id` | Not in migration-defined view |
| `facility_id` | ✓ matches |
| `facility_name` | ✓ matches |
| `facility_type` | ✓ matches |
| `city` | ✓ matches |
| `state_province` | ✓ matches |
| `medicine_id` | ✓ matches |
| `generic_name` | ✓ matches |
| `brand_names` | **`text[]` array type, column name plural** — migration has `brand_name text` scalar |
| `dosage_form` | ✓ matches |
| `strength` | ✓ matches |
| `therapeutic_class` | ✓ matches |
| `quantity_available` | Per-batch integer — migration has `total_available bigint` aggregate |
| `reorder_level` | Per-batch — not in migration-defined view |
| `expiry_date` | Per-batch — migration has `earliest_expiry_date` |
| `batch_number` | Not in migration-defined view |
| `dispensing_unit` | ✓ present |
| `pack_size` | Not in migration-defined view |
| `last_updated` | ✓ matches (added by `00008`) |
| `availability_status` | Computed text — not in migration-defined view |
| **`country`** | **ABSENT from live view** |
| **`facility_is_verified`** | **ABSENT from live view** |
| **`total_available`** | **ABSENT from live view** |
| **`earliest_expiry_date`** | **ABSENT from live view** |
| **`batch_count`** | **ABSENT from live view** |

**Impact:** The migration-defined `medicine_search` RPC cannot work against this view because it references `total_available`, `batch_count`, `facility_is_verified`, `country`, and `brand_name` — none of which exist in the live view. `Search.jsx` was rewritten to bypass the RPC and query this view directly with JS-side aggregation.

**Also used by:** `Transfers.jsx` `NewTransferModal` — queries `medicine_availability_view` filtered by `medicine_id` and `quantity_available > 0` to find which facilities have a given medicine in stock. **This query works correctly against the live view.**

---

## 3. RPCs / Functions

### 3.1 Core RPCs (`00005_core_rpcs.sql`, modified by `00007`, `00008`)

#### `medicine_search`

| | |
|---|---|
| **Parameters** | `p_query text, p_country text, p_state text, p_city text, p_dosage_form text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0` |
| **Returns** | TABLE with medicine/facility/availability columns |
| **Security** | DEFINER, requires `auth.uid() IS NOT NULL` |
| **Frontend caller** | `Search.jsx` — **NOT CALLED**. Frontend was rewritten to query `medicine_availability_view` directly to avoid this broken RPC. |
| **Status** | ⛔ BROKEN on live DB. References column names that don't exist in the live view. Migration `20260528_fix_medicine_search_live_view.sql` was written to fix it but has NOT been applied to the live DB. |

---

#### `create_inventory_item`

| | |
|---|---|
| **Parameters** | `p_facility_id uuid, p_medicine_id uuid, p_batch_number text, p_quantity integer, p_dispensing_unit text DEFAULT 'tablet', p_pack_size integer DEFAULT NULL, p_reorder_level integer DEFAULT 10, p_expiry_date date DEFAULT NULL, p_manufacture_date date DEFAULT NULL, p_brand_name text DEFAULT NULL, p_supplier_id uuid DEFAULT NULL, p_unit_cost numeric DEFAULT NULL, p_selling_price numeric DEFAULT NULL, p_storage_condition text DEFAULT 'room_temperature', p_storage_location text DEFAULT NULL, p_notes text DEFAULT NULL` |
| **Returns** | uuid (new inventory_item id) |
| **Auth check** | Caller must be active staff at `p_facility_id` |
| **Validation** | `p_quantity > 0` |
| **Side effects** | Inserts `inventory_items` row; records initial `'receipt'` movement in `inventory_movements` |
| **Frontend caller** | `Inventory.jsx` → `AddModal.handleSubmit()` |
| **Status** | ✅ Called correctly. All 16 parameters match. |

---

#### `update_inventory_quantity`

| | |
|---|---|
| **Parameters** | `p_inventory_item_id uuid, p_quantity_change integer, p_movement_type text, p_notes text DEFAULT NULL` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at owning facility |
| **Validation** | `movement_type` IN allowed set; result quantity cannot go below 0 |
| **Side effects** | Updates `quantity_available`; records movement; triggers `update_stock_alerts` |
| **Frontend callers** | `Inventory.jsx` → `AdjModal`, `ExpireModal`; `Transfers.jsx` → (indirectly via fulfill RPC) |
| **Status** | ✅ Called correctly with correct param names. ⚠ `movement_type 'transfer_out'/'transfer_in'` — whether the live DB CHECK accepts these depends on whether `00007` was applied. |

---

#### `approve_transfer_request`

| | |
|---|---|
| **Parameters** | `p_request_id uuid, p_quantity_approved integer, p_inventory_item_id uuid` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at `supplying_facility_id` |
| **Validation** | Status must be `'pending'`; inventory_item must belong to supplying facility; available stock ≥ quantity; `p_quantity_approved > 0` |
| **Side effects** | Reserves stock (`quantity_reserved += quantity_approved`); sets `status = 'approved'`; sets `approved_inventory_item_id` |
| **Frontend caller** | `Transfers.jsx` → `ActionModal` type `'approve'` |
| **Status** | ✅ Params match. ⚠ RPC references `approved_inventory_item_id` column — if column absent on live DB, RPC body will error at runtime. |

---

#### `reject_transfer_request`

| | |
|---|---|
| **Parameters** | `p_request_id uuid, p_notes text DEFAULT NULL` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at `supplying_facility_id` |
| **Validation** | Status must be `'pending'` |
| **Frontend caller** | `Transfers.jsx` → `ActionModal` type `'reject'` |
| **Status** | ✅ Called correctly. |

---

#### `cancel_transfer_request`

| | |
|---|---|
| **Parameters** | `p_request_id uuid, p_notes text DEFAULT NULL` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at `requesting_facility_id` |
| **Validation** | Status must be `'pending'` or `'approved'` |
| **Side effects** | If approved: releases reservation from exact batch (`quantity_reserved -= quantity_approved`) |
| **Frontend caller** | `Transfers.jsx` → `ActionModal` type `'cancel'` |
| **Status** | ✅ Params match. ⚠ References `approved_inventory_item_id` for reservation release — same uncertainty as above. |

---

#### `mark_transfer_in_transit`

| | |
|---|---|
| **Parameters** | `p_request_id uuid, p_notes text DEFAULT NULL` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at `supplying_facility_id` |
| **Validation** | Status must be `'approved'`; `approved_inventory_item_id` must exist |
| **Side effects** | Deducts from exact batch; releases reservation; records `'transfer_out'` movement; sets status `'in_transit'` |
| **Frontend caller** | `Transfers.jsx` → `ActionModal` type `'in_transit'` (supplying facility) |
| **Status** | ✅ Params match. ⚠ Depends on `approved_inventory_item_id` column and `'transfer_out'` movement type CHECK. |

---

#### `fulfill_transfer_request`

| | |
|---|---|
| **Parameters** | `p_request_id uuid, p_quantity_fulfilled integer, p_notes text DEFAULT NULL` |
| **Returns** | void |
| **Auth check** | Caller must be active staff at **`requesting_facility_id`** (not supplying) |
| **Validation** | Status must be `'in_transit'`; `p_quantity_fulfilled > 0` |
| **Side effects** | Loads source batch metadata; finds or creates matching batch at requesting facility; adds quantity; records `'transfer_in'` movement; sets `status = 'fulfilled'`, `fulfilled_at = now()` |
| **Frontend caller** | `Transfers.jsx` → `ActionModal` type `'fulfill'` — shown only to requesting facility when status is `'in_transit'` |
| **Status** | ✅ Auth side and params now match — requesting facility calls it. After this RPC succeeds, `Transfers.jsx` also inserts an `inventory_items` row directly as a safety net for legacy transfers that skipped the RPC. ⚠ `'transfer_in'` movement type CHECK uncertainty. |

---

### 3.2 Admin RPCs (`20260520_admin_hardening.sql`)

All admin RPCs require `role = 'system_admin'` in `user_profiles`. All write to `admin_audit_logs`.

| RPC | Parameters | Frontend caller | Status |
|-----|-----------|-----------------|--------|
| `admin_verify_facility` | `p_facility_id uuid, p_notes text DEFAULT NULL` | `Admin.jsx` | ✅ Params match |
| `admin_suspend_facility` | `p_facility_id uuid, p_reason text` | `Admin.jsx` | ✅ Params match. Sets `network_suppressed = true` on inventory, NOT `is_active = false`. |
| `admin_review_inventory_item` | `p_item_id uuid, p_notes text DEFAULT NULL` | `Admin.jsx` | ✅ Params match |
| `admin_remove_inventory_item` | `p_item_id uuid, p_reason text` | `Admin.jsx` | ✅ Params match |
| `admin_resolve_dispute` | `p_request_id uuid, p_action text ('resolve'|'cancel'), p_notes text DEFAULT NULL` | `Admin.jsx` | ✅ Params match |
| `admin_resolve_batch_alert` | `p_alert_id uuid, p_notes text DEFAULT NULL` | `Admin.jsx` | ✅ Params match |

---

### 3.3 Drug Alert RPCs (`20260520d_drug_alert_protocol.sql`, fixes in `00006`, `00007`)

#### `publish_batch_alert`

| | |
|---|---|
| **Parameters** | `p_alert_reference text, p_title text, p_medicine_id uuid DEFAULT NULL, p_medicine_name_raw text DEFAULT NULL, p_batch_numbers text[] DEFAULT '{}', p_manufacturer text DEFAULT NULL, p_alert_type text DEFAULT 'recall', p_severity text DEFAULT 'urgent', p_source text DEFAULT 'NAFDAC', p_issuing_authority text DEFAULT NULL, p_description text DEFAULT '', p_recommended_action text DEFAULT '', p_risk_to_patients text DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL, p_public_visible boolean DEFAULT true` |
| **Returns** | uuid (alert id) |
| **Auth check** | system_admin only |
| **Side effects** | Inserts `batch_alerts`; suppresses matching `inventory_items` (`network_suppressed = true`); creates `alert_facility_responses` rows for each affected facility |
| **Frontend caller** | `Admin.jsx` → publish alert form |
| **Status** | ✅ All params match. |

#### `respond_to_alert`

| | |
|---|---|
| **Parameters** | `p_response_id uuid, p_status text, p_notes text DEFAULT NULL` |
| **Valid statuses** | `'quarantined'`, `'not_affected'`, `'already_dispensed'`, `'returned_removed'` |
| **Auth check** | Caller must be active staff at response's `facility_id` |
| **Side effects** | Updates `alert_facility_responses.response_status`; conditionally lifts `network_suppressed` on `inventory_items` based on status and current stock level |
| **Frontend callers** | `DrugAlerts.jsx`, `Dashboard.jsx` |
| **Status** | ✅ Params match. Suppression logic: `not_affected` → lift; `quarantined` → keep suppressed; `already_dispensed`/`returned_removed` → lift only if `quantity_available = 0`. |

---

### 3.4 Helper Functions

| Function | Returns | Purpose |
|----------|---------|---------|
| `is_system_admin()` | boolean | Checks `user_profiles.role = 'system_admin'` for current user. Used in RLS policies to break recursion. SECURITY DEFINER. |
| `is_facility_admin_at(p_facility_id uuid)` | boolean | Checks `facility_staff` for `role = 'facility_admin'` at given facility. Used in RLS. SECURITY DEFINER. |
| `set_updated_at()` | trigger | Sets `NEW.updated_at = now()`. Used by `inventory_items` and `transfer_requests` triggers. |

---

## 4. Triggers

### 4.1 `auth.users`

| Trigger | Event | Function | Action |
|---------|-------|----------|--------|
| `on_auth_user_created` | AFTER INSERT | `handle_new_user()` SECURITY DEFINER | Inserts row in `user_profiles` (id, full_name from metadata, role = `'pharmacist'`). ON CONFLICT DO NOTHING. |

---

### 4.2 `public.facilities`

| Trigger | Event | Function | Action |
|---------|-------|----------|--------|
| `on_facility_created` | AFTER INSERT | `handle_new_facility()` SECURITY DEFINER | Inserts `facility_staff` row linking `created_by` as `role = 'facility_admin'`. ON CONFLICT DO NOTHING. |

---

### 4.3 `public.inventory_items`

| Trigger | Event | Function | Action |
|---------|-------|----------|--------|
| `trg_inventory_items_updated_at` | BEFORE UPDATE | `set_updated_at()` | Sets `updated_at = now()` |
| `trg_update_stock_alerts` | AFTER UPDATE OF `quantity_available` (WHEN OLD ≠ NEW) | `update_stock_alerts()` SECURITY DEFINER | Creates/resolves `stock_alerts` rows based on thresholds. Logic: qty = 0 → insert `out_of_stock`, resolve `low_stock`; net < reorder_level (was ≥) → insert `low_stock`; net ≥ reorder_level → resolve both. |

---

### 4.4 `public.transfer_requests`

| Trigger | Event | Function | Action |
|---------|-------|----------|--------|
| `trg_transfer_requests_updated_at` | BEFORE UPDATE | `set_updated_at()` | Sets `updated_at = now()` |

---

### 4.5 `public.batch_alerts` / `alert_facility_responses`

No triggers. All side effects are managed within the `publish_batch_alert` and `respond_to_alert` SECURITY DEFINER RPCs.

---

## 5. RLS Policies

### 5.1 `user_profiles`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `user_profiles: own read` | SELECT | `auth.uid() = id` |
| `user_profiles: own update` | UPDATE | `auth.uid() = id` (USING + WITH CHECK) |
| `user_profiles: admin read` | SELECT | `public.is_system_admin()` |

---

### 5.2 `facilities`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `facilities: read verified` | SELECT | `auth.uid() IS NOT NULL AND is_verified = true AND is_active = true` |
| `facilities: read own` | SELECT | Staff exists in `facility_staff` for current user |
| `facilities: insert own` | INSERT | `created_by = auth.uid()` |
| `facilities: update own` | UPDATE | Caller is `facility_admin` at this facility (`is_facility_admin_at()`) |
| `facilities: admin all` | ALL | `public.is_system_admin()` |

---

### 5.3 `facility_staff`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `facility_staff: own read` | SELECT | `user_id = auth.uid()` |
| `facility_staff: facility admin select` | SELECT | `public.is_facility_admin_at(facility_id)` |
| `facility_staff: facility admin insert` | INSERT | `role != 'system_admin' AND is_facility_admin_at(facility_id)` |
| `facility_staff: facility admin update` | UPDATE | `is_facility_admin_at(facility_id)`, WITH CHECK `role != 'system_admin'` |
| `facility_staff: sysadmin all` | ALL | `public.is_system_admin()` |

---

### 5.4 `medicines`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `medicines: authenticated read` | SELECT | `auth.uid() IS NOT NULL AND is_active = true` |
| `medicines: admin write` | ALL | `public.is_system_admin()` |

---

### 5.5 `inventory_items`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `inventory_items: own facility select` | SELECT | Active staff at `facility_id` |
| `inventory_items: own facility insert` | INSERT | Active staff at `facility_id` |
| `inventory_items: own facility update` | UPDATE | Active staff at `facility_id` |
| `inventory_items: network read` | SELECT | `auth.uid() IS NOT NULL AND is_active = true AND network_suppressed = false AND facility.is_verified = true` |
| `inventory_items: admin all` | ALL | `public.is_system_admin()` |

> **Note:** The `"network read"` policy allows any authenticated user to SELECT inventory items from other verified facilities — this is what makes cross-facility search possible. The `network_suppressed` flag is the mechanism that removes recalled/flagged stock from this view without deleting records.

---

### 5.6 `transfer_requests`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `transfer_requests: participant select` | SELECT | Staff at `requesting_facility_id` OR `supplying_facility_id` |
| `transfer_requests: requester insert` | INSERT | Staff at `requesting_facility_id` |
| `transfer_requests: requester limited update` | UPDATE | Staff at requesting; WITH CHECK `status = 'disputed' OR receipt_confirmed = true` |
| `transfer_requests: admin all` | ALL | `public.is_system_admin()` |

> **Important:** The supplying facility has NO UPDATE policy on `transfer_requests`. All status transitions that originate from the supplying side (approve, reject, in_transit) must go through SECURITY DEFINER RPCs. Direct `.update()` calls from the supplying side will be rejected by RLS.

---

### 5.7 `stock_alerts`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `stock_alerts: facility staff read` | SELECT | Active staff at `facility_id` |
| `stock_alerts: facility staff update` | UPDATE | Active staff at `facility_id` |
| `stock_alerts: admin all` | ALL | `public.is_system_admin()` |

---

### 5.8 `batch_alerts`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `batch_alerts: public read` | SELECT | `public_visible = true` |
| `batch_alerts: facility with response` | SELECT | Facility staff with an existing `alert_facility_responses` row for this alert |
| `batch_alerts: admin write` | ALL | `public.is_system_admin()` |

> `MedicineAlerts.jsx` (public page) uses the `public_visible = true` policy. `DrugAlerts.jsx` and `Dashboard.jsx` (authenticated) use the second policy. Both can coexist.

---

### 5.9 `alert_facility_responses`

| Policy name | Command | Expression |
|-------------|---------|------------|
| `alert_facility_responses: facility read` | SELECT | Active staff at `facility_id` |
| `alert_facility_responses: facility update` | UPDATE | Active staff at `facility_id` |
| `alert_facility_responses: admin all` | ALL | `public.is_system_admin()` |

---

## 6. Runtime Contract — Frontend Depends On

### 6.1 Onboarding (`Onboarding.jsx`)

1. `supabase.from('facilities').insert(...)` — direct INSERT with all facility fields
2. Trigger `on_facility_created` fires automatically → creates `facility_staff` row for the creator as `facility_admin`
3. Trigger `on_auth_user_created` must have already fired when user signed up → `user_profiles` row must exist
4. After insert, `useFacility` hook re-fetches `facility_staff` to get the new facility

**Contract:** INSERT on `facilities` must succeed under the `facilities: insert own` RLS policy (`created_by = auth.uid()`).

---

### 6.2 Inventory Add/Edit (`Inventory.jsx`)

**Add:** `supabase.rpc('create_inventory_item', { 16 params })` → returns new item uuid  
**Adjust:** `supabase.rpc('update_inventory_quantity', { p_inventory_item_id, p_quantity_change, p_movement_type, p_notes })`  
**Expire:** `update_inventory_quantity` with `movement_type = 'expired_removal'` then `.update({ is_active: false })`  
**Edit:** Direct `.update()` on `inventory_items` — works under own-facility SELECT + UPDATE RLS  

All inventory operations are gated by active staff membership at the facility.

---

### 6.3 Medicine Network Search (`Search.jsx`)

**Current contract (live):**
```
supabase
  .from('medicine_availability_view')
  .select('facility_id, facility_name, facility_type, city, state_province,
           medicine_id, generic_name, brand_names, dosage_form, strength,
           dispensing_unit, quantity_available, expiry_date')
  .gt('quantity_available', 0)
  .ilike('generic_name', `%${query}%`)
  [.ilike('state_province', ...), .ilike('city', ...), .eq('dosage_form', ...)]
  .limit(500)
```

Aggregation (total_available, batch_count, earliest_expiry_date) is done in JavaScript after receiving per-batch rows. `brand_names` is handled as either `text[]` or `text` — the first element is used.

**The `medicine_search` RPC is NOT used.** It is broken on the live DB.

---

### 6.4 Transfer Request (`Transfers.jsx`)

1. `medicines` select → populate medicine dropdown
2. On medicine select: query `medicine_availability_view` filtered by `medicine_id` and `quantity_available > 0` → populate supplier facility dropdown (only facilities with that medicine in stock)
3. Duplicate check: query `transfer_requests` for existing active requests with same medicine + same supplier
4. Submit: `supabase.from('transfer_requests').insert({ requesting_facility_id, supplying_facility_id, medicine_id, quantity_requested, urgency, reason, requested_by, status: 'pending' })`

**Contract:** Requester must be authenticated staff. `medicine_availability_view` must return columns `facility_id, facility_name, facility_type, city, state_province, quantity_available` for the given `medicine_id`.

---

### 6.5 Transfer Approval Flow (`Transfers.jsx`)

```
pending  → approve  : supabase.rpc('approve_transfer_request', { p_request_id, p_quantity_approved, p_inventory_item_id })
pending  → reject   : supabase.rpc('reject_transfer_request', { p_request_id, p_notes })
pending  → cancel   : supabase.rpc('cancel_transfer_request', { p_request_id, p_notes })
approved → dispatch : supabase.rpc('mark_transfer_in_transit', { p_request_id, p_notes })
in_transit → fulfill: supabase.rpc('fulfill_transfer_request', { p_request_id, p_quantity_fulfilled, p_notes })
in_transit → receive: Also: .from('inventory_items').insert({...}) + .update({ receipt_confirmed: true })
```

**Auth rules enforced by RPCs:**
- approve/reject/dispatch: caller must be staff at `supplying_facility_id`
- cancel/fulfill: caller must be staff at `requesting_facility_id`

**Batch selection for approve:** Frontend queries `inventory_items` for the supplying facility filtered by `medicine_id` and `is_active = true`, shows available batches, user selects one — its `id` becomes `p_inventory_item_id`.

---

### 6.6 Alerts (`Alerts.jsx`, `Dashboard.jsx`)

**Stock alerts:** `supabase.from('stock_alerts').select('*, inventory_items(...)').eq('facility_id', ...).eq('status', 'active')`  
Auto-generated by `trg_update_stock_alerts` trigger on `inventory_items.quantity_available` changes.  
Near-expiry alerts: require external scheduled job — **may not be active on live DB.**

**Drug alerts (facility):** `supabase.from('alert_facility_responses').select('..., batch_alerts(...)')` — reads responses created by `publish_batch_alert` RPC  
**Response:** `supabase.rpc('respond_to_alert', { p_response_id, p_status, p_notes })`

---

### 6.7 Public Medicine Alerts (`MedicineAlerts.jsx`)

`supabase.from('batch_alerts').select('...').eq('public_visible', true).neq('status', 'resolved').order('created_at', { ascending: false })`

No authentication required. Allowed by `batch_alerts: public read` RLS policy.

---

## 7. Dangerous Mismatches Still Present

| # | Mismatch | Severity | Current state |
|---|----------|----------|---------------|
| 1 | **`medicine_search` RPC broken** | 🔴 HIGH | RPC references aggregated column names that don't exist in live view. Frontend bypassed it in `Search.jsx`. Migration fix written (`20260528_fix_medicine_search_live_view.sql`) but NOT applied to live DB. If any code path still calls this RPC directly, it will fail silently. | 
| 2 | **`medicine_availability_view` shape mismatch** | 🔴 HIGH | Live view is per-batch; migration stack defines aggregated view. If the migration stack is ever re-applied (e.g., reset + replay), `Search.jsx` and `Transfers.jsx` will break because the column names will change. |
| 3 | **`approved_inventory_item_id` on `transfer_requests`** | 🟡 MEDIUM | If the `00007_tighten_core_rpc_integrity.sql` migration was NOT applied to the live DB, then `approve_transfer_request`, `cancel_transfer_request`, and `mark_transfer_in_transit` RPCs will fail at runtime when they try to write/read that column. |
| 4 | **`movement_type` CHECK — `transfer_out`/`transfer_in`** | 🟡 MEDIUM | If the original CHECK (`'receipt','dispensed','adjustment','expired_removal','return'`) is still live (00007 not applied), the `mark_transfer_in_transit` RPC's internal `update_inventory_quantity` call will be rejected. |
| 5 | **`inventory_items` named CHECK constraints** | 🟢 LOW | Migration `00010_tighten_base_schema_constraints.sql` was written this session but NOT applied to live DB. Rows violating `quantity_reserved <= quantity_available` are possible. |
| 6 | **Near-expiry alerts not auto-generating** | 🟡 MEDIUM | No pg_cron or Edge Function confirmed on live DB for near-expiry alert creation. The `near_expiry` alert_type exists in the schema but likely never populates. |
| 7 | **Admin hardening columns** | 🟡 MEDIUM | `facilities.verified_at`, `suspended_at`, `inventory_items.network_suppressed`, `admin_reviewed_at` etc. exist in migrations but whether they're live is unknown. Admin RPCs will fail if columns absent. |
| 8 | **Direct inventory INSERT after fulfill** | 🟠 DESIGN NOTE | `Transfers.jsx` inserts an `inventory_items` row directly (via `.from('inventory_items').insert(...)`) as a safety net after calling `fulfill_transfer_request`. This row has no `batch_number` semantics (uses auto-generated TRANSFER-{date}) and hardcodes `dispensing_unit: 'tablet'`. The RPC also adds stock (correctly, with the real batch metadata) — so if the RPC succeeds, stock is added twice. This needs review. |

---

## 8. Do Not Touch Without Developer Review

The following areas carry meaningful risk if changed without careful review:

### 8.1 `medicine_availability_view`
The live DB view is fundamentally different from the migration-defined view. `Search.jsx` and `Transfers.jsx` were written specifically for the live per-batch shape. Any change to this view — or any migration that replaces it with the aggregated shape — will break both pages.

### 8.2 `network_suppressed` on `inventory_items`
This column is the drug-alert suppression mechanism. Setting `network_suppressed = true` hides stock from the search network without deleting it. `admin_suspend_facility` sets it on all items when a facility is suspended. `respond_to_alert` conditionally lifts it. Do **not** conflate it with `is_active`. The comment in `00001_base_schema.sql` is explicit: "Do NOT use `is_active = false` to suppress inventory from network search."

### 8.3 `respond_to_alert` suppression logic
The `already_dispensed` and `returned_removed` statuses will only lift suppression if `quantity_available = 0`. This is intentional — it prevents facilities from falsely claiming they dispensed recalled stock to re-enable it. Do not loosen this check.

### 8.4 Transfer RPC auth sides
- Supplying facility: `approve_transfer_request`, `reject_transfer_request`, `mark_transfer_in_transit`
- Requesting facility: `cancel_transfer_request`, `fulfill_transfer_request`

These auth requirements are enforced inside the RPCs. The frontend UI was realigned to match (fulfill button shown only to requesting facility). Swapping which facility calls which RPC will produce auth errors from inside the RPC body.

### 8.5 `approved_inventory_item_id` on `transfer_requests`
This column tracks which specific inventory batch was reserved for a transfer. It's required by `cancel_transfer_request` (to release the reservation from the exact batch) and `mark_transfer_in_transit` (to deduct from the exact batch). If this column doesn't exist on the live DB, the entire approval → dispatch → fulfill flow is broken at the database level.

### 8.6 `batch_alerts.public_visible` flag
This is the only mechanism controlling whether a drug alert appears on the public-facing `MedicineAlerts.jsx` page (accessible without login from `/ng`). Do not remove this column or change its default.

### 8.7 `facility_staff` as the auth backbone
Every RLS policy and every SECURITY DEFINER RPC resolves facility membership by querying `facility_staff` for `(user_id = auth.uid(), facility_id, is_active = true)`. This table is the root of all per-facility authorization. Any schema change to `facility_staff` — adding required columns, changing the unique constraint, altering `is_active` semantics — will cascade through every policy and RPC.

### 8.8 `is_system_admin()` and `is_facility_admin_at()` helper functions
These SECURITY DEFINER functions were introduced specifically to break RLS infinite recursion (a facility_admin reading facilities → RLS checks facility_staff → which checks facilities → loop). Replacing them with inline subqueries in RLS policies may reintroduce the recursion.

---

*End of Live Supabase Baseline Report*
