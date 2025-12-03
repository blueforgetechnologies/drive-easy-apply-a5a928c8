-- Fix: Allow all authenticated users to VIEW dispatchers (needed for Load Hunter MY TRUCKS mode)
-- Keep admin-only for INSERT, UPDATE, DELETE

DROP POLICY IF EXISTS "Admins can view all dispatchers" ON public.dispatchers;

CREATE POLICY "Authenticated users can view dispatchers"
ON public.dispatchers
FOR SELECT
USING (auth.uid() IS NOT NULL);