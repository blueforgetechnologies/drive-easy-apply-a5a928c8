-- Add factoring approval column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS factoring_approval text DEFAULT 'pending';