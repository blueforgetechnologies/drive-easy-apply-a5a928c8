
-- ============================================================================
-- COST OPTIMIZATION: 4 changes to reduce per-email DB compute
-- ============================================================================

-- ============================================================================
-- 1. Consolidated RPC: handle_gmail_stub
--    Replaces 3-4 separate DB calls in gmail-webhook with a single RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_gmail_stub(
  p_email_address TEXT,
  p_history_id TEXT,
  p_queue_limit INTEGER DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_breaker JSONB;
  v_stub_id UUID;
  v_alias TEXT;
  v_normalized_email TEXT;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email_address));

  -- STEP 1: Resolve tenant (3-tier: +alias → gmail_inboxes → fail-closed)
  -- Extract +alias from email
  v_alias := substring(v_normalized_email from '([^@]+)\+([^@]+)@');
  IF v_alias IS NOT NULL THEN
    v_alias := '+' || (regexp_match(v_normalized_email, '[^@]+\+([^@]+)@'))[1];
    SELECT id, name INTO v_tenant_id, v_tenant_name
    FROM tenants WHERE gmail_alias = v_alias LIMIT 1;
  END IF;

  -- Fallback: gmail_inboxes
  IF v_tenant_id IS NULL THEN
    SELECT gi.tenant_id, t.name INTO v_tenant_id, v_tenant_name
    FROM gmail_inboxes gi
    JOIN tenants t ON t.id = gi.tenant_id
    WHERE gi.email_address = v_normalized_email AND gi.is_active = true
    LIMIT 1;
  END IF;

  -- Fail-closed: no tenant
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'action', 'quarantine',
      'reason', 'no_tenant_for_alias',
      'email_address', p_email_address
    );
  END IF;

  -- STEP 2: Circuit breaker check (O(1))
  v_breaker := public.check_circuit_breaker(p_queue_limit);
  IF (v_breaker->>'breaker_open')::boolean THEN
    -- Log dropped stub
    INSERT INTO circuit_breaker_events (tenant_id, email_address, history_id, breaker_type, reason)
    VALUES (v_tenant_id, p_email_address, p_history_id,
            CASE WHEN v_breaker->>'reason' = 'worker_stale' THEN 'stall_detector' ELSE 'queue_depth' END,
            v_breaker->>'reason');
    
    RETURN jsonb_build_object(
      'action', 'dropped',
      'reason', v_breaker->>'reason',
      'tenant_id', v_tenant_id,
      'tenant_name', v_tenant_name
    );
  END IF;

  -- STEP 3: Insert stub (ignore duplicates via unique constraint)
  BEGIN
    INSERT INTO gmail_stubs (tenant_id, email_address, history_id, status)
    VALUES (v_tenant_id, p_email_address, p_history_id, 'pending')
    RETURNING id INTO v_stub_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'action', 'duplicate',
      'tenant_id', v_tenant_id,
      'tenant_name', v_tenant_name
    );
  END;

  RETURN jsonb_build_object(
    'action', 'created',
    'stub_id', v_stub_id,
    'tenant_id', v_tenant_id,
    'tenant_name', v_tenant_name
  );
END;
$$;

-- ============================================================================
-- 2. Remove update_tenant_last_email per-INSERT trigger
--    Replace with batch function called by cron every 5 minutes
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_update_tenant_last_email ON public.load_emails;

CREATE OR REPLACE FUNCTION public.batch_update_tenant_last_email()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE tenants t
  SET last_email_received_at = sub.max_received
  FROM (
    SELECT tenant_id, MAX(received_at) as max_received
    FROM load_emails
    WHERE received_at > now() - interval '10 minutes'
    GROUP BY tenant_id
  ) sub
  WHERE t.id = sub.tenant_id
    AND (t.last_email_received_at IS NULL OR t.last_email_received_at < sub.max_received);
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Schedule batch update every 5 minutes via pg_cron
SELECT cron.schedule(
  'batch-update-tenant-last-email',
  '*/5 * * * *',
  $$SELECT public.batch_update_tenant_last_email()$$
);

-- ============================================================================
-- 3. Lazy load_id: Remove set_load_id trigger from INSERT path
--    load_id will be generated on-demand when first viewed
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_set_load_id ON public.load_emails;

-- Make load_id nullable (it may already be, but ensure)
ALTER TABLE public.load_emails ALTER COLUMN load_id DROP NOT NULL;

-- Create function to lazily assign load_id when needed
CREATE OR REPLACE FUNCTION public.ensure_load_id(p_email_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_load_id TEXT;
BEGIN
  SELECT load_id INTO v_load_id FROM load_emails WHERE id = p_email_id;
  
  IF v_load_id IS NOT NULL THEN
    RETURN v_load_id;
  END IF;
  
  -- Generate and assign
  v_load_id := generate_load_id_for_date(
    (SELECT received_at FROM load_emails WHERE id = p_email_id)
  );
  
  UPDATE load_emails SET load_id = v_load_id WHERE id = p_email_id;
  RETURN v_load_id;
END;
$$;
