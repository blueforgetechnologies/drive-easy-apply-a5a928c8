-- =====================================================
-- MULTI-TENANT ISOLATION FIX - PHASE 2
-- Enforce tenant_id NOT NULL on load_emails
-- =====================================================

-- Step 1: Backfill any NULL tenant_id values
-- load_emails should derive tenant from hunt_plans via matches
-- But for historical orphan emails, assign to default tenant

UPDATE public.load_emails le
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE le.tenant_id IS NULL;

-- Step 2: Make tenant_id NOT NULL
ALTER TABLE public.load_emails ALTER COLUMN tenant_id SET NOT NULL;

-- Step 3: Add tenant isolation trigger if not exists
DROP TRIGGER IF EXISTS enforce_load_emails_tenant_isolation ON public.load_emails;
CREATE TRIGGER enforce_load_emails_tenant_isolation
  BEFORE INSERT OR UPDATE ON public.load_emails
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();

-- Step 4: Update RLS policies to use can_access_tenant pattern
-- Drop legacy policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Admins can manage load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Dispatchers can view load emails" ON public.load_emails;

-- Check if tenant-aware policies exist, drop and recreate
DROP POLICY IF EXISTS "Tenant members can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can insert load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can delete load emails" ON public.load_emails;

CREATE POLICY "Tenant members can view load emails"
ON public.load_emails FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert load emails"
ON public.load_emails FOR INSERT
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update load emails"
ON public.load_emails FOR UPDATE
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete load emails"
ON public.load_emails FOR DELETE
USING (can_access_tenant(auth.uid(), tenant_id));