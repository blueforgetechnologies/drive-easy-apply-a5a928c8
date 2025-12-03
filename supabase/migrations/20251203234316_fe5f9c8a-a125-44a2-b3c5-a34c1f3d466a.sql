-- Fix: Restrict email_queue table to service role only (no client access)
-- Edge functions use SERVICE_ROLE_KEY which bypasses RLS

DROP POLICY IF EXISTS "email_queue_all" ON public.email_queue;

-- Deny all client access - only service role can access this table
CREATE POLICY "Service role only - no client access"
ON public.email_queue
FOR ALL
USING (false)
WITH CHECK (false);