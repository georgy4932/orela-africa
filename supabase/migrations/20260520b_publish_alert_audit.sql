-- =============================================================
-- Amend publish_batch_alert to write to admin_audit_logs
-- Run AFTER 20260520_admin_hardening.sql has been applied
-- =============================================================

CREATE OR REPLACE FUNCTION public.publish_batch_alert(
  p_alert_reference    text,
  p_title              text,
  p_medicine_id        uuid    DEFAULT NULL,
  p_medicine_name_raw  text    DEFAULT NULL,
  p_batch_numbers      text[]  DEFAULT '{}',
  p_manufacturer       text    DEFAULT NULL,
  p_alert_type         text    DEFAULT 'recall',
  p_severity           text    DEFAULT 'urgent',
  p_source             text    DEFAULT 'NAFDAC',
  p_issuing_authority  text    DEFAULT NULL,
  p_description        text    DEFAULT '',
  p_recommended_action text    DEFAULT '',
  p_risk_to_patients   text    DEFAULT NULL,
  p_expires_at         timestamptz DEFAULT NULL,
  p_public_visible     boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'system_admin'
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  INSERT INTO batch_alerts (
    alert_reference, title, medicine_id, medicine_name_raw,
    batch_numbers, manufacturer, alert_type, severity,
    source, issuing_authority, description, recommended_action,
    risk_to_patients, expires_at, public_visible,
    status, issued_at, created_at
  ) VALUES (
    p_alert_reference, p_title, p_medicine_id, p_medicine_name_raw,
    p_batch_numbers, p_manufacturer, p_alert_type, p_severity,
    p_source, p_issuing_authority, p_description, p_recommended_action,
    p_risk_to_patients, p_expires_at, p_public_visible,
    'active', now(), now()
  )
  RETURNING id INTO v_alert_id;

  INSERT INTO admin_audit_logs (actor_user_id, action_type, target_table, target_id, notes)
  VALUES (
    auth.uid(),
    'publish_batch_alert',
    'batch_alerts',
    v_alert_id,
    p_alert_reference || ' — ' || p_title
  );

  RETURN v_alert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_batch_alert(
  text, text, uuid, text, text[], text, text, text,
  text, text, text, text, text, timestamptz, boolean
) TO authenticated;
