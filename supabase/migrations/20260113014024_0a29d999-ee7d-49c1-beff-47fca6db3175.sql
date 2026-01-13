
-- PHASE C1: Hunt Fingerprint Cooldown Gating

-- 1) Create table for tracking hunt action cooldowns
CREATE TABLE IF NOT EXISTS public.hunt_fingerprint_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hunt_plan_id UUID NOT NULL REFERENCES public.hunt_plans(id) ON DELETE CASCADE,
  load_content_fingerprint TEXT NOT NULL,
  last_action_at TIMESTAMPTZ NOT NULL,
  action_count INT NOT NULL DEFAULT 1,
  last_load_email_id UUID REFERENCES public.load_emails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, hunt_plan_id, load_content_fingerprint)
);

-- Enable RLS
ALTER TABLE public.hunt_fingerprint_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant users can view their hunt actions"
ON public.hunt_fingerprint_actions FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Platform admins can manage all hunt actions"
ON public.hunt_fingerprint_actions FOR ALL
USING (is_platform_admin(auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_hunt_fingerprint_actions_lookup 
ON public.hunt_fingerprint_actions(tenant_id, hunt_plan_id, load_content_fingerprint);

-- 2) Create RPC for atomic cooldown check
CREATE OR REPLACE FUNCTION public.should_trigger_hunt_for_fingerprint(
  p_tenant_id UUID,
  p_hunt_plan_id UUID,
  p_fingerprint TEXT,
  p_received_at TIMESTAMPTZ,
  p_cooldown_seconds INT DEFAULT 60,
  p_last_load_email_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_cooldown_interval INTERVAL;
BEGIN
  v_cooldown_interval := (p_cooldown_seconds || ' seconds')::INTERVAL;
  
  -- Try to get existing record with lock
  SELECT * INTO v_existing
  FROM public.hunt_fingerprint_actions
  WHERE tenant_id = p_tenant_id
    AND hunt_plan_id = p_hunt_plan_id
    AND load_content_fingerprint = p_fingerprint
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- No existing record: insert and return true
    INSERT INTO public.hunt_fingerprint_actions (
      tenant_id, hunt_plan_id, load_content_fingerprint, 
      last_action_at, action_count, last_load_email_id
    ) VALUES (
      p_tenant_id, p_hunt_plan_id, p_fingerprint,
      p_received_at, 1, p_last_load_email_id
    );
    RETURN true;
  END IF;
  
  -- Check if cooldown has passed
  IF p_received_at >= v_existing.last_action_at + v_cooldown_interval THEN
    -- Cooldown passed: update and return true
    UPDATE public.hunt_fingerprint_actions
    SET last_action_at = p_received_at,
        action_count = action_count + 1,
        updated_at = now(),
        last_load_email_id = COALESCE(p_last_load_email_id, last_load_email_id)
    WHERE id = v_existing.id;
    RETURN true;
  END IF;
  
  -- Still in cooldown: return false
  RETURN false;
END;
$$;

-- 3) Add database default for ingestion_source as guardrail
ALTER TABLE public.load_emails 
ALTER COLUMN ingestion_source SET DEFAULT 'unknown';

-- Add comment
COMMENT ON TABLE public.hunt_fingerprint_actions IS 'Tracks when hunt actions were last triggered per (tenant, hunt, fingerprint) to prevent duplicate notifications within cooldown period';
COMMENT ON FUNCTION public.should_trigger_hunt_for_fingerprint IS 'Atomically checks and updates cooldown for hunt actions. Returns true if action should proceed, false if suppressed.';
