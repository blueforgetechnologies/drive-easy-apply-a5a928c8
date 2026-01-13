-- Add configurable cooldown columns for hunt matching
-- Priority: hunt_plans.cooldown_seconds_min > tenants.cooldown_seconds_min > default 60

-- Add to hunt_plans (per-hunt override)
ALTER TABLE public.hunt_plans 
ADD COLUMN IF NOT EXISTS cooldown_seconds_min integer DEFAULT NULL;

COMMENT ON COLUMN public.hunt_plans.cooldown_seconds_min IS 
'Minimum cooldown in seconds before re-triggering for same fingerprint. NULL = use tenant default or 60.';

-- Add to tenants (tenant-wide default)
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS cooldown_seconds_min integer DEFAULT NULL;

COMMENT ON COLUMN public.tenants.cooldown_seconds_min IS 
'Default minimum cooldown in seconds for hunt matching. NULL = use system default of 60.';