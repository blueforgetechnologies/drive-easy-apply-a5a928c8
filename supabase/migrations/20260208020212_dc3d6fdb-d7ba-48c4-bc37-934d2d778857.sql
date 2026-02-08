
-- Thin wrapper so the VPS worker can call pg_try_advisory_xact_lock via RPC.
-- Returns true if lock acquired, false if already held by another session.
CREATE OR REPLACE FUNCTION public.pg_advisory_xact_lock_try(lock_id integer)
  RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT pg_try_advisory_xact_lock(lock_id);
$$;
