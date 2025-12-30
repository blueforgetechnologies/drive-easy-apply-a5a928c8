-- Create UI Action Registry table
CREATE TABLE public.ui_action_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_key TEXT NOT NULL UNIQUE,
  ui_location TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('navigate', 'api_call', 'mutation', 'modal', 'external_link')),
  backend_target TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  feature_flag_key TEXT,
  tenant_scope TEXT NOT NULL DEFAULT 'global' CHECK (tenant_scope IN ('global', 'tenant')),
  description TEXT,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ui_action_registry ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all actions
CREATE POLICY "Platform admins can view UI actions"
ON public.ui_action_registry
FOR SELECT
USING (is_user_platform_admin(auth.uid()));

-- Create index for fast lookups
CREATE INDEX idx_ui_action_registry_action_key ON public.ui_action_registry(action_key);
CREATE INDEX idx_ui_action_registry_enabled ON public.ui_action_registry(enabled);

-- Trigger for updated_at
CREATE TRIGGER update_ui_action_registry_updated_at
BEFORE UPDATE ON public.ui_action_registry
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.ui_action_registry IS 'Registry of all UI actions to detect dead buttons and ensure backend connectivity';