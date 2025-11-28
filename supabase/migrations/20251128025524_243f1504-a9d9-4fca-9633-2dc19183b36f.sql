-- Add fault_codes column to vehicles table to store diagnostic trouble codes from Samsara
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS fault_codes jsonb DEFAULT '[]'::jsonb;