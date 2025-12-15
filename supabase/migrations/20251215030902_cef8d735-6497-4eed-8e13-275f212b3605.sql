-- Allow any client (anon or authenticated) to read loadboard filters
CREATE POLICY "Anyone can view loadboard filters"
ON public.loadboard_filters
FOR SELECT
TO anon, authenticated
USING (true);