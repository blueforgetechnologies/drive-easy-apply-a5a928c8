-- Add payee_id column to carriers table
ALTER TABLE public.carriers
ADD COLUMN payee_id uuid REFERENCES public.payees(id);

-- Create index for better performance
CREATE INDEX idx_carriers_payee_id ON public.carriers(payee_id);