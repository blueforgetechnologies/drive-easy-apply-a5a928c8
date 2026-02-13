
-- Table to store OTR schedule info per batch date per tenant
CREATE TABLE public.invoice_batch_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  batch_date DATE NOT NULL,
  schedule_name TEXT,
  schedule_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, batch_date)
);

-- Enable RLS
ALTER TABLE public.invoice_batch_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant schedules"
  ON public.invoice_batch_schedules FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can insert their tenant schedules"
  ON public.invoice_batch_schedules FOR INSERT
  WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can update their tenant schedules"
  ON public.invoice_batch_schedules FOR UPDATE
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can delete their tenant schedules"
  ON public.invoice_batch_schedules FOR DELETE
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Trigger for updated_at
CREATE TRIGGER update_invoice_batch_schedules_updated_at
  BEFORE UPDATE ON public.invoice_batch_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for schedule PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('otr-schedules', 'otr-schedules', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload schedule PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'otr-schedules' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view schedule PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'otr-schedules');

CREATE POLICY "Authenticated users can update schedule PDFs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'otr-schedules' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete schedule PDFs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'otr-schedules' AND auth.role() = 'authenticated');
