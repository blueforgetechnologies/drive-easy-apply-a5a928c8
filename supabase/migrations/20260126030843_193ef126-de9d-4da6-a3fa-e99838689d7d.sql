-- Fix screen_share_sessions SELECT policies to allow finding pending sessions to join
-- The current policy only allows viewing if you're already a participant, 
-- but you need to be able to find the session BEFORE joining it

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Participant or platform admin can view session" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "screen_share_sessions_select_participant" ON public.screen_share_sessions;

-- Create corrected SELECT policy that allows:
-- 1. Platform admins to see all sessions
-- 2. Participants (admin_user_id or client_user_id) to see their sessions
-- 3. Tenant members to see PENDING sessions (so they can join them)
CREATE POLICY "screen_share_sessions_select_policy" ON public.screen_share_sessions
FOR SELECT
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
);