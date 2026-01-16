-- Add INSERT/UPDATE policy for service role (workers use service role key which bypasses RLS,
-- but let's also add policies for completeness and the RPC function)

-- Allow service role and RPC function to insert/update heartbeats
CREATE POLICY "Service role can manage worker heartbeats"
ON public.worker_heartbeats
FOR ALL
USING (true)
WITH CHECK (true);

-- Note: The RPC function runs with SECURITY DEFINER so it should work,
-- but let's make sure the worker's direct upsert fallback also works