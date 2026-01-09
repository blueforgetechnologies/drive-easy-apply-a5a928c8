-- Create worker_heartbeats table for tracking worker health
CREATE TABLE public.worker_heartbeats (
  id TEXT PRIMARY KEY, -- worker ID like "worker-1", "worker-2"
  last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'healthy', -- healthy, degraded, error
  emails_sent INTEGER NOT NULL DEFAULT 0,
  emails_failed INTEGER NOT NULL DEFAULT 0,
  loops_completed INTEGER NOT NULL DEFAULT 0,
  current_batch_size INTEGER,
  rate_limit_until TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  host_info JSONB, -- optional metadata about the worker container
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all heartbeats
CREATE POLICY "Platform admins can view worker heartbeats"
ON public.worker_heartbeats
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Workers use service role to write, so no insert/update policy needed for authenticated users

-- Create function for workers to report heartbeat (uses service role)
CREATE OR REPLACE FUNCTION public.worker_heartbeat(
  p_worker_id TEXT,
  p_status TEXT DEFAULT 'healthy',
  p_emails_sent INTEGER DEFAULT 0,
  p_emails_failed INTEGER DEFAULT 0,
  p_loops_completed INTEGER DEFAULT 0,
  p_current_batch_size INTEGER DEFAULT NULL,
  p_rate_limit_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_host_info JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO worker_heartbeats (
    id, last_heartbeat, status, emails_sent, emails_failed, 
    loops_completed, current_batch_size, rate_limit_until, error_message, host_info
  )
  VALUES (
    p_worker_id, now(), p_status, p_emails_sent, p_emails_failed,
    p_loops_completed, p_current_batch_size, p_rate_limit_until, p_error_message, p_host_info
  )
  ON CONFLICT (id) DO UPDATE SET
    last_heartbeat = now(),
    status = p_status,
    emails_sent = p_emails_sent,
    emails_failed = p_emails_failed,
    loops_completed = p_loops_completed,
    current_batch_size = COALESCE(p_current_batch_size, worker_heartbeats.current_batch_size),
    rate_limit_until = p_rate_limit_until,
    error_message = p_error_message,
    host_info = COALESCE(p_host_info, worker_heartbeats.host_info);
END;
$$;

-- Create view for easy health status checking
CREATE OR REPLACE VIEW public.worker_health_status AS
SELECT 
  id as worker_id,
  last_heartbeat,
  status,
  emails_sent,
  emails_failed,
  loops_completed,
  current_batch_size,
  rate_limit_until,
  error_message,
  CASE
    WHEN last_heartbeat > now() - INTERVAL '2 minutes' THEN 'online'
    WHEN last_heartbeat > now() - INTERVAL '5 minutes' THEN 'stale'
    ELSE 'offline'
  END as connection_status,
  EXTRACT(EPOCH FROM (now() - last_heartbeat)) as seconds_since_heartbeat
FROM worker_heartbeats;

-- Grant access to the view for authenticated users (RLS on base table still applies)
GRANT SELECT ON public.worker_health_status TO authenticated;