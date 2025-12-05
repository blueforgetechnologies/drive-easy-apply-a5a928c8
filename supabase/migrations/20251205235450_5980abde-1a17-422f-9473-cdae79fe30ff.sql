-- Add MC and DOT number columns to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS mc_number text,
ADD COLUMN IF NOT EXISTS dot_number text;