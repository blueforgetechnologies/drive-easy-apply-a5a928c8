
-- PART 2: Create unroutable_email_stats_daily table for aggregated diagnostics
CREATE TABLE IF NOT EXISTS public.unroutable_email_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  failure_reason text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, failure_reason)
);

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_unroutable_email_stats_daily_day 
ON public.unroutable_email_stats_daily(day DESC);

-- Comment for documentation
COMMENT ON TABLE public.unroutable_email_stats_daily IS 
'Aggregated daily counts of unroutable emails by failure reason. Reduces need to query raw unroutable_emails table for diagnostics.';

-- Create cleanup function for unroutable_emails (7-day retention)
CREATE OR REPLACE FUNCTION public.cleanup_unroutable_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Before deleting, aggregate to daily stats
  INSERT INTO unroutable_email_stats_daily (day, failure_reason, count)
  SELECT 
    DATE(received_at) as day,
    failure_reason,
    COUNT(*) as count
  FROM unroutable_emails
  WHERE received_at < NOW() - INTERVAL '7 days'
  GROUP BY DATE(received_at), failure_reason
  ON CONFLICT (day, failure_reason) 
  DO UPDATE SET 
    count = unroutable_email_stats_daily.count + EXCLUDED.count,
    updated_at = NOW();

  -- Delete old records
  DELETE FROM unroutable_emails
  WHERE received_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.cleanup_unroutable_emails() TO service_role;

-- PART 3: Add worker_fast_polling feature flag (without category column)
INSERT INTO feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES (
  'worker_fast_polling',
  'Worker Fast Polling (5s)',
  'When enabled, worker polls at 5s intervals. When disabled, polls at 20s intervals for cost savings.',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;

-- Enable fast polling for INTERNAL only (for testing)
INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true 
FROM feature_flags 
WHERE key = 'worker_fast_polling'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

-- Disable fast polling for PILOT (use slower 20s interval)
INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', false 
FROM feature_flags 
WHERE key = 'worker_fast_polling'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;
