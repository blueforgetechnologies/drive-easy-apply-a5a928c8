-- Create cleanup function for gmail_stubs
CREATE OR REPLACE FUNCTION public.cleanup_gmail_stubs_old()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM gmail_stubs
    WHERE status IN ('completed', 'skipped')
    AND queued_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;
