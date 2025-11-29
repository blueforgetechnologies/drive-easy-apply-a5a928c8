-- Fix search_path on gmail tokens trigger function
DROP FUNCTION IF EXISTS update_gmail_tokens_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_gmail_tokens_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS gmail_tokens_updated_at ON public.gmail_tokens;
CREATE TRIGGER gmail_tokens_updated_at
  BEFORE UPDATE ON public.gmail_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_gmail_tokens_updated_at();