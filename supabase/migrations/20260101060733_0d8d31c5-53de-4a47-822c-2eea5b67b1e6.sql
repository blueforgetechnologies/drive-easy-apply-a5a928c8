
-- Update the unreviewed_matches view to include tenant_id from hunt_plans
-- This allows proper tenant filtering in queries
DROP VIEW IF EXISTS unreviewed_matches;

CREATE VIEW unreviewed_matches AS
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
    hp.plan_name,
    hp.enabled AS hunt_enabled,
    hp.vehicle_size,
    hp.pickup_radius,
    hp.zip_code AS hunt_zip,
    hp.tenant_id  -- Add tenant_id for proper tenant filtering
FROM load_hunt_matches m
JOIN load_emails e ON m.load_email_id = e.id
JOIN hunt_plans hp ON m.hunt_plan_id = hp.id
WHERE 
    m.match_status = 'active' 
    AND m.is_active = true 
    AND hp.enabled = true 
    AND (e.expires_at IS NULL OR e.expires_at > now());

-- Grant access to the view
GRANT SELECT ON unreviewed_matches TO authenticated;
GRANT SELECT ON unreviewed_matches TO anon;
