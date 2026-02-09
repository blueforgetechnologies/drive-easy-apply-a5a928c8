-- Add columns to store OTR's exact response data
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS otr_error_message text,
  ADD COLUMN IF NOT EXISTS otr_raw_response jsonb,
  ADD COLUMN IF NOT EXISTS otr_failed_at timestamp with time zone;