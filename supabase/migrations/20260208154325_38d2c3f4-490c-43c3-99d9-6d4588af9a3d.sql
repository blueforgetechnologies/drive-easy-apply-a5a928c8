
-- Add watch_expiry column to gmail_tokens
ALTER TABLE public.gmail_tokens 
ADD COLUMN IF NOT EXISTS watch_expiry TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.gmail_tokens.watch_expiry IS 'Expiration timestamp of the Gmail Pub/Sub watch subscription, updated after each successful watch() call';
