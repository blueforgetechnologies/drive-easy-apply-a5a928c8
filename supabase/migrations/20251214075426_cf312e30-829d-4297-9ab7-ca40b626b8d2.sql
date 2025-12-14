-- Add email_source column to load_emails table
ALTER TABLE public.load_emails 
ADD COLUMN email_source text NOT NULL DEFAULT 'sylectus';

-- Create index for efficient source filtering
CREATE INDEX idx_load_emails_source ON public.load_emails(email_source);

-- Create composite index for analytics queries (source + received_at)
CREATE INDEX idx_load_emails_source_received ON public.load_emails(email_source, received_at);

-- Add comment for documentation
COMMENT ON COLUMN public.load_emails.email_source IS 'Source TMS system: sylectus, fullcircle, etc.';