-- Create function to cleanup stale email queue entries (older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_email_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '7 days';
  
  WITH deleted AS (
    DELETE FROM email_queue
    WHERE queued_at < cutoff_date
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create function to cleanup stale pubsub tracking entries (older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_pubsub_tracking()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '7 days';
  
  WITH deleted AS (
    DELETE FROM pubsub_tracking
    WHERE received_at < cutoff_date
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create function to cleanup old vehicle location history (older than 8 days)
CREATE OR REPLACE FUNCTION public.cleanup_vehicle_location_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '8 days';
  
  WITH deleted AS (
    DELETE FROM vehicle_location_history
    WHERE recorded_at < cutoff_date
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create a table to track cleanup job executions for the System Health dashboard
CREATE TABLE IF NOT EXISTS public.cleanup_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  records_affected integer DEFAULT 0,
  success boolean DEFAULT true,
  error_message text,
  duration_ms integer
);

-- Create index for faster queries on recent job executions
CREATE INDEX IF NOT EXISTS idx_cleanup_job_logs_executed_at ON public.cleanup_job_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleanup_job_logs_job_name ON public.cleanup_job_logs(job_name);

-- Enable RLS
ALTER TABLE public.cleanup_job_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read cleanup logs
CREATE POLICY "Authenticated users can view cleanup logs"
ON public.cleanup_job_logs
FOR SELECT
USING (auth.role() = 'authenticated');