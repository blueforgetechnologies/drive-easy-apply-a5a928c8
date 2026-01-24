-- A) SECURITY FIX: Tighten company_profile RLS
-- Remove the permissive NULL tenant_id access for normal users
-- NULL rows should only be accessible to platform admins

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Tenant admins can manage their company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Tenant members can view their company profile" ON public.company_profile;

-- Create new stricter policies:
-- SELECT: Normal users can only see their own tenant's profile, platform admins can see all
CREATE POLICY "Tenant members can view their own company profile"
ON public.company_profile
FOR SELECT
USING (
  (tenant_id IS NOT NULL AND can_access_tenant(auth.uid(), tenant_id))
  OR
  (tenant_id IS NULL AND is_platform_admin(auth.uid()))
);

-- INSERT: Only tenant members can insert for their tenant
CREATE POLICY "Tenant members can insert their company profile"
ON public.company_profile
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL AND can_access_tenant(auth.uid(), tenant_id)
);

-- UPDATE: Only tenant members can update their tenant's profile, platform admins can update NULL rows
CREATE POLICY "Tenant members can update their company profile"
ON public.company_profile
FOR UPDATE
USING (
  (tenant_id IS NOT NULL AND can_access_tenant(auth.uid(), tenant_id))
  OR
  (tenant_id IS NULL AND is_platform_admin(auth.uid()))
)
WITH CHECK (
  (tenant_id IS NOT NULL AND can_access_tenant(auth.uid(), tenant_id))
  OR
  (tenant_id IS NULL AND is_platform_admin(auth.uid()))
);

-- DELETE: Only platform admins can delete, and only NULL rows (global templates)
CREATE POLICY "Platform admins can delete global company profiles"
ON public.company_profile
FOR DELETE
USING (
  tenant_id IS NULL AND is_platform_admin(auth.uid())
);

-- Add current_step column to applications for wizard progress tracking
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1;

-- Add updated_at column if missing
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.update_applications_updated_at();