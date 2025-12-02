-- Fix security definer view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS unreviewed_matches;

CREATE VIEW unreviewed_matches 
WITH (security_invoker = true) AS
SELECT 
  lhm.id as match_id,
  lhm.load_email_id,
  lhm.hunt_plan_id,
  lhm.vehicle_id,
  lhm.distance_miles,
  lhm.is_active,
  lhm.matched_at,
  le.email_id,
  le.from_email,
  le.from_name,
  le.subject,
  le.received_at,
  le.expires_at,
  le.status as email_status,
  le.parsed_data,
  le.load_id,
  hp.plan_name,
  hp.enabled as hunt_enabled,
  hp.vehicle_size,
  hp.pickup_radius,
  hp.zip_code as hunt_zip
FROM load_hunt_matches lhm
JOIN load_emails le ON le.id = lhm.load_email_id
JOIN hunt_plans hp ON hp.id = lhm.hunt_plan_id
WHERE lhm.is_active = true
  AND le.status = 'new'
  AND hp.enabled = true
ORDER BY le.received_at DESC;

GRANT SELECT ON unreviewed_matches TO authenticated;