-- Add shipper and receiver information to loads table
ALTER TABLE public.loads
ADD COLUMN IF NOT EXISTS shipper_name TEXT,
ADD COLUMN IF NOT EXISTS shipper_address TEXT,
ADD COLUMN IF NOT EXISTS shipper_city TEXT,
ADD COLUMN IF NOT EXISTS shipper_state TEXT,
ADD COLUMN IF NOT EXISTS shipper_zip TEXT,
ADD COLUMN IF NOT EXISTS shipper_contact TEXT,
ADD COLUMN IF NOT EXISTS shipper_phone TEXT,
ADD COLUMN IF NOT EXISTS shipper_email TEXT,
ADD COLUMN IF NOT EXISTS receiver_name TEXT,
ADD COLUMN IF NOT EXISTS receiver_address TEXT,
ADD COLUMN IF NOT EXISTS receiver_city TEXT,
ADD COLUMN IF NOT EXISTS receiver_state TEXT,
ADD COLUMN IF NOT EXISTS receiver_zip TEXT,
ADD COLUMN IF NOT EXISTS receiver_contact TEXT,
ADD COLUMN IF NOT EXISTS receiver_phone TEXT,
ADD COLUMN IF NOT EXISTS receiver_email TEXT;