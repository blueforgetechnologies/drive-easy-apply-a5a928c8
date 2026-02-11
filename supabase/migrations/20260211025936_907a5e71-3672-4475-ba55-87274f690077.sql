-- Add paid_by_name to invoices to track who marked invoice as paid
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_by_name text;