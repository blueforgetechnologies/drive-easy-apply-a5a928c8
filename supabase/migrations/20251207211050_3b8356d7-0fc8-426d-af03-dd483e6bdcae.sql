-- Drop existing overly permissive policies on map_load_tracking
DROP POLICY IF EXISTS "Authenticated users can insert map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Authenticated users can view map load tracking" ON public.map_load_tracking;

-- Create restrictive RLS policies
-- Users can only view their own tracking data
CREATE POLICY "Users can view own map load tracking"
ON public.map_load_tracking
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all tracking data for analytics
CREATE POLICY "Admins can view all map load tracking"
ON public.map_load_tracking
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Users can insert their own tracking records
CREATE POLICY "Users can insert own map load tracking"
ON public.map_load_tracking
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);