-- Create claim_gmail_stubs_batch RPC with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.attempts < 10
    ORDER BY gs.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE gmail_stubs gs
  SET 
    status = 'processing',
    attempts = gs.attempts + 1
  FROM claimed
  WHERE gs.id = claimed.id
  RETURNING gs.*;
END;
$function$;

-- Create complete_gmail_stub RPC
CREATE OR REPLACE FUNCTION public.complete_gmail_stub(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE gmail_stubs
  SET 
    status = 'completed',
    error = NULL
  WHERE id = p_id;
END;
$function$;

-- Create fail_gmail_stub RPC
CREATE OR REPLACE FUNCTION public.fail_gmail_stub(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE gmail_stubs
  SET 
    status = CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
    error = p_error
  WHERE id = p_id;
END;
$function$;

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';