-- Ensure processing_started_at exists for tracking active processing
ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Replace any existing (possibly recursive) implementation
DROP FUNCTION IF EXISTS public.reset_stale_email_queue();

-- Non-recursive implementation: reset items stuck in 'processing' > 5 minutes
CREATE OR REPLACE FUNCTION public.reset_stale_email_queue()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.email_queue
  SET
    status = 'pending',
    processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;