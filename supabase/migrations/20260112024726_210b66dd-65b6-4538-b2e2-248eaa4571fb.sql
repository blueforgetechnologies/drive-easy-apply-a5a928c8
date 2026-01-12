-- Phase A: Load Content Dedup Metrics Views

-- 1. Main metrics view (24h + 1h guardrail)
CREATE OR REPLACE VIEW public.load_content_metrics_24h AS
SELECT 
  -- Core counts
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '24 hours') AS receipts_24h,
  
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '24 hours' 
     AND dedup_eligible = true) AS eligible_receipts_24h,
  
  -- Only count distinct fingerprints from dedup-eligible rows
  (SELECT COUNT(DISTINCT load_content_fingerprint) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '24 hours' 
     AND dedup_eligible = true 
     AND load_content_fingerprint IS NOT NULL) AS unique_content_24h,
  
  -- Reuse rate (based on eligible only)
  CASE 
    WHEN (SELECT COUNT(*) FROM load_emails 
          WHERE received_at > NOW() - INTERVAL '24 hours' 
            AND dedup_eligible = true) > 0
    THEN ROUND(100.0 * (1 - 
         (SELECT COUNT(DISTINCT load_content_fingerprint)::numeric 
          FROM load_emails 
          WHERE received_at > NOW() - INTERVAL '24 hours' 
            AND dedup_eligible = true 
            AND load_content_fingerprint IS NOT NULL) / 
         (SELECT COUNT(*) FROM load_emails 
          WHERE received_at > NOW() - INTERVAL '24 hours' 
            AND dedup_eligible = true)), 2)
    ELSE 0
  END AS reuse_rate_24h,
  
  -- Missing FK (regression indicator) - 24h
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '24 hours' 
     AND dedup_eligible = true 
     AND load_content_fingerprint IS NULL) AS missing_fk_24h,
  
  -- 1-hour guardrail metrics (for alert trigger)
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '1 hour' 
     AND dedup_eligible = true) AS eligible_1h,
  
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '1 hour' 
     AND dedup_eligible = true 
     AND load_content_fingerprint IS NULL) AS missing_fk_1h,
  
  (SELECT COUNT(*) 
   FROM load_emails 
   WHERE received_at > NOW() - INTERVAL '1 hour' 
     AND dedup_eligible = true 
     AND parsed_load_fingerprint IS NULL) AS missing_parsed_fp_1h;

-- 2. Provider breakdown view (sylectus, fullcircle, other)
CREATE OR REPLACE VIEW public.load_content_provider_breakdown_24h AS
WITH normalized AS (
  SELECT 
    CASE 
      WHEN LOWER(email_source) IN ('sylectus', 'fullcircle') THEN LOWER(email_source)
      ELSE 'other'
    END AS provider,
    dedup_eligible,
    load_content_fingerprint
  FROM load_emails
  WHERE received_at > NOW() - INTERVAL '24 hours'
)
SELECT 
  provider,
  COUNT(*) AS receipts,
  COUNT(*) FILTER (WHERE dedup_eligible = true) AS eligible,
  COUNT(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS unique_content,
  CASE 
    WHEN COUNT(*) FILTER (WHERE dedup_eligible = true) > 0
    THEN ROUND(100.0 * (1 - 
         COUNT(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL)::numeric / 
         COUNT(*) FILTER (WHERE dedup_eligible = true)), 2)
    ELSE 0
  END AS reuse_rate
FROM normalized
WHERE provider IN ('sylectus', 'fullcircle')
GROUP BY provider

UNION ALL

SELECT 
  'other' AS provider,
  COUNT(*) AS receipts,
  COUNT(*) FILTER (WHERE dedup_eligible = true) AS eligible,
  0 AS unique_content,
  0 AS reuse_rate
FROM normalized
WHERE provider = 'other'
HAVING COUNT(*) > 0;

-- 3. Top 10 most-reused content (7 days)
CREATE OR REPLACE VIEW public.load_content_top10_7d AS
SELECT 
  fingerprint,
  provider,
  receipt_count,
  first_seen_at,
  last_seen_at
FROM load_content
WHERE first_seen_at > NOW() - INTERVAL '7 days'
ORDER BY receipt_count DESC
LIMIT 10;