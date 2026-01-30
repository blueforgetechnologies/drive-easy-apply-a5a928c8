
-- Fix: Allow postgres role (function owner) to access email_queue
-- The SECURITY DEFINER function runs as postgres, not service_role
-- So it needs its own permissive policy

-- Option 1: Add explicit policy for postgres role
CREATE POLICY "Postgres role full access for SECURITY DEFINER functions"
ON public.email_queue
FOR ALL
TO postgres
USING (true)
WITH CHECK (true);
