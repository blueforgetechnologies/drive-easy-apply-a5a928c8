-- Add processing_started_at column to email_queue for atomic claiming
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone;

-- Index for finding stale processing items
CREATE INDEX IF NOT EXISTS idx_email_queue_stale 
ON public.email_queue (status, processing_started_at) 
WHERE status = 'processing';

-- Atomic batch claim function using FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_email_queue_batch(p_batch_size integer DEFAULT 25)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  gmail_message_id text,
  gmail_history_id text,
  payload_url text,
  attempts integer,
  queued_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT eq.id
    FROM email_queue eq
    WHERE eq.status = 'pending'
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
  RETURNING 
    eq.id,
    eq.tenant_id,
    eq.gmail_message_id,
    eq.gmail_history_id,
    eq.payload_url,
    eq.attempts,
    eq.queued_at;
END;
$function$;

-- Reset stale email queue items (stuck in processing for over 5 minutes)
CREATE OR REPLACE FUNCTION public.reset_stale_email_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reset_count integer := 0;
BEGIN
  WITH reset AS (
    UPDATE email_queue
    SET 
      status = 'pending',
      processing_started_at = NULL
    WHERE status = 'processing'
      AND processing_started_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO reset_count FROM reset;
  
  IF reset_count > 0 THEN
    RAISE NOTICE 'Reset % stale email queue items', reset_count;
  END IF;
  
  RETURN reset_count;
END;
$function$;

-- Mark email queue item as completed
CREATE OR REPLACE FUNCTION public.complete_email_queue_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE email_queue
  SET 
    status = 'completed',
    processed_at = now()
  WHERE id = p_id;
END;
$function$;

-- Mark email queue item as failed
CREATE OR REPLACE FUNCTION public.fail_email_queue_item(p_id uuid, p_error text, p_attempts integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE email_queue
  SET 
    status = CASE WHEN p_attempts >= 3 THEN 'failed' ELSE 'pending' END,
    last_error = p_error,
    processing_started_at = NULL
  WHERE id = p_id;
END;
$function$;