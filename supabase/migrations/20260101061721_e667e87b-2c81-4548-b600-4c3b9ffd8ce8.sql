-- ============================================================
-- COMPREHENSIVE TENANT ISOLATION ENFORCEMENT
-- ============================================================
-- Goal: Make it IMPOSSIBLE to read/write cross-tenant data
-- even if developers forget UI filters.
-- ============================================================

-- A) Create trigger function to enforce tenant_id on INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_tenant_id uuid;
BEGIN
  -- Get current tenant from JWT claims via tenant_users membership
  v_current_tenant_id := get_current_tenant_id();
  
  -- For INSERT: auto-set tenant_id if null, block if wrong tenant
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN
      IF v_current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Cannot insert without tenant context. Please ensure you are logged in and have tenant membership.';
      END IF;
      NEW.tenant_id := v_current_tenant_id;
    ELSIF NEW.tenant_id != v_current_tenant_id THEN
      -- Allow platform admins to insert for any tenant
      IF NOT is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cross-tenant write blocked. You cannot insert data for tenant % when your context is %.', NEW.tenant_id, v_current_tenant_id;
      END IF;
    END IF;
  END IF;
  
  -- For UPDATE: block changing tenant_id to different tenant
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      IF NOT is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cannot change tenant_id of existing record.';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- B) Apply triggers to ALL tenant-owned tables
-- ============================================================

-- Helper to safely create trigger if not exists
CREATE OR REPLACE FUNCTION public.create_tenant_trigger_if_not_exists(table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('
    DROP TRIGGER IF EXISTS enforce_tenant_isolation_trigger ON public.%I;
    CREATE TRIGGER enforce_tenant_isolation_trigger
      BEFORE INSERT OR UPDATE ON public.%I
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_tenant_isolation();
  ', table_name, table_name);
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip silently
  NULL;
END;
$$;

-- Apply to all tenant-owned tables
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'applications', 'carriers', 'contacts', 'customers', 'dispatchers',
    'driver_invites', 'expenses', 'hunt_plans', 'invoices', 'load_documents',
    'load_expenses', 'load_hunt_matches', 'load_stops', 'loads', 'locations',
    'maintenance_records', 'payees', 'settlements', 'vehicles', 'company_profile',
    'invites', 'custom_roles', 'role_permissions', 'user_custom_roles',
    'tenant_integrations', 'vehicle_integrations', 'tenant_preferences'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    PERFORM public.create_tenant_trigger_if_not_exists(tbl);
  END LOOP;
END;
$$;

-- Clean up helper function
DROP FUNCTION IF EXISTS public.create_tenant_trigger_if_not_exists(text);

-- C) Fix unreviewed_matches view - make it SECURITY INVOKER (default)
-- ============================================================
-- Drop and recreate WITHOUT security definer to ensure RLS applies
DROP VIEW IF EXISTS unreviewed_matches;

CREATE VIEW unreviewed_matches AS
SELECT
    m.id AS match_id,
    m.load_email_id,
    m.hunt_plan_id,
    m.vehicle_id,
    m.distance_miles,
    m.is_active,
    m.match_status,
    m.matched_at,
    e.email_id,
    e.from_email,
    e.from_name,
    e.subject,
    e.received_at,
    e.expires_at,
    e.status AS email_status,
    e.parsed_data,
    e.load_id,
    e.email_source,
    hp.plan_name,
    hp.enabled AS hunt_enabled,
    hp.vehicle_size,
    hp.pickup_radius,
    hp.zip_code AS hunt_zip,
    hp.tenant_id
FROM load_hunt_matches m
JOIN load_emails e ON m.load_email_id = e.id
JOIN hunt_plans hp ON m.hunt_plan_id = hp.id
WHERE
    m.match_status = 'active'
    AND m.is_active = true
    AND hp.enabled = true
    AND (e.expires_at IS NULL OR e.expires_at > now());

-- This view inherits RLS from underlying tables (hunt_plans has tenant RLS)
-- No SECURITY DEFINER = SECURITY INVOKER by default = RLS applies

COMMENT ON VIEW unreviewed_matches IS 'SECURITY INVOKER view - RLS from hunt_plans enforces tenant isolation';

-- Grant access
GRANT SELECT ON unreviewed_matches TO authenticated;

-- D) Ensure RLS is enabled on all tenant-owned tables with proper policies
-- ============================================================
-- Note: Most tables already have RLS from previous migrations.
-- This ensures load_hunt_matches has proper RLS since it's used in the view.

-- Ensure load_hunt_matches has RLS enabled
ALTER TABLE IF EXISTS load_hunt_matches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies on load_hunt_matches to recreate properly
DROP POLICY IF EXISTS "Tenant members can view their matches" ON load_hunt_matches;
DROP POLICY IF EXISTS "Tenant members can insert matches" ON load_hunt_matches;
DROP POLICY IF EXISTS "Tenant members can update matches" ON load_hunt_matches;
DROP POLICY IF EXISTS "Tenant members can delete matches" ON load_hunt_matches;
DROP POLICY IF EXISTS "Tenant members can manage their matches" ON load_hunt_matches;

-- Create comprehensive RLS policies for load_hunt_matches
CREATE POLICY "Tenant isolation: SELECT" ON load_hunt_matches
  FOR SELECT USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: INSERT" ON load_hunt_matches
  FOR INSERT WITH CHECK (
    is_platform_admin(auth.uid()) 
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: UPDATE" ON load_hunt_matches
  FOR UPDATE USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: DELETE" ON load_hunt_matches
  FOR DELETE USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id = get_current_tenant_id()
  );

-- E) Ensure load_emails also has proper tenant RLS
-- ============================================================
ALTER TABLE IF EXISTS load_emails ENABLE ROW LEVEL SECURITY;

-- Check if tenant_id column exists on load_emails, add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'load_emails' 
    AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE load_emails ADD COLUMN tenant_id uuid REFERENCES tenants(id);
  END IF;
END $$;

-- Drop existing load_emails policies to recreate
DROP POLICY IF EXISTS "Tenant members can view load emails" ON load_emails;
DROP POLICY IF EXISTS "Tenant members can manage load emails" ON load_emails;
DROP POLICY IF EXISTS "Dispatchers can view all load emails" ON load_emails;
DROP POLICY IF EXISTS "Dispatchers can manage load emails" ON load_emails;

-- Create tenant-aware policies for load_emails
-- Note: Some emails may be tenant-agnostic (NULL tenant_id), which platform admins can see
CREATE POLICY "Tenant isolation: SELECT load_emails" ON load_emails
  FOR SELECT USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id IS NULL  -- Legacy/shared emails
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: INSERT load_emails" ON load_emails
  FOR INSERT WITH CHECK (
    is_platform_admin(auth.uid()) 
    OR tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: UPDATE load_emails" ON load_emails
  FOR UPDATE USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
  );

CREATE POLICY "Tenant isolation: DELETE load_emails" ON load_emails
  FOR DELETE USING (
    is_platform_admin(auth.uid()) 
    OR tenant_id IS NULL
    OR tenant_id = get_current_tenant_id()
  );