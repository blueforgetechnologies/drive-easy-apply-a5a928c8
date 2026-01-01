-- =====================================================
-- MULTI-TENANT ISOLATION FIX - CORRECTED ORDER
-- 1. Add columns
-- 2. Backfill data
-- 3. Add triggers (after backfill!)
-- 4. Update RLS policies
-- =====================================================

-- =====================================================
-- STEP 1: ADD tenant_id COLUMNS (already done by partial migration)
-- These are idempotent with IF NOT EXISTS
-- =====================================================
ALTER TABLE public.load_bids 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.match_action_history
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.map_load_tracking
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- =====================================================
-- STEP 2: BACKFILL tenant_id (BEFORE triggers exist)
-- =====================================================

-- Backfill load_bids from vehicle -> tenant_id
UPDATE public.load_bids lb
SET tenant_id = v.tenant_id
FROM public.vehicles v
WHERE lb.vehicle_id = v.id
AND lb.tenant_id IS NULL;

-- For any remaining load_bids without vehicle, use default tenant
UPDATE public.load_bids
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;

-- Backfill match_action_history from match -> hunt_plan -> tenant_id
UPDATE public.match_action_history mah
SET tenant_id = hp.tenant_id
FROM public.load_hunt_matches lhm
JOIN public.hunt_plans hp ON lhm.hunt_plan_id = hp.id
WHERE mah.match_id = lhm.id
AND mah.tenant_id IS NULL;

-- For any remaining match_action_history, use default tenant
UPDATE public.match_action_history
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;

-- Backfill map_load_tracking from user -> tenant_users
UPDATE public.map_load_tracking mlt
SET tenant_id = tu.tenant_id
FROM public.tenant_users tu
WHERE mlt.user_id = tu.user_id
AND tu.is_active = true
AND mlt.tenant_id IS NULL;

-- For any remaining map_load_tracking, use default tenant
UPDATE public.map_load_tracking
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;

-- Backfill audit_logs to default tenant (historical logs)
UPDATE public.audit_logs
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;

-- =====================================================
-- STEP 3: DROP TRIGGERS IF THEY EXIST (from partial migration)
-- =====================================================
DROP TRIGGER IF EXISTS enforce_load_bids_tenant_isolation ON public.load_bids;
DROP TRIGGER IF EXISTS enforce_match_action_history_tenant_isolation ON public.match_action_history;
DROP TRIGGER IF EXISTS enforce_map_load_tracking_tenant_isolation ON public.map_load_tracking;
DROP TRIGGER IF EXISTS enforce_audit_logs_tenant_isolation ON public.audit_logs;

-- =====================================================
-- STEP 4: MAKE tenant_id NOT NULL (after backfill)
-- =====================================================
ALTER TABLE public.load_bids ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.match_action_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.map_load_tracking ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id SET NOT NULL;

-- =====================================================
-- STEP 5: ADD TENANT ISOLATION TRIGGERS (after NOT NULL)
-- =====================================================
CREATE TRIGGER enforce_load_bids_tenant_isolation
  BEFORE INSERT OR UPDATE ON public.load_bids
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();

CREATE TRIGGER enforce_match_action_history_tenant_isolation
  BEFORE INSERT OR UPDATE ON public.match_action_history
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();

CREATE TRIGGER enforce_map_load_tracking_tenant_isolation
  BEFORE INSERT OR UPDATE ON public.map_load_tracking
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();

CREATE TRIGGER enforce_audit_logs_tenant_isolation
  BEFORE INSERT OR UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();

-- =====================================================
-- STEP 6: DROP LEGACY ROLE-ONLY RLS POLICIES (idempotent)
-- =====================================================

-- load_bids
DROP POLICY IF EXISTS "Admins can delete bids" ON public.load_bids;
DROP POLICY IF EXISTS "Dispatchers can insert bids" ON public.load_bids;
DROP POLICY IF EXISTS "Dispatchers can update bids" ON public.load_bids;
DROP POLICY IF EXISTS "Dispatchers can view all bids" ON public.load_bids;

-- match_action_history
DROP POLICY IF EXISTS "Admins can delete match action history" ON public.match_action_history;
DROP POLICY IF EXISTS "Dispatchers can insert match action history" ON public.match_action_history;
DROP POLICY IF EXISTS "Dispatchers can view match action history" ON public.match_action_history;

-- map_load_tracking
DROP POLICY IF EXISTS "Admins can insert map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Admins can view all map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Admins can view all map loads" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Admins can view map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Authenticated users can insert map loads" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Authenticated users can view map loads" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Dispatchers can insert map tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Dispatchers can view map tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Users can insert own map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Users can view own map load tracking" ON public.map_load_tracking;

-- audit_logs
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;

-- =====================================================
-- STEP 7: CREATE NEW TENANT-FIRST RLS POLICIES
-- =====================================================

-- Drop if exists (from partial migration) then recreate
DROP POLICY IF EXISTS "Tenant members can view bids" ON public.load_bids;
DROP POLICY IF EXISTS "Tenant members can insert bids" ON public.load_bids;
DROP POLICY IF EXISTS "Tenant members can update bids" ON public.load_bids;
DROP POLICY IF EXISTS "Tenant members can delete bids" ON public.load_bids;

CREATE POLICY "Tenant members can view bids"
ON public.load_bids FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert bids"
ON public.load_bids FOR INSERT
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update bids"
ON public.load_bids FOR UPDATE
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete bids"
ON public.load_bids FOR DELETE
USING (can_access_tenant(auth.uid(), tenant_id));

-- match_action_history
DROP POLICY IF EXISTS "Tenant members can view match action history" ON public.match_action_history;
DROP POLICY IF EXISTS "Tenant members can insert match action history" ON public.match_action_history;
DROP POLICY IF EXISTS "Tenant members can delete match action history" ON public.match_action_history;

CREATE POLICY "Tenant members can view match action history"
ON public.match_action_history FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert match action history"
ON public.match_action_history FOR INSERT
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete match action history"
ON public.match_action_history FOR DELETE
USING (can_access_tenant(auth.uid(), tenant_id));

-- map_load_tracking
DROP POLICY IF EXISTS "Tenant members can view their tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Tenant members can insert tracking" ON public.map_load_tracking;

CREATE POLICY "Tenant members can view their tracking"
ON public.map_load_tracking FOR SELECT
USING (
  can_access_tenant(auth.uid(), tenant_id) 
  AND (auth.uid() = user_id OR is_platform_admin(auth.uid()))
);

CREATE POLICY "Tenant members can insert tracking"
ON public.map_load_tracking FOR INSERT
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

-- audit_logs
DROP POLICY IF EXISTS "Tenant members can view their audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant members can insert audit logs" ON public.audit_logs;

CREATE POLICY "Tenant members can view their audit logs"
ON public.audit_logs FOR SELECT
USING (
  is_platform_admin(auth.uid()) 
  OR can_access_tenant(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant members can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));