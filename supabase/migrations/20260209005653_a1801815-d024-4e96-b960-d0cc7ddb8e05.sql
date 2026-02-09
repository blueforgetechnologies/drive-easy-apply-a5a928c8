
-- Add billing_reference_number to invoice_loads for OTR billing overrides
-- This keeps the original load reference_number untouched
ALTER TABLE public.invoice_loads
ADD COLUMN billing_reference_number text;

COMMENT ON COLUMN public.invoice_loads.billing_reference_number IS 'Optional override of the load reference_number for OTR billing. When set, OTR submission uses this instead of the original load reference_number.';
