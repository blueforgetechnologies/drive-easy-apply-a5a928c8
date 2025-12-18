-- Add booked_load_id column to load_hunt_matches to track when a bid has been booked
-- This allows keeping the bid visible while also showing it in the booked tab
ALTER TABLE public.load_hunt_matches 
ADD COLUMN booked_load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_load_hunt_matches_booked_load_id ON public.load_hunt_matches(booked_load_id);

-- Add comment for documentation
COMMENT ON COLUMN public.load_hunt_matches.booked_load_id IS 'Links to the load created when this bid was booked';