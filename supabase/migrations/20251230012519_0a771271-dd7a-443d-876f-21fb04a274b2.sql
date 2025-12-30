-- Phase 2: Add tenant_id to EXISTING tables for multi-tenant isolation

-- Add tenant_id to load_emails
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to hunt_plans
ALTER TABLE public.hunt_plans 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to vehicles
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to loads
ALTER TABLE public.loads 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to dispatchers
ALTER TABLE public.dispatchers 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to load_hunt_matches
ALTER TABLE public.load_hunt_matches 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to carriers
ALTER TABLE public.carriers 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Create indexes for tenant_id columns (performance optimization)
CREATE INDEX IF NOT EXISTS idx_load_emails_tenant ON public.load_emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hunt_plans_tenant ON public.hunt_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON public.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loads_tenant ON public.loads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dispatchers_tenant ON public.dispatchers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_load_hunt_matches_tenant ON public.load_hunt_matches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carriers_tenant ON public.carriers(tenant_id);

-- Create a default tenant for existing data migration (using correct column names)
INSERT INTO public.tenants (name, slug, release_channel)
VALUES ('Default Tenant', 'default', 'general')
ON CONFLICT DO NOTHING;

-- Backfill existing records with the default tenant
UPDATE public.load_emails SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.hunt_plans SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.vehicles SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.loads SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.customers SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.dispatchers SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.load_hunt_matches SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.carriers SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1) WHERE tenant_id IS NULL;

-- Add RLS policies for tenant isolation on load_emails
DROP POLICY IF EXISTS "Tenant members can view their load emails" ON public.load_emails;
CREATE POLICY "Tenant members can view their load emails" 
ON public.load_emails FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can insert load emails" ON public.load_emails;
CREATE POLICY "Tenant members can insert load emails" 
ON public.load_emails FOR INSERT 
TO authenticated 
WITH CHECK (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can update their load emails" ON public.load_emails;
CREATE POLICY "Tenant members can update their load emails" 
ON public.load_emails FOR UPDATE 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on hunt_plans
DROP POLICY IF EXISTS "Tenant members can view their hunt plans" ON public.hunt_plans;
CREATE POLICY "Tenant members can view their hunt plans" 
ON public.hunt_plans FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their hunt plans" ON public.hunt_plans;
CREATE POLICY "Tenant members can manage their hunt plans" 
ON public.hunt_plans FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on vehicles
DROP POLICY IF EXISTS "Tenant members can view their vehicles" ON public.vehicles;
CREATE POLICY "Tenant members can view their vehicles" 
ON public.vehicles FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their vehicles" ON public.vehicles;
CREATE POLICY "Tenant members can manage their vehicles" 
ON public.vehicles FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on loads
DROP POLICY IF EXISTS "Tenant members can view their loads" ON public.loads;
CREATE POLICY "Tenant members can view their loads" 
ON public.loads FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their loads" ON public.loads;
CREATE POLICY "Tenant members can manage their loads" 
ON public.loads FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on customers
DROP POLICY IF EXISTS "Tenant members can view their customers" ON public.customers;
CREATE POLICY "Tenant members can view their customers" 
ON public.customers FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their customers" ON public.customers;
CREATE POLICY "Tenant members can manage their customers" 
ON public.customers FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on dispatchers
DROP POLICY IF EXISTS "Tenant members can view their dispatchers" ON public.dispatchers;
CREATE POLICY "Tenant members can view their dispatchers" 
ON public.dispatchers FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their dispatchers" ON public.dispatchers;
CREATE POLICY "Tenant members can manage their dispatchers" 
ON public.dispatchers FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on load_hunt_matches
DROP POLICY IF EXISTS "Tenant members can view their matches" ON public.load_hunt_matches;
CREATE POLICY "Tenant members can view their matches" 
ON public.load_hunt_matches FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their matches" ON public.load_hunt_matches;
CREATE POLICY "Tenant members can manage their matches" 
ON public.load_hunt_matches FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

-- Add RLS policies for tenant isolation on carriers
DROP POLICY IF EXISTS "Tenant members can view their carriers" ON public.carriers;
CREATE POLICY "Tenant members can view their carriers" 
ON public.carriers FOR SELECT 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Tenant members can manage their carriers" ON public.carriers;
CREATE POLICY "Tenant members can manage their carriers" 
ON public.carriers FOR ALL 
TO authenticated 
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.is_tenant_member(auth.uid(), tenant_id)
);