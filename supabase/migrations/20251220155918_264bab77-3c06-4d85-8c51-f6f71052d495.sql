-- Add factoring company fields to company_profile table
ALTER TABLE public.company_profile 
ADD COLUMN factoring_company_name text,
ADD COLUMN factoring_company_address text,
ADD COLUMN factoring_company_city text,
ADD COLUMN factoring_company_state text,
ADD COLUMN factoring_company_zip text,
ADD COLUMN factoring_contact_name text,
ADD COLUMN factoring_contact_email text,
ADD COLUMN factoring_contact_phone text;