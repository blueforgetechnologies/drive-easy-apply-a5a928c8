-- Add gmail_alias and last_email_received_at to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS gmail_alias text,
ADD COLUMN IF NOT EXISTS last_email_received_at timestamp with time zone;

-- Add unique constraint on gmail_alias to prevent duplicates
ALTER TABLE public.tenants 
ADD CONSTRAINT tenants_gmail_alias_unique UNIQUE (gmail_alias);

-- Create email health alerts table to track alert history
CREATE TABLE IF NOT EXISTS public.email_health_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- 'system_wide' or 'tenant_inactive'
  alert_level text NOT NULL, -- 'warning' or 'critical'
  message text NOT NULL,
  threshold_minutes integer NOT NULL,
  last_email_at timestamp with time zone,
  is_business_hours boolean NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for querying recent alerts
CREATE INDEX IF NOT EXISTS idx_email_health_alerts_tenant ON public.email_health_alerts(tenant_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_health_alerts_unresolved ON public.email_health_alerts(resolved_at) WHERE resolved_at IS NULL;

-- Enable RLS
ALTER TABLE public.email_health_alerts ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all alerts
CREATE POLICY "Platform admins can view all alerts"
ON public.email_health_alerts FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Platform admins can insert alerts (edge function uses service role)
CREATE POLICY "Service role can manage alerts"
ON public.email_health_alerts FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to update last_email_received_at when emails are processed
CREATE OR REPLACE FUNCTION public.update_tenant_last_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    UPDATE public.tenants 
    SET last_email_received_at = COALESCE(NEW.received_at, now())
    WHERE id = NEW.tenant_id
    AND (last_email_received_at IS NULL OR last_email_received_at < COALESCE(NEW.received_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update tenant's last_email_received_at
DROP TRIGGER IF EXISTS trigger_update_tenant_last_email ON public.load_emails;
CREATE TRIGGER trigger_update_tenant_last_email
AFTER INSERT ON public.load_emails
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_last_email();

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.gmail_alias IS 'Gmail plus-address suffix for this tenant (e.g., +acme for talbilogistics+acme@gmail.com)';
COMMENT ON COLUMN public.tenants.last_email_received_at IS 'Timestamp of the last email received for this tenant, used for health monitoring';