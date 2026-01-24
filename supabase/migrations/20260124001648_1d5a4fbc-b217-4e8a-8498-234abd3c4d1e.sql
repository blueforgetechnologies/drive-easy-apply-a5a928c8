-- Add billing_email to customers for direct invoice billing
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS billing_email TEXT NULL;