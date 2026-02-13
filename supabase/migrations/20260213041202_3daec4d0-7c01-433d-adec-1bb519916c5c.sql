
-- Add per-customer factoring flat fee (e.g., $1.75 per load for Landstar)
ALTER TABLE public.customers
ADD COLUMN factoring_flat_fee numeric DEFAULT NULL;

COMMENT ON COLUMN public.customers.factoring_flat_fee IS 'Per-load flat fee charged by factoring company for this customer (e.g., $1.75 for Landstar via OTR Solutions)';

-- Set Landstar Express America Inc flat fee
UPDATE public.customers 
SET factoring_flat_fee = 1.75 
WHERE id = '8578228a-2586-445f-a9f7-df9d757247c0';
