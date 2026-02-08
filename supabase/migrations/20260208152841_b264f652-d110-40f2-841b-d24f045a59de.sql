
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF public.gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued_count integer := 0;
  v_failed_count integer := 0;
  v_lease_timeout_minutes integer := 15;
  v_max_attempts integer := 5;
  v_backlog_cutoff_minutes integer := 30; -- Changed from 5 to 30 minutes
BEGIN
  -- STEP 1: Reap stale processing rows (stuck > lease_timeout_minutes)
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

  IF v_requeued_count > 0 THEN
    RAISE NOTICE 'gmail_stubs: reaped % stale processing stubs', v_requeued_count;
  END IF;

  -- STEP 2: Claim new batch of pending stubs (ONLY newer than backlog_cutoff_minutes)
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
$$;
