
-- Fix: The claim_inbound_email_queue_batch RPC cannot see rows due to RLS policy
-- The current policy is "false" which blocks all access including SECURITY DEFINER functions
-- Solution: Allow service role operations by recreating the function to bypass RLS

-- Drop and recreate the function with explicit RLS bypass using auth.role()
DROP FUNCTION IF EXISTS public.claim_inbound_email_queue_batch(integer);

CREATE OR REPLACE FUNCTION public.claim_inbound_email_queue_batch(p_batch_size integer DEFAULT 50)
RETURNS SETOF email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- This function is called by the VPS worker using service role key
  -- SECURITY DEFINER runs as function owner (postgres) which bypasses RLS
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
$function$;

-- Also add a permissive policy for authenticated service_role requests
-- This allows the service role to see and modify rows
CREATE POLICY "Service role full access"
ON public.email_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
