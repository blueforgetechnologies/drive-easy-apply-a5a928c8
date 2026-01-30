-- Gmail inboxes mapping table for base email → tenant routing
CREATE TABLE IF NOT EXISTS public.gmail_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  email_address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_address)
);

-- Index for fast tenant lookup
CREATE INDEX IF NOT EXISTS gmail_inboxes_tenant_idx ON public.gmail_inboxes(tenant_id);

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS gmail_inboxes_email_idx ON public.gmail_inboxes(email_address);

-- Enable RLS
ALTER TABLE public.gmail_inboxes ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all
CREATE POLICY "Platform admins full access" ON public.gmail_inboxes
  FOR ALL USING (public.is_platform_admin(auth.uid()));

-- Tenant members can view their own
CREATE POLICY "Tenant members can view own inboxes" ON public.gmail_inboxes
  FOR SELECT USING (public.can_access_tenant(auth.uid(), tenant_id));

-- Seed Talbi Logistics inbox mapping
INSERT INTO public.gmail_inboxes (tenant_id, email_address)
VALUES ('0b611a2e-3182-4c56-95be-ad5637f53eac', 'p.d@talbilogistics.com')
ON CONFLICT (email_address) DO UPDATE 
SET tenant_id = EXCLUDED.tenant_id, is_active = true;