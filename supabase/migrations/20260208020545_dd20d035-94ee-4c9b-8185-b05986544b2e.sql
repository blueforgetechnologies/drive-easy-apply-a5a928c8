
-- 1) Add leader-election columns to broker_credit_checks
ALTER TABLE public.broker_credit_checks
  ADD COLUMN IF NOT EXISTS broker_key text,
  ADD COLUMN IF NOT EXISTS decision_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'complete';

-- 2) Backfill existing rows so NOT NULL can be enforced later
-- For now, leave broker_key/decision_window_start nullable on existing rows

-- 3) Create unique index for leader election (only on rows that have the new columns populated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_credit_checks_leader
  ON public.broker_credit_checks (tenant_id, broker_key, decision_window_start)
  WHERE broker_key IS NOT NULL AND decision_window_start IS NOT NULL;

-- 4) Drop the advisory lock RPC that is no longer used
DROP FUNCTION IF EXISTS public.pg_advisory_xact_lock_try(integer);
