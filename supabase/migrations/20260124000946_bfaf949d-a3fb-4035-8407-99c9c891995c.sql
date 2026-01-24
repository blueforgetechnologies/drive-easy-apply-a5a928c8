-- Create invoice_email_log table for tracking direct email sends
CREATE TABLE public.invoice_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  cc TEXT NULL,
  subject TEXT NOT NULL,
  resend_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT NULL,
  attachments JSONB NULL,
  warnings TEXT[] NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies using the correct function signature
CREATE POLICY "Users can view their tenant's invoice email logs"
ON public.invoice_email_log
FOR SELECT
USING (public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can insert invoice email logs for their tenant"
ON public.invoice_email_log
FOR INSERT
WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

-- Create index for faster lookups
CREATE INDEX idx_invoice_email_log_invoice_id ON public.invoice_email_log(invoice_id);
CREATE INDEX idx_invoice_email_log_tenant_id ON public.invoice_email_log(tenant_id);

-- Add tenant isolation trigger
CREATE TRIGGER enforce_tenant_isolation_invoice_email_log
  BEFORE INSERT OR UPDATE ON public.invoice_email_log
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tenant_isolation();