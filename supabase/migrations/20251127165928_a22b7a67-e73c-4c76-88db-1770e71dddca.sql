-- Create carriers table for managing carrier companies
CREATE TABLE IF NOT EXISTS public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mc_number TEXT,
  dot_number TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for carriers
CREATE POLICY "Admins can view all carriers"
  ON public.carriers
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert carriers"
  ON public.carriers
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update carriers"
  ON public.carriers
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete carriers"
  ON public.carriers
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Create payees table for managing payment recipients
CREATE TABLE IF NOT EXISTS public.payees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT,
  payment_method TEXT,
  bank_name TEXT,
  account_number TEXT,
  routing_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payees ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for payees
CREATE POLICY "Admins can view all payees"
  ON public.payees
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert payees"
  ON public.payees
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payees"
  ON public.payees
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payees"
  ON public.payees
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Add triggers for updated_at
CREATE TRIGGER update_carriers_updated_at
  BEFORE UPDATE ON public.carriers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payees_updated_at
  BEFORE UPDATE ON public.payees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();