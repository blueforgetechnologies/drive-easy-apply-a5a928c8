-- ===============================================
-- PHASE 2: SYSTEM-LEVEL TENANT ENFORCEMENT
-- ===============================================

-- 1. Add tenant_id to company_profile table
ALTER TABLE public.company_profile 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2. Add tenant_id to invites table (for tenant-scoped user invites)
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 3. Add tenant_id to custom_roles table (for tenant-scoped roles)
ALTER TABLE public.custom_roles 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 4. Add tenant_id to role_permissions table
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 5. Add tenant_id to user_custom_roles table
ALTER TABLE public.user_custom_roles 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 6. Add tenant_id to permissions table (to allow tenant-specific permissions)
ALTER TABLE public.permissions 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 7. Create tenant_integrations table for per-tenant integrations
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  is_enabled boolean DEFAULT true,
  credentials_encrypted jsonb,
  settings jsonb DEFAULT '{}',
  last_sync_at timestamp with time zone,
  sync_status text DEFAULT 'pending',
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- 8. Create vehicle_integrations table for external tracker mapping
CREATE TABLE IF NOT EXISTS public.vehicle_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_name text,
  is_active boolean DEFAULT true,
  last_sync_at timestamp with time zone,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, vehicle_id, provider)
);

-- 9. Create tenant_preferences table for per-tenant preferences
CREATE TABLE IF NOT EXISTS public.tenant_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  timezone text DEFAULT 'America/New_York',
  date_format text DEFAULT 'MM/dd/yyyy',
  currency text DEFAULT 'USD',
  notification_settings jsonb DEFAULT '{}',
  ui_settings jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 10. Enable RLS on new tables
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_preferences ENABLE ROW LEVEL SECURITY;

-- 11. RLS policies for tenant_integrations
CREATE POLICY "Tenant members can view their integrations"
ON public.tenant_integrations FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their integrations"
ON public.tenant_integrations FOR ALL
USING (can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

-- 12. RLS policies for vehicle_integrations
CREATE POLICY "Tenant members can view their vehicle integrations"
ON public.vehicle_integrations FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their vehicle integrations"
ON public.vehicle_integrations FOR ALL
USING (can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

-- 13. RLS policies for tenant_preferences
CREATE POLICY "Tenant members can view their preferences"
ON public.tenant_preferences FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their preferences"
ON public.tenant_preferences FOR ALL
USING (can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

-- 14. Update company_profile RLS to be tenant-scoped
DROP POLICY IF EXISTS "Admins can insert company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Admins can update company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Admins can view company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Dispatchers can view company profile" ON public.company_profile;

CREATE POLICY "Tenant members can view their company profile"
ON public.company_profile FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their company profile"
ON public.company_profile FOR ALL
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

-- 15. Update invites RLS to be tenant-scoped (if tenant_id is present)
DROP POLICY IF EXISTS "Admins can delete invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can insert invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can view all invites" ON public.invites;

CREATE POLICY "Tenant members can view their invites"
ON public.invites FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage invites"
ON public.invites FOR ALL
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

-- 16. Update custom_roles RLS to be tenant-scoped
CREATE POLICY "Tenant members can view their roles"
ON public.custom_roles FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their roles"
ON public.custom_roles FOR ALL
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

-- 17. Update role_permissions RLS to be tenant-scoped
CREATE POLICY "Tenant members can view their role permissions"
ON public.role_permissions FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their role permissions"
ON public.role_permissions FOR ALL
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

-- 18. Update user_custom_roles RLS to be tenant-scoped
CREATE POLICY "Tenant members can view their user role assignments"
ON public.user_custom_roles FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage their user role assignments"
ON public.user_custom_roles FOR ALL
USING (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id))
WITH CHECK (tenant_id IS NULL OR can_access_tenant(auth.uid(), tenant_id));

-- 19. Create function to get current user's tenant from context
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get the first active tenant membership for the user
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_users
  WHERE user_id = v_user_id AND is_active = true
  LIMIT 1;
  
  RETURN v_tenant_id;
END;
$$;

-- 20. Add updated_at trigger to new tables
CREATE TRIGGER update_tenant_integrations_updated_at
BEFORE UPDATE ON public.tenant_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_integrations_updated_at
BEFORE UPDATE ON public.vehicle_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_preferences_updated_at
BEFORE UPDATE ON public.tenant_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();