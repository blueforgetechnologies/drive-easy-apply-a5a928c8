-- Create worker_config table for controlling external workers
CREATE TABLE public.worker_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT true,
  paused BOOLEAN NOT NULL DEFAULT false,
  batch_size INTEGER NOT NULL DEFAULT 25,
  loop_interval_ms INTEGER NOT NULL DEFAULT 3000,
  concurrent_limit INTEGER NOT NULL DEFAULT 5,
  per_request_delay_ms INTEGER NOT NULL DEFAULT 0,
  backoff_on_429 BOOLEAN NOT NULL DEFAULT true,
  backoff_duration_ms INTEGER NOT NULL DEFAULT 30000,
  max_retries INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Insert default configuration with rate-limit-friendly settings
INSERT INTO public.worker_config (id, enabled, batch_size, loop_interval_ms, concurrent_limit, per_request_delay_ms, backoff_on_429, backoff_duration_ms, max_retries, notes)
VALUES ('default', true, 10, 5000, 2, 100, true, 30000, 3, 'Recommended settings to avoid Gmail rate limits');

-- Enable RLS
ALTER TABLE public.worker_config ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view worker config
CREATE POLICY "Platform admins can view worker config"
  ON public.worker_config FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- Only platform admins can update worker config
CREATE POLICY "Platform admins can update worker config"
  ON public.worker_config FOR UPDATE
  USING (public.is_platform_admin(auth.uid()));

-- Create function for workers to read config (no auth required, called by service role)
CREATE OR REPLACE FUNCTION public.get_worker_config()
RETURNS TABLE (
  enabled BOOLEAN,
  paused BOOLEAN,
  batch_size INTEGER,
  loop_interval_ms INTEGER,
  concurrent_limit INTEGER,
  per_request_delay_ms INTEGER,
  backoff_on_429 BOOLEAN,
  backoff_duration_ms INTEGER,
  max_retries INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wc.enabled,
    wc.paused,
    wc.batch_size,
    wc.loop_interval_ms,
    wc.concurrent_limit,
    wc.per_request_delay_ms,
    wc.backoff_on_429,
    wc.backoff_duration_ms,
    wc.max_retries
  FROM public.worker_config wc
  WHERE wc.id = 'default'
  LIMIT 1;
END;
$$;