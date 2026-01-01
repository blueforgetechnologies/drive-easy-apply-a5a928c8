-- =====================================================
-- TENANT ISOLATION ENFORCEMENT - NOT NULL CONSTRAINTS
-- Make tenant_id NOT NULL on all tenant-owned tables
-- FKs already exist from previous migration
-- =====================================================

-- Applications table
ALTER TABLE public.applications
  ALTER COLUMN tenant_id SET NOT NULL;

-- Contacts table  
ALTER TABLE public.contacts
  ALTER COLUMN tenant_id SET NOT NULL;

-- Driver invites table
ALTER TABLE public.driver_invites
  ALTER COLUMN tenant_id SET NOT NULL;

-- Expenses table
ALTER TABLE public.expenses
  ALTER COLUMN tenant_id SET NOT NULL;

-- Invoices table
ALTER TABLE public.invoices
  ALTER COLUMN tenant_id SET NOT NULL;

-- Locations table
ALTER TABLE public.locations
  ALTER COLUMN tenant_id SET NOT NULL;

-- Payees table
ALTER TABLE public.payees
  ALTER COLUMN tenant_id SET NOT NULL;

-- Settlements table
ALTER TABLE public.settlements
  ALTER COLUMN tenant_id SET NOT NULL;

-- Load expenses table
ALTER TABLE public.load_expenses
  ALTER COLUMN tenant_id SET NOT NULL;

-- Carriers table
ALTER TABLE public.carriers
  ALTER COLUMN tenant_id SET NOT NULL;

-- Customers table
ALTER TABLE public.customers
  ALTER COLUMN tenant_id SET NOT NULL;

-- Dispatchers table
ALTER TABLE public.dispatchers
  ALTER COLUMN tenant_id SET NOT NULL;

-- Vehicles table
ALTER TABLE public.vehicles
  ALTER COLUMN tenant_id SET NOT NULL;

-- Loads table
ALTER TABLE public.loads
  ALTER COLUMN tenant_id SET NOT NULL;

-- Hunt plans table
ALTER TABLE public.hunt_plans
  ALTER COLUMN tenant_id SET NOT NULL;