
-- Create helper RPC to get multi-match fingerprints (proves re-triggering works)
CREATE OR REPLACE FUNCTION public.get_multi_match_fingerprints()
RETURNS TABLE (
  hunt_plan_id uuid,
  load_content_fingerprint text,
  match_count bigint,
  first_received timestamptz,
  last_received timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lhm.hunt_plan_id,
    le.load_content_fingerprint,
    COUNT(*) AS match_count,
    MIN(le.received_at) AS first_received,
    MAX(le.received_at) AS last_received
  FROM load_hunt_matches lhm
  JOIN load_emails le ON le.id = lhm.load_email_id
  WHERE le.load_content_fingerprint IS NOT NULL
  GROUP BY lhm.hunt_plan_id, le.load_content_fingerprint
  HAVING COUNT(*) > 1
  ORDER BY MAX(le.received_at) DESC
  LIMIT 50;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_multi_match_fingerprints() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_multi_match_fingerprints() TO service_role;
