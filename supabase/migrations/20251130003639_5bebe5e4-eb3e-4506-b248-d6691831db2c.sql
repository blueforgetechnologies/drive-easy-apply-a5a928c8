-- Add a timestamp field to track when a load should appear in the missed section
-- This allows loads to stay in unreviewed while also appearing in missed for tracking
ALTER TABLE load_emails 
ADD COLUMN marked_missed_at timestamp with time zone DEFAULT NULL;

-- Add an index for efficient querying
CREATE INDEX idx_load_emails_marked_missed_at ON load_emails(marked_missed_at) WHERE marked_missed_at IS NOT NULL;

-- Add a comment explaining the field
COMMENT ON COLUMN load_emails.marked_missed_at IS 'Timestamp when load was marked for missed tracking. Load remains in unreviewed but also appears in missed section.';