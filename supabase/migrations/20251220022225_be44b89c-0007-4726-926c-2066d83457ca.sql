-- Create table to store Mapbox billing history (never deleted)
CREATE TABLE public.mapbox_billing_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_period TEXT NOT NULL, -- e.g., "Dec 2025" or "2025-12"
  billing_start DATE NOT NULL,
  billing_end DATE NOT NULL,
  geocoding_requests INTEGER NOT NULL DEFAULT 0,
  map_loads INTEGER NOT NULL DEFAULT 0,
  directions_requests INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  invoice_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(billing_period)
);

-- Enable RLS
ALTER TABLE public.mapbox_billing_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all billing history
CREATE POLICY "Admins can view mapbox billing history"
ON public.mapbox_billing_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert billing history
CREATE POLICY "Admins can insert mapbox billing history"
ON public.mapbox_billing_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update billing history
CREATE POLICY "Admins can update mapbox billing history"
ON public.mapbox_billing_history
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- NO DELETE POLICY - billing history should never be deleted

-- Add trigger for updated_at
CREATE TRIGGER update_mapbox_billing_history_updated_at
BEFORE UPDATE ON public.mapbox_billing_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the December 2025 billing data from the invoice
INSERT INTO public.mapbox_billing_history (
  billing_period,
  billing_start,
  billing_end,
  geocoding_requests,
  map_loads,
  directions_requests,
  total_cost,
  invoice_date,
  notes
) VALUES (
  '2025-12',
  '2025-12-01',
  '2025-12-31',
  227633,
  1077,
  4,
  96.00,
  '2026-01-01',
  'Invoice from Mapbox - Temporary Geocoding API usage'
);