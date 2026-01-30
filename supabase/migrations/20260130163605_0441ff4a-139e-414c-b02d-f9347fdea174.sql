-- =============================================================================
-- Phase 1: Canonical Cost-Elimination Architecture
-- gmail_stubs table + circuit_breaker_events + indexes + RLS
-- =============================================================================

-- 1. Create gmail_stubs table (tenant-scoped, minimal stub for VPS processing)
CREATE TABLE IF NOT EXISTS public.gmail_stubs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  history_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- UNIQUE constraint for deduplication: (tenant_id, email_address, history_id)
  CONSTRAINT gmail_stubs_dedup_unique UNIQUE (tenant_id, email_address, history_id)
);

-- 2. Indexes for efficient VPS worker claims
CREATE INDEX IF NOT EXISTS idx_gmail_stubs_pending ON public.gmail_stubs (status, queued_at ASC) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_gmail_stubs_tenant_status ON public.gmail_stubs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_gmail_stubs_claimed_at ON public.gmail_stubs (claimed_at)
  WHERE status = 'processing';

-- 3. Enable RLS
ALTER TABLE public.gmail_stubs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (tenant-scoped)
CREATE POLICY "Service role full access to gmail_stubs"
  ON public.gmail_stubs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Tenant members can view their gmail_stubs"
  ON public.gmail_stubs FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

-- 5. Circuit breaker events table (for logging dropped stubs when breaker is OPEN)
CREATE TABLE IF NOT EXISTS public.circuit_breaker_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  email_address TEXT NOT NULL,
  history_id TEXT,
  reason TEXT NOT NULL,
  breaker_type TEXT NOT NULL, -- 'stall_detector' or 'queue_depth'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Index for circuit breaker events (recent lookups)
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_recent 
  ON public.circuit_breaker_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_tenant 
  ON public.circuit_breaker_events (tenant_id, created_at DESC);

-- 7. Enable RLS for circuit breaker events
ALTER TABLE public.circuit_breaker_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to circuit_breaker_events"
  ON public.circuit_breaker_events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Platform admins can view circuit_breaker_events"
  ON public.circuit_breaker_events FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- 8. Add last_processed_at to worker_heartbeats if not exists
-- This supports the O(1) stall detector check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_heartbeats' AND column_name = 'last_processed_at'
  ) THEN
    ALTER TABLE public.worker_heartbeats 
    ADD COLUMN last_processed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- 9. Function for O(1) circuit breaker check (stall detector)
-- Returns true if breaker should be OPEN (block writes)
CREATE OR REPLACE FUNCTION public.check_circuit_breaker_stall()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_processed TIMESTAMP WITH TIME ZONE;
  v_stale_threshold INTERVAL := '5 minutes';
  v_is_stale BOOLEAN := false;
  v_worker_status TEXT;
BEGIN
  -- O(1): Get the single worker heartbeat row
  SELECT last_processed_at, status
  INTO v_last_processed, v_worker_status
  FROM public.worker_heartbeats
  WHERE id = 'vps-worker'
  LIMIT 1;
  
  -- If no heartbeat, fail-open (allow writes)
  IF v_last_processed IS NULL THEN
    RETURN jsonb_build_object(
      'breaker_open', false,
      'reason', 'no_heartbeat_data'
    );
  END IF;
  
  -- Check if last_processed_at is older than threshold
  v_is_stale := (now() - v_last_processed) > v_stale_threshold;
  
  RETURN jsonb_build_object(
    'breaker_open', v_is_stale,
    'reason', CASE WHEN v_is_stale THEN 'worker_stale' ELSE 'worker_healthy' END,
    'last_processed_at', v_last_processed,
    'staleness_seconds', EXTRACT(EPOCH FROM (now() - v_last_processed))::INTEGER,
    'worker_status', v_worker_status
  );
END;
$$;

-- 10. Function for O(1) queue depth check using LIMIT (bounded, not COUNT(*))
-- Uses EXISTS with LIMIT to check if queue exceeds threshold
CREATE OR REPLACE FUNCTION public.check_circuit_breaker_depth(p_limit INTEGER DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exceeds_limit BOOLEAN;
  v_sample_count INTEGER;
BEGIN
  -- O(1) bounded check: Does pending count exceed limit?
  -- Uses LIMIT (p_limit + 1) to check if we have MORE than the limit
  SELECT COUNT(*) INTO v_sample_count
  FROM (
    SELECT 1 FROM public.gmail_stubs
    WHERE status = 'pending'
    LIMIT (p_limit + 1)
  ) sample;
  
  v_exceeds_limit := v_sample_count > p_limit;
  
  RETURN jsonb_build_object(
    'breaker_open', v_exceeds_limit,
    'reason', CASE WHEN v_exceeds_limit THEN 'queue_depth_exceeded' ELSE 'queue_ok' END,
    'sample_count', v_sample_count,
    'limit', p_limit
  );
END;
$$;

-- 11. Unified circuit breaker check (combines stall + depth)
CREATE OR REPLACE FUNCTION public.check_circuit_breaker(p_queue_limit INTEGER DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stall_result JSONB;
  v_depth_result JSONB;
  v_breaker_open BOOLEAN := false;
  v_reason TEXT := 'ok';
BEGIN
  -- Check stall first (O(1))
  v_stall_result := public.check_circuit_breaker_stall();
  
  IF (v_stall_result->>'breaker_open')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'breaker_open', true,
      'reason', 'worker_stale',
      'stall_check', v_stall_result
    );
  END IF;
  
  -- Check depth (O(1) bounded)
  v_depth_result := public.check_circuit_breaker_depth(p_queue_limit);
  
  IF (v_depth_result->>'breaker_open')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'breaker_open', true,
      'reason', 'queue_depth_exceeded',
      'depth_check', v_depth_result
    );
  END IF;
  
  RETURN jsonb_build_object(
    'breaker_open', false,
    'reason', 'ok',
    'stall_check', v_stall_result,
    'depth_check', v_depth_result
  );
END;
$$;

-- 12. Claim function for VPS worker (batch claim stubs)
CREATE OR REPLACE FUNCTION public.claim_gmail_stubs_batch(p_batch_size INTEGER DEFAULT 50)
RETURNS SETOF gmail_stubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT gs.id
    FROM public.gmail_stubs gs
    WHERE gs.status = 'pending'
      AND gs.claimed_at IS NULL
      AND gs.attempts < 5
    ORDER BY gs.queued_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.gmail_stubs gs
  SET 
    status = 'processing',
    claimed_at = now(),
    attempts = gs.attempts + 1
  FROM claimed
  WHERE gs.id = claimed.id
  RETURNING gs.*;
END;
$$;

-- 13. Add comments for documentation
COMMENT ON TABLE public.gmail_stubs IS 'Minimal stubs from gmail-webhook for VPS worker processing. Part of canonical cost-elimination architecture (I1-I5).';
COMMENT ON TABLE public.circuit_breaker_events IS 'Log of dropped stubs when circuit breaker is OPEN. Used for monitoring and debugging.';
COMMENT ON FUNCTION public.check_circuit_breaker IS 'O(1) circuit breaker check combining stall detection and bounded queue depth check.';