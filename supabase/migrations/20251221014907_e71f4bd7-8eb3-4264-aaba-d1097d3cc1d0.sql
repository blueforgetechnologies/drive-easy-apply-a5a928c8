-- Add default carrier reference to company_profile
ALTER TABLE public.company_profile 
ADD COLUMN default_carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL;