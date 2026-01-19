-- Modify check_tenant_rate_limit to support dry_run mode (check without incrementing)
CREATE OR REPLACE FUNCTION public.check_tenant_rate_limit(
  p_tenant_id uuid,
  p_limit_per_minute integer DEFAULT 60,
  p_limit_per_day integer DEFAULT 10000,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_key text;
  v_day_key text;
  v_minute_count integer;
  v_day_count integer;
  v_result jsonb;
BEGIN
  -- Generate time-based keys
  v_minute_key := 'rate:' || p_tenant_id || ':minute:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD-HH24-MI');
  v_day_key := 'rate:' || p_tenant_id || ':day:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  
  -- Get current counts
  SELECT COALESCE(
    (SELECT count FROM tenant_rate_limits WHERE key = v_minute_key AND expires_at > now()),
    0
  ) INTO v_minute_count;
  
  SELECT COALESCE(
    (SELECT count FROM tenant_rate_limits WHERE key = v_day_key AND expires_at > now()),
    0
  ) INTO v_day_count;
  
  -- Check limits
  IF v_minute_count >= p_limit_per_minute THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'minute_limit_exceeded',
      'minute_count', v_minute_count,
      'day_count', v_day_count
    );
  END IF;
  
  IF v_day_count >= p_limit_per_day THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'day_limit_exceeded',
      'minute_count', v_minute_count,
      'day_count', v_day_count
    );
  END IF;
  
  -- If dry_run, return without incrementing
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', null,
      'minute_count', v_minute_count,
      'day_count', v_day_count
    );
  END IF;
  
  -- Increment counters (only if not dry_run)
  INSERT INTO tenant_rate_limits (key, tenant_id, count, expires_at)
  VALUES (v_minute_key, p_tenant_id, 1, now() + interval '1 minute')
  ON CONFLICT (key) DO UPDATE SET count = tenant_rate_limits.count + 1;
  
  INSERT INTO tenant_rate_limits (key, tenant_id, count, expires_at)
  VALUES (v_day_key, p_tenant_id, 1, now() + interval '1 day')
  ON CONFLICT (key) DO UPDATE SET count = tenant_rate_limits.count + 1;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'reason', null,
    'minute_count', v_minute_count + 1,
    'day_count', v_day_count + 1
  );
END;
$$;

-- New function to increment rate counter by a specific amount (for post-dedup counting)
CREATE OR REPLACE FUNCTION public.increment_tenant_rate_count(
  p_tenant_id uuid,
  p_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_key text;
  v_day_key text;
  v_minute_count integer;
  v_day_count integer;
BEGIN
  IF p_count <= 0 THEN
    RETURN jsonb_build_object('success', true, 'minute_count', 0, 'day_count', 0);
  END IF;

  -- Generate time-based keys
  v_minute_key := 'rate:' || p_tenant_id || ':minute:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD-HH24-MI');
  v_day_key := 'rate:' || p_tenant_id || ':day:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  
  -- Increment minute counter by p_count
  INSERT INTO tenant_rate_limits (key, tenant_id, count, expires_at)
  VALUES (v_minute_key, p_tenant_id, p_count, now() + interval '1 minute')
  ON CONFLICT (key) DO UPDATE SET count = tenant_rate_limits.count + p_count
  RETURNING count INTO v_minute_count;
  
  -- Increment day counter by p_count
  INSERT INTO tenant_rate_limits (key, tenant_id, count, expires_at)
  VALUES (v_day_key, p_tenant_id, p_count, now() + interval '1 day')
  ON CONFLICT (key) DO UPDATE SET count = tenant_rate_limits.count + p_count
  RETURNING count INTO v_day_count;
  
  RETURN jsonb_build_object(
    'success', true,
    'minute_count', COALESCE(v_minute_count, p_count),
    'day_count', COALESCE(v_day_count, p_count)
  );
END;
$$;