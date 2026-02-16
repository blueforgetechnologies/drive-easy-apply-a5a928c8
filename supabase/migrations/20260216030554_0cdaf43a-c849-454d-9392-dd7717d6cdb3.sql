-- Composite index for Load Hunter email query: tenant + created_at + received_at
-- This resolves statement timeouts on the 2.4GB / 251K row load_emails table
CREATE INDEX IF NOT EXISTS idx_load_emails_tenant_created_received 
ON public.load_emails (tenant_id, created_at DESC, received_at DESC);
