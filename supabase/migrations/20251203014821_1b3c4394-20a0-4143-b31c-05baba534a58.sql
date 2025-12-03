-- Add floor_load_id and initial_match_done columns to hunt_plans
-- floor_load_id: the load_id cursor from which matching begins (never go backward)
-- initial_match_done: flag to track if initial 15-min backfill was completed

ALTER TABLE public.hunt_plans 
ADD COLUMN IF NOT EXISTS floor_load_id text,
ADD COLUMN IF NOT EXISTS initial_match_done boolean DEFAULT false;