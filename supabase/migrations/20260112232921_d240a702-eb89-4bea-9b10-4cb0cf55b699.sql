-- ============================================================================
-- B3: tenant_inbound_addresses - Custom Inbound Email Mapping
-- Allows tenants to receive emails from addresses that don't use plus-addressing
-- ============================================================================

-- Create tenant_inbound_addresses table
CREATE TABLE public.tenant_inbound_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Create unique index on normalized (lowercased, trimmed) email address
-- This prevents duplicates like "P.D@example.com" and "p.d@example.com"
CREATE UNIQUE INDEX idx_tenant_inbound_addresses_email_unique 
  ON public.tenant_inbound_addresses (lower(trim(email_address)));

-- Create index for tenant lookups
CREATE INDEX idx_tenant_inbound_addresses_tenant 
  ON public.tenant_inbound_addresses (tenant_id);

-- Create index for active address lookups (used by gmail-webhook routing)
CREATE INDEX idx_tenant_inbound_addresses_active_lookup 
  ON public.tenant_inbound_addresses (lower(trim(email_address))) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.tenant_inbound_addresses ENABLE ROW LEVEL SECURITY;

-- Platform admin only: SELECT
CREATE POLICY "Platform admins can view all inbound addresses"
ON public.tenant_inbound_addresses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Platform admin only: INSERT
CREATE POLICY "Platform admins can create inbound addresses"
ON public.tenant_inbound_addresses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Platform admin only: UPDATE
CREATE POLICY "Platform admins can update inbound addresses"
ON public.tenant_inbound_addresses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Platform admin only: DELETE
CREATE POLICY "Platform admins can delete inbound addresses"
ON public.tenant_inbound_addresses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Add comment explaining the table purpose
COMMENT ON TABLE public.tenant_inbound_addresses IS 'Custom inbound email addresses for tenants that cannot use plus-addressing. Used as fallback routing when no +alias is found in email headers.';
COMMENT ON COLUMN public.tenant_inbound_addresses.email_address IS 'The custom email address (e.g., p.d@talbilogistics.com). Stored as-is but compared case-insensitively via the unique index.';