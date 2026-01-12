-- Drop and recreate load_content_metrics_24h with proper coverage vs reuse separation
DROP VIEW IF EXISTS public.load_content_metrics_24h;

CREATE VIEW public.load_content_metrics_24h AS
WITH base AS (
  SELECT
    id,
    received_at,
    dedup_eligible,
    load_content_fingerprint,
    parsed_load_fingerprint
  FROM load_emails
  WHERE received_at > now() - interval '24 hours'
),
metrics_24h AS (
  SELECT
    COUNT(*) AS receipts_24h,
    COUNT(*) FILTER (WHERE dedup_eligible = true) AS eligible_receipts_24h,
    COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS eligible_with_fk_24h,
    COUNT(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS unique_content_24h,
    COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NULL) AS missing_fk_24h
  FROM base
),
metrics_1h AS (
  SELECT
    COUNT(*) FILTER (WHERE dedup_eligible = true) AS eligible_1h,
    COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NULL) AS missing_fk_1h,
    COUNT(*) FILTER (WHERE dedup_eligible = true AND parsed_load_fingerprint IS NULL) AS missing_parsed_fp_1h
  FROM load_emails
  WHERE received_at > now() - interval '1 hour'
)
SELECT
  m24.receipts_24h,
  m24.eligible_receipts_24h,
  m24.eligible_with_fk_24h,
  m24.unique_content_24h,
  m24.missing_fk_24h,
  -- Coverage rate: what % of eligible rows have FK
  CASE 
    WHEN m24.eligible_receipts_24h = 0 THEN 0
    ELSE round(100.0 * m24.eligible_with_fk_24h / m24.eligible_receipts_24h, 2)
  END AS coverage_rate_24h,
  -- Reuse rate: computed ONLY on eligible_with_fk rows
  CASE 
    WHEN m24.eligible_with_fk_24h = 0 THEN 0
    ELSE round(100.0 * (1.0 - m24.unique_content_24h::numeric / m24.eligible_with_fk_24h), 2)
  END AS reuse_rate_24h,
  m1.eligible_1h,
  m1.missing_fk_1h,
  m1.missing_parsed_fp_1h
FROM metrics_24h m24, metrics_1h m1;

-- Drop and recreate load_content_provider_breakdown_24h with coverage column
DROP VIEW IF EXISTS public.load_content_provider_breakdown_24h;

CREATE VIEW public.load_content_provider_breakdown_24h AS
SELECT
  CASE 
    WHEN lower(COALESCE(email_source, '')) = 'sylectus' THEN 'sylectus'
    WHEN lower(COALESCE(email_source, '')) = 'fullcircle' THEN 'fullcircle'
    ELSE 'other'
  END AS provider,
  COUNT(*) AS receipts,
  COUNT(*) FILTER (WHERE dedup_eligible = true) AS eligible,
  COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS eligible_with_fk,
  COUNT(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) AS unique_content,
  -- Coverage rate: what % of eligible rows have FK
  CASE 
    WHEN COUNT(*) FILTER (WHERE dedup_eligible = true) = 0 THEN 0
    ELSE round(100.0 * COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) / COUNT(*) FILTER (WHERE dedup_eligible = true), 2)
  END AS coverage_rate,
  -- Reuse rate: computed ONLY on eligible_with_fk rows
  CASE 
    WHEN COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL) = 0 THEN 0
    ELSE round(100.0 * (1.0 - COUNT(DISTINCT load_content_fingerprint) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL)::numeric / COUNT(*) FILTER (WHERE dedup_eligible = true AND load_content_fingerprint IS NOT NULL)), 2)
  END AS reuse_rate
FROM load_emails
WHERE received_at > now() - interval '24 hours'
GROUP BY 
  CASE 
    WHEN lower(COALESCE(email_source, '')) = 'sylectus' THEN 'sylectus'
    WHEN lower(COALESCE(email_source, '')) = 'fullcircle' THEN 'fullcircle'
    ELSE 'other'
  END
ORDER BY provider;