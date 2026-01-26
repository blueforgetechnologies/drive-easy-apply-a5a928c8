-- Clean up old permissive policies that were not dropped
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Users can update their sessions" ON public.screen_share_sessions;