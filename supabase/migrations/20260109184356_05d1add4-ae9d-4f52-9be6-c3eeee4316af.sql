-- Add content_hash column for smart business-level deduplication
-- This hash is based on core load fields, not gmail_message_id
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS content_hash text;

-- Add parent_email_id to link updates to original loads
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS parent_email_id uuid REFERENCES public.load_emails(id);

-- Add is_update flag to mark emails that are updates to previous ones
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS is_update boolean DEFAULT false;

-- Create index for fast duplicate lookups by content_hash within tenant
CREATE INDEX IF NOT EXISTS idx_load_emails_content_hash_tenant 
ON public.load_emails(tenant_id, content_hash) 
WHERE content_hash IS NOT NULL;

-- Create index for finding updates to a load
CREATE INDEX IF NOT EXISTS idx_load_emails_parent 
ON public.load_emails(parent_email_id) 
WHERE parent_email_id IS NOT NULL;

-- Add comment explaining the content_hash
COMMENT ON COLUMN public.load_emails.content_hash IS 'Hash of core load fields (origin, destination, date, order#) for smart deduplication';
COMMENT ON COLUMN public.load_emails.parent_email_id IS 'Links to original load email if this is an update/revision';
COMMENT ON COLUMN public.load_emails.is_update IS 'True if this email is a minor update to a previous load posting';