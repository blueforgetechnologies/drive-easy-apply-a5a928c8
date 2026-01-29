-- Add parsed_at column to track successful parsing completion
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMP WITH TIME ZONE NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.email_queue.parsed_at IS 
  'Set only after payload fetch + parsing + load_emails upsert all succeed. NULL means unparsed/needs retry.';

-- Partial index for efficient inbound claiming
CREATE INDEX IF NOT EXISTS idx_email_queue_inbound_claim 
ON public.email_queue (queued_at ASC)
WHERE status = 'pending' 
  AND payload_url IS NOT NULL 
  AND to_email IS NULL 
  AND parsed_at IS NULL 
  AND processing_started_at IS NULL;