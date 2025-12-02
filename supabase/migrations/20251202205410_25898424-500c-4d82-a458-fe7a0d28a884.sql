-- Add unique constraint on email_id for proper upsert handling
CREATE UNIQUE INDEX IF NOT EXISTS load_emails_email_id_unique ON public.load_emails (email_id);

-- Add index for faster received_at queries
CREATE INDEX IF NOT EXISTS load_emails_received_at_idx ON public.load_emails (received_at DESC);

-- Add index for faster status filtering
CREATE INDEX IF NOT EXISTS load_emails_status_idx ON public.load_emails (status);