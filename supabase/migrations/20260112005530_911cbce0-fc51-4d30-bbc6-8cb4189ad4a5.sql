-- Create RPC to increment receipt_count atomically
CREATE OR REPLACE FUNCTION public.increment_load_content_receipt_count(p_fingerprint TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.load_content
  SET 
    receipt_count = receipt_count + 1,
    last_seen_at = now()
  WHERE fingerprint = p_fingerprint;
END;
$$;