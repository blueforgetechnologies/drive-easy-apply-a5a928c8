-- Add unique constraint for fan-out upsert on broker_credit_checks
-- This allows upserting per (tenant_id, load_email_id, match_id)
CREATE UNIQUE INDEX IF NOT EXISTS broker_credit_checks_tenant_load_match_unique 
ON public.broker_credit_checks (tenant_id, load_email_id, match_id) 
WHERE match_id IS NOT NULL;