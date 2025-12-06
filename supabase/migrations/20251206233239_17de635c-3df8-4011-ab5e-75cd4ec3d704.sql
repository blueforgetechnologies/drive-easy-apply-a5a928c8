-- Add vehicle_size column for size in feet (independent from dimensions_length in inches)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_size integer;