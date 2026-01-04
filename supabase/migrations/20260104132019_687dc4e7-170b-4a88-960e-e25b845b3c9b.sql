-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.claim_email_queue_batch(integer);

-- Recreate with outbound email fields
CREATE OR REPLACE FUNCTION public.claim_email_queue_batch(p_batch_size integer DEFAULT 25)
RETURNS TABLE(
  id uuid, 
  tenant_id uuid, 
  gmail_message_id text, 
  gmail_history_id text, 
  payload_url text, 
  attempts integer, 
  queued_at timestamp with time zone,
  to_email text,
  subject text,
  body_html text,
  body_text text,
  from_email text,
  from_name text
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
    eq.queued_at,
    eq.to_email,
    eq.subject,
    eq.body_html,
    eq.body_text,
    eq.from_email,
    eq.from_name;
END;
$function$;