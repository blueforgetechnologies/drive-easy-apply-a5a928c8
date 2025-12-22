-- Add payment-related columns to vehicles table for ownership types
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS monthly_payment numeric,
ADD COLUMN IF NOT EXISTS weekly_payment numeric,
ADD COLUMN IF NOT EXISTS cents_per_mile numeric;