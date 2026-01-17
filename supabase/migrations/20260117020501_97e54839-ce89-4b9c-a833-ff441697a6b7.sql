-- Atomic inbound batch claiming with FOR UPDATE SKIP LOCKED
-- Prevents two workers from claiming the same inbound email

CREATE OR REPLACE FUNCTION public.claim_inbound_email_queue_batch(p_batch_size integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  gmail_message_id text,
  gmail_history_id text,
  payload_url text,
  attempts integer,
  queued_at timestamp with time zone,
  subject text,
  from_email text,
  body_html text,
  body_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT eq.id
    FROM public.email_queue eq
    WHERE eq.status = 'pending'
      -- Inbound identifiers: has payload_url, subject is NULL (not yet parsed)
      AND eq.payload_url IS NOT NULL
      AND eq.subject IS NULL
      -- Prevent infinite loops
      AND eq.attempts < 50
    ORDER BY eq.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_queue eq
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
    eq.subject,
    eq.from_email,
    eq.body_html,
    eq.body_text;
END;
$function$;