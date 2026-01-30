-- Update worker_heartbeat RPC to support last_processed_at parameter
CREATE OR REPLACE FUNCTION public.worker_heartbeat(
  p_worker_id text, 
  p_status text DEFAULT 'healthy'::text, 
  p_emails_sent integer DEFAULT 0, 
  p_emails_failed integer DEFAULT 0, 
  p_loops_completed integer DEFAULT 0, 
  p_current_batch_size integer DEFAULT NULL::integer, 
  p_rate_limit_until timestamp with time zone DEFAULT NULL::timestamp with time zone, 
  p_error_message text DEFAULT NULL::text, 
  p_host_info jsonb DEFAULT NULL::jsonb,
  p_last_processed_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO worker_heartbeats (
    id, last_heartbeat, status, emails_sent, emails_failed, 
    loops_completed, current_batch_size, rate_limit_until, error_message, host_info,
    last_processed_at
  )
  VALUES (
    p_worker_id, now(), p_status, p_emails_sent, p_emails_failed,
    p_loops_completed, p_current_batch_size, p_rate_limit_until, p_error_message, p_host_info,
    p_last_processed_at
  )
  ON CONFLICT (id) DO UPDATE SET
    last_heartbeat = now(),
    status = p_status,
    emails_sent = p_emails_sent,
    emails_failed = p_emails_failed,
    loops_completed = p_loops_completed,
    current_batch_size = COALESCE(p_current_batch_size, worker_heartbeats.current_batch_size),
    rate_limit_until = p_rate_limit_until,
    error_message = p_error_message,
    host_info = COALESCE(p_host_info, worker_heartbeats.host_info),
    last_processed_at = COALESCE(p_last_processed_at, worker_heartbeats.last_processed_at);
END;
$$;