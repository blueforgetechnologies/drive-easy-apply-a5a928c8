-- D) Prevent session pile-up: Add partial unique index for session_code per tenant for active/pending
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_session_code_per_tenant_active 
ON public.screen_share_sessions (tenant_id, session_code) 
WHERE status IN ('pending', 'active');