-- Enhanced claim_gmail_stubs_batch with configurable lease timeout and max attempts
-- Version: Bulletproof anti-stuck mechanism
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF public.gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requeued_count integer := 0;
  v_failed_count integer := 0;
  v_lease_timeout_minutes integer := 15; -- Configurable: how long before reaping stale processing
  v_max_attempts integer := 5;           -- Max retries before marking as failed
BEGIN
  -- STEP 1: Reap stale processing rows (stuck > lease_timeout_minutes)
  -- These are stubs that were claimed but never completed (worker crash/hang)
  WITH stale AS (
    SELECT id, attempts
    FROM public.gmail_stubs
    WHERE status = 'processing'
      AND claimed_at < now() - (v_lease_timeout_minutes || ' minutes')::interval
      AND processed_at IS NULL
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.gmail_stubs gs
  SET 
    status = CASE 
      WHEN stale.attempts >= v_max_attempts THEN 'failed'
      ELSE 'pending'
    END,
    claimed_at = NULL,
    error = CASE 
      WHEN stale.attempts >= v_max_attempts THEN 'max_attempts_exceeded_after_stale_requeue'
      ELSE 'reaped_stale_processing_' || (stale.attempts + 1)::text
    END
  FROM stale
  WHERE gs.id = stale.id;

  GET DIAGNOSTICS v_requeued_count = ROW_COUNT;

  -- Log requeued count for observability (shows up in postgres logs)
  IF v_requeued_count > 0 THEN
    RAISE NOTICE 'gmail_stubs: reaped % stale processing stubs', v_requeued_count;
  END IF;

  -- STEP 2: Claim new batch of pending stubs
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM public.gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.attempts < v_max_attempts
    ORDER BY gs.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.gmail_stubs gs
  SET
    status = 'processing',
    claimed_at = now(),
    attempts = gs.attempts + 1
  FROM claimed
  WHERE gs.id = claimed.id
  RETURNING gs.*;
END;
$$;

-- Add helper function to get gmail_stubs queue health (for watchdog queries)
CREATE OR REPLACE FUNCTION public.get_gmail_stubs_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending_count integer;
  v_processing_count integer;
  v_failed_count integer;
  v_completed_count integer;
  v_oldest_pending timestamptz;
  v_oldest_processing timestamptz;
  v_last_completed timestamptz;
BEGIN
  -- Get counts by status
  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'processing'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_pending_count, v_processing_count, v_failed_count, v_completed_count
  FROM public.gmail_stubs
  WHERE queued_at > now() - interval '24 hours';  -- Only count recent for performance

  -- Get oldest timestamps
  SELECT MIN(queued_at) INTO v_oldest_pending 
  FROM public.gmail_stubs WHERE status = 'pending';
  
  SELECT MIN(claimed_at) INTO v_oldest_processing 
  FROM public.gmail_stubs WHERE status = 'processing';
  
  SELECT MAX(processed_at) INTO v_last_completed 
  FROM public.gmail_stubs WHERE status = 'completed';

  RETURN jsonb_build_object(
    'pending_count', v_pending_count,
    'processing_count', v_processing_count,
    'failed_count', v_failed_count,
    'completed_count', v_completed_count,
    'oldest_pending_at', v_oldest_pending,
    'oldest_pending_age_minutes', EXTRACT(EPOCH FROM (now() - v_oldest_pending)) / 60,
    'oldest_processing_at', v_oldest_processing,
    'oldest_processing_age_minutes', EXTRACT(EPOCH FROM (now() - v_oldest_processing)) / 60,
    'last_completed_at', v_last_completed,
    'time_since_completion_minutes', EXTRACT(EPOCH FROM (now() - v_last_completed)) / 60
  );
END;
$$;