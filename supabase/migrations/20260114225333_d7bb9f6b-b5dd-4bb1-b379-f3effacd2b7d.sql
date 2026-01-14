-- A) Add tenant_id column to load_hunt_matches
-- Step 1: Add nullable column first
ALTER TABLE public.load_hunt_matches 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Step 2: Backfill tenant_id from hunt_plans
UPDATE public.load_hunt_matches lhm
SET tenant_id = hp.tenant_id
FROM public.hunt_plans hp
WHERE lhm.hunt_plan_id = hp.id
  AND lhm.tenant_id IS NULL;

-- Step 3: Make column NOT NULL after backfill
ALTER TABLE public.load_hunt_matches 
ALTER COLUMN tenant_id SET NOT NULL;

-- Step 4: Create index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_load_hunt_matches_tenant_status_created 
ON public.load_hunt_matches (tenant_id, match_status, created_at DESC);

-- Step 5: Create trigger to auto-set tenant_id on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.sync_load_hunt_matches_tenant_id()
RETURNS TRIGGER AS $$
DECLARE
  hunt_tenant_id uuid;
BEGIN
  -- Get tenant_id from the associated hunt_plan
  SELECT tenant_id INTO hunt_tenant_id
  FROM public.hunt_plans
  WHERE id = NEW.hunt_plan_id;
  
  -- Validate hunt plan exists
  IF hunt_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Hunt plan % not found or has no tenant_id', NEW.hunt_plan_id;
  END IF;
  
  -- Auto-set tenant_id if not provided
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := hunt_tenant_id;
  ELSIF NEW.tenant_id != hunt_tenant_id THEN
    -- Reject if provided tenant_id doesn't match hunt_plan's tenant_id
    RAISE EXCEPTION 'tenant_id mismatch: provided %, expected % from hunt_plan', NEW.tenant_id, hunt_tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS sync_load_hunt_matches_tenant_id_trigger ON public.load_hunt_matches;
CREATE TRIGGER sync_load_hunt_matches_tenant_id_trigger
BEFORE INSERT OR UPDATE ON public.load_hunt_matches
FOR EACH ROW
EXECUTE FUNCTION public.sync_load_hunt_matches_tenant_id();

-- Step 6: Update RLS policies to use new tenant_id column directly
DROP POLICY IF EXISTS "Users can view matches for their tenant" ON public.load_hunt_matches;
CREATE POLICY "Users can view matches for their tenant"
ON public.load_hunt_matches
FOR SELECT
USING (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_users tm
    WHERE tm.user_id = auth.uid() AND tm.is_active = true
  )
);

DROP POLICY IF EXISTS "Users can manage matches for their tenant" ON public.load_hunt_matches;
CREATE POLICY "Users can manage matches for their tenant"
ON public.load_hunt_matches
FOR ALL
USING (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_users tm
    WHERE tm.user_id = auth.uid() AND tm.is_active = true
  )
);

-- Step 7: Enable realtime for load_hunt_matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'load_hunt_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.load_hunt_matches;
  END IF;
END $$;