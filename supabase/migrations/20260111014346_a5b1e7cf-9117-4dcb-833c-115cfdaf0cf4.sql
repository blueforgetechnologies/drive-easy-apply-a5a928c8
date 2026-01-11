-- =====================================================
-- Global Integrations with Per-Tenant Overrides
-- =====================================================

-- 1) Create platform_integrations table for global default API keys
CREATE TABLE IF NOT EXISTS public.platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}', -- stores encrypted global API key + settings
  config_hint TEXT, -- masked hint for display (e.g., ••••1234)
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on platform_integrations
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

-- Only platform admins can manage global integrations
CREATE POLICY "Platform admins can manage global integrations"
  ON public.platform_integrations
  FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- All authenticated users can read enabled global integrations (for UI display)
CREATE POLICY "Authenticated users can view global integrations"
  ON public.platform_integrations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_platform_integrations_key ON public.platform_integrations(integration_key);

-- 2) Add use_global column to tenant_integrations if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_integrations' 
    AND column_name = 'use_global'
  ) THEN
    ALTER TABLE public.tenant_integrations ADD COLUMN use_global BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Rename credentials_encrypted to override_config for clarity (if exists)
-- We'll keep the original column and add a new one for clarity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_integrations' 
    AND column_name = 'override_config'
  ) THEN
    ALTER TABLE public.tenant_integrations ADD COLUMN override_config TEXT;
    -- Copy existing encrypted credentials to override_config
    UPDATE public.tenant_integrations 
    SET override_config = credentials_encrypted 
    WHERE credentials_encrypted IS NOT NULL;
  END IF;
END $$;

-- Add override_hint column for masked display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_integrations' 
    AND column_name = 'override_hint'
  ) THEN
    ALTER TABLE public.tenant_integrations ADD COLUMN override_hint TEXT;
    -- Copy existing hints
    UPDATE public.tenant_integrations 
    SET override_hint = credentials_hint 
    WHERE credentials_hint IS NOT NULL;
  END IF;
END $$;

-- 3) Create integration_usage_events table for logging
CREATE TABLE IF NOT EXISTS public.integration_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'success', 'error')),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on usage events
ALTER TABLE public.integration_usage_events ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all usage events
CREATE POLICY "Platform admins can view all usage events"
  ON public.integration_usage_events
  FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- Tenant members can view their own usage events
CREATE POLICY "Tenant members can view own usage events"
  ON public.integration_usage_events
  FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id));

-- Only server can insert usage events (no client writes)
CREATE POLICY "Service role can insert usage events"
  ON public.integration_usage_events
  FOR INSERT
  WITH CHECK (false); -- Blocked for all clients, service role bypasses RLS

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON public.integration_usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_key ON public.integration_usage_events(integration_key);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON public.integration_usage_events(created_at DESC);

-- 4) Create the resolver function: resolve_integration_config
-- This is the SINGLE SOURCE OF TRUTH for integration config resolution
CREATE OR REPLACE FUNCTION public.resolve_integration_config(
  p_tenant_id UUID,
  p_integration_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform RECORD;
  v_tenant RECORD;
  v_result JSONB;
BEGIN
  -- Get global platform config
  SELECT * INTO v_platform
  FROM public.platform_integrations
  WHERE integration_key = p_integration_key;

  -- Get tenant-specific config
  SELECT * INTO v_tenant
  FROM public.tenant_integrations
  WHERE tenant_id = p_tenant_id
    AND provider = p_integration_key;

  -- Resolution logic:
  -- 1) If tenant has use_global = false AND override_config exists → use tenant override
  -- 2) Else → use global platform config
  -- 3) If integration is disabled globally with no override → return error
  
  IF v_tenant.use_global = false AND v_tenant.override_config IS NOT NULL THEN
    -- Tenant override
    v_result := jsonb_build_object(
      'source', 'tenant_override',
      'is_enabled', COALESCE(v_tenant.is_enabled, true),
      'config', v_tenant.override_config,
      'config_hint', v_tenant.override_hint,
      'integration_key', p_integration_key
    );
  ELSIF v_platform.id IS NOT NULL THEN
    -- Global config
    IF v_platform.is_enabled = false THEN
      -- Check if tenant has an override that enables it
      IF v_tenant.use_global = false AND v_tenant.is_enabled = true THEN
        v_result := jsonb_build_object(
          'source', 'tenant_override',
          'is_enabled', true,
          'config', v_tenant.override_config,
          'config_hint', v_tenant.override_hint,
          'integration_key', p_integration_key
        );
      ELSE
        v_result := jsonb_build_object(
          'source', 'global_disabled',
          'is_enabled', false,
          'error', 'Integration is disabled globally',
          'integration_key', p_integration_key
        );
      END IF;
    ELSE
      v_result := jsonb_build_object(
        'source', 'global',
        'is_enabled', true,
        'config', v_platform.config,
        'config_hint', v_platform.config_hint,
        'integration_key', p_integration_key
      );
    END IF;
  ELSE
    -- No config found anywhere
    v_result := jsonb_build_object(
      'source', 'not_configured',
      'is_enabled', false,
      'error', 'Integration not configured',
      'integration_key', p_integration_key
    );
  END IF;

  RETURN v_result;
END;
$$;

-- 5) Seed initial platform integrations (4 in scope: mapbox, resend, weather, highway)
INSERT INTO public.platform_integrations (integration_key, is_enabled, description)
VALUES 
  ('mapbox', true, 'Maps and geocoding services'),
  ('resend', true, 'Transactional email service'),
  ('weather', true, 'Real-time weather data for locations'),
  ('highway', true, 'Carrier identity verification and fraud prevention')
ON CONFLICT (integration_key) DO NOTHING;

-- 6) Update tenant_integrations to default use_global = true for existing records
UPDATE public.tenant_integrations
SET use_global = true
WHERE use_global IS NULL;

-- 7) Grant execute on resolver function to authenticated users
GRANT EXECUTE ON FUNCTION public.resolve_integration_config(UUID, TEXT) TO authenticated;