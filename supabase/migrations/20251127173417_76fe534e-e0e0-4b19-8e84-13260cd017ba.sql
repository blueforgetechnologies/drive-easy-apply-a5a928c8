-- Add comprehensive dispatcher fields
ALTER TABLE public.dispatchers
ADD COLUMN IF NOT EXISTS pay_percentage numeric,
ADD COLUMN IF NOT EXISTS assigned_trucks integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS dob date,
ADD COLUMN IF NOT EXISTS license_number text,
ADD COLUMN IF NOT EXISTS license_issued_date date,
ADD COLUMN IF NOT EXISTS license_expiration_date date,
ADD COLUMN IF NOT EXISTS application_status text,
ADD COLUMN IF NOT EXISTS contract_agreement text,
ADD COLUMN IF NOT EXISTS emergency_contact_1_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_1_phone text,
ADD COLUMN IF NOT EXISTS emergency_contact_1_relationship text,
ADD COLUMN IF NOT EXISTS emergency_contact_2_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_2_phone text,
ADD COLUMN IF NOT EXISTS emergency_contact_2_relationship text,
ADD COLUMN IF NOT EXISTS role text;