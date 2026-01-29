-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS public.claim_inbound_email_queue_batch(integer);

-- Recreate with correct return type (SETOF email_queue)
CREATE OR REPLACE FUNCTION public.claim_inbound_email_queue_batch(p_batch_size integer DEFAULT 50)
RETURNS SETOF email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT eq.id
    FROM email_queue eq
    WHERE eq.status = 'pending'
      AND eq.payload_url IS NOT NULL
      AND eq.to_email IS NULL
      AND eq.parsed_at IS NULL
      AND eq.processing_started_at IS NULL
      AND eq.attempts < 50
    ORDER BY eq.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE email_queue eq
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = eq.attempts + 1
  FROM claimed
  WHERE eq.id = claimed.id
  RETURNING eq.*;
END;
$$;