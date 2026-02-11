-- Add payment_status column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending' 
CHECK (payment_status IN ('pending', 'paid'));