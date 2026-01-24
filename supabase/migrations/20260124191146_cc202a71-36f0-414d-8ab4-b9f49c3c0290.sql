-- Add missing header columns to unroutable_emails for full debugging visibility
ALTER TABLE public.unroutable_emails 
  ADD COLUMN IF NOT EXISTS x_gm_original_to_header text,
  ADD COLUMN IF NOT EXISTS x_forwarded_to_header text,
  ADD COLUMN IF NOT EXISTS cc_header text;

-- Add index for recent unroutable queries
CREATE INDEX IF NOT EXISTS idx_unroutable_emails_received_status 
  ON public.unroutable_emails(received_at DESC, status);