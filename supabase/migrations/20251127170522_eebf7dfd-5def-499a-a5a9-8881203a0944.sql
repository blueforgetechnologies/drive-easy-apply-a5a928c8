-- =============================================
-- COMPREHENSIVE TMS DATABASE SCHEMA
-- =============================================

-- Create loads table for freight management
CREATE TABLE IF NOT EXISTS public.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number TEXT UNIQUE NOT NULL,
  
  -- Customer & Broker Info
  customer_id UUID,
  broker_name TEXT,
  broker_contact TEXT,
  broker_phone TEXT,
  broker_email TEXT,
  
  -- Load Details
  load_type TEXT, -- 'internal', 'broker', 'load_board'
  status TEXT DEFAULT 'pending', -- pending, dispatched, in_transit, delivered, completed, cancelled
  
  -- Financial
  rate NUMERIC(10,2),
  customer_rate NUMERIC(10,2),
  broker_fee NUMERIC(10,2),
  fuel_surcharge NUMERIC(10,2),
  accessorial_charges NUMERIC(10,2),
  total_revenue NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  profit_margin NUMERIC(10,2),
  
  -- Assignment
  assigned_driver_id UUID,
  assigned_vehicle_id UUID,
  assigned_dispatcher_id UUID,
  carrier_id UUID,
  
  -- Pickup Details
  pickup_location TEXT,
  pickup_address TEXT,
  pickup_city TEXT,
  pickup_state TEXT,
  pickup_zip TEXT,
  pickup_date TIMESTAMP WITH TIME ZONE,
  pickup_time TEXT,
  pickup_contact TEXT,
  pickup_phone TEXT,
  pickup_notes TEXT,
  actual_pickup_date TIMESTAMP WITH TIME ZONE,
  
  -- Delivery Details
  delivery_location TEXT,
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_state TEXT,
  delivery_zip TEXT,
  delivery_date TIMESTAMP WITH TIME ZONE,
  delivery_time TEXT,
  delivery_contact TEXT,
  delivery_phone TEXT,
  delivery_notes TEXT,
  actual_delivery_date TIMESTAMP WITH TIME ZONE,
  
  -- Cargo Details
  cargo_weight NUMERIC(10,2),
  cargo_pieces INTEGER,
  cargo_description TEXT,
  commodity_type TEXT,
  special_instructions TEXT,
  
  -- Distance & Route
  estimated_miles NUMERIC(10,2),
  actual_miles NUMERIC(10,2),
  route_notes TEXT,
  
  -- Documents
  bol_number TEXT,
  pro_number TEXT,
  po_number TEXT,
  reference_number TEXT,
  
  -- Tracking
  current_location TEXT,
  eta TIMESTAMP WITH TIME ZONE,
  last_updated_location TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_by UUID,
  notes TEXT
);

-- Create load_documents table for file attachments
CREATE TABLE IF NOT EXISTS public.load_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  document_type TEXT, -- 'bol', 'pod', 'rate_confirmation', 'invoice', 'other'
  file_name TEXT,
  file_url TEXT,
  file_size INTEGER,
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- Create settlements table for driver payments
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number TEXT UNIQUE NOT NULL,
  
  -- Driver/Payee Info
  driver_id UUID,
  payee_id UUID,
  
  -- Period
  period_start DATE,
  period_end DATE,
  
  -- Payment Details
  payment_method TEXT, -- 'per_mile', 'percentage', 'flat_rate', 'salary'
  base_rate NUMERIC(10,2),
  total_miles NUMERIC(10,2),
  total_loads INTEGER,
  gross_pay NUMERIC(10,2),
  
  -- Deductions
  fuel_advance NUMERIC(10,2),
  insurance_deduction NUMERIC(10,2),
  equipment_lease NUMERIC(10,2),
  maintenance_deduction NUMERIC(10,2),
  other_deductions NUMERIC(10,2),
  total_deductions NUMERIC(10,2),
  
  -- Net Pay
  net_pay NUMERIC(10,2),
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, approved, paid, cancelled
  
  -- Payment Info
  payment_date DATE,
  payment_reference TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  
  notes TEXT
);

