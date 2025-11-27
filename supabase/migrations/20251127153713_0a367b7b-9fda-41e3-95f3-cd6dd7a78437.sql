-- Add emergency contacts and additional driver management fields to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS emergency_contacts jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS driver_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS driver_salary text,
ADD COLUMN IF NOT EXISTS driver_address text,
ADD COLUMN IF NOT EXISTS home_phone text,
ADD COLUMN IF NOT EXISTS cell_phone text,
ADD COLUMN IF NOT EXISTS driver_record_expiry date,
ADD COLUMN IF NOT EXISTS medical_card_expiry date,
ADD COLUMN IF NOT EXISTS restrictions text,
ADD COLUMN IF NOT EXISTS national_registry text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS account_name text,
ADD COLUMN IF NOT EXISTS routing_number text,
ADD COLUMN IF NOT EXISTS checking_number text,
ADD COLUMN IF NOT EXISTS account_type text,
ADD COLUMN IF NOT EXISTS pay_method text DEFAULT 'salary',
ADD COLUMN IF NOT EXISTS pay_per_mile decimal(10,2),
ADD COLUMN IF NOT EXISTS weekly_salary decimal(10,2),
ADD COLUMN IF NOT EXISTS work_permit_expiry date,
ADD COLUMN IF NOT EXISTS green_card_expiry date,
ADD COLUMN IF NOT EXISTS application_date date,
ADD COLUMN IF NOT EXISTS hired_date date,
ADD COLUMN IF NOT EXISTS termination_date date,
ADD COLUMN IF NOT EXISTS vehicle_note text,
ADD COLUMN IF NOT EXISTS score_card text,
ADD COLUMN IF NOT EXISTS driver_password text;

-- Add comment to describe emergency_contacts structure
COMMENT ON COLUMN applications.emergency_contacts IS 'Array of emergency contact objects with fields: firstName, lastName, phone, address, relationship';