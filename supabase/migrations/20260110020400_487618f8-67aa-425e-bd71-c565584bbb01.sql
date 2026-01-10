-- Add broker credit check fields to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS otr_approval_status text DEFAULT 'unchecked',
ADD COLUMN IF NOT EXISTS otr_credit_limit numeric,
ADD COLUMN IF NOT EXISTS otr_last_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS otr_check_error text;

-- Create broker credit check history table for audit trail
CREATE TABLE public.broker_credit_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  broker_name text NOT NULL,
  mc_number text,
  approval_status text NOT NULL,
  credit_limit numeric,
  raw_response jsonb,
  checked_by text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  load_email_id uuid,
  match_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.broker_credit_checks ENABLE ROW LEVEL SECURITY;

-- RLS policies for broker_credit_checks using tenant_users (the correct table)
CREATE POLICY "Users can view their tenant's broker credit checks"
  ON public.broker_credit_checks
  FOR SELECT
  USING (tenant_id IN (
    SELECT tu.tenant_id FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() AND tu.is_active = true
  ));

CREATE POLICY "Users can insert broker credit checks for their tenant"
  ON public.broker_credit_checks
  FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tu.tenant_id FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() AND tu.is_active = true
  ));

-- Add index for faster lookups
CREATE INDEX idx_broker_credit_checks_tenant ON public.broker_credit_checks(tenant_id);
CREATE INDEX idx_broker_credit_checks_mc ON public.broker_credit_checks(mc_number);
CREATE INDEX idx_broker_credit_checks_customer ON public.broker_credit_checks(customer_id);

-- Add comment for documentation
COMMENT ON TABLE public.broker_credit_checks IS 'Audit trail of broker credit checks via OTR Solutions or other factoring companies';
COMMENT ON COLUMN public.customers.otr_approval_status IS 'OTR Solutions approval status: unchecked, approved, not_approved, call_otr, not_found';