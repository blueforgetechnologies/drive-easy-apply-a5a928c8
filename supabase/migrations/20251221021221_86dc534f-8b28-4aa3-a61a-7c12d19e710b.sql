-- Add new columns for invoice tracking matching the reference design
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS billing_party text,
ADD COLUMN IF NOT EXISTS advance_issued numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_deposit numeric DEFAULT 0;