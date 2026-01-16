-- Fix SECURITY DEFINER views by recreating them with SECURITY INVOKER
-- This ensures queries respect the caller's permissions instead of the view creator's

-- Drop and recreate worker_health_status view
DROP VIEW IF EXISTS public.worker_health_status;
CREATE VIEW public.worker_health_status 
WITH (security_invoker = true)
AS
SELECT 
  id AS worker_id,
  last_heartbeat,
  status,
  emails_sent,
  emails_failed,
  loops_completed,
  current_batch_size,
  rate_limit_until,
  error_message,
  CASE
    WHEN last_heartbeat > (now() - interval '2 minutes') THEN 'online'
    WHEN last_heartbeat > (now() - interval '5 minutes') THEN 'stale'
    ELSE 'offline'
  END AS connection_status,
  EXTRACT(epoch FROM now() - last_heartbeat) AS seconds_since_heartbeat
FROM worker_heartbeats;

-- Drop and recreate load_content_top10_7d view
DROP VIEW IF EXISTS public.load_content_top10_7d;
CREATE VIEW public.load_content_top10_7d 
WITH (security_invoker = true)
AS
SELECT 
  fingerprint,
  provider,
  receipt_count,
  first_seen_at,
  last_seen_at
FROM load_content
WHERE first_seen_at > (now() - interval '7 days')
ORDER BY receipt_count DESC
LIMIT 10;

-- Drop and recreate load_content_metrics_24h view
DROP VIEW IF EXISTS public.load_content_metrics_24h;
CREATE VIEW public.load_content_metrics_24h 
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT 
    id,
    received_at,
    dedup_eligible,
    load_content_fingerprint,
    parsed_load_fingerprint
  FROM load_emails
  WHERE received_at > (now() - interval '24 hours')
), 
metrics_24h AS (
  SELECT 
    count(*) AS receipts_24h,
    count(*) FILTER (WHERE dedup_eligible = true) AS eligible_receipts_24h,
    count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS eligible_with_fk_24h,
    count(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS unique_content_24h,
    count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NULL) AS missing_fk_24h
  FROM base
),
metrics_1h AS (
  SELECT 
    count(*) FILTER (WHERE dedup_eligible = true) AS eligible_1h,
    count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NULL) AS missing_fk_1h,
    count(*) FILTER (WHERE dedup_eligible = true AND parsed_load_fingerprint IS NULL) AS missing_parsed_fp_1h
  FROM load_emails
  WHERE received_at > (now() - interval '1 hour')
)
SELECT 
  m24.receipts_24h,
  m24.eligible_receipts_24h,
  m24.eligible_with_fk_24h,
  m24.unique_content_24h,
  m24.missing_fk_24h,
  CASE WHEN m24.eligible_receipts_24h = 0 THEN 0 
    ELSE round(100.0 * m24.eligible_with_fk_24h / m24.eligible_receipts_24h, 2) 
  END AS coverage_rate_24h,
  CASE WHEN m24.eligible_with_fk_24h = 0 THEN 0 
    ELSE round(100.0 * (1.0 - m24.unique_content_24h::numeric / m24.eligible_with_fk_24h), 2) 
  END AS reuse_rate_24h,
  m1.eligible_1h,
  m1.missing_fk_1h,
  m1.missing_parsed_fp_1h
FROM metrics_24h m24, metrics_1h m1;

-- Drop and recreate load_content_provider_breakdown_24h view
DROP VIEW IF EXISTS public.load_content_provider_breakdown_24h;
CREATE VIEW public.load_content_provider_breakdown_24h 
WITH (security_invoker = true)
AS
SELECT 
  CASE
    WHEN lower(COALESCE(email_source, '')) = 'sylectus' THEN 'sylectus'
    WHEN lower(COALESCE(email_source, '')) = 'fullcircle' THEN 'fullcircle'
    ELSE 'other'
  END AS provider,
  count(*) AS receipts,
  count(*) FILTER (WHERE dedup_eligible = true) AS eligible,
  count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS eligible_with_fk,
  count(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS unique_content,
  CASE WHEN count(*) FILTER (WHERE dedup_eligible = true) = 0 THEN 0 
    ELSE round(100.0 * count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) / count(*) FILTER (WHERE dedup_eligible = true), 2) 
  END AS coverage_rate,
  CASE WHEN count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) = 0 THEN 0 
    ELSE round(100.0 * (1.0 - count(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL)::numeric / count(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL)), 2) 
  END AS reuse_rate
FROM load_emails
WHERE received_at > (now() - interval '24 hours')
GROUP BY 1;

-- Drop and recreate unreviewed_matches view
DROP VIEW IF EXISTS public.unreviewed_matches;
CREATE VIEW public.unreviewed_matches 
WITH (security_invoker = true)
AS
SELECT 
  lhm.*,
  le.subject,
  le.from_email,
  le.parsed_data,
  le.received_at,
  hp.plan_name,
  hp.vehicle_id as hunt_vehicle_id
FROM load_hunt_matches lhm
JOIN load_emails le ON le.id = lhm.load_email_id
JOIN hunt_plans hp ON hp.id = lhm.hunt_plan_id
WHERE lhm.is_active = true
  AND lhm.match_status = 'active';

-- Drop and recreate content_dedup_metrics view
DROP VIEW IF EXISTS public.content_dedup_metrics;
CREATE VIEW public.content_dedup_metrics 
WITH (security_invoker = true)
AS
SELECT 
  count(*) AS total_content_rows,
  sum(receipt_count) AS total_receipts,
  count(*) FILTER (WHERE receipt_count > 1) AS reused_content,
  sum(receipt_count) FILTER (WHERE receipt_count > 1) - count(*) FILTER (WHERE receipt_count > 1) AS duplicate_receipts_saved,
  CASE WHEN sum(receipt_count) = 0 THEN 0 
    ELSE round(100.0 * (sum(receipt_count) - count(*)) / sum(receipt_count), 2) 
  END AS dedup_savings_percent
FROM load_content;

-- Drop and recreate load_dedup_metrics view  
DROP VIEW IF EXISTS public.load_dedup_metrics;
CREATE VIEW public.load_dedup_metrics 
WITH (security_invoker = true)
AS
SELECT 
  count(*) AS total_emails,
  count(*) FILTER (WHERE is_duplicate = true) AS duplicates_detected,
  count(*) FILTER (WHERE dedup_eligible = true) AS dedup_eligible_count,
  count(*) FILTER (WHERE load_content_fingerprint IS NOT NULL) AS with_content_fk,
  CASE WHEN count(*) = 0 THEN 0 
    ELSE round(100.0 * count(*) FILTER (WHERE is_duplicate = true) / count(*), 2) 
  END AS duplicate_rate,
  CASE WHEN count(*) FILTER (WHERE dedup_eligible = true) = 0 THEN 0 
    ELSE round(100.0 * count(*) FILTER (WHERE load_content_fingerprint IS NOT NULL) / count(*) FILTER (WHERE dedup_eligible = true), 2) 
  END AS fk_coverage_rate
FROM load_emails
WHERE received_at > (now() - interval '7 days');