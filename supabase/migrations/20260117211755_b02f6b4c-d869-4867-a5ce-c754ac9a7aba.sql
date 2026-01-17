-- Add posted_at column to load_emails table
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS posted_at timestamp with time zone;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_load_emails_posted_at ON public.load_emails(posted_at);

-- Add comment for documentation
COMMENT ON COLUMN public.load_emails.posted_at IS 'Timestamp when the load was originally posted (parsed from email body)';
