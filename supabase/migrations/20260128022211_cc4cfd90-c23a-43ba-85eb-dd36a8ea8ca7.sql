-- Phase 7A: gmail_history_queue table for ENQUEUE_ONLY mode
-- Service-role only access (no RLS, explicit grants)

-- Create table
CREATE TABLE public.gmail_history_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL,
  history_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  queued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT gmail_history_queue_unique UNIQUE (email_address, history_id)
);

-- Index for worker claim query
CREATE INDEX idx_gmail_history_queue_pending 
  ON public.gmail_history_queue (status, queued_at ASC) 
  WHERE status = 'pending';

-- NO RLS enabled - service_role has full access by default

-- Explicit grants for service_role
GRANT SELECT, INSERT, UPDATE ON public.gmail_history_queue TO service_role;

-- Create feature flag for enqueue-only mode (default OFF)
INSERT INTO public.feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES (
  'gmail_webhook_enqueue_only',
  'Gmail Webhook Enqueue-Only Mode',
  'When enabled, gmail-webhook writes stubs to gmail_history_queue instead of full processing. Worker must be upgraded first.',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;

-- Worker claim function with SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_gmail_history_batch(p_batch_size integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  email_address text,
  history_id text,
  queued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT ghq.id
    FROM public.gmail_history_queue ghq
    WHERE ghq.status = 'pending'
    ORDER BY ghq.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.gmail_history_queue ghq
  SET
    status = 'processing',
    claimed_at = now()
  FROM claimed
  WHERE ghq.id = claimed.id
  RETURNING
    ghq.id,
    ghq.email_address,
    ghq.history_id,
    ghq.queued_at;
END;
$$;

-- Completion function
CREATE OR REPLACE FUNCTION public.complete_gmail_history_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE gmail_history_queue
  SET status = 'processed', processed_at = now()
  WHERE id = p_id;
END;
$$;

-- Failure function
CREATE OR REPLACE FUNCTION public.fail_gmail_history_item(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE gmail_history_queue
  SET status = 'failed', error = p_error, processed_at = now()
  WHERE id = p_id;
END;
$$;

-- Explicit function grants for service_role
GRANT EXECUTE ON FUNCTION public.claim_gmail_history_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_gmail_history_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_gmail_history_item(uuid, text) TO service_role;