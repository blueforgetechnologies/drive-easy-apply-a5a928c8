-- Add accounting department fields to company_profile
ALTER TABLE public.company_profile
ADD COLUMN IF NOT EXISTS accounting_email TEXT NULL,
ADD COLUMN IF NOT EXISTS accounting_phone TEXT NULL,
ADD COLUMN IF NOT EXISTS accounting_contact_name TEXT NULL;