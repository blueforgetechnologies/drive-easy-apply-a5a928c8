CREATE OR REPLACE FUNCTION public.check_circuit_breaker_depth(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exceeds_limit BOOLEAN;
  v_sample_count INTEGER;
  v_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Only count stubs from the last 30 minutes to prevent stale backlog
  -- from tripping the breaker during worker downtime/restarts
  v_cutoff := now() - interval '30 minutes';
  
  -- O(1) bounded check: Does recent pending count exceed limit?
  SELECT COUNT(*) INTO v_sample_count
  FROM (
    SELECT 1 FROM public.gmail_stubs
    WHERE status = 'pending'
      AND created_at >= v_cutoff
    LIMIT (p_limit + 1)
  ) sample;
  
  v_exceeds_limit := v_sample_count > p_limit;
  
  RETURN jsonb_build_object(
    'breaker_open', v_exceeds_limit,
    'reason', CASE WHEN v_exceeds_limit THEN 'queue_depth_exceeded' ELSE 'queue_ok' END,
    'sample_count', v_sample_count,
    'limit', p_limit,
    'cutoff_minutes', 30
  );
END;
$function$;