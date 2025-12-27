
-- 1. Create pay_structures table for flexible, stackable pay configurations
CREATE TABLE public.pay_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('vehicle', 'dispatcher', 'driver')),
  pay_type TEXT NOT NULL CHECK (pay_type IN ('percentage', 'hourly', 'salary', 'per_mile', 'flat_per_load', 'flat_per_stop', 'flat_weekly', 'flat_monthly')),
  rate NUMERIC NOT NULL,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('gross_revenue', 'carrier_rate', 'net_revenue', 'hours_worked', 'miles', 'per_load', 'per_stop', 'weekly', 'monthly')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_pay_structures_entity ON pay_structures(entity_id, entity_type);
CREATE INDEX idx_pay_structures_active ON pay_structures(entity_id, entity_type, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.pay_structures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_structures
CREATE POLICY "Admins can view pay structures"
  ON public.pay_structures FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pay structures"
  ON public.pay_structures FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pay structures"
  ON public.pay_structures FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pay structures"
  ON public.pay_structures FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view pay structures"
  ON public.pay_structures FOR SELECT
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Add payee_id to dispatchers
ALTER TABLE public.dispatchers ADD COLUMN payee_id UUID REFERENCES public.payees(id);
CREATE INDEX idx_dispatchers_payee_id ON dispatchers(payee_id);

-- 3. Add payee_id to applications (drivers)
ALTER TABLE public.applications ADD COLUMN payee_id UUID REFERENCES public.payees(id);
CREATE INDEX idx_applications_payee_id ON applications(payee_id);

-- 4. Add carrier_id to vehicles (proper FK instead of text)
ALTER TABLE public.vehicles ADD COLUMN carrier_id UUID REFERENCES public.carriers(id);
CREATE INDEX idx_vehicles_carrier_id ON vehicles(carrier_id);

-- 5. Add payee_id to vehicles (proper FK instead of text)
ALTER TABLE public.vehicles ADD COLUMN payee_id UUID REFERENCES public.payees(id);
CREATE INDEX idx_vehicles_payee_id ON vehicles(payee_id);

-- 6. Migrate dispatcher pay_percentage to pay_structures
INSERT INTO pay_structures (entity_id, entity_type, pay_type, rate, applies_to, description, is_active, priority)
SELECT 
  id,
  'dispatcher',
  'percentage',
  COALESCE(pay_percentage, 5),
  'gross_revenue',
  'Commission percentage',
  true,
  1
FROM dispatchers
WHERE pay_percentage IS NOT NULL AND pay_percentage > 0;

-- 7. Try to match vehicle carrier text to carriers table
UPDATE vehicles v
SET carrier_id = c.id
FROM carriers c
WHERE LOWER(TRIM(v.carrier)) = LOWER(TRIM(c.name))
  AND v.carrier IS NOT NULL
  AND v.carrier_id IS NULL;

-- 8. Try to match vehicle payee text to payees table
UPDATE vehicles v
SET payee_id = p.id
FROM payees p
WHERE LOWER(TRIM(v.payee)) = LOWER(TRIM(p.name))
  AND v.payee IS NOT NULL
  AND v.payee_id IS NULL;

-- 9. Create trigger for updated_at on pay_structures
CREATE TRIGGER update_pay_structures_updated_at
  BEFORE UPDATE ON public.pay_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
