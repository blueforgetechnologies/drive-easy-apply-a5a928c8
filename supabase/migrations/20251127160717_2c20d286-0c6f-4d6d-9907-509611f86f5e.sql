-- Create vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT UNIQUE,
  license_plate TEXT,
  status TEXT DEFAULT 'active',
  assigned_driver_id UUID,
  mileage INTEGER,
  last_service_date DATE,
  next_service_date DATE,
  insurance_expiry DATE,
  registration_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create dispatchers table
CREATE TABLE IF NOT EXISTS public.dispatchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  hire_date DATE,
  termination_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatchers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vehicles
CREATE POLICY "Admins can view all vehicles"
ON vehicles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert vehicles"
ON vehicles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update vehicles"
ON vehicles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete vehicles"
ON vehicles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for dispatchers
CREATE POLICY "Admins can view all dispatchers"
ON dispatchers FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert dispatchers"
ON dispatchers FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update dispatchers"
ON dispatchers FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete dispatchers"
ON dispatchers FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispatchers_updated_at
BEFORE UPDATE ON dispatchers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();