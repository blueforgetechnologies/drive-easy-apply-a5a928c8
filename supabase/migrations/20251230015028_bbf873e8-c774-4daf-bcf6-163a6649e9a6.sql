-- Add rate limit columns to tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS rate_limit_per_day integer DEFAULT 10000,
ADD COLUMN IF NOT EXISTS daily_usage_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_usage_reset_at timestamp with time zone DEFAULT now();

-- Create tenant rate limit tracking table for fine-grained tracking
CREATE TABLE IF NOT EXISTS public.tenant_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  window_start timestamp with time zone NOT NULL,
  window_type text NOT NULL CHECK (window_type IN ('minute', 'hour', 'day')),
  request_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, window_start, window_type)
);

-- Enable RLS
ALTER TABLE public.tenant_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role only access (edge functions)
CREATE POLICY "Service role only for rate limits"
ON public.tenant_rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tenant_rate_limits_lookup 
ON public.tenant_rate_limits(tenant_id, window_type, window_start DESC);

-- Function to check and increment rate limit atomically
CREATE OR REPLACE FUNCTION public.check_tenant_rate_limit(
  p_tenant_id uuid,
  p_limit_per_minute integer DEFAULT 60,
  p_limit_per_day integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_start timestamp with time zone;
  v_day_start timestamp with time zone;
  v_minute_count integer;
  v_day_count integer;
  v_allowed boolean := true;
  v_reason text := null;
BEGIN
  -- Calculate window starts
  v_minute_start := date_trunc('minute', now());
  v_day_start := date_trunc('day', now());
  
  -- Upsert minute counter and get count
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_minute_start, 'minute', 1)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + 1
  RETURNING request_count INTO v_minute_count;
  
  -- Upsert day counter and get count
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_day_start, 'day', 1)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + 1
  RETURNING request_count INTO v_day_count;
  
  -- Check limits
  IF v_minute_count > p_limit_per_minute THEN
    v_allowed := false;
    v_reason := 'Rate limit exceeded: ' || p_limit_per_minute || ' requests per minute';
  ELSIF v_day_count > p_limit_per_day THEN
    v_allowed := false;
    v_reason := 'Daily limit exceeded: ' || p_limit_per_day || ' requests per day';
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'minute_count', v_minute_count,
    'day_count', v_day_count,
    'minute_limit', p_limit_per_minute,
    'day_limit', p_limit_per_day
  );
END;
$$;

-- Cleanup function for old rate limit records
CREATE OR REPLACE FUNCTION public.cleanup_tenant_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM tenant_rate_limits
    WHERE window_start < now() - interval '2 days'
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;