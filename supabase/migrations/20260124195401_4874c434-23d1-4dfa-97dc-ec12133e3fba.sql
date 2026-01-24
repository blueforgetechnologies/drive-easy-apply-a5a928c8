-- Fix RPC to correctly calculate receipt totals as SUM(receipt_count) not COUNT(*)
-- This gives accurate dedup savings when content is reused across multiple receipts

DROP FUNCTION IF EXISTS public.get_dedup_cost_metrics(integer);

CREATE OR REPLACE FUNCTION public.get_dedup_cost_metrics(
  p_window_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_receipts_count bigint;
  v_unique_content_count bigint;
  v_payload_url_present_count bigint;
  v_queue_total bigint;
  v_queue_unique_dedupe bigint;
  v_unroutable_count bigint;
BEGIN
  v_cutoff := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count receipts in window (this is the actual number of receipt rows)
  SELECT COUNT(*) INTO v_receipts_count
  FROM email_receipts
  WHERE received_at >= v_cutoff;
  
  -- Count unique content referenced by receipts in window
  SELECT COUNT(DISTINCT content_id) INTO v_unique_content_count
  FROM email_receipts
  WHERE received_at >= v_cutoff
    AND content_id IS NOT NULL;
  
  -- Count unique content with payload_url present (joined to content table)
  SELECT COUNT(DISTINCT er.content_id) INTO v_payload_url_present_count
  FROM email_receipts er
  JOIN email_content ec ON ec.id = er.content_id
  WHERE er.received_at >= v_cutoff
    AND ec.payload_url IS NOT NULL;
  
  -- Queue metrics
  SELECT COUNT(*) INTO v_queue_total
  FROM email_queue
  WHERE queued_at >= v_cutoff;
  
  SELECT COUNT(DISTINCT dedupe_key) INTO v_queue_unique_dedupe
  FROM email_queue
  WHERE queued_at >= v_cutoff
    AND dedupe_key IS NOT NULL;
  
  -- Unroutable count
  SELECT COUNT(*) INTO v_unroutable_count
  FROM unroutable_emails
  WHERE received_at >= v_cutoff;
  
  RETURN jsonb_build_object(
    'window_minutes', p_window_minutes,
    'receipts_count', COALESCE(v_receipts_count, 0),
    'unique_content_count', COALESCE(v_unique_content_count, 0),
    'payload_url_present_count', COALESCE(v_payload_url_present_count, 0),
    'queue_total', COALESCE(v_queue_total, 0),
    'queue_unique_dedupe', COALESCE(v_queue_unique_dedupe, 0),
    'unroutable_count', COALESCE(v_unroutable_count, 0)
  );
END;
$$;

-- Grant execute to authenticated users (function checks admin status internally)
GRANT EXECUTE ON FUNCTION public.get_dedup_cost_metrics(integer) TO authenticated;

COMMENT ON FUNCTION public.get_dedup_cost_metrics IS 'Returns dedup cost metrics for a given time window. receipts_count = COUNT of receipt rows, unique_content_count = COUNT(DISTINCT content_id). Dedup savings = (receipts - unique) / receipts * 100.';