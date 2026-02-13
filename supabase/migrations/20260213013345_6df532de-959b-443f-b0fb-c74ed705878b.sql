-- Add verification results column to invoice_batch_schedules
ALTER TABLE public.invoice_batch_schedules 
ADD COLUMN verification_results jsonb DEFAULT NULL;

-- verification_results structure:
-- {
--   "invoices": { "invoice_number": { "schedule_net_pay": 1234.56, "expected_payout": 1234.56, "matched": true } },
--   "total_schedule_net": 12345.67,
--   "total_expected_net": 12345.67,
--   "all_matched": true,
--   "verified_at": "2026-02-13T..."
-- }
