-- Drop any existing policies on map_load_tracking first
DROP POLICY IF EXISTS "Authenticated users can insert map loads" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Authenticated users can view map loads" ON public.map_load_tracking;
DROP POLICY IF EXISTS "Allow all access to map_load_tracking" ON public.map_load_tracking;

-- Create proper policies for map_load_tracking
CREATE POLICY "Authenticated users can insert map loads"
ON public.map_load_tracking
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view map loads"
ON public.map_load_tracking
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Drop any existing policies on mapbox_monthly_usage first
DROP POLICY IF EXISTS "Admins can view mapbox usage" ON public.mapbox_monthly_usage;
DROP POLICY IF EXISTS "Admins can insert mapbox usage" ON public.mapbox_monthly_usage;
DROP POLICY IF EXISTS "Admins can update mapbox usage" ON public.mapbox_monthly_usage;
DROP POLICY IF EXISTS "Allow all access to mapbox_monthly_usage" ON public.mapbox_monthly_usage;

-- Create proper policies for mapbox_monthly_usage
CREATE POLICY "Admins can view mapbox usage"
ON public.mapbox_monthly_usage
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert mapbox usage"
ON public.mapbox_monthly_usage
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update mapbox usage"
ON public.mapbox_monthly_usage
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));