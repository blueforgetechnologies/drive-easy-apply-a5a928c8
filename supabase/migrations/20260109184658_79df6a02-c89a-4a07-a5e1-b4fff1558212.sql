-- Drop and recreate the view to add new columns for update tracking
DROP VIEW IF EXISTS public.unreviewed_matches;

CREATE VIEW public.unreviewed_matches AS
SELECT 
    m.id AS match_id,
    m.load_email_id,
    m.hunt_plan_id,
    m.vehicle_id,
    m.distance_miles,
    m.is_active,
    m.match_status,
    m.matched_at,
    e.email_id,
    e.from_email,
    e.from_name,
    e.subject,
    e.received_at,
    e.expires_at,
    e.status AS email_status,
    e.parsed_data,
    e.load_id,
    e.email_source,
    e.is_update,
    e.parent_email_id,
    e.content_hash,
    hp.plan_name,
    hp.enabled AS hunt_enabled,
    hp.vehicle_size,
    hp.pickup_radius,
    hp.zip_code AS hunt_zip,
    hp.tenant_id
FROM load_hunt_matches m
JOIN load_emails e ON m.load_email_id = e.id
JOIN hunt_plans hp ON m.hunt_plan_id = hp.id
WHERE m.match_status = 'active'
  AND m.is_active = true
  AND hp.enabled = true
  AND (e.expires_at IS NULL OR e.expires_at > now());