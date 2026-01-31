CREATE OR REPLACE FUNCTION public.complete_gmail_stub(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.gmail_stubs
  SET 
    status = 'completed',
    processed_at = now(),
    error = NULL
  WHERE id = p_id;
END;
$$;