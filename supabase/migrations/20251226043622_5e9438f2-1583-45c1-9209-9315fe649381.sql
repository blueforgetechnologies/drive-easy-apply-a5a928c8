-- Create payment_formulas table for configurable NET calculations
CREATE TABLE public.payment_formulas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  formula_name TEXT NOT NULL UNIQUE,
  add_columns TEXT[] NOT NULL DEFAULT '{}',
  subtract_columns TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_formulas ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view formulas (company-wide setting)
CREATE POLICY "Anyone can view payment formulas" 
ON public.payment_formulas 
FOR SELECT 
USING (true);

-- Allow authenticated users to insert formulas
CREATE POLICY "Authenticated users can create formulas" 
ON public.payment_formulas 
FOR INSERT 
WITH CHECK (true);

-- Allow authenticated users to update formulas
CREATE POLICY "Authenticated users can update formulas" 
ON public.payment_formulas 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_payment_formulas_updated_at
BEFORE UPDATE ON public.payment_formulas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();