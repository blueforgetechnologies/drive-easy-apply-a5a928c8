-- =====================================================
-- FIX: payment_formulas INSERT/UPDATE policies
-- Require tenant membership for writes while allowing global reads
-- =====================================================

-- Drop overly permissive write policies
DROP POLICY IF EXISTS "Authenticated users can create formulas" ON public.payment_formulas;
DROP POLICY IF EXISTS "Authenticated users can update formulas" ON public.payment_formulas;

-- Create tenant-scoped INSERT policy
-- Users can only insert formulas for their own tenant
CREATE POLICY "Tenant members can create formulas"
ON public.payment_formulas
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL 
  AND tenant_id IN (
    SELECT tu.tenant_id 
    FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
      AND tu.is_active = true
  )
);

-- Create tenant-scoped UPDATE policy
-- Users can only update formulas belonging to their tenant
CREATE POLICY "Tenant members can update formulas"
ON public.payment_formulas
FOR UPDATE
USING (
  tenant_id IS NOT NULL 
  AND tenant_id IN (
    SELECT tu.tenant_id 
    FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
      AND tu.is_active = true
  )
);

-- Add DELETE policy for completeness (tenant-scoped)
CREATE POLICY "Tenant members can delete formulas"
ON public.payment_formulas
FOR DELETE
USING (
  tenant_id IS NOT NULL 
  AND tenant_id IN (
    SELECT tu.tenant_id 
    FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
      AND tu.is_active = true
  )
);