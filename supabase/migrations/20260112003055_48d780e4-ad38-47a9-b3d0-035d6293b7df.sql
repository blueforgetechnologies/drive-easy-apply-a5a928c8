-- =============================================================================
-- CROSS-TENANT DEDUP: Global load_content table + load_emails FK
-- =============================================================================

-- 1) Create global load_content table (stores canonical parsed payload ONCE)
CREATE TABLE public.load_content (
  fingerprint TEXT PRIMARY KEY,
  canonical_payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_count INT NOT NULL DEFAULT 1,
  provider TEXT NULL,
  fingerprint_version INT NOT NULL,
  size_bytes INT NULL
);

-- Enable RLS but add NO policies (deny all for anon/authenticated)
-- Service role bypasses RLS automatically
ALTER TABLE public.load_content ENABLE ROW LEVEL SECURITY;

-- Index for cleanup jobs (archive stale content)
CREATE INDEX idx_load_content_last_seen ON public.load_content(last_seen_at);

-- 2) Add reference column to load_emails (nullable for graceful degradation)
ALTER TABLE public.load_emails 
ADD COLUMN load_content_fingerprint TEXT NULL;

-- Add FK constraint (nullable, not deferrable for simplicity)
ALTER TABLE public.load_emails
ADD CONSTRAINT fk_load_emails_load_content
FOREIGN KEY (load_content_fingerprint) 
REFERENCES public.load_content(fingerprint)
ON DELETE SET NULL;