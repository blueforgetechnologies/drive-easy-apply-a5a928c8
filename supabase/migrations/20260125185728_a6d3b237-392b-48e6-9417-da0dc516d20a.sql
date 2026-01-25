-- Add archived status and create auto-archive function
-- First, create a function that archives rejected applications older than 36 hours
CREATE OR REPLACE FUNCTION public.auto_archive_rejected_applications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE applications
  SET status = 'archived'
  WHERE status = 'rejected'
    AND rejected_at IS NOT NULL
    AND rejected_at < NOW() - INTERVAL '36 hours';
END;
$$;

-- Create a scheduled job using pg_cron to run every hour
SELECT cron.schedule(
  'auto-archive-rejected-applications',
  '0 * * * *',  -- Run every hour
  $$SELECT public.auto_archive_rejected_applications()$$
);