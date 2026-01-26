-- Fix UPDATE policy to include WITH CHECK clause (correct function signature)
DROP POLICY IF EXISTS "Participants can update their sessions" ON public.screen_share_sessions;

CREATE POLICY "Participants can update their sessions"
ON public.screen_share_sessions
FOR UPDATE
TO authenticated
USING (
  (
    (auth.uid() = admin_user_id OR auth.uid() = client_user_id)
    AND can_access_tenant(auth.uid(), tenant_id)
  )
  OR is_platform_admin(auth.uid())
)
WITH CHECK (
  (
    (auth.uid() = admin_user_id OR auth.uid() = client_user_id)
    AND can_access_tenant(auth.uid(), tenant_id)
  )
  OR is_platform_admin(auth.uid())
);