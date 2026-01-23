-- Add billing_method column to invoices table
-- Values: 'unknown' (default), 'otr' (OTR factoring), 'direct_email' (direct billing)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS billing_method text DEFAULT 'unknown';

-- Add check constraint for valid values
ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_billing_method_check 
CHECK (billing_method IN ('unknown', 'otr', 'direct_email'));

-- Create index for filtering by billing_method
CREATE INDEX IF NOT EXISTS idx_invoices_billing_method ON public.invoices(billing_method);

-- Comment for documentation
COMMENT ON COLUMN public.invoices.billing_method IS 'Billing method: unknown (default), otr (OTR factoring), direct_email (direct billing to customer)';