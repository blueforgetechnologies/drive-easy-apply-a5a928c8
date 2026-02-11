
-- Update check constraint to allow all 4 payment statuses
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'delivered', 'failed'));

-- Update existing delivered invoices (those with otr_submitted_at or sent email logs) to payment_status = 'delivered'
UPDATE public.invoices SET payment_status = 'delivered' WHERE payment_status = 'pending' AND otr_submitted_at IS NOT NULL;
