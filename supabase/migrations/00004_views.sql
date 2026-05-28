-- =============================================================================
-- 00004_views.sql
-- Database views. Run after 00001_base_schema.sql.
-- CREATE OR REPLACE is idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- medicine_availability_view
-- Aggregates available inventory per medicine per facility for network search.
--
-- Consumed by: medicine_search RPC (00005_core_rpcs.sql)
-- Also used by: Search.jsx indirectly via the RPC
--
-- Filtering rules (must be preserved exactly):
--   - inventory_items.is_active = true       (soft-deleted items excluded)
--   - inventory_items.network_suppressed = false  (suppressed by admin or
--       drug alert — excluded from network, but record is NOT deleted)
--   - facilities.is_verified = true          (unverified facilities excluded)
--   - facilities.is_active = true            (suspended facilities excluded)
--   - net_available > 0                      (zero-stock not shown in search)
--
-- IMPORTANT: Do NOT remove the network_suppressed filter. Suppression is the
-- mechanism used to hide recalled/flagged stock without deleting records.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.medicine_availability_view AS
SELECT
  -- Medicine identity (Search.jsx result row display)
  m.id                                                    AS medicine_id,
  m.generic_name,
  m.dosage_form,
  m.strength,
  m.therapeutic_class,

  -- Facility info (shown in Search.jsx results)
  f.id                                                    AS facility_id,
  f.name                                                  AS facility_name,
  f.facility_type,
  f.city,
  f.state_province,
  f.country,
  f.is_verified                                           AS facility_is_verified,

  -- Aggregated stock data across all matching batches at this facility
  SUM(ii.quantity_available - ii.quantity_reserved)       AS total_available,
  MIN(ii.expiry_date)                                     AS earliest_expiry_date,
  COUNT(ii.id)                                            AS batch_count,

  -- Representative values from the batch with the most stock
  -- (brand_name and dispensing_unit may vary across batches; pick dominant)
  (
    SELECT ii2.brand_name
    FROM public.inventory_items ii2
    WHERE ii2.facility_id = f.id
      AND ii2.medicine_id = m.id
      AND ii2.is_active = true
      AND ii2.network_suppressed = false
      AND ii2.quantity_available > ii2.quantity_reserved
    ORDER BY ii2.quantity_available DESC
    LIMIT 1
  )                                                       AS brand_name,
  (
    SELECT ii3.dispensing_unit
    FROM public.inventory_items ii3
    WHERE ii3.facility_id = f.id
      AND ii3.medicine_id = m.id
      AND ii3.is_active = true
      AND ii3.network_suppressed = false
    ORDER BY ii3.quantity_available DESC
    LIMIT 1
  )                                                       AS dispensing_unit

FROM public.inventory_items ii
JOIN public.medicines   m ON m.id = ii.medicine_id
JOIN public.facilities  f ON f.id = ii.facility_id

WHERE
  ii.is_active         = true
  AND ii.network_suppressed = false
  AND f.is_verified    = true
  AND f.is_active      = true
  AND (ii.quantity_available - ii.quantity_reserved) > 0

GROUP BY
  m.id, m.generic_name, m.dosage_form, m.strength, m.therapeutic_class,
  f.id, f.name, f.facility_type, f.city, f.state_province, f.country, f.is_verified;
