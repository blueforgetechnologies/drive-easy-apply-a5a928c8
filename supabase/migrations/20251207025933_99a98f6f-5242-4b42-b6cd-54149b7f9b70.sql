-- Second migration: Add RLS policies for dispatcher role

-- Allow dispatchers to view vehicles (needed for Load Hunter)
CREATE POLICY "Dispatchers can view vehicles"
ON public.vehicles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view hunt plans
CREATE POLICY "Dispatchers can view all hunt plans"
ON public.hunt_plans
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to manage hunt plans
CREATE POLICY "Dispatchers can insert hunt plans"
ON public.hunt_plans
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can update hunt plans"
ON public.hunt_plans
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can delete hunt plans"
ON public.hunt_plans
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view load emails
CREATE POLICY "Dispatchers can view load emails"
ON public.load_emails
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to update load emails (for status changes)
CREATE POLICY "Dispatchers can update load emails"
ON public.load_emails
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view load hunt matches
CREATE POLICY "Dispatchers can view hunt matches"
ON public.load_hunt_matches
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to update hunt matches (for bid/skip actions)
CREATE POLICY "Dispatchers can update hunt matches"
ON public.load_hunt_matches
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to insert hunt matches
CREATE POLICY "Dispatchers can insert hunt matches"
ON public.load_hunt_matches
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view customers (for bids)
CREATE POLICY "Dispatchers can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view carriers
CREATE POLICY "Dispatchers can view carriers"
ON public.carriers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view loads
CREATE POLICY "Dispatchers can view loads"
ON public.loads
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to insert/update loads
CREATE POLICY "Dispatchers can insert loads"
ON public.loads
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can update loads"
ON public.loads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to insert email send tracking
CREATE POLICY "Dispatchers can insert email tracking"
ON public.email_send_tracking
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view map load tracking
CREATE POLICY "Dispatchers can view map tracking"
ON public.map_load_tracking
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert map tracking"
ON public.map_load_tracking
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view applications (drivers)
CREATE POLICY "Dispatchers can view applications"
ON public.applications
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view company profile
CREATE POLICY "Dispatchers can view company profile"
ON public.company_profile
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to view directions API tracking
CREATE POLICY "Dispatchers can view directions tracking"
ON public.directions_api_tracking
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert directions tracking"
ON public.directions_api_tracking
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow dispatchers to use geocode cache
CREATE POLICY "Dispatchers can view geocode cache"
ON public.geocode_cache
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert geocode cache"
ON public.geocode_cache
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can update geocode cache"
ON public.geocode_cache
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));