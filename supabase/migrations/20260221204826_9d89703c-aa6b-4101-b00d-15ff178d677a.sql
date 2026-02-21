
-- 1) Add matching_enabled flag to worker_config (default false)
ALTER TABLE public.worker_config
ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false;

-- 2) Recreate ops_pipeline_health view to gate matching checks behind matching_enabled
CREATE OR REPLACE VIEW public.ops_pipeline_health AS
WITH stubs_30m AS (
  SELECT
    count(*) FILTER (WHERE created_at > now() - interval '30 minutes' AND status = 'pending') AS pending_30m,
    count(*) FILTER (WHERE created_at > now() - interval '30 minutes' AND status = 'processing') AS processing_30m,
    count(*) FILTER (WHERE created_at > now() - interval '30 minutes' AND status = 'completed') AS completed_30m,
    count(*) FILTER (WHERE created_at > now() - interval '30 minutes' AND status = 'skipped') AS skipped_30m,
    count(*) FILTER (WHERE created_at > now() - interval '30 minutes' AND status = 'dead_letter') AS dead_letter_30m,
    min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at,
    max(created_at) FILTER (WHERE status = 'pending') AS newest_pending_created_at
  FROM gmail_stubs
),
lag AS (
  SELECT COALESCE(EXTRACT(epoch FROM now() - (SELECT oldest_pending_created_at FROM stubs_30m)), 0)::integer AS oldest_pending_lag_seconds
),
workers AS (
  SELECT
    count(*) AS workers_seen_5m,
    max(last_heartbeat) AS newest_heartbeat_at,
    min(last_heartbeat) AS oldest_heartbeat_at,
    COALESCE(EXTRACT(epoch FROM now() - max(last_heartbeat)), 999999)::integer AS newest_heartbeat_age_seconds,
    COALESCE(EXTRACT(epoch FROM now() - min(last_heartbeat)), 999999)::integer AS oldest_heartbeat_age_seconds
  FROM worker_heartbeats
  WHERE last_heartbeat > now() - interval '5 minutes'
),
matching AS (
  SELECT
    workers_reporting_5m,
    newest_update_age_seconds,
    newest_match_age_seconds,
    matches_processed_5m_total
  FROM ops_matching_health
),
config AS (
  SELECT COALESCE(matching_enabled, false) AS matching_enabled
  FROM worker_config
  WHERE id = 'default'
  LIMIT 1
)
SELECT
  now() AS ts,
  (SELECT pending_30m FROM stubs_30m) AS pending_30m,
  (SELECT processing_30m FROM stubs_30m) AS processing_30m,
  (SELECT completed_30m FROM stubs_30m) AS completed_30m,
  (SELECT skipped_30m FROM stubs_30m) AS skipped_30m,
  (SELECT dead_letter_30m FROM stubs_30m) AS dead_letter_30m,
  (SELECT oldest_pending_created_at FROM stubs_30m) AS oldest_pending_created_at,
  (SELECT newest_pending_created_at FROM stubs_30m) AS newest_pending_created_at,
  (SELECT oldest_pending_lag_seconds FROM lag) AS oldest_pending_lag_seconds,
  (SELECT workers_seen_5m FROM workers) AS workers_seen_5m,
  (SELECT newest_heartbeat_at FROM workers) AS newest_heartbeat_at,
  (SELECT oldest_heartbeat_at FROM workers) AS oldest_heartbeat_at,
  (SELECT newest_heartbeat_age_seconds FROM workers) AS newest_heartbeat_age_seconds,
  (SELECT oldest_heartbeat_age_seconds FROM workers) AS oldest_heartbeat_age_seconds,
  (SELECT workers_reporting_5m FROM matching) AS matching_workers_reporting_5m,
  (SELECT newest_update_age_seconds FROM matching) AS matching_newest_update_age_seconds,
  (SELECT newest_match_age_seconds FROM matching) AS matching_newest_match_age_seconds,
  (SELECT matches_processed_5m_total FROM matching) AS matches_processed_5m_total,
  CASE
    -- Core pipeline checks (always active)
    WHEN (SELECT workers_seen_5m FROM workers) = 0 THEN 'red'
    WHEN (SELECT newest_heartbeat_age_seconds FROM workers) > 120 THEN 'red'
    WHEN (SELECT pending_30m FROM stubs_30m) > 2000 THEN 'red'
    WHEN (SELECT oldest_pending_lag_seconds FROM lag) > 900 THEN 'red'
    -- Matching checks: ONLY RED when matching_enabled = true
    WHEN (SELECT matching_enabled FROM config) AND (SELECT workers_reporting_5m FROM matching) = 0 THEN 'red'
    WHEN (SELECT matching_enabled FROM config) AND (SELECT newest_update_age_seconds FROM matching) > 120 THEN 'red'
    -- Matching yellow: also gated
    WHEN (SELECT matching_enabled FROM config) AND (SELECT newest_match_age_seconds FROM matching) > 900 THEN 'yellow'
    -- Pipeline yellow (always active)
    WHEN (SELECT oldest_pending_lag_seconds FROM lag) > 300 THEN 'yellow'
    WHEN (SELECT pending_30m FROM stubs_30m) > 200 THEN 'yellow'
    ELSE 'green'
  END AS overall_status;
