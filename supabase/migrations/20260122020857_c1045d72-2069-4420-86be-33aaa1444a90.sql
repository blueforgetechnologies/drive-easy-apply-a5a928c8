-- Add heading (bearing) to vehicles for live map rotation
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;