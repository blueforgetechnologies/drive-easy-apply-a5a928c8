-- Add invoice_number column to loads table
ALTER TABLE public.loads
ADD COLUMN IF NOT EXISTS invoice_number text;