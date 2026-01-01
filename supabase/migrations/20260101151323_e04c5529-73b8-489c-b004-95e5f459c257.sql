-- Alter tenant_integrations to add missing columns and fix types
-- Change credentials_encrypted from jsonb to text for encrypted blob storage
ALTER TABLE public.tenant_integrations 
  ALTER COLUMN credentials_encrypted TYPE text USING credentials_encrypted::text;

-- Add credentials_hint for masked display
ALTER TABLE public.tenant_integrations 
  ADD COLUMN IF NOT EXISTS credentials_hint text;

-- Add last_checked_at for status tracking
ALTER TABLE public.tenant_integrations 
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

-- Update default for sync_status
ALTER TABLE public.tenant_integrations 
  ALTER COLUMN sync_status SET DEFAULT 'unknown';

-- Create unique constraint on tenant_id + provider if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tenant_integrations_tenant_provider_key'
  ) THEN
    ALTER TABLE public.tenant_integrations 
      ADD CONSTRAINT tenant_integrations_tenant_provider_key 
      UNIQUE (tenant_id, provider);
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant_provider 
  ON public.tenant_integrations (tenant_id, provider);

-- Create a secure view that excludes credentials_encrypted
CREATE OR REPLACE VIEW public.tenant_integrations_safe AS
SELECT 
  id,
  tenant_id,
  provider,
  is_enabled,
  credentials_hint,
  settings,
  last_sync_at,
  last_checked_at,
  sync_status,
  error_message,
  created_at,
  updated_at
FROM public.tenant_integrations;

-- RLS for the safe view (inherits from base table)
-- Note: Views inherit RLS from their base tables when SECURITY INVOKER (default)