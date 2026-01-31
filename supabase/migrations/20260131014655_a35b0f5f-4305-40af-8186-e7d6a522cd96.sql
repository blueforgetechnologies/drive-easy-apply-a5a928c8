-- Enhanced claim_gmail_stubs_batch with stale processing requeue
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF public.gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- STEP 1: Reset stale processing rows (stuck > 10 minutes)
  UPDATE public.gmail_stubs
  SET 
    status = 'pending',
    claimed_at = NULL,
    error = 'stale_processing_requeued'
  WHERE status = 'processing'
    AND claimed_at < now() - interval '10 minutes'
    AND processed_at IS NULL;

  -- STEP 2: Claim new batch
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM public.gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.attempts < 10
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