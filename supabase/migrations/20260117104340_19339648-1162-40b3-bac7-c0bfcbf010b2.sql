-- Add tenant_id column (nullable = global default)
ALTER TABLE public.payment_formulas 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_payment_formulas_tenant_id 
ON public.payment_formulas(tenant_id);

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to manage formulas" ON public.payment_formulas;
DROP POLICY IF EXISTS "Allow authenticated to insert formulas" ON public.payment_formulas;
DROP POLICY IF EXISTS "Allow authenticated to update formulas" ON public.payment_formulas;

-- SELECT: Can read global defaults (NULL) OR own tenant's formulas
CREATE POLICY "Users can read default or own tenant formulas"
ON public.payment_formulas FOR SELECT
TO authenticated
USING (
  tenant_id IS NULL 
  OR can_access_tenant(auth.uid(), tenant_id)
);

-- INSERT: Only to own tenant (cannot create global defaults)
CREATE POLICY "Users can create own tenant formulas"
ON public.payment_formulas FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- UPDATE: Only own tenant's formulas (cannot modify global defaults)
CREATE POLICY "Users can update own tenant formulas"
ON public.payment_formulas FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);

-- DELETE: Only own tenant's formulas
CREATE POLICY "Users can delete own tenant formulas"
ON public.payment_formulas FOR DELETE
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND can_access_tenant(auth.uid(), tenant_id)
);