-- Tighten outbound batch claiming to NEVER pick inbound load emails.
-- In this system, inbound load emails are stored in email_queue with:
--   - payload_url IS NOT NULL (raw payload in storage)
--   - subject IS NULL (intentionally left NULL as a processing marker)
-- Outbound sends should always have subject + body.

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
    FROM public.email_queue eq
    WHERE eq.status = 'pending'
      -- Outbound identifiers
      AND eq.to_email IS NOT NULL
      AND eq.subject IS NOT NULL
      AND (eq.body_html IS NOT NULL OR eq.body_text IS NOT NULL)
      -- Extra safety: outbound should not have a payload_url
      AND eq.payload_url IS NULL
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
    eq.to_email,
    eq.subject,
    eq.body_html,
    eq.body_text,
    eq.from_email,
    eq.from_name;
END;
$function$;