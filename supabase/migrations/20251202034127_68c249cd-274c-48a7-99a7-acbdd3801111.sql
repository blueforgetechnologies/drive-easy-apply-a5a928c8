-- Fix gmail_tokens RLS - restrict to service role only (no public access)
DROP POLICY IF EXISTS "Service role can manage gmail tokens" ON public.gmail_tokens;

CREATE POLICY "Only service role can access gmail tokens"
ON public.gmail_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix unreviewed_matches view - it's a view so we need to secure underlying tables
-- The view itself doesn't have RLS, but we ensure load_emails and load_hunt_matches are protected

-- Ensure load_emails has proper RLS
ALTER TABLE public.load_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view load emails" ON public.load_emails;
CREATE POLICY "Authenticated users can view load emails"
ON public.load_emails
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert load emails" ON public.load_emails;
CREATE POLICY "Authenticated users can insert load emails"
ON public.load_emails
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update load emails" ON public.load_emails;
CREATE POLICY "Authenticated users can update load emails"
ON public.load_emails
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Service role can manage load emails" ON public.load_emails;
CREATE POLICY "Service role can manage load emails"
ON public.load_emails
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure load_hunt_matches has proper RLS
ALTER TABLE public.load_hunt_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view hunt matches" ON public.load_hunt_matches;
CREATE POLICY "Authenticated users can view hunt matches"
ON public.load_hunt_matches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert hunt matches" ON public.load_hunt_matches;
CREATE POLICY "Authenticated users can insert hunt matches"
ON public.load_hunt_matches
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update hunt matches" ON public.load_hunt_matches;
CREATE POLICY "Authenticated users can update hunt matches"
ON public.load_hunt_matches
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete hunt matches" ON public.load_hunt_matches;
CREATE POLICY "Authenticated users can delete hunt matches"
ON public.load_hunt_matches
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Service role can manage hunt matches" ON public.load_hunt_matches;
CREATE POLICY "Service role can manage hunt matches"
ON public.load_hunt_matches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create function to check if email is invited (for signup validation)
CREATE OR REPLACE FUNCTION public.is_email_invited(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invites
    WHERE LOWER(email) = LOWER(check_email)
    AND accepted_at IS NULL
  )
$$;