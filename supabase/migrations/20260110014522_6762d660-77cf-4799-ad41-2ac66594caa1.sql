-- Platform email configuration table
CREATE TABLE public.platform_email_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_mode TEXT NOT NULL DEFAULT 'gmail' CHECK (email_mode IN ('gmail', 'custom_domain')),
  gmail_base_email TEXT DEFAULT 'talbilogistics@gmail.com',
  custom_domain TEXT,
  custom_domain_status TEXT DEFAULT 'not_configured' CHECK (custom_domain_status IN ('not_configured', 'pending_verification', 'active', 'failed')),
  custom_domain_verified_at TIMESTAMP WITH TIME ZONE,
  catch_all_forward_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one config row allowed (singleton pattern)
CREATE UNIQUE INDEX platform_email_config_singleton ON public.platform_email_config ((true));

-- Insert default config
INSERT INTO public.platform_email_config (email_mode, gmail_base_email) 
VALUES ('gmail', 'talbilogistics@gmail.com');

-- Add MC number to tenants for carrier lookup
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS mc_number TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS carrier_address TEXT;

-- Enable RLS
ALTER TABLE public.platform_email_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write email config
CREATE POLICY "Admins can read email config" 
ON public.platform_email_config 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update email config" 
ON public.platform_email_config 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_platform_email_config_updated_at
BEFORE UPDATE ON public.platform_email_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();