
-- Fix rate limiter functions to match actual tenant_rate_limits schema
-- Table has: id, tenant_id, window_start, window_type, request_count, created_at
-- Functions incorrectly reference: key, count, expires_at

-- Drop the overloaded version with dry_run (incorrect schema) 
DROP FUNCTION IF EXISTS public.check_tenant_rate_limit(uuid, integer, integer, boolean);

-- Recreate check_tenant_rate_limit with dry_run support using correct schema
CREATE OR REPLACE FUNCTION public.check_tenant_rate_limit(
  p_tenant_id uuid, 
  p_limit_per_minute integer DEFAULT 60, 
  p_limit_per_day integer DEFAULT 10000,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  -- Get current counts without incrementing first
  SELECT COALESCE(request_count, 0) INTO v_minute_count
  FROM tenant_rate_limits 
  WHERE tenant_id = p_tenant_id 
    AND window_start = v_minute_start 
    AND window_type = 'minute';
  
  IF v_minute_count IS NULL THEN
    v_minute_count := 0;
  END IF;
  
  SELECT COALESCE(request_count, 0) INTO v_day_count
  FROM tenant_rate_limits 
  WHERE tenant_id = p_tenant_id 
    AND window_start = v_day_start 
    AND window_type = 'day';
  
  IF v_day_count IS NULL THEN
    v_day_count := 0;
  END IF;
  
  -- Check limits
  IF v_minute_count >= p_limit_per_minute THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'minute_limit_exceeded',
      'minute_count', v_minute_count,
      'day_count', v_day_count,
      'minute_limit', p_limit_per_minute,
      'day_limit', p_limit_per_day
    );
  END IF;
  
  IF v_day_count >= p_limit_per_day THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'day_limit_exceeded',
      'minute_count', v_minute_count,
      'day_count', v_day_count,
      'minute_limit', p_limit_per_minute,
      'day_limit', p_limit_per_day
    );
  END IF;
  
  -- If dry_run, return without incrementing
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', null,
      'minute_count', v_minute_count,
      'day_count', v_day_count,
      'minute_limit', p_limit_per_minute,
      'day_limit', p_limit_per_day
    );
  END IF;
  
  -- Increment counters (only if not dry_run)
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_minute_start, 'minute', 1)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + 1
  RETURNING request_count INTO v_minute_count;
  
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_day_start, 'day', 1)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + 1
  RETURNING request_count INTO v_day_count;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'reason', null,
    'minute_count', v_minute_count,
    'day_count', v_day_count,
    'minute_limit', p_limit_per_minute,
    'day_limit', p_limit_per_day
  );
END;
$function$;

-- Fix increment_tenant_rate_count to use correct schema
CREATE OR REPLACE FUNCTION public.increment_tenant_rate_count(
  p_tenant_id uuid, 
  p_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_minute_start timestamp with time zone;
  v_day_start timestamp with time zone;
  v_minute_count integer;
  v_day_count integer;
BEGIN
  IF p_count <= 0 THEN
    RETURN jsonb_build_object('success', true, 'minute_count', 0, 'day_count', 0);
  END IF;

  -- Calculate window starts
  v_minute_start := date_trunc('minute', now());
  v_day_start := date_trunc('day', now());
  
  -- Increment minute counter by p_count
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_minute_start, 'minute', p_count)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + p_count
  RETURNING request_count INTO v_minute_count;
  
  -- Increment day counter by p_count
  INSERT INTO tenant_rate_limits (tenant_id, window_start, window_type, request_count)
  VALUES (p_tenant_id, v_day_start, 'day', p_count)
  ON CONFLICT (tenant_id, window_start, window_type)
  DO UPDATE SET request_count = tenant_rate_limits.request_count + p_count
  RETURNING request_count INTO v_day_count;
  
  RETURN jsonb_build_object(
    'success', true,
    'minute_count', COALESCE(v_minute_count, p_count),
    'day_count', COALESCE(v_day_count, p_count)
  );
END;
$function$;
