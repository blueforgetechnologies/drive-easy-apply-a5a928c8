-- Add parsed_load_fingerprint column to load_emails
ALTER TABLE load_emails 
ADD COLUMN IF NOT EXISTS parsed_load_fingerprint text;

-- Add composite index for fast tenant + fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_load_emails_tenant_fingerprint 
ON load_emails (tenant_id, parsed_load_fingerprint) 
WHERE parsed_load_fingerprint IS NOT NULL;

-- Add index for fingerprint-only lookups (for future global dedup)
CREATE INDEX IF NOT EXISTS idx_load_emails_fingerprint 
ON load_emails (parsed_load_fingerprint) 
WHERE parsed_load_fingerprint IS NOT NULL;

-- Add is_duplicate flag and reference to original
ALTER TABLE load_emails 
ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES load_emails(id);

-- Add index for duplicate tracking
CREATE INDEX IF NOT EXISTS idx_load_emails_duplicates 
ON load_emails (duplicate_of_id) 
WHERE duplicate_of_id IS NOT NULL;

-- Track duplicate stats in a view
CREATE OR REPLACE VIEW load_dedup_metrics AS
SELECT 
  -- Total loads
  (SELECT COUNT(*) FROM load_emails WHERE tenant_id IS NOT NULL) AS total_loads,
  (SELECT COUNT(*) FROM load_emails WHERE tenant_id IS NOT NULL AND received_at > NOW() - INTERVAL '24 hours') AS loads_24h,
  
  -- Duplicates
  (SELECT COUNT(*) FROM load_emails WHERE is_duplicate = true) AS total_duplicates,
  (SELECT COUNT(*) FROM load_emails WHERE is_duplicate = true AND received_at > NOW() - INTERVAL '24 hours') AS duplicates_24h,
  
  -- Unique fingerprints
  (SELECT COUNT(DISTINCT parsed_load_fingerprint) FROM load_emails WHERE parsed_load_fingerprint IS NOT NULL) AS unique_fingerprints,
  
  -- Dedup rate
  CASE 
    WHEN (SELECT COUNT(*) FROM load_emails WHERE tenant_id IS NOT NULL) > 0
    THEN ROUND(100.0 * (SELECT COUNT(*) FROM load_emails WHERE is_duplicate = true)::numeric / 
         (SELECT COUNT(*) FROM load_emails WHERE tenant_id IS NOT NULL), 2)
    ELSE 0
  END AS dedup_rate_pct,
  
  -- By tenant breakdown
  (SELECT jsonb_object_agg(
    t.slug,
    jsonb_build_object(
      'total', COALESCE(counts.total, 0),
      'duplicates', COALESCE(counts.dupes, 0),
      'unique_fingerprints', COALESCE(counts.unique_fp, 0)
    )
  ) FROM tenants t
  LEFT JOIN (
    SELECT 
      tenant_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_duplicate = true) as dupes,
      COUNT(DISTINCT parsed_load_fingerprint) as unique_fp
    FROM load_emails
    WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id
  ) counts ON counts.tenant_id = t.id
  ) AS tenant_breakdown;