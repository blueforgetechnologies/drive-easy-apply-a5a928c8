-- Create locations table for facilities with geocodes
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT, -- shipper, consignee, yard, shop
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'USA',
  latitude NUMERIC,
  longitude NUMERIC,
  hours TEXT,
  pickup_instructions TEXT,
  delivery_instructions TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create contacts table for people associated with customers, carriers, locations
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- customer, carrier, location
  entity_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create load_stops table for multi-stop loads
CREATE TABLE public.load_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  stop_type TEXT NOT NULL, -- pickup, delivery
  location_id UUID REFERENCES public.locations(id),
  location_name TEXT,
  location_address TEXT,
  location_city TEXT,
  location_state TEXT,
  location_zip TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  actual_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled', -- scheduled, arrived, loading/unloading, departed, completed
  reference_numbers TEXT,
  required_documents TEXT[],
  notes TEXT,
  detention_start TIMESTAMPTZ,
  detention_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create load_expenses table for tracking expenses per load
CREATE TABLE public.load_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL, -- fuel, tolls, lumper, detention, layover, other
  amount NUMERIC NOT NULL,
  description TEXT,
  receipt_url TEXT,
  incurred_date DATE,
  paid_by TEXT, -- driver, company, carrier
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Create company_profile table
CREATE TABLE public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'USA',
  phone TEXT,
  email TEXT,
  website TEXT,
  dot_number TEXT,
  mc_number TEXT,
  tax_id TEXT,
  default_currency TEXT DEFAULT 'USD',
  default_timezone TEXT DEFAULT 'America/New_York',
  billing_terms TEXT,
  remittance_info TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create maintenance_records table for asset maintenance
CREATE TABLE public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL, -- PM, repair, inspection, tire, other
  service_date DATE NOT NULL,
  odometer INTEGER,
  engine_hours NUMERIC,
  description TEXT NOT NULL,
  cost NUMERIC,
  vendor TEXT,
  invoice_number TEXT,
  invoice_url TEXT,
  next_service_date DATE,
  next_service_odometer INTEGER,
  downtime_hours NUMERIC,
  status TEXT DEFAULT 'completed', -- scheduled, in_progress, completed, cancelled
  performed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- load, invoice, settlement, etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- created, updated, deleted, status_changed
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  user_id UUID,
  user_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  notes TEXT
);

-- Update loads table with enhanced fields
ALTER TABLE public.loads
ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'pending', -- pending, billed, paid
ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'unsettled', -- unsettled, included, paid
ADD COLUMN IF NOT EXISTS billing_notes TEXT,
ADD COLUMN IF NOT EXISTS dispatch_notes TEXT,
ADD COLUMN IF NOT EXISTS detention_charges NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS layover_charges NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_charges NUMERIC,
ADD COLUMN IF NOT EXISTS equipment_type TEXT, -- dry_van, reefer, flatbed, etc.
ADD COLUMN IF NOT EXISTS temperature_required TEXT,
ADD COLUMN IF NOT EXISTS hazmat BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS team_required BOOLEAN DEFAULT false;

-- Update settlements table with enhanced structure
ALTER TABLE public.settlements
ADD COLUMN IF NOT EXISTS settlement_type TEXT DEFAULT 'driver', -- driver, carrier, owner_operator
ADD COLUMN IF NOT EXISTS accessorial_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS detention_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS layover_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_pay NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS fuel_deduction NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS escrow_deduction NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_earnings NUMERIC DEFAULT 0;

-- Enable RLS on new tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for locations
CREATE POLICY "Admins can view all locations" ON public.locations FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert locations" ON public.locations FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update locations" ON public.locations FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete locations" ON public.locations FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for contacts
CREATE POLICY "Admins can view all contacts" ON public.contacts FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert contacts" ON public.contacts FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contacts" ON public.contacts FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for load_stops
CREATE POLICY "Admins can view all load stops" ON public.load_stops FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert load stops" ON public.load_stops FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update load stops" ON public.load_stops FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete load stops" ON public.load_stops FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for load_expenses
CREATE POLICY "Admins can view all load expenses" ON public.load_expenses FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert load expenses" ON public.load_expenses FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update load expenses" ON public.load_expenses FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete load expenses" ON public.load_expenses FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for company_profile
CREATE POLICY "Admins can view company profile" ON public.company_profile FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert company profile" ON public.company_profile FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update company profile" ON public.company_profile FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for maintenance_records
CREATE POLICY "Admins can view all maintenance records" ON public.maintenance_records FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert maintenance records" ON public.maintenance_records FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update maintenance records" ON public.maintenance_records FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete maintenance records" ON public.maintenance_records FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Create RLS policies for audit_logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create triggers for updated_at
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_load_stops_updated_at BEFORE UPDATE ON public.load_stops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_company_profile_updated_at BEFORE UPDATE ON public.company_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_contacts_entity ON public.contacts(entity_type, entity_id);
CREATE INDEX idx_load_stops_load_id ON public.load_stops(load_id, stop_sequence);
CREATE INDEX idx_load_expenses_load_id ON public.load_expenses(load_id);
CREATE INDEX idx_maintenance_asset_id ON public.maintenance_records(asset_id, service_date);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id, timestamp);
CREATE INDEX idx_locations_type_status ON public.locations(type, status);