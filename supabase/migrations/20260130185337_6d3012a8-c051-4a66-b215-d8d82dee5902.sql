-- Claim gmail_stubs batch atomically for VPS worker processing
-- Uses FOR UPDATE SKIP LOCKED for multi-worker safety
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.attempts < 10
      AND (gs.claimed_at IS NULL OR gs.claimed_at < now() - interval '5 minutes')
    ORDER BY gs.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE gmail_stubs gs
  SET 
    status = 'processing',
    claimed_at = now(),
    attempts = gs.attempts + 1
  FROM claimed
  WHERE gs.id = claimed.id
  RETURNING gs.*;
END;
$$;

-- Complete a gmail_stub after successful processing
CREATE OR REPLACE FUNCTION public.complete_gmail_stub(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE gmail_stubs
  SET 
    status = 'completed',
    processed_at = now(),
    claimed_at = NULL
  WHERE id = p_id;
END;
$$;

-- Fail a gmail_stub with error message
CREATE OR REPLACE FUNCTION public.fail_gmail_stub(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE gmail_stubs
  SET 
    status = CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
    error = p_error,
    claimed_at = NULL
  WHERE id = p_id;
END;
$$;

-- Update worker_heartbeat to support last_processed_at for circuit breaker
-- (Already exists but ensuring parameter is handled)
DROP FUNCTION IF EXISTS public.worker_heartbeat(text, text, integer, integer, integer, integer, timestamp with time zone, text, jsonb);

CREATE OR REPLACE FUNCTION public.worker_heartbeat(
  p_worker_id text,
  p_status text DEFAULT 'healthy',
  p_emails_sent integer DEFAULT 0,
  p_emails_failed integer DEFAULT 0,
  p_loops_completed integer DEFAULT 0,
  p_current_batch_size integer DEFAULT NULL,
  p_rate_limit_until timestamp with time zone DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_host_info jsonb DEFAULT NULL,
  p_last_processed_at timestamp with time zone DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO worker_heartbeats (
    id, last_heartbeat, status, emails_sent, emails_failed, 
    loops_completed, current_batch_size, rate_limit_until, error_message, host_info, last_processed_at
  )
  VALUES (
    p_worker_id, now(), p_status, p_emails_sent, p_emails_failed,
    p_loops_completed, p_current_batch_size, p_rate_limit_until, p_error_message, p_host_info, p_last_processed_at
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