-- Drop and recreate unreviewed_matches view to use match_status
DROP VIEW IF EXISTS public.unreviewed_matches;

CREATE VIEW public.unreviewed_matches AS
SELECT 
    lhm.id AS match_id,
    lhm.load_email_id,
    lhm.hunt_plan_id,
    lhm.vehicle_id,
    lhm.distance_miles,
    lhm.is_active,
    lhm.match_status,
    lhm.matched_at,
    le.email_id,
    le.from_email,
    le.from_name,
    le.subject,
    le.received_at,
    le.expires_at,
    le.status AS email_status,
    le.parsed_data,
    le.load_id,
    hp.plan_name,
    hp.enabled AS hunt_enabled,
    hp.vehicle_size,
    hp.pickup_radius,
    hp.zip_code AS hunt_zip
FROM load_hunt_matches lhm
JOIN load_emails le ON le.id = lhm.load_email_id
JOIN hunt_plans hp ON hp.id = lhm.hunt_plan_id
WHERE lhm.match_status = 'active' 
  AND le.status = 'new'::text 
  AND hp.enabled = true
ORDER BY le.received_at DESC;