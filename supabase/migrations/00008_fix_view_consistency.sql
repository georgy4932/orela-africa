-- =============================================================================
-- 00008_fix_view_consistency.sql
-- Corrects medicine_availability_view and the medicine_search RPC.
--
-- Problems fixed:
--   1. brand_name was read from the batch with the most stock, while
--      earliest_expiry_date is MIN(expiry_date) across all batches.
--      These two fields could come from completely different batches,
--      showing a brand that does not correspond to the soonest-expiring stock.
--      Fix: remove brand_name from the view (Option A). Search.jsx already
--      guards the field with a null check so the UI degrades gracefully.
--
--   2. dispensing_unit subquery was missing the
--      (quantity_available - quantity_reserved) > 0 filter that the outer
--      WHERE enforces for every other batch. It could therefore pick a
--      batch that is fully reserved and invisible to the aggregate.
--      Fix: add the missing net_available filter and a stable id tiebreaker
--      so the result is deterministic when two batches have the same qty.
--
--   3. No freshness signal was exposed.
--      Fix: add MAX(ii.updated_at) AS last_updated to both the view and RPC.
--
-- Filters preserved exactly:
--   ii.is_active = true
--   ii.network_suppressed = false
--   f.is_verified = true
--   f.is_active = true
--   (ii.quantity_available - ii.quantity_reserved) > 0
--
-- Run AFTER 00005_core_rpcs.sql and after any 00007_* migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace medicine_availability_view
-- PostgreSQL does not allow CREATE OR REPLACE VIEW when removing a column.
-- Drop the view first; the medicine_search RPC is PL/pgSQL so PostgreSQL
-- does not track it as a formal dependency — the DROP does not cascade to it.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.medicine_availability_view;
CREATE VIEW public.medicine_availability_view AS
SELECT
  -- Medicine identity
  m.id                                                    AS medicine_id,
  m.generic_name,
  m.dosage_form,
  m.strength,
  m.therapeutic_class,

  -- Facility
  f.id                                                    AS facility_id,
  f.name                                                  AS facility_name,
  f.facility_type,
  f.city,
  f.state_province,
  f.country,
  f.is_verified                                           AS facility_is_verified,

  -- Aggregated stock (all matching batches at this facility)
  SUM(ii.quantity_available - ii.quantity_reserved)       AS total_available,
  MIN(ii.expiry_date)                                     AS earliest_expiry_date,
  COUNT(ii.id)                                            AS batch_count,
  MAX(ii.updated_at)                                      AS last_updated,

  -- dispensing_unit from the batch with the most net-available stock.
  -- Applies the same net_available filter as the outer WHERE so it cannot
  -- return a batch that is fully reserved. Tiebroken by id for stability.
  (
    SELECT ii2.dispensing_unit
    FROM public.inventory_items ii2
    WHERE ii2.facility_id              = f.id
      AND ii2.medicine_id              = m.id
      AND ii2.is_active                = true
      AND ii2.network_suppressed       = false
      AND (ii2.quantity_available - ii2.quantity_reserved) > 0
    ORDER BY (ii2.quantity_available - ii2.quantity_reserved) DESC, ii2.id ASC
    LIMIT 1
  )                                                       AS dispensing_unit

FROM public.inventory_items ii
JOIN public.medicines  m ON m.id = ii.medicine_id
JOIN public.facilities f ON f.id = ii.facility_id

WHERE
  ii.is_active              = true
  AND ii.network_suppressed = false
  AND f.is_verified         = true
  AND f.is_active           = true
  AND (ii.quantity_available - ii.quantity_reserved) > 0

GROUP BY
  m.id, m.generic_name, m.dosage_form, m.strength, m.therapeutic_class,
  f.id, f.name, f.facility_type, f.city, f.state_province, f.country,
  f.is_verified;

-- ---------------------------------------------------------------------------
-- 2. Replace medicine_search RPC
-- Adding last_updated and removing brand_name changes the return type, so
-- the old function must be dropped before the new one can be created.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.medicine_search(text, text, text, text, text, integer, integer);

CREATE FUNCTION public.medicine_search(
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
  dispensing_unit      text,
  last_updated         timestamptz
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
    v.dispensing_unit,
    v.last_updated
  FROM public.medicine_availability_view v
  WHERE
    (
      p_query IS NULL
      OR v.generic_name ILIKE '%' || p_query || '%'
    )
    AND (p_country     IS NULL OR v.country        ILIKE p_country)
    AND (p_state       IS NULL OR v.state_province ILIKE '%' || p_state || '%')
    AND (p_city        IS NULL OR v.city           ILIKE '%' || p_city  || '%')
    AND (p_dosage_form IS NULL OR v.dosage_form    ILIKE p_dosage_form)
  ORDER BY v.total_available DESC, v.generic_name ASC
  LIMIT  LEAST(COALESCE(p_limit,  50), 200)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.medicine_search(text, text, text, text, text, integer, integer) TO authenticated;
