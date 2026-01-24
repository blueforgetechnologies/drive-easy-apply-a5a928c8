
-- Fix RLS for unroutable_email_stats_daily (service_role only - internal diagnostics table)
ALTER TABLE public.unroutable_email_stats_daily ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by cleanup cron and inspector)
CREATE POLICY "Service role full access" 
ON public.unroutable_email_stats_daily
FOR ALL
USING (true)
WITH CHECK (true);
