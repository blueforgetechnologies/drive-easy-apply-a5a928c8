-- Add dedup_eligible_reason column (separate from fingerprint_missing_reason)
ALTER TABLE load_emails 
ADD COLUMN IF NOT EXISTS dedup_eligible_reason text;

COMMENT ON COLUMN load_emails.dedup_eligible_reason IS 
'Reason for dedup eligibility status. Values: missing_origin_location, missing_destination_location, missing_broker_identity, missing_pickup_date';

COMMENT ON COLUMN load_emails.fingerprint_missing_reason IS 
'Reason fingerprint could not be computed or stored. Values: missing_parsed_data, exception_during_compute, load_content_upsert_failed. NOT for eligibility reasons.';