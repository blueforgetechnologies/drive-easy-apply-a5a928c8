-- Tenant Factoring Configuration
-- Stores per-tenant factoring company credentials (encrypted)

CREATE TABLE public.tenant_factoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'otr_solutions',
  is_enabled boolean NOT NULL DEFAULT false,
  
  -- Encrypted credentials (encrypted at application layer using INTEGRATIONS_MASTER_KEY)
  credentials_encrypted text,
  credentials_hint text, -- e.g. "****5678" for last 4 of API key
  
  -- OTR-specific settings
  settings jsonb DEFAULT '{}'::jsonb,
  
  -- Status tracking
  sync_status text DEFAULT 'not_configured' CHECK (sync_status IN ('not_configured', 'pending', 'healthy', 'failed')),
  error_message text,
  last_checked_at timestamptz,
  last_submission_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, provider)
);

-- Enable RLS
ALTER TABLE public.tenant_factoring_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenant members can view their factoring config"
ON public.tenant_factoring_config
FOR SELECT
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

-- Only platform admins can modify (credentials are sensitive)
CREATE POLICY "Platform admins can manage factoring config"
ON public.tenant_factoring_config
FOR ALL
TO authenticated
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Tenant admins can also manage their own config
CREATE POLICY "Tenant admins can manage their factoring config"
ON public.tenant_factoring_config
FOR ALL
TO authenticated
USING (
  can_access_tenant(auth.uid(), tenant_id) 
  AND has_tenant_role(auth.uid(), tenant_id, 'admin')
)
WITH CHECK (
  can_access_tenant(auth.uid(), tenant_id) 
  AND has_tenant_role(auth.uid(), tenant_id, 'admin')
);

-- Updated at trigger
CREATE TRIGGER update_tenant_factoring_config_updated_at
  BEFORE UPDATE ON public.tenant_factoring_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for fast tenant lookup
CREATE INDEX idx_tenant_factoring_config_tenant_id ON public.tenant_factoring_config(tenant_id);

-- Add comment
COMMENT ON TABLE public.tenant_factoring_config IS 'Per-tenant factoring company configuration (OTR Solutions credentials)';