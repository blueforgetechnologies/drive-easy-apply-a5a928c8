-- TENANT ISOLATION FIX: Add tenant_id to tables missing it and add RLS policies
-- Phase 1: Add tenant_id column to tables that don't have it (nullable first for backfill)

-- applications
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- driver_invites
ALTER TABLE public.driver_invites ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- expenses (already has no tenant_id)
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- load_documents
ALTER TABLE public.load_documents ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- load_expenses
ALTER TABLE public.load_expenses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- load_stops (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'load_stops') THEN
    ALTER TABLE public.load_stops ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  END IF;
END $$;

-- locations
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- maintenance_records (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_records') THEN
    ALTER TABLE public.maintenance_records ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  END IF;
END $$;

-- payees
ALTER TABLE public.payees ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- settlements
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Phase 2: Backfill tenant_id with default tenant for existing rows
UPDATE public.applications SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.contacts SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.driver_invites SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.expenses SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.invoices SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.load_documents SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.load_expenses SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.locations SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.payees SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.settlements SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;

-- Backfill nullable tenant_id in existing tables
UPDATE public.carriers SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.customers SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.dispatchers SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.loads SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.vehicles SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;
UPDATE public.hunt_plans SET tenant_id = get_default_tenant_id() WHERE tenant_id IS NULL;

-- Phase 3: Add tenant-scoped RLS policies for newly added tables

-- Applications RLS
CREATE POLICY "Tenant members can view their applications"
  ON public.applications FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their applications"
  ON public.applications FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Driver invites RLS  
CREATE POLICY "Tenant members can view their driver invites"
  ON public.driver_invites FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their driver invites"
  ON public.driver_invites FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Invoices RLS
CREATE POLICY "Tenant members can view their invoices"
  ON public.invoices FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their invoices"
  ON public.invoices FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Settlements RLS
CREATE POLICY "Tenant members can view their settlements"
  ON public.settlements FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their settlements"
  ON public.settlements FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Expenses RLS
CREATE POLICY "Tenant members can view their expenses"
  ON public.expenses FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their expenses"
  ON public.expenses FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Payees RLS
CREATE POLICY "Tenant members can view their payees"
  ON public.payees FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their payees"
  ON public.payees FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Locations RLS
CREATE POLICY "Tenant members can view their locations"
  ON public.locations FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their locations"
  ON public.locations FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Contacts RLS
CREATE POLICY "Tenant members can view their contacts"
  ON public.contacts FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their contacts"
  ON public.contacts FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Load documents RLS
CREATE POLICY "Tenant members can view their load documents"
  ON public.load_documents FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their load documents"
  ON public.load_documents FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

-- Load expenses RLS
CREATE POLICY "Tenant members can view their load expenses"
  ON public.load_expenses FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage their load expenses"
  ON public.load_expenses FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(auth.uid(), tenant_id));