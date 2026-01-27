-- Pub/Sub-level deduplication table
-- Used to detect and skip duplicate Pub/Sub deliveries BEFORE any Gmail API calls

CREATE TABLE public.pubsub_dedup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL,
  history_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint for dedup check
  CONSTRAINT pubsub_dedup_unique UNIQUE (email_address, history_id)
);

-- Index for cleanup queries (delete old entries)
CREATE INDEX idx_pubsub_dedup_created_at ON public.pubsub_dedup (created_at);

-- Comment for documentation
COMMENT ON TABLE public.pubsub_dedup IS 'Tracks processed Pub/Sub notifications to skip duplicates before Gmail API calls. Entries older than 24h can be cleaned up.';

-- No RLS needed - this table is only accessed by edge functions with service role