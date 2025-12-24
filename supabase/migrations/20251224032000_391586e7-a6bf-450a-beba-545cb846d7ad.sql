-- Create carrier rate history table
CREATE TABLE public.carrier_rate_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  old_rate NUMERIC,
  new_rate NUMERIC NOT NULL,
  changed_by UUID,
  changed_by_name TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.carrier_rate_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view carrier rate history"
ON public.carrier_rate_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view carrier rate history"
ON public.carrier_rate_history
FOR SELECT
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert carrier rate history"
ON public.carrier_rate_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert carrier rate history"
ON public.carrier_rate_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups by load_id
CREATE INDEX idx_carrier_rate_history_load_id ON public.carrier_rate_history(load_id);

-- Create index for ordering by changed_at
CREATE INDEX idx_carrier_rate_history_changed_at ON public.carrier_rate_history(changed_at DESC);