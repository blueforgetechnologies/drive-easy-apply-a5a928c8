
-- Drop existing check constraint
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

-- Allow NULL values
ALTER TABLE public.invoices ALTER COLUMN payment_status DROP NOT NULL;

-- Change default to NULL
ALTER TABLE public.invoices ALTER COLUMN payment_status SET DEFAULT NULL;

-- Clear all non-paid values to NULL
UPDATE public.invoices SET payment_status = NULL WHERE payment_status IS DISTINCT FROM 'paid';

-- Add clean constraint
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid'));
