-- TASK 1: Add tenant_id to gmail_tokens for proper tenant mapping
ALTER TABLE public.gmail_tokens 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- Create index for efficient lookups
CREATE INDEX idx_gmail_tokens_tenant_id ON public.gmail_tokens(tenant_id);

-- Update comment
COMMENT ON COLUMN public.gmail_tokens.tenant_id IS 'Tenant that owns this Gmail integration';

-- TASK 3: Add tenant_id to spend_alerts
ALTER TABLE public.spend_alerts 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- Create index for efficient lookups  
CREATE INDEX idx_spend_alerts_tenant_id ON public.spend_alerts(tenant_id);

-- Update comment
COMMENT ON COLUMN public.spend_alerts.tenant_id IS 'Tenant that owns this spend alert configuration';

-- Drop existing permissive RLS policies on spend_alerts
DROP POLICY IF EXISTS "Users can view their own spend alerts" ON public.spend_alerts;
DROP POLICY IF EXISTS "Users can insert spend alerts" ON public.spend_alerts;
DROP POLICY IF EXISTS "Users can update spend alerts" ON public.spend_alerts;

-- Create proper tenant-scoped RLS policies
CREATE POLICY "Users can view spend alerts for their tenant"
ON public.spend_alerts
FOR SELECT
USING (
  is_platform_admin(auth.uid())
  OR is_tenant_member(auth.uid(), tenant_id)
);

CREATE POLICY "Users can insert spend alerts for their tenant"
ON public.spend_alerts
FOR INSERT
WITH CHECK (
  is_platform_admin(auth.uid())
  OR is_tenant_member(auth.uid(), tenant_id)
);

CREATE POLICY "Users can update spend alerts for their tenant"
ON public.spend_alerts
FOR UPDATE
USING (
  is_platform_admin(auth.uid())
  OR is_tenant_member(auth.uid(), tenant_id)
);

CREATE POLICY "Users can delete spend alerts for their tenant"
ON public.spend_alerts
FOR DELETE
USING (
  is_platform_admin(auth.uid())
  OR is_tenant_member(auth.uid(), tenant_id)
);