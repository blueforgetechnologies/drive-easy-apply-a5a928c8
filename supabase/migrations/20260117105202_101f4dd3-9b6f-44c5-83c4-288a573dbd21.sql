-- ============================================
-- FIX 1: pay_structures - Add tenant isolation
-- ============================================

-- Add tenant_id column (nullable = global default)
ALTER TABLE public.pay_structures 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_pay_structures_tenant_id 
ON public.pay_structures(tenant_id);

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Anyone can view pay structures" ON public.pay_structures;
DROP POLICY IF EXISTS "Authenticated users can manage pay structures" ON public.pay_structures;

-- Enable RLS if not already
ALTER TABLE public.pay_structures ENABLE ROW LEVEL SECURITY;

-- SELECT: Can read global defaults (NULL) OR own tenant's structures
CREATE POLICY "Users can read default or own tenant pay structures"
ON public.pay_structures FOR SELECT
TO authenticated
USING (
  tenant_id IS NULL 
  OR can_access_tenant(auth.uid(), tenant_id)
);

-- INSERT: Only to own tenant (cannot create global defaults)
CREATE POLICY "Users can create own tenant pay structures"
ON public.pay_structures FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- UPDATE: Only own tenant's structures
CREATE POLICY "Users can update own tenant pay structures"
ON public.pay_structures FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- DELETE: Only own tenant's structures
CREATE POLICY "Users can delete own tenant pay structures"
ON public.pay_structures FOR DELETE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- ============================================
-- FIX 2: profiles INSERT policy - Restrict to own profile
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

-- Create proper policy: users can only insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- ============================================
-- FIX 3: loadboard_filters - Add tenant isolation
-- ============================================

-- Add tenant_id column (nullable = global/shared filters)
ALTER TABLE public.loadboard_filters 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_loadboard_filters_tenant_id 
ON public.loadboard_filters(tenant_id);

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Anyone can view loadboard filters" ON public.loadboard_filters;
DROP POLICY IF EXISTS "Authenticated users can manage loadboard filters" ON public.loadboard_filters;

-- Enable RLS if not already
ALTER TABLE public.loadboard_filters ENABLE ROW LEVEL SECURITY;

-- SELECT: Can read global filters (NULL) OR own tenant's filters
CREATE POLICY "Users can read default or own tenant loadboard filters"
ON public.loadboard_filters FOR SELECT
TO authenticated
USING (
  tenant_id IS NULL 
  OR can_access_tenant(auth.uid(), tenant_id)
);

-- INSERT: Only to own tenant
CREATE POLICY "Users can create own tenant loadboard filters"
ON public.loadboard_filters FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- UPDATE: Only own tenant's filters
CREATE POLICY "Users can update own tenant loadboard filters"
ON public.loadboard_filters FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- DELETE: Only own tenant's filters
CREATE POLICY "Users can delete own tenant loadboard filters"
ON public.loadboard_filters FOR DELETE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);