-- Fix the overly permissive RLS policy on map_load_tracking
-- Drop the policy with 'true' condition and replace with proper admin check

DROP POLICY IF EXISTS "Admins can view all map loads" ON public.map_load_tracking;

-- Create proper admin policy using has_role function
CREATE POLICY "Admins can view all map loads" 
ON public.map_load_tracking 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));