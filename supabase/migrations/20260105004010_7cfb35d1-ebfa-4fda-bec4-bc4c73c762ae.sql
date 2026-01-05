-- Create tenant_feature_access table for configurable feature permissions
CREATE TABLE public.tenant_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT tenant_feature_access_unique UNIQUE (tenant_id, user_id, feature_key)
);

-- Create index for efficient lookups
CREATE INDEX idx_tenant_feature_access_lookup 
ON public.tenant_feature_access(tenant_id, user_id, feature_key) 
WHERE is_enabled = true;

-- Enable RLS
ALTER TABLE public.tenant_feature_access ENABLE ROW LEVEL SECURITY;

-- Policy: Platform admins can do everything
CREATE POLICY "Platform admins have full access"
ON public.tenant_feature_access
FOR ALL
USING (is_platform_admin(auth.uid()));

-- Policy: Tenant admins/owners can manage grants for their tenant
CREATE POLICY "Tenant admins can manage their tenant grants"
ON public.tenant_feature_access
FOR ALL
USING (
  has_tenant_role(auth.uid(), tenant_id, 'admin')
  OR has_tenant_role(auth.uid(), tenant_id, 'owner')
)
WITH CHECK (
  has_tenant_role(auth.uid(), tenant_id, 'admin')
  OR has_tenant_role(auth.uid(), tenant_id, 'owner')
);

-- Policy: Users can read their own grants
CREATE POLICY "Users can read their own grants"
ON public.tenant_feature_access
FOR SELECT
USING (user_id = auth.uid());

-- Create helper function for checking feature access
CREATE OR REPLACE FUNCTION public.can_access_feature(
  p_user_id UUID,
  p_tenant_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Platform admins always have access
    is_platform_admin(p_user_id)
    OR
    -- Check tenant_feature_access for explicit grant
    EXISTS (
      SELECT 1 
      FROM public.tenant_feature_access 
      WHERE tenant_id = p_tenant_id 
        AND user_id = p_user_id 
        AND feature_key = p_feature_key 
        AND is_enabled = true
    )
$$;