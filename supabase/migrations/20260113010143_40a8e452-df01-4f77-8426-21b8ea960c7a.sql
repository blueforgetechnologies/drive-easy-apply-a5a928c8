-- Add ingestion_source column for attribution tracking
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS ingestion_source TEXT;

-- Add geocoding tracking columns
ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS geocoding_status TEXT DEFAULT 'pending';

ALTER TABLE public.load_emails 
ADD COLUMN IF NOT EXISTS geocoding_error_code TEXT;

-- Add index for pending geocoding retries
CREATE INDEX IF NOT EXISTS idx_load_emails_geocoding_pending 
ON public.load_emails (geocoding_status) 
WHERE geocoding_status = 'pending';

-- Add comment for documentation
COMMENT ON COLUMN public.load_emails.ingestion_source IS 'Tracks which edge function created this row: fetch-gmail-loads or process-email-queue';
COMMENT ON COLUMN public.load_emails.geocoding_status IS 'Status of geocoding: pending, success, failed, or skipped';
COMMENT ON COLUMN public.load_emails.geocoding_error_code IS 'Error code if geocoding failed (e.g., rate_limit, no_features, api_error)';