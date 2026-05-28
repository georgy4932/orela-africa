-- 20260528_fix_medicine_search_live_view.sql
--
-- Problem: medicine_search references column names that exist in the
-- migration-defined medicine_availability_view (total_available, batch_count,
-- earliest_expiry_date, brand_name, country, facility_is_verified) but the
-- live DB view has per-batch rows with different column names
-- (quantity_available, expiry_date, brand_names, availability_status —
-- no country, no facility_is_verified, no aggregated totals).
--
-- Fix: rewrite medicine_search to aggregate directly from the per-batch live
-- view, joining public.facilities for country and is_verified.
--
-- Return type is unchanged so Search.jsx needs no column-name changes.
-- The LATERAL joins avoid type ambiguity on brand_names (text vs text[]).

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
    agg.medicine_id,
    agg.generic_name,
    bn.brand_name,
    agg.dosage_form,
    agg.strength,
    agg.therapeutic_class,
    agg.facility_id,
    agg.facility_name,
    agg.facility_type,
    agg.city,
    agg.state_province,
    agg.country,
    agg.facility_is_verified,
    agg.total_available,
    agg.earliest_expiry_date,
    agg.batch_count,
    du.dispensing_unit
  FROM (
    -- Aggregate per-batch rows into one row per (facility × medicine)
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
      f.country,
      f.is_verified                        AS facility_is_verified,
      SUM(v.quantity_available)::bigint    AS total_available,
      MIN(v.expiry_date)                   AS earliest_expiry_date,
      COUNT(*)::bigint                     AS batch_count
    FROM public.medicine_availability_view v
    JOIN public.facilities f ON f.id = v.facility_id
    WHERE
      f.is_verified = true
      AND f.is_active = true
      AND v.quantity_available > 0
      -- Text search across generic_name and brand_names (cast handles text/text[])
      AND (
        p_query IS NULL
        OR v.generic_name   ILIKE '%' || p_query || '%'
        OR v.brand_names::text ILIKE '%' || p_query || '%'
      )
      AND (p_country     IS NULL OR f.country        =      p_country)
      AND (p_state       IS NULL OR v.state_province ILIKE '%' || p_state || '%')
      AND (p_city        IS NULL OR v.city           ILIKE '%' || p_city  || '%')
      AND (p_dosage_form IS NULL OR v.dosage_form    ILIKE p_dosage_form)
    GROUP BY
      v.medicine_id, v.generic_name, v.dosage_form, v.strength, v.therapeutic_class,
      v.facility_id, v.facility_name, v.facility_type, v.city, v.state_province,
      f.country, f.is_verified
    HAVING SUM(v.quantity_available) > 0
  ) agg
  -- LATERAL: pick a representative brand_name from inventory_items
  -- (avoids brand_names text/text[] type ambiguity entirely)
  LEFT JOIN LATERAL (
    SELECT ii.brand_name
    FROM public.inventory_items ii
    WHERE ii.facility_id = agg.facility_id
      AND ii.medicine_id = agg.medicine_id
      AND ii.is_active = true
      AND ii.brand_name IS NOT NULL
    ORDER BY ii.quantity_available DESC
    LIMIT 1
  ) bn ON true
  -- LATERAL: pick a representative dispensing_unit from inventory_items
  LEFT JOIN LATERAL (
    SELECT ii2.dispensing_unit
    FROM public.inventory_items ii2
    WHERE ii2.facility_id = agg.facility_id
      AND ii2.medicine_id = agg.medicine_id
      AND ii2.is_active = true
    ORDER BY ii2.quantity_available DESC
    LIMIT 1
  ) du ON true
  ORDER BY agg.total_available DESC, agg.generic_name ASC
  LIMIT  LEAST(COALESCE(p_limit,  50), 200)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.medicine_search(text, text, text, text, text, integer, integer) TO authenticated;
