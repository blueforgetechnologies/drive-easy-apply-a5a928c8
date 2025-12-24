-- Add timezone column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.timezone IS 'User timezone preference (IANA timezone format)';