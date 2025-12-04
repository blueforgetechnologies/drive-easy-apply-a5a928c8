-- Create a function to get email queue stats (bypasses RLS with SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_email_queue_pending_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM email_queue WHERE status = 'pending';
$$;