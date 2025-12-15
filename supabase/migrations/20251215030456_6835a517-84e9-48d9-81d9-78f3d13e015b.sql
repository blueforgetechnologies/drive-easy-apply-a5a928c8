-- Drop existing SELECT policies and recreate properly
DROP POLICY IF EXISTS "Admins can view loadboard filters" ON public.loadboard_filters;
DROP POLICY IF EXISTS "Dispatchers can view loadboard filters" ON public.loadboard_filters;

-- Recreate as proper PERMISSIVE policies
CREATE POLICY "Admins can view loadboard filters"
ON public.loadboard_filters
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view loadboard filters"
ON public.loadboard_filters
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role));