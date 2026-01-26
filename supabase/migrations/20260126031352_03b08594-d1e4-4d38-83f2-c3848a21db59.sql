-- Fix screen_share_sessions UPDATE policy to allow joining pending sessions
-- Current policy requires you to already be a participant, but you need to UPDATE to become one

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "screen_share_sessions_update_participant" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Participant or platform admin can update session" ON public.screen_share_sessions;

-- Create corrected UPDATE policy that allows:
-- 1. Platform admins to update all sessions
-- 2. Existing participants to update their sessions  
-- 3. Tenant members to update PENDING sessions (to join them)
-- 4. Participants to update ACTIVE sessions (for WebRTC signaling)
CREATE POLICY "screen_share_sessions_update_policy" ON public.screen_share_sessions
FOR UPDATE
USING (
  is_platform_admin(auth.uid())
  OR (
    can_access_tenant(auth.uid(), tenant_id)
    AND (
      -- Already a participant
      auth.uid() = admin_user_id
      OR auth.uid() = client_user_id
      -- OR session is pending (joinable)
      OR status = 'pending'
    )
  )
)
WITH CHECK (
  is_platform_admin(auth.uid())
  OR (
    can_access_tenant(auth.uid(), tenant_id)
    AND (
      auth.uid() = admin_user_id
      OR auth.uid() = client_user_id
      OR status IN ('pending', 'active')
    )
  )
);