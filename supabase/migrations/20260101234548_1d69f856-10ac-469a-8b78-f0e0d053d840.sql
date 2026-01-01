-- Drop existing safe view first
DROP VIEW IF EXISTS public.tenant_integrations_safe;

-- Create tenant_integrations_safe view (SECURITY INVOKER - uses caller's permissions)
-- This view explicitly excludes credentials_encrypted
CREATE VIEW public.tenant_integrations_safe 
WITH (security_invoker = true) AS
SELECT 
  id,
  tenant_id,
  provider,
  is_enabled,
  settings,
  sync_status,
  error_message,
  last_sync_at,
  last_checked_at,
  credentials_hint,
  created_at,
  updated_at,
  -- Derived field: is_configured based on whether credentials exist
  (credentials_encrypted IS NOT NULL AND credentials_encrypted != '') AS is_configured
FROM public.tenant_integrations;

-- Drop all existing RLS policies on tenant_integrations
DROP POLICY IF EXISTS "Tenant admins can manage their integrations" ON public.tenant_integrations;
DROP POLICY IF EXISTS "Tenant members can view their integrations" ON public.tenant_integrations;

-- Create restrictive policy that blocks ALL authenticated user access to base table
-- Only service_role can access this table now
CREATE POLICY "Block all authenticated access to base table"
ON public.tenant_integrations
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);