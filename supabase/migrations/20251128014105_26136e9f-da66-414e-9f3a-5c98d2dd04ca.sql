-- Add additional carrier fields for detailed carrier management
ALTER TABLE carriers 
ADD COLUMN IF NOT EXISTS safer_status TEXT,
ADD COLUMN IF NOT EXISTS safety_rating TEXT,
ADD COLUMN IF NOT EXISTS carrier_symbol TEXT,
ADD COLUMN IF NOT EXISTS dispatch_name TEXT,
ADD COLUMN IF NOT EXISTS dispatch_phone TEXT,
ADD COLUMN IF NOT EXISTS dispatch_email TEXT,
ADD COLUMN IF NOT EXISTS after_hours_phone TEXT,
ADD COLUMN IF NOT EXISTS personal_business TEXT,
ADD COLUMN IF NOT EXISTS dun_bradstreet TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_title TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_home_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_cell_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_email TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_carriers_dot_number ON carriers(dot_number);
CREATE INDEX IF NOT EXISTS idx_carriers_mc_number ON carriers(mc_number);