-- Add bid tracking columns to load_hunt_matches
ALTER TABLE public.load_hunt_matches 
ADD COLUMN IF NOT EXISTS bid_rate numeric,
ADD COLUMN IF NOT EXISTS bid_by uuid,
ADD COLUMN IF NOT EXISTS bid_at timestamp with time zone;