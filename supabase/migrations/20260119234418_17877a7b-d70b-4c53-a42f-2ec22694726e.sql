-- Create OTR invoice submissions tracking table
CREATE TABLE public.otr_invoice_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  broker_mc text NOT NULL,
  broker_name text,
  invoice_number text NOT NULL,
  invoice_amount numeric NOT NULL,
  otr_invoice_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  raw_request jsonb,
  raw_response jsonb,
  submitted_by text,
  quick_pay boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.otr_invoice_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant's OTR submissions"
  ON public.otr_invoice_submissions
  FOR SELECT
  USING (tenant_id IN (
    SELECT tu.tenant_id FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() AND tu.is_active = true
  ));

CREATE POLICY "Users can insert OTR submissions for their tenant"
  ON public.otr_invoice_submissions
  FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tu.tenant_id FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() AND tu.is_active = true
  ));

-- Add indexes
CREATE INDEX idx_otr_submissions_tenant ON public.otr_invoice_submissions(tenant_id);
CREATE INDEX idx_otr_submissions_invoice ON public.otr_invoice_submissions(invoice_id);
CREATE INDEX idx_otr_submissions_status ON public.otr_invoice_submissions(status);

-- Add OTR tracking columns to invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS otr_submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS otr_invoice_id text,
ADD COLUMN IF NOT EXISTS otr_status text,
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

-- Add index for OTR status queries
CREATE INDEX IF NOT EXISTS idx_invoices_otr_status ON public.invoices(otr_status);

-- Comments for documentation
COMMENT ON TABLE public.otr_invoice_submissions IS 'Tracks invoice submissions to OTR Solutions factoring API';
COMMENT ON COLUMN public.invoices.otr_status IS 'OTR factoring status: submitted, processing, approved, funded, rejected';