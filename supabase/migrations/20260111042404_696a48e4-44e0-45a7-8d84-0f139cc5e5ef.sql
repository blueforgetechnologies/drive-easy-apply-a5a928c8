-- Add size_bytes column to email_content for storage tracking
ALTER TABLE email_content 
ADD COLUMN IF NOT EXISTS size_bytes integer;

-- Drop and recreate the view with updated columns
DROP VIEW IF EXISTS content_dedup_metrics;

CREATE VIEW content_dedup_metrics AS
SELECT 
  -- Content stats
  (SELECT COUNT(*) FROM email_content) AS unique_content_count,
  (SELECT COUNT(*) FROM email_content WHERE first_seen_at > NOW() - INTERVAL '24 hours') AS unique_content_24h,
  (SELECT COUNT(*) FROM email_content WHERE first_seen_at > NOW() - INTERVAL '7 days') AS unique_content_7d,
  
  -- Receipt stats
  (SELECT COUNT(*) FROM email_receipts) AS total_receipts,
  (SELECT COUNT(*) FROM email_receipts WHERE received_at > NOW() - INTERVAL '24 hours') AS receipts_24h,
  (SELECT COUNT(*) FROM email_receipts WHERE received_at > NOW() - INTERVAL '7 days') AS receipts_7d,
  
  -- Reuse metrics
  (SELECT SUM(receipt_count) FROM email_content) AS total_content_uses,
  (SELECT AVG(receipt_count)::numeric(10,2) FROM email_content WHERE receipt_count > 1) AS avg_reuse_count,
  (SELECT MAX(receipt_count) FROM email_content) AS max_reuse_count,
  
  -- Storage stats
  (SELECT COALESCE(SUM(size_bytes), 0) FROM email_content) AS total_stored_bytes,
  (SELECT COALESCE(AVG(size_bytes), 0)::integer FROM email_content WHERE size_bytes IS NOT NULL) AS avg_content_size_bytes,
  
  -- Estimated savings (receipts - unique content) * avg size
  (SELECT 
    CASE 
      WHEN (SELECT COUNT(*) FROM email_receipts) > 0 AND (SELECT COUNT(*) FROM email_content) > 0
      THEN ((SELECT COUNT(*) FROM email_receipts) - (SELECT COUNT(*) FROM email_content)) * 
           COALESCE((SELECT AVG(size_bytes) FROM email_content WHERE size_bytes IS NOT NULL), 50000)
      ELSE 0 
    END
  )::bigint AS estimated_bytes_saved,
  
  -- Provider breakdown
  (SELECT jsonb_object_agg(
    provider, 
    jsonb_build_object('count', cnt, 'total_uses', uses, 'size_bytes', bytes)
  ) FROM (
    SELECT 
      provider, 
      COUNT(*) as cnt, 
      SUM(receipt_count) as uses,
      COALESCE(SUM(size_bytes), 0) as bytes
    FROM email_content 
    GROUP BY provider
  ) p) AS provider_breakdown,
  
  -- Quarantine rate (for monitoring)
  (SELECT COUNT(*) FROM unroutable_emails WHERE received_at > NOW() - INTERVAL '24 hours') AS quarantine_24h,
  (SELECT COUNT(*) FROM unroutable_emails WHERE received_at > NOW() - INTERVAL '7 days') AS quarantine_7d,
  
  -- Feature flag status per tenant
  (SELECT jsonb_object_agg(
    t.slug,
    COALESCE(tff.enabled, ff.default_enabled)
  ) FROM tenants t
  LEFT JOIN feature_flags ff ON ff.key = 'content_dedup_enabled'
  LEFT JOIN tenant_feature_flags tff ON tff.tenant_id = t.id AND tff.feature_flag_id = ff.id
  WHERE ff.id IS NOT NULL
  ) AS tenant_feature_status;