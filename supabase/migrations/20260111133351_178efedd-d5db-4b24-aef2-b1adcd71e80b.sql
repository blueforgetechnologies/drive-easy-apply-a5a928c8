-- Add dedup_eligible flag and canonical payload storage for debugging
ALTER TABLE public.load_emails
ADD COLUMN IF NOT EXISTS dedup_eligible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS dedup_canonical_payload jsonb DEFAULT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.load_emails.dedup_eligible IS 'False if critical fields missing (origin city+state, broker, pickup_date) - skip dedup for safety';
COMMENT ON COLUMN public.load_emails.dedup_canonical_payload IS 'Canonical payload used for fingerprint computation - stored for debugging duplicates';

-- Create index for querying dedup-eligible loads
CREATE INDEX IF NOT EXISTS idx_load_emails_dedup_eligible ON public.load_emails (tenant_id, dedup_eligible) WHERE dedup_eligible = false;