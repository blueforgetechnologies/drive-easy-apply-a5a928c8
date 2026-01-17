-- ============================================
-- FIX 1: carrier_rate_history - Add tenant isolation
-- ============================================

-- Add tenant_id column
ALTER TABLE public.carrier_rate_history 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from parent loads table
UPDATE public.carrier_rate_history crh
SET tenant_id = l.tenant_id
FROM public.loads l
WHERE crh.load_id = l.id
  AND crh.tenant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_carrier_rate_history_tenant_id 
ON public.carrier_rate_history(tenant_id);

-- Drop old role-based policies
DROP POLICY IF EXISTS "Admins can insert carrier rate history" ON public.carrier_rate_history;
DROP POLICY IF EXISTS "Admins can view carrier rate history" ON public.carrier_rate_history;
DROP POLICY IF EXISTS "Dispatchers can insert carrier rate history" ON public.carrier_rate_history;
DROP POLICY IF EXISTS "Dispatchers can view carrier rate history" ON public.carrier_rate_history;

-- Create tenant-scoped policies
CREATE POLICY "Tenant members can view carrier rate history"
ON public.carrier_rate_history FOR SELECT
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert carrier rate history"
ON public.carrier_rate_history FOR INSERT
TO authenticated
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update carrier rate history"
ON public.carrier_rate_history FOR UPDATE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete carrier rate history"
ON public.carrier_rate_history FOR DELETE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

-- ============================================
-- FIX 2: invoice_loads - Add tenant isolation
-- ============================================

-- Add tenant_id column
ALTER TABLE public.invoice_loads 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from parent invoices table
UPDATE public.invoice_loads il
SET tenant_id = i.tenant_id
FROM public.invoices i
WHERE il.invoice_id = i.id
  AND il.tenant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_invoice_loads_tenant_id 
ON public.invoice_loads(tenant_id);

-- Drop old role-based policies
DROP POLICY IF EXISTS "Admins can delete invoice loads" ON public.invoice_loads;
DROP POLICY IF EXISTS "Admins can insert invoice loads" ON public.invoice_loads;
DROP POLICY IF EXISTS "Admins can view all invoice loads" ON public.invoice_loads;

-- Create tenant-scoped policies
CREATE POLICY "Tenant members can view invoice loads"
ON public.invoice_loads FOR SELECT
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert invoice loads"
ON public.invoice_loads FOR INSERT
TO authenticated
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update invoice loads"
ON public.invoice_loads FOR UPDATE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete invoice loads"
ON public.invoice_loads FOR DELETE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

-- ============================================
-- FIX 3: settlement_loads - Add tenant isolation
-- ============================================

-- Add tenant_id column
ALTER TABLE public.settlement_loads 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from parent settlements table
UPDATE public.settlement_loads sl
SET tenant_id = s.tenant_id
FROM public.settlements s
WHERE sl.settlement_id = s.id
  AND sl.tenant_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_settlement_loads_tenant_id 
ON public.settlement_loads(tenant_id);

-- Enable RLS if not already
ALTER TABLE public.settlement_loads ENABLE ROW LEVEL SECURITY;

-- Drop any old policies
DROP POLICY IF EXISTS "Admins can manage settlement loads" ON public.settlement_loads;
DROP POLICY IF EXISTS "Admins can view settlement loads" ON public.settlement_loads;

-- Create tenant-scoped policies
CREATE POLICY "Tenant members can view settlement loads"
ON public.settlement_loads FOR SELECT
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert settlement loads"
ON public.settlement_loads FOR INSERT
TO authenticated
WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update settlement loads"
ON public.settlement_loads FOR UPDATE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete settlement loads"
ON public.settlement_loads FOR DELETE
TO authenticated
USING (can_access_tenant(auth.uid(), tenant_id));