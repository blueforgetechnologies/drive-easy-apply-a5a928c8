-- ============================================================================
-- UNIFIED RPC: upsert_load_content
-- Handles: insert-if-missing, else increment receipt_count, always update last_seen_at
-- Called from: process-email-queue, fetch-gmail-loads, backfill-fingerprints
-- ============================================================================

-- Drop old increment RPC if exists
DROP FUNCTION IF EXISTS increment_load_content_receipt_count(text);

-- Create the unified upsert RPC
CREATE OR REPLACE FUNCTION upsert_load_content(
  p_fingerprint text,
  p_canonical_payload jsonb,
  p_fingerprint_version integer DEFAULT 1,
  p_size_bytes integer DEFAULT NULL,
  p_provider text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_result jsonb;
BEGIN
  -- Try to find existing row
  SELECT fingerprint, receipt_count, first_seen_at
  INTO v_existing
  FROM load_content
  WHERE fingerprint = p_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    -- Row exists: increment receipt_count, update last_seen_at
    -- Optionally update canonical_payload if it was NULL
    UPDATE load_content
    SET 
      receipt_count = receipt_count + 1,
      last_seen_at = now(),
      canonical_payload = COALESCE(canonical_payload, p_canonical_payload),
      size_bytes = COALESCE(load_content.size_bytes, p_size_bytes)
    WHERE fingerprint = p_fingerprint;
    
    v_result := jsonb_build_object(
      'action', 'updated',
      'fingerprint', p_fingerprint,
      'new_receipt_count', v_existing.receipt_count + 1
    );
  ELSE
    -- Row doesn't exist: insert new
    INSERT INTO load_content (
      fingerprint,
      canonical_payload,
      first_seen_at,
      last_seen_at,
      receipt_count,
      provider,
      fingerprint_version,
      size_bytes
    ) VALUES (
      p_fingerprint,
      p_canonical_payload,
      now(),
      now(),
      1,
      p_provider,
      p_fingerprint_version,
      p_size_bytes
    );
    
    v_result := jsonb_build_object(
      'action', 'inserted',
      'fingerprint', p_fingerprint,
      'new_receipt_count', 1
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- DB GUARDRAIL: Trigger to enforce dedup_eligible=false when fingerprint missing
-- If dedup_eligible=true but parsed_load_fingerprint is null, auto-correct
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_dedup_fingerprint_guardrail()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guardrail: If dedup_eligible=true but fingerprint is null, force to false
  IF NEW.dedup_eligible = true AND NEW.parsed_load_fingerprint IS NULL THEN
    NEW.dedup_eligible := false;
    NEW.dedup_eligible_reason := COALESCE(NEW.dedup_eligible_reason, 'fingerprint_missing');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS tr_enforce_dedup_fingerprint ON load_emails;

CREATE TRIGGER tr_enforce_dedup_fingerprint
  BEFORE INSERT OR UPDATE ON load_emails
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dedup_fingerprint_guardrail();

-- Grant execute on RPC
GRANT EXECUTE ON FUNCTION upsert_load_content(text, jsonb, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_load_content(text, jsonb, integer, integer, text) TO service_role;