-- Add missing fingerprint columns to load_emails for stub processor
ALTER TABLE public.load_emails
ADD COLUMN IF NOT EXISTS fingerprint_version INTEGER,
ADD COLUMN IF NOT EXISTS parsed_load_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Add index for fingerprint lookups (used in dedup)
CREATE INDEX IF NOT EXISTS idx_load_emails_parsed_load_fingerprint 
ON public.load_emails(parsed_load_fingerprint) 
WHERE parsed_load_fingerprint IS NOT NULL;

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';