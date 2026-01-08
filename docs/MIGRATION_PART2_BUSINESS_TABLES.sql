-- =============================================
-- FREIGHTTMS MIGRATION - PART 2 OF 3
-- BUSINESS TABLES
-- Run this SECOND in your Supabase SQL Editor
-- =============================================

-- =============================================
-- SECTION 1: PAYEES (must come before carriers/dispatchers)
-- =============================================

CREATE TABLE public.payees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payee_type TEXT DEFAULT 'individual',
  tax_id TEXT,
  payment_method TEXT DEFAULT 'check',
  bank_name TEXT,
  account_name TEXT,
  routing_number TEXT,
  account_number TEXT,
  account_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.payees ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 2: CARRIERS
-- =============================================

CREATE TABLE public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mc_number TEXT,
  dot_number TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'active',
  safer_status TEXT,
  safety_rating TEXT,
  carrier_symbol TEXT,
  dispatch_name TEXT,
  dispatch_phone TEXT,
  dispatch_email TEXT,
  after_hours_phone TEXT,
  personal_business TEXT,
  dun_bradstreet TEXT,
  emergency_contact_name TEXT,
  emergency_contact_title TEXT,
  emergency_contact_home_phone TEXT,
  emergency_contact_cell_phone TEXT,
  emergency_contact_email TEXT,
  logo_url TEXT,
  show_in_fleet_financials BOOLEAN NOT NULL DEFAULT true,
  payee_id UUID REFERENCES public.payees(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 3: CUSTOMERS
-- =============================================

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  payment_terms TEXT,
  credit_limit NUMERIC,
  status TEXT DEFAULT 'active',
  notes TEXT,
  email_secondary TEXT,
  phone_secondary TEXT,
  phone_mobile TEXT,
  phone_fax TEXT,
  mc_number TEXT,
  dot_number TEXT,
  factoring_approval TEXT DEFAULT 'pending',
  customer_type TEXT DEFAULT 'broker',
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 4: LOCATIONS
-- =============================================

CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'USA',
  latitude NUMERIC,
  longitude NUMERIC,
  location_type TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  operating_hours TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 5: VEHICLES
-- =============================================

CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number TEXT NOT NULL,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  license_plate TEXT,
  license_state TEXT,
  vehicle_type TEXT,
  truck_type TEXT DEFAULT 'company_truck',
  status TEXT DEFAULT 'active',
  current_location TEXT,
  current_latitude NUMERIC,
  current_longitude NUMERIC,
  last_location_update TIMESTAMP WITH TIME ZONE,
  fuel_type TEXT,
  fuel_capacity NUMERIC,
  mpg NUMERIC,
  length_feet NUMERIC,
  weight_capacity NUMERIC,
  cargo_type TEXT,
  is_hazmat_certified BOOLEAN DEFAULT false,
  requires_load_approval BOOLEAN DEFAULT false,
  contractor_percentage NUMERIC,
  carrier_id UUID REFERENCES public.carriers(id),
  assigned_driver_id UUID,
  notes TEXT,
  insurance_expiry DATE,
  registration_expiry DATE,
  inspection_expiry DATE,
  samsara_id TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Vehicle integrations
CREATE TABLE public.vehicle_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(vehicle_id, provider)
);
ALTER TABLE public.vehicle_integrations ENABLE ROW LEVEL SECURITY;

-- Vehicle location history
CREATE TABLE public.vehicle_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  speed NUMERIC,
  heading NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'manual'
);
ALTER TABLE public.vehicle_location_history ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 6: DISPATCHERS
-- =============================================

CREATE TABLE public.dispatchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  hire_date DATE,
  termination_date DATE,
  notes TEXT,
  pay_percentage NUMERIC,
  assigned_trucks INTEGER DEFAULT 0,
  address TEXT,
  dob DATE,
  license_number TEXT,
  license_issued_date DATE,
  license_expiration_date DATE,
  application_status TEXT,
  contract_agreement TEXT,
  emergency_contact_1_name TEXT,
  emergency_contact_1_phone TEXT,
  emergency_contact_1_relationship TEXT,
  emergency_contact_2_name TEXT,
  emergency_contact_2_phone TEXT,
  emergency_contact_2_relationship TEXT,
  role TEXT,
  user_id UUID REFERENCES auth.users(id),
  must_change_password BOOLEAN DEFAULT false,
  show_all_tab BOOLEAN DEFAULT false,
  payee_id UUID REFERENCES public.payees(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.dispatchers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 7: DRIVER INVITES & APPLICATIONS
-- =============================================

CREATE TABLE public.driver_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  invited_by UUID NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE,
  application_started_at TIMESTAMP WITH TIME ZONE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.driver_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_info JSONB NOT NULL,
  payroll_policy JSONB NOT NULL,
  license_info JSONB NOT NULL,
  driving_history JSONB NOT NULL,
  employment_history JSONB NOT NULL,
  document_upload JSONB NOT NULL,
  drug_alcohol_policy JSONB NOT NULL,
  driver_dispatch_sheet JSONB NOT NULL,
  no_rider_policy JSONB NOT NULL,
  safe_driving_policy JSONB NOT NULL,
  contractor_agreement JSONB NOT NULL,
  direct_deposit JSONB NOT NULL,
  why_hire_you JSONB NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'pending',
  emergency_contacts JSONB DEFAULT '[]',
  driver_status TEXT DEFAULT 'pending',
  driver_salary TEXT,
  driver_address TEXT,
  home_phone TEXT,
  cell_phone TEXT,
  driver_record_expiry DATE,
  medical_card_expiry DATE,
  restrictions TEXT,
  national_registry TEXT,
  bank_name TEXT,
  account_name TEXT,
  routing_number TEXT,
  checking_number TEXT,
  account_type TEXT,
  pay_method TEXT DEFAULT 'salary',
  pay_per_mile NUMERIC,
  weekly_salary NUMERIC,
  work_permit_expiry DATE,
  green_card_expiry DATE,
  application_date DATE,
  hired_date DATE,
  termination_date DATE,
  vehicle_note TEXT,
  score_card TEXT,
  invite_id UUID REFERENCES public.driver_invites(id),
  hourly_rate NUMERIC,
  hours_per_week INTEGER,
  load_percentage NUMERIC,
  base_salary NUMERIC,
  overtime_eligible BOOLEAN DEFAULT false,
  overtime_multiplier TEXT DEFAULT '1.5',
  weekend_premium NUMERIC,
  holiday_pay_rate TEXT DEFAULT 'none',
  sign_on_bonus NUMERIC,
  safety_bonus NUMERIC,
  fuel_bonus NUMERIC,
  referral_bonus NUMERIC,
  per_diem NUMERIC,
  layover_pay NUMERIC,
  detention_pay NUMERIC,
  stop_pay NUMERIC,
  insurance_deduction NUMERIC,
  escrow_deduction NUMERIC,
  equipment_lease NUMERIC,
  other_deductions NUMERIC,
  pay_method_active BOOLEAN DEFAULT true,
  payee_id UUID REFERENCES public.payees(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 8: LOADS
-- =============================================

-- Create sequence for load IDs
CREATE SEQUENCE IF NOT EXISTS public.load_email_seq START 1;

CREATE TABLE public.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  broker_name TEXT,
  broker_contact TEXT,
  broker_phone TEXT,
  broker_email TEXT,
  load_type TEXT,
  status TEXT DEFAULT 'pending',
  rate NUMERIC,
  customer_rate NUMERIC,
  broker_fee NUMERIC,
  fuel_surcharge NUMERIC,
  accessorial_charges NUMERIC,
  total_revenue NUMERIC,
  total_cost NUMERIC,
  profit NUMERIC,
  profit_margin NUMERIC,
  commodity TEXT,
  weight NUMERIC,
  pieces INTEGER,
  dimensions TEXT,
  equipment_type TEXT,
  temperature_min NUMERIC,
  temperature_max NUMERIC,
  is_hazmat BOOLEAN DEFAULT false,
  hazmat_class TEXT,
  reference_numbers JSONB,
  special_instructions TEXT,
  internal_notes TEXT,
  pickup_date DATE,
  pickup_time_start TIME,
  pickup_time_end TIME,
  pickup_location_id UUID REFERENCES public.locations(id),
  pickup_city TEXT,
  pickup_state TEXT,
  pickup_zip TEXT,
  pickup_address TEXT,
  delivery_date DATE,
  delivery_time_start TIME,
  delivery_time_end TIME,
  delivery_location_id UUID REFERENCES public.locations(id),
  delivery_city TEXT,
  delivery_state TEXT,
  delivery_zip TEXT,
  delivery_address TEXT,
  total_miles NUMERIC,
  empty_miles NUMERIC,
  loaded_miles NUMERIC,
  estimated_fuel_cost NUMERIC,
  rate_per_mile NUMERIC,
  assigned_vehicle_id UUID REFERENCES public.vehicles(id),
  assigned_driver_id UUID,
  dispatcher_id UUID REFERENCES public.dispatchers(id),
  carrier_id UUID REFERENCES public.carriers(id),
  carrier_rate NUMERIC,
  carrier_approved BOOLEAN DEFAULT false,
  approved_payload NUMERIC,
  invoice_id UUID,
  settlement_id UUID,
  pod_received BOOLEAN DEFAULT false,
  pod_received_at TIMESTAMP WITH TIME ZONE,
  billing_status TEXT DEFAULT 'unbilled',
  payment_status TEXT DEFAULT 'unpaid',
  load_email_id UUID,
  booked_at TIMESTAMP WITH TIME ZONE,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;

-- Load stops (multi-stop loads)
CREATE TABLE public.load_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  stop_type TEXT NOT NULL,
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
  actual_arrival TIMESTAMP WITH TIME ZONE,
  actual_departure TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'scheduled',
  reference_numbers TEXT,
  required_documents TEXT[],
  notes TEXT,
  detention_start TIMESTAMP WITH TIME ZONE,
  detention_end TIMESTAMP WITH TIME ZONE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.load_stops ENABLE ROW LEVEL SECURITY;

-- Load documents
CREATE TABLE public.load_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  document_type TEXT,
  file_name TEXT,
  file_url TEXT,
  file_size INTEGER,
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.load_documents ENABLE ROW LEVEL SECURITY;

-- Load expenses
CREATE TABLE public.load_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  receipt_url TEXT,
  incurred_date DATE,
  paid_by TEXT,
  notes TEXT,
  created_by UUID,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.load_expenses ENABLE ROW LEVEL SECURITY;

-- Carrier rate history
CREATE TABLE public.carrier_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  old_rate NUMERIC,
  new_rate NUMERIC NOT NULL,
  old_payload NUMERIC,
  new_payload NUMERIC,
  changed_by UUID,
  changed_by_name TEXT,
  notes TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.carrier_rate_history ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 9: LOAD HUNTER (EMAIL PARSING)
-- =============================================

CREATE TABLE public.load_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id TEXT NOT NULL,
  thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  body_text TEXT,
  body_html TEXT,
  parsed_data JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_load_id UUID REFERENCES public.loads(id),
  marked_missed_at TIMESTAMP WITH TIME ZONE,
  load_id TEXT,
  has_issues BOOLEAN DEFAULT false,
  issue_notes TEXT,
  email_source email_source NOT NULL DEFAULT 'sylectus',
  raw_payload_url TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.load_emails ENABLE ROW LEVEL SECURITY;

-- Load emails archive
CREATE TABLE public.load_emails_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  email_id TEXT NOT NULL,
  thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  parsed_data JSONB,
  status TEXT NOT NULL,
  load_id TEXT,
  email_source email_source NOT NULL,
  has_issues BOOLEAN DEFAULT false,
  issue_notes TEXT,
  assigned_load_id UUID,
  marked_missed_at TIMESTAMP WITH TIME ZONE,
  original_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  original_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_payload_url TEXT
);
ALTER TABLE public.load_emails_archive ENABLE ROW LEVEL SECURITY;

-- Hunt plans
CREATE TABLE public.hunt_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  vehicle_size TEXT,
  zip_code TEXT,
  available_feet TEXT,
  partial BOOLEAN DEFAULT false,
  pickup_radius TEXT,
  mile_limit TEXT,
  load_capacity TEXT,
  available_date DATE,
  available_time TIME,
  destination_zip TEXT,
  destination_radius TEXT,
  notes TEXT,
  hunt_coordinates JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  floor_load_id TEXT,
  initial_match_done BOOLEAN DEFAULT false,
  sources email_source[],
  regional_bounds JSONB,
  created_by UUID,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.hunt_plans ENABLE ROW LEVEL SECURITY;

-- Load hunt matches
CREATE TABLE public.load_hunt_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_email_id UUID NOT NULL REFERENCES public.load_emails(id) ON DELETE CASCADE,
  hunt_plan_id UUID NOT NULL REFERENCES public.hunt_plans(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  distance_miles NUMERIC,
  match_score NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_status TEXT NOT NULL DEFAULT 'active',
  matched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  bid_rate NUMERIC,
  bid_by UUID,
  bid_at TIMESTAMP WITH TIME ZONE,
  booked_load_id UUID REFERENCES public.loads(id),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.load_hunt_matches ENABLE ROW LEVEL SECURITY;

-- Load hunt matches archive
CREATE TABLE public.load_hunt_matches_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_match_id UUID NOT NULL,
  load_email_id UUID NOT NULL,
  hunt_plan_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  distance_miles NUMERIC,
  match_score NUMERIC,
  is_active BOOLEAN NOT NULL,
  match_status TEXT NOT NULL,
  matched_at TIMESTAMP WITH TIME ZONE NOT NULL,
  original_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  original_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archive_reason TEXT NOT NULL DEFAULT 'deleted'
);
ALTER TABLE public.load_hunt_matches_archive ENABLE ROW LEVEL SECURITY;

-- Load bids
CREATE TABLE public.load_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id TEXT NOT NULL,
  load_email_id UUID REFERENCES public.load_emails(id),
  match_id UUID REFERENCES public.load_hunt_matches(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  dispatcher_id UUID REFERENCES public.dispatchers(id),
  carrier_id UUID REFERENCES public.carriers(id),
  bid_amount NUMERIC NOT NULL,
  to_email TEXT,
  status TEXT DEFAULT 'sent',
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.load_bids ENABLE ROW LEVEL SECURITY;

-- Missed loads history
CREATE TABLE public.missed_loads_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_email_id UUID NOT NULL REFERENCES public.load_emails(id) ON DELETE CASCADE,
  missed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reset_at TIMESTAMP WITH TIME ZONE,
  dispatcher_id UUID,
  from_email TEXT,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.missed_loads_history ENABLE ROW LEVEL SECURITY;

-- Match action history
CREATE TABLE public.match_action_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  action TEXT NOT NULL,
  user_id UUID,
  user_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.match_action_history ENABLE ROW LEVEL SECURITY;

-- Loadboard filters
CREATE TABLE public.loadboard_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source email_source NOT NULL,
  filter_type TEXT NOT NULL,
  original_value TEXT NOT NULL,
  canonical_value TEXT[],
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  auto_mapped BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.loadboard_filters ENABLE ROW LEVEL SECURITY;

-- Parser hints
CREATE TABLE public.parser_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source email_source NOT NULL,
  field_name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  replacement TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.parser_hints ENABLE ROW LEVEL SECURITY;

-- Sylectus type config
CREATE TABLE public.sylectus_type_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.sylectus_type_config ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 10: INVOICES & SETTLEMENTS
-- =============================================

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  invoice_date DATE,
  due_date DATE,
  subtotal NUMERIC,
  tax NUMERIC,
  total_amount NUMERIC,
  amount_paid NUMERIC,
  balance_due NUMERIC,
  status TEXT DEFAULT 'draft',
  payment_terms TEXT,
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  billing_party TEXT,
  advance_issued NUMERIC DEFAULT 0,
  expected_deposit NUMERIC DEFAULT 0,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  load_id UUID REFERENCES public.loads(id),
  amount NUMERIC,
  description TEXT
);
ALTER TABLE public.invoice_loads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number TEXT NOT NULL,
  payee_id UUID REFERENCES public.payees(id),
  payee_name TEXT,
  settlement_period_start DATE,
  settlement_period_end DATE,
  total_revenue NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft',
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.settlement_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES public.settlements(id) ON DELETE CASCADE,
  load_id UUID REFERENCES public.loads(id),
  amount NUMERIC,
  description TEXT
);
ALTER TABLE public.settlement_loads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 11: EXPENSES & MAINTENANCE
-- =============================================

CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.expense_categories(id),
  expense_date DATE,
  amount NUMERIC,
  description TEXT,
  payee TEXT,
  payment_method TEXT,
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID,
  load_id UUID REFERENCES public.loads(id),
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  created_by UUID,
  notes TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  description TEXT,
  cost NUMERIC,
  vendor TEXT,
  performed_at DATE,
  next_due_date DATE,
  next_due_miles NUMERIC,
  odometer_reading NUMERIC,
  notes TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'completed',
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 12: COMPANY PROFILE & CONTACTS
-- =============================================

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
  factoring_company_name TEXT,
  factoring_company_address TEXT,
  factoring_company_city TEXT,
  factoring_company_state TEXT,
  factoring_company_zip TEXT,
  factoring_contact_name TEXT,
  factoring_contact_email TEXT,
  factoring_contact_phone TEXT,
  factoring_percentage NUMERIC DEFAULT 2,
  default_carrier_id UUID REFERENCES public.carriers(id),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 13: PAYMENT FORMULAS & PAY STRUCTURES
-- =============================================

CREATE TABLE public.payment_formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  formula_type TEXT NOT NULL,
  base_rate NUMERIC,
  per_mile_rate NUMERIC,
  percentage NUMERIC,
  min_amount NUMERIC,
  max_amount NUMERIC,
  conditions JSONB,
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.payment_formulas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pay_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pay_type TEXT NOT NULL,
  base_rate NUMERIC,
  per_mile_rate NUMERIC,
  percentage NUMERIC,
  bonus_structure JSONB,
  deductions JSONB,
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pay_structures ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 14: AUDIT LOGS
-- =============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  user_id UUID,
  user_name TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip_address TEXT,
  notes TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- END OF PART 2
-- =============================================
-- After running this, proceed to PART 3
