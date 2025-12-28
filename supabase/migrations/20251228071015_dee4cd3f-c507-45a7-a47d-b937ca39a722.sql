-- Add clearance_inches column to vehicles table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS clearance_inches integer;