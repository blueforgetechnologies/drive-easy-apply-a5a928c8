
-- ============================================================
-- CONSOLIDATE load_emails RLS policies
-- Replaces 5 SELECT, 4 UPDATE, 3 DELETE, 3 INSERT policies
-- with 1 each. Same security logic, dramatically fewer function calls.
-- ============================================================

-- DROP all existing SELECT policies on load_emails
DROP POLICY IF EXISTS "Admins can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant isolation: SELECT load_emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can view load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can view their load emails" ON public.load_emails;

-- DROP all existing UPDATE policies on load_emails
DROP POLICY IF EXISTS "Admins can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Dispatchers can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE load_emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can update load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can update their load emails" ON public.load_emails;

-- DROP all existing DELETE policies on load_emails
DROP POLICY IF EXISTS "Admins can delete load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant isolation: DELETE load_emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can delete load emails" ON public.load_emails;

-- DROP all existing INSERT policies on load_emails
DROP POLICY IF EXISTS "Admins can insert load emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant isolation: INSERT load_emails" ON public.load_emails;
DROP POLICY IF EXISTS "Tenant members can insert load emails" ON public.load_emails;

-- CREATE single consolidated policies for load_emails
CREATE POLICY "load_emails_select" ON public.load_emails
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_emails_insert" ON public.load_emails
  FOR INSERT WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_emails_update" ON public.load_emails
  FOR UPDATE USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_emails_delete" ON public.load_emails
  FOR DELETE USING (
    tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

-- ============================================================
-- CONSOLIDATE load_hunt_matches RLS policies
-- ============================================================

-- DROP all existing SELECT policies on load_hunt_matches
DROP POLICY IF EXISTS "Admins can view hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Dispatchers can view hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Users can view matches for their tenant" ON public.load_hunt_matches;

-- DROP all existing UPDATE policies on load_hunt_matches
DROP POLICY IF EXISTS "Admins can update hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Dispatchers can update hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON public.load_hunt_matches;

-- DROP all existing DELETE policies on load_hunt_matches
DROP POLICY IF EXISTS "Admins can delete hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON public.load_hunt_matches;

-- DROP all existing INSERT policies on load_hunt_matches
DROP POLICY IF EXISTS "Admins can insert hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Dispatchers can insert hunt matches" ON public.load_hunt_matches;
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON public.load_hunt_matches;

-- DROP the ALL policy
DROP POLICY IF EXISTS "Users can manage matches for their tenant" ON public.load_hunt_matches;

-- CREATE single consolidated policies for load_hunt_matches
CREATE POLICY "load_hunt_matches_select" ON public.load_hunt_matches
  FOR SELECT USING (
    tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_hunt_matches_insert" ON public.load_hunt_matches
  FOR INSERT WITH CHECK (
    tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_hunt_matches_update" ON public.load_hunt_matches
  FOR UPDATE USING (
    tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "load_hunt_matches_delete" ON public.load_hunt_matches
  FOR DELETE USING (
    tenant_id = get_current_tenant_id()
    OR is_platform_admin(auth.uid())
  );
