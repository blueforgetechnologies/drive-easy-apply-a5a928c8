-- Add unique constraint on (tenant_id, load_email_id, match_id) to support ON CONFLICT upserts
CREATE UNIQUE INDEX IF NOT EXISTS broker_credit_checks_unique_tenant_load_match
ON public.broker_credit_checks (tenant_id, load_email_id, match_id);