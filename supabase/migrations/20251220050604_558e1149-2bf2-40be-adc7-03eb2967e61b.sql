-- Add billing party address fields to loads table
ALTER TABLE public.loads 
ADD COLUMN IF NOT EXISTS broker_address TEXT,
ADD COLUMN IF NOT EXISTS broker_city TEXT,
ADD COLUMN IF NOT EXISTS broker_state TEXT,
ADD COLUMN IF NOT EXISTS broker_zip TEXT;