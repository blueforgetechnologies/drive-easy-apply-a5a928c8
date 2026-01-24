-- SECURITY FIX: Add public_token to driver_invites for secure invite authentication
-- The public_token is a cryptographically random string used in invitation URLs
-- instead of exposing the raw UUID id

-- Add public_token column (nullable initially for backfill)
ALTER TABLE public.driver_invites 
ADD COLUMN IF NOT EXISTS public_token text UNIQUE;

-- Backfill existing invites with new tokens (using gen_random_uuid for randomness)
UPDATE public.driver_invites 
SET public_token = encode(gen_random_bytes(32), 'hex')
WHERE public_token IS NULL;

-- Now make it NOT NULL with default for new records
ALTER TABLE public.driver_invites 
ALTER COLUMN public_token SET NOT NULL,
ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_driver_invites_public_token ON public.driver_invites(public_token);

-- COMMENT explaining the security purpose
COMMENT ON COLUMN public.driver_invites.public_token IS 'Cryptographically random token used in public invitation URLs. Never expose the id directly.';