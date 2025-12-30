-- Phase 3: Add tenant_id to email_queue for tenant-aware ingestion

-- Add tenant_id column to email_queue
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Create index for efficient tenant queries
CREATE INDEX IF NOT EXISTS idx_email_queue_tenant ON public.email_queue(tenant_id);

-- Create dedupe_key column for deterministic deduplication per tenant
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Create unique constraint for tenant-scoped deduplication
-- This allows same gmail_message_id for different tenants (future multi-tenant Gmail)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_tenant_dedupe 
ON public.email_queue(tenant_id, dedupe_key) 
WHERE dedupe_key IS NOT NULL;

-- Create function to get default tenant for current single-tenant mode
CREATE OR REPLACE FUNCTION public.get_default_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1
$$;

-- Backfill existing email_queue items with default tenant
UPDATE public.email_queue 
SET tenant_id = public.get_default_tenant_id() 
WHERE tenant_id IS NULL;

-- Set dedupe_key for existing items (using gmail_message_id as dedupe key)
UPDATE public.email_queue 
SET dedupe_key = gmail_message_id 
WHERE dedupe_key IS NULL;