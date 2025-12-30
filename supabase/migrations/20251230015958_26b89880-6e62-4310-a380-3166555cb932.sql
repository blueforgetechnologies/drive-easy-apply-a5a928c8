-- Insert Load Hunter feature flags
INSERT INTO public.feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES 
  ('load_hunter_enabled', 'Load Hunter', 'Enable Load Hunter email ingestion for this tenant', true, false),
  ('load_hunter_matching', 'Load Hunter Matching', 'Enable automatic load-to-hunt matching', true, false),
  ('load_hunter_bidding', 'Load Hunter Bidding', 'Enable bid submission from Load Hunter', true, false)
ON CONFLICT (key) DO NOTHING;

-- Create tenant feature flag overrides if not exists
CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  feature_flag_id uuid REFERENCES public.feature_flags(id) ON DELETE CASCADE NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  enabled_for_roles text[] DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, feature_flag_id)
);

-- Enable RLS
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all tenant feature flags
CREATE POLICY "Platform admins can manage tenant feature flags"
ON public.tenant_feature_flags
FOR ALL
USING (is_platform_admin(auth.uid()));

-- Tenant admins can view their own feature flags
CREATE POLICY "Tenant members can view their feature flags"
ON public.tenant_feature_flags
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_lookup 
ON public.tenant_feature_flags(tenant_id, feature_flag_id);