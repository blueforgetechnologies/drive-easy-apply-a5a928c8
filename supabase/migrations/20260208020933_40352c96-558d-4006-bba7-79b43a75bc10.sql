
-- Drop the old partial index that doesn't distinguish decision vs fan-out rows
DROP INDEX IF EXISTS idx_broker_credit_checks_leader;

-- Create the correct partial unique index: only applies to decision rows (match_id IS NULL)
CREATE UNIQUE INDEX idx_broker_credit_checks_decision
  ON public.broker_credit_checks (tenant_id, broker_key, decision_window_start)
  WHERE match_id IS NULL;
