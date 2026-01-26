-- Rename policies to consistent naming convention
-- DROP and recreate with consistent names

-- SELECT policy
DROP POLICY IF EXISTS "Participants can view their sessions" ON public.screen_share_sessions;
CREATE POLICY "screen_share_sessions_select_participant"
ON public.screen_share_sessions
FOR SELECT
TO authenticated
USING (
  ((auth.uid() = admin_user_id OR auth.uid() = client_user_id) AND can_access_tenant(auth.uid(), tenant_id))
  OR is_platform_admin(auth.uid())
);

-- INSERT policy  
DROP POLICY IF EXISTS "Participants can create sessions" ON public.screen_share_sessions;
CREATE POLICY "screen_share_sessions_insert_participant"
ON public.screen_share_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = get_current_tenant_id()
  AND (
    (initiated_by = 'admin' AND admin_user_id = auth.uid() AND client_user_id IS NULL)
    OR (initiated_by = 'client' AND client_user_id = auth.uid() AND admin_user_id IS NULL)
  )
);

-- UPDATE policy
DROP POLICY IF EXISTS "Participants can update their sessions" ON public.screen_share_sessions;
CREATE POLICY "screen_share_sessions_update_participant"
ON public.screen_share_sessions
FOR UPDATE
TO authenticated
USING (
  ((auth.uid() = admin_user_id OR auth.uid() = client_user_id) AND can_access_tenant(auth.uid(), tenant_id))
  OR is_platform_admin(auth.uid())
)
WITH CHECK (
  ((auth.uid() = admin_user_id OR auth.uid() = client_user_id) AND can_access_tenant(auth.uid(), tenant_id))
  OR is_platform_admin(auth.uid())
);

-- DELETE policy
DROP POLICY IF EXISTS "Participants can delete their sessions" ON public.screen_share_sessions;
CREATE POLICY "screen_share_sessions_delete_participant"
ON public.screen_share_sessions
FOR DELETE
TO authenticated
USING (
  ((auth.uid() = admin_user_id OR auth.uid() = client_user_id) AND can_access_tenant(auth.uid(), tenant_id))
  OR is_platform_admin(auth.uid())
);