-- Create settlement_loads junction table
CREATE TABLE IF NOT EXISTS public.settlement_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID REFERENCES public.settlements(id) ON DELETE CASCADE,
  load_id UUID REFERENCES public.loads(id),
  driver_pay NUMERIC(10,2),
  miles NUMERIC(10,2),
  rate NUMERIC(10,2)
);

-- Create invoices table for customer billing
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  
  -- Customer Info
  customer_name TEXT,
  customer_email TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  
  -- Invoice Details
  invoice_date DATE,
  due_date DATE,
  
  -- Financial
  subtotal NUMERIC(10,2),
  tax NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  amount_paid NUMERIC(10,2),
  balance_due NUMERIC(10,2),
  
  -- Status
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, partial_paid, paid, overdue, cancelled
  
  -- Payment
  payment_terms TEXT,
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  
  notes TEXT
);

-- Create invoice_loads junction table
CREATE TABLE IF NOT EXISTS public.invoice_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  load_id UUID REFERENCES public.loads(id),
  amount NUMERIC(10,2),
  description TEXT
);

-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
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
  credit_limit NUMERIC(10,2),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- Create expense_categories table
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.expense_categories(id),
  expense_date DATE,
  amount NUMERIC(10,2),
  description TEXT,
  payee TEXT,
  payment_method TEXT,
  vehicle_id UUID,
  driver_id UUID,
  load_id UUID,
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  notes TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for loads
CREATE POLICY "Admins can view all loads" ON public.loads FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert loads" ON public.loads FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update loads" ON public.loads FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete loads" ON public.loads FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for load_documents
CREATE POLICY "Admins can view all load documents" ON public.load_documents FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert load documents" ON public.load_documents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete load documents" ON public.load_documents FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for settlements
CREATE POLICY "Admins can view all settlements" ON public.settlements FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert settlements" ON public.settlements FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update settlements" ON public.settlements FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete settlements" ON public.settlements FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for settlement_loads
CREATE POLICY "Admins can view all settlement loads" ON public.settlement_loads FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert settlement loads" ON public.settlement_loads FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete settlement loads" ON public.settlement_loads FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for invoices
CREATE POLICY "Admins can view all invoices" ON public.invoices FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for invoice_loads
CREATE POLICY "Admins can view all invoice loads" ON public.invoice_loads FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert invoice loads" ON public.invoice_loads FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete invoice loads" ON public.invoice_loads FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for customers
CREATE POLICY "Admins can view all customers" ON public.customers FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert customers" ON public.customers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update customers" ON public.customers FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for expense_categories
CREATE POLICY "Admins can view all expense categories" ON public.expense_categories FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert expense categories" ON public.expense_categories FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update expense categories" ON public.expense_categories FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create RLS policies for expenses
CREATE POLICY "Admins can view all expenses" ON public.expenses FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert expenses" ON public.expenses FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update expenses" ON public.expenses FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete expenses" ON public.expenses FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at triggers
CREATE TRIGGER update_loads_updated_at BEFORE UPDATE ON public.loads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settlements_updated_at BEFORE UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_loads_status ON public.loads(status);
CREATE INDEX idx_loads_driver ON public.loads(assigned_driver_id);
CREATE INDEX idx_loads_vehicle ON public.loads(assigned_vehicle_id);
CREATE INDEX idx_loads_pickup_date ON public.loads(pickup_date);
CREATE INDEX idx_loads_delivery_date ON public.loads(delivery_date);
CREATE INDEX idx_settlements_driver ON public.settlements(driver_id);
CREATE INDEX idx_settlements_status ON public.settlements(status);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_name);

-- Insert default expense categories
INSERT INTO public.expense_categories (name, description) VALUES
  ('Fuel', 'Fuel purchases and fuel cards'),
  ('Maintenance', 'Vehicle maintenance and repairs'),
  ('Insurance', 'Insurance premiums and claims'),
  ('Tolls', 'Toll road charges'),
  ('Permits', 'Operating permits and licenses'),
  ('Office', 'Office supplies and equipment'),
  ('Other', 'Miscellaneous expenses')
ON CONFLICT DO NOTHING;