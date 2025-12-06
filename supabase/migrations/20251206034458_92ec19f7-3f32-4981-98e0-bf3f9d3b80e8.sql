-- Fix remaining security issues

-- 1. FIX map_load_tracking - need to check if policies exist and recreate properly
DROP POLICY IF EXISTS "Authenticated users can view map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Authenticated users can insert map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Allow all access to map load tracking" ON public.map_load_tracking;
DROP POLICY IF EXISTS "map_load_tracking_all" ON public.map_load_tracking;

-- Ensure RLS is enabled
ALTER TABLE public.map_load_tracking ENABLE ROW LEVEL SECURITY;

-- Add proper restricted policies
CREATE POLICY "Admins can view map load tracking"
ON public.map_load_tracking FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert map load tracking"
ON public.map_load_tracking FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. FIX processing_state - ensure no public access at all
DROP POLICY IF EXISTS "No client access to processing state" ON public.processing_state;
DROP POLICY IF EXISTS "Allow all access to processing_state" ON public.processing_state;
DROP POLICY IF EXISTS "processing_state_all" ON public.processing_state;

-- Ensure RLS is enabled
ALTER TABLE public.processing_state ENABLE ROW LEVEL SECURITY;

-- Block all client access (service role bypasses RLS)
CREATE POLICY "Service role only access to processing state"
ON public.processing_state FOR ALL
USING (false)
WITH CHECK (false);

-- 3. FIX geocode_cache_daily_stats - restrict to admins
DROP POLICY IF EXISTS "Allow read access to geocode stats" ON public.geocode_cache_daily_stats;
DROP POLICY IF EXISTS "geocode_cache_daily_stats_select" ON public.geocode_cache_daily_stats;

-- Ensure RLS is enabled
ALTER TABLE public.geocode_cache_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view geocode stats"
ON public.geocode_cache_daily_stats FOR SELECT
USING (has_role(auth.uid(), 'admin'));