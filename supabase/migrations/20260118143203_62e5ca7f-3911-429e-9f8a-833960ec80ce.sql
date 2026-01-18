-- Fix invites table: Current policies allow access when tenant_id IS NULL which exposes data publicly
-- Drop and recreate policies to require tenant membership without NULL fallback

DROP POLICY IF EXISTS "Tenant admins can manage invites" ON public.invites;
DROP POLICY IF EXISTS "Tenant members can view their invites" ON public.invites;

-- Create proper restrictive policies
CREATE POLICY "Tenant members can view their invites"
ON public.invites
FOR SELECT
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id) OR is_platform_admin(auth.uid())
);

CREATE POLICY "Tenant members can manage their invites"
ON public.invites
FOR ALL
TO authenticated
USING (
  is_tenant_member(auth.uid(), tenant_id) OR is_platform_admin(auth.uid())
)
WITH CHECK (
  is_tenant_member(auth.uid(), tenant_id) OR is_platform_admin(auth.uid())
);