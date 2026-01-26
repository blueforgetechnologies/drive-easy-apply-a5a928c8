-- Fix screen_share_sessions INSERT policy to allow users to create sessions 
-- for any tenant they belong to, not just their "first" tenant

-- Drop conflicting INSERT policies
DROP POLICY IF EXISTS "screen_share_sessions_insert_participant" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Creator must be authenticated participant in current tenant" ON public.screen_share_sessions;

-- Create a corrected INSERT policy that allows users to create sessions 
-- for any tenant they are an active member of
CREATE POLICY "screen_share_sessions_insert_policy" ON public.screen_share_sessions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND can_access_tenant(auth.uid(), tenant_id)
  AND (
    (initiated_by = 'admin' AND admin_user_id = auth.uid() AND client_user_id IS NULL)
    OR 
    (initiated_by = 'client' AND client_user_id = auth.uid() AND admin_user_id IS NULL)
  )
);