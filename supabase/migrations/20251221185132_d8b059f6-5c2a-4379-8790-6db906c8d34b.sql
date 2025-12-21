-- Add factoring percentage column to company_profile
ALTER TABLE public.company_profile 
ADD COLUMN factoring_percentage numeric DEFAULT 2;