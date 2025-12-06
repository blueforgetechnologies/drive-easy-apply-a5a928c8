-- Add match_status column to load_hunt_matches for tracking: active, skipped, bid
ALTER TABLE public.load_hunt_matches 
ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'active';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_load_hunt_matches_status ON public.load_hunt_matches(match_status);

-- Migrate existing data: active matches stay 'active', inactive become 'skipped'
UPDATE public.load_hunt_matches 
SET match_status = CASE 
  WHEN is_active = true THEN 'active'
  ELSE 'skipped'
END
WHERE match_status = 'active' AND is_active = false;