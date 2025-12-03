-- Fix 1: Secure gmail_tokens - deny all client access (service role bypasses RLS)
DROP POLICY IF EXISTS "Only service role can access gmail tokens" ON public.gmail_tokens;
CREATE POLICY "No client access to gmail tokens"
ON public.gmail_tokens
FOR ALL
USING (false)
WITH CHECK (false);

-- Fix 2: Secure dispatchers table with admin-only RLS policies
DROP POLICY IF EXISTS "dispatchers_select" ON public.dispatchers;
DROP POLICY IF EXISTS "dispatchers_insert" ON public.dispatchers;
DROP POLICY IF EXISTS "dispatchers_update" ON public.dispatchers;
DROP POLICY IF EXISTS "dispatchers_delete" ON public.dispatchers;

CREATE POLICY "Admins can view all dispatchers"
ON public.dispatchers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert dispatchers"
ON public.dispatchers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update dispatchers"
ON public.dispatchers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete dispatchers"
ON public.dispatchers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));