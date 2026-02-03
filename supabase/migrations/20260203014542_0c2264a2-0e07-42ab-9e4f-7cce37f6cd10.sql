-- Update claim_gmail_stubs_batch to only claim stubs newer than 5 minutes
-- This is the permanent worker guardrail to prevent processing old backlog

CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_requeued_count integer := 0;
  v_failed_count integer := 0;
  v_lease_timeout_minutes integer := 15; -- Configurable: how long before reaping stale processing
  v_max_attempts integer := 5;           -- Max retries before marking as failed
  v_backlog_cutoff_minutes integer := 5; -- GUARDRAIL: Only process stubs newer than this
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

  -- STEP 2: Claim new batch of pending stubs (ONLY newer than backlog_cutoff_minutes)
  -- This is the PERMANENT GUARDRAIL to prevent processing old backlog
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM public.gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.attempts < v_max_attempts
      AND gs.queued_at >= now() - (v_backlog_cutoff_minutes || ' minutes')::interval
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
$function$;