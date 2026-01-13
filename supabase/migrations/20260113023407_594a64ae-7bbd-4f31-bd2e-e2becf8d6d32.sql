-- Add fingerprint_missing_reason column to load_emails for tracking why fingerprints are missing
ALTER TABLE load_emails 
ADD COLUMN IF NOT EXISTS fingerprint_missing_reason text;

-- Add index for finding rows with missing fingerprints
CREATE INDEX IF NOT EXISTS idx_load_emails_missing_fingerprint
ON load_emails (tenant_id, email_source, ingestion_source)
WHERE (dedup_eligible = true AND load_content_fingerprint IS NULL)
   OR parsed_load_fingerprint IS NULL;

-- Add comment documenting reason codes
COMMENT ON COLUMN load_emails.fingerprint_missing_reason IS 
'Reason fingerprint is missing. Values: missing_required_fields, exception_during_compute, load_content_upsert_failed, provider_missing, skipped_by_guard';