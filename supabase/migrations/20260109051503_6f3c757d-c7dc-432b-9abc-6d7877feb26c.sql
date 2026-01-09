-- Drop and recreate the function with new return type
DROP FUNCTION IF EXISTS public.get_worker_config();

CREATE FUNCTION public.get_worker_config()
RETURNS TABLE(
  enabled boolean, 
  paused boolean, 
  batch_size integer, 
  loop_interval_ms integer, 
  concurrent_limit integer, 
  per_request_delay_ms integer, 
  backoff_on_429 boolean, 
  backoff_duration_ms integer, 
  max_retries integer,
  restart_requested_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wc.enabled,
    wc.paused,
    wc.batch_size,
    wc.loop_interval_ms,
    wc.concurrent_limit,
    wc.per_request_delay_ms,
    wc.backoff_on_429,
    wc.backoff_duration_ms,
    wc.max_retries,
    wc.restart_requested_at
  FROM public.worker_config wc
  WHERE wc.id = 'default'
  LIMIT 1;
END;
$$;