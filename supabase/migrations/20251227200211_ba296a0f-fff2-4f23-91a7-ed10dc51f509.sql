-- Add contractor_percentage column to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS contractor_percentage numeric;