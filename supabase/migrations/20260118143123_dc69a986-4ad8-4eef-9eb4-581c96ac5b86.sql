-- Fix worker_heartbeats table: Drop the overly permissive policy that allows public access
-- This policy has USING (true) which allows anyone to read the table
DROP POLICY IF EXISTS "Service role can manage worker heartbeats" ON public.worker_heartbeats;

-- The existing "Platform admins can view worker heartbeats" policy already restricts SELECT to platform admins
-- Workers should use service role key which bypasses RLS entirely, so no client-accessible write policy is needed
-- By removing the permissive policy and keeping only the admin policy, the table is properly secured