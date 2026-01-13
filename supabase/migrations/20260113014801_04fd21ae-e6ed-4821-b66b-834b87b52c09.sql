
-- PHASE C: Fix cooldown gating to use received_at (not now) + fail-closed on RPC error

-- 1) Add last_received_at column to track the actual email received_at
ALTER TABLE public.hunt_fingerprint_actions 
ADD COLUMN IF NOT EXISTS last_received_at timestamptz NULL;

-- Backfill existing rows: set last_received_at = last_action_at for backward compatibility
UPDATE public.hunt_fingerprint_actions 
SET last_received_at = last_action_at 
WHERE last_received_at IS NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hunt_fingerprint_last_received 
ON public.hunt_fingerprint_actions (tenant_id, hunt_plan_id, last_received_at);

-- 2) Drop and recreate the RPC to use last_received_at for comparison
DROP FUNCTION IF EXISTS public.should_trigger_hunt_for_fingerprint(uuid, uuid, text, timestamptz, integer, uuid);

CREATE OR REPLACE FUNCTION public.should_trigger_hunt_for_fingerprint(
  p_tenant_id uuid,
  p_hunt_plan_id uuid,
  p_fingerprint text,
  p_received_at timestamptz,
  p_cooldown_seconds integer DEFAULT 60,
  p_last_load_email_id uuid DEFAULT NULL
)
RETURNS boolean
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
    -- No existing record: insert and return true (allow action)
    INSERT INTO public.hunt_fingerprint_actions (
      tenant_id, hunt_plan_id, load_content_fingerprint, 
      last_received_at, last_action_at, action_count, last_load_email_id
    ) VALUES (
      p_tenant_id, p_hunt_plan_id, p_fingerprint,
      p_received_at, now(), 1, p_last_load_email_id
    );
    RETURN true;
  END IF;
  
  -- Handle backward compatibility: if last_received_at is NULL, treat as no prior action
  IF v_existing.last_received_at IS NULL THEN
    UPDATE public.hunt_fingerprint_actions
    SET last_received_at = p_received_at,
        last_action_at = now(),
        action_count = action_count + 1,
        updated_at = now(),
        last_load_email_id = COALESCE(p_last_load_email_id, last_load_email_id)
    WHERE id = v_existing.id;
    RETURN true;
  END IF;
  
  -- CRITICAL: Compare using received_at (not now()) because processing may be delayed
  -- If p_received_at >= last_received_at + cooldown, allow action
  IF p_received_at >= v_existing.last_received_at + v_cooldown_interval THEN
    -- Cooldown passed: update and return true
    UPDATE public.hunt_fingerprint_actions
    SET last_received_at = p_received_at,
        last_action_at = now(),
        action_count = action_count + 1,
        updated_at = now(),
        last_load_email_id = COALESCE(p_last_load_email_id, last_load_email_id)
    WHERE id = v_existing.id;
    RETURN true;
  END IF;
  
  -- Still in cooldown: return false (suppress action)
  RETURN false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.should_trigger_hunt_for_fingerprint(uuid, uuid, text, timestamptz, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.should_trigger_hunt_for_fingerprint(uuid, uuid, text, timestamptz, integer, uuid) TO service_role;
