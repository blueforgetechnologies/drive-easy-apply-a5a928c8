-- Add source column to gmail_stubs for tracking reconciliation vs webhook stubs
ALTER TABLE gmail_stubs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'webhook';

-- Create index on source for monitoring queries
CREATE INDEX IF NOT EXISTS idx_gmail_stubs_source ON gmail_stubs(source);

-- Comment for documentation
COMMENT ON COLUMN gmail_stubs.source IS 'Source of the stub: webhook (Pub/Sub notification), reconciliation (hourly gap-fill job), or manual (admin backfill)';