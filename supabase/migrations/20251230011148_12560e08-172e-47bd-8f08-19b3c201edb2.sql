-- =====================================================
-- PHASE 1: MULTI-TENANT FOUNDATION (Complete)
-- =====================================================

-- 1. Create tenant status enum
CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial', 'churned');

-- 2. Create release channel enum for staged rollouts
CREATE TYPE public.release_channel AS ENUM ('internal', 'pilot', 'general');

-- 3. Create tenants table (core multi-tenancy)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status tenant_status NOT NULL DEFAULT 'trial',
    release_channel release_channel NOT NULL DEFAULT 'general',
    api_key TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    api_key_hash TEXT,
    settings JSONB DEFAULT '{}',
    webhook_secret TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
    rate_limit_per_minute INTEGER DEFAULT 1000,
    is_paused BOOLEAN DEFAULT false,
    max_users INTEGER DEFAULT 50,
    max_vehicles INTEGER DEFAULT 100,
    max_hunt_plans INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create tenant_users junction table
CREATE TABLE public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'dispatcher',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 5. Create feature_flags table (global definitions)
CREATE TABLE public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    default_enabled BOOLEAN DEFAULT false,
    requires_role TEXT[] DEFAULT '{}',
    is_killswitch BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create tenant_feature_flags (per-tenant overrides)
CREATE TABLE public.tenant_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    enabled_for_roles TEXT[] DEFAULT NULL,
    enabled_by UUID REFERENCES auth.users(id),
    enabled_at TIMESTAMPTZ DEFAULT now(),
    notes TEXT,
    UNIQUE(tenant_id, feature_flag_id)
);

-- 7. Create feature_flag_audit_log
CREATE TABLE public.feature_flag_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    feature_flag_id UUID REFERENCES public.feature_flags(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address TEXT
);

-- 8. Create helper function to get user's current tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id 
    FROM public.tenant_users 
    WHERE user_id = _user_id 
      AND is_active = true 
    LIMIT 1
$$;

-- 9. Create helper function to check tenant membership
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_users 
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id 
          AND is_active = true
    )
$$;

-- 10. Create helper function to check if user is platform admin
-- Uses TEXT comparison to work with admin role (existing enum value)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = _user_id 
          AND role::text = 'admin'
    )
$$;

-- 11. Create helper to check tenant role
CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id UUID, _tenant_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_users 
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id 
          AND role = _role 
          AND is_active = true
    )
$$;

-- 12. Create function to check feature flag for tenant
CREATE OR REPLACE FUNCTION public.is_feature_enabled(_tenant_id UUID, _feature_key TEXT, _user_role TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_flag RECORD;
    v_override RECORD;
BEGIN
    -- Get the feature flag definition
    SELECT * INTO v_flag FROM public.feature_flags WHERE key = _feature_key;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check killswitch (globally disabled)
    IF v_flag.is_killswitch AND NOT v_flag.default_enabled THEN
        RETURN false;
    END IF;
    
    -- Get tenant-specific override
    SELECT * INTO v_override 
    FROM public.tenant_feature_flags 
    WHERE tenant_id = _tenant_id AND feature_flag_id = v_flag.id;
    
    -- If tenant override exists, use it
    IF FOUND THEN
        -- Check role restriction if applicable
        IF v_override.enabled_for_roles IS NOT NULL AND array_length(v_override.enabled_for_roles, 1) > 0 THEN
            IF _user_role IS NULL OR NOT (_user_role = ANY(v_override.enabled_for_roles)) THEN
                RETURN false;
            END IF;
        END IF;
        RETURN v_override.enabled;
    END IF;
    
    -- Otherwise use default
    RETURN v_flag.default_enabled;
END;
$$;

-- 13. Enable RLS on all new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_audit_log ENABLE ROW LEVEL SECURITY;

-- 14. RLS Policies for tenants table
CREATE POLICY "Platform admins can view all tenants"
ON public.tenants FOR SELECT
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can insert tenants"
ON public.tenants FOR INSERT
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update tenants"
ON public.tenants FOR UPDATE
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete tenants"
ON public.tenants FOR DELETE
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Tenant members can view own tenant"
ON public.tenants FOR SELECT
USING (is_tenant_member(auth.uid(), id));

-- 15. RLS Policies for tenant_users table
CREATE POLICY "Platform admins can manage all tenant users"
ON public.tenant_users FOR ALL
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Tenant admins can view tenant users"
ON public.tenant_users FOR SELECT
USING (
    is_tenant_member(auth.uid(), tenant_id) 
    OR has_tenant_role(auth.uid(), tenant_id, 'tenant_admin')
);

CREATE POLICY "Tenant admins can manage tenant users"
ON public.tenant_users FOR ALL
USING (has_tenant_role(auth.uid(), tenant_id, 'tenant_admin'));

-- 16. RLS Policies for feature_flags (global definitions - admin only)
CREATE POLICY "Platform admins can manage feature flags"
ON public.feature_flags FOR ALL
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view feature flags"
ON public.feature_flags FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 17. RLS Policies for tenant_feature_flags
CREATE POLICY "Platform admins can manage all tenant feature flags"
ON public.tenant_feature_flags FOR ALL
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Tenant admins can view own feature flags"
ON public.tenant_feature_flags FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

-- 18. RLS Policies for feature_flag_audit_log
CREATE POLICY "Platform admins can view all audit logs ff"
ON public.feature_flag_audit_log FOR ALL
USING (is_platform_admin(auth.uid()));

CREATE POLICY "Tenant admins can view own feature audit logs"
ON public.feature_flag_audit_log FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id));

-- 19. Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at
    BEFORE UPDATE ON public.tenant_users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON public.feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_feature_flags_updated_at
    BEFORE UPDATE ON public.tenant_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 20. Create indexes for performance
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX idx_tenant_feature_flags_tenant ON public.tenant_feature_flags(tenant_id);
CREATE INDEX idx_feature_flag_audit_tenant ON public.feature_flag_audit_log(tenant_id);
CREATE INDEX idx_tenants_api_key ON public.tenants(api_key);
CREATE INDEX idx_tenants_slug ON public.tenants(slug);

-- 21. Insert initial feature flags for Load Hunter
INSERT INTO public.feature_flags (key, name, description, default_enabled) VALUES
    ('load_hunter', 'Load Hunter', 'Enable Load Hunter email ingestion and matching', false),
    ('load_hunter_ai_parsing', 'AI-Powered Parsing', 'Use AI for enhanced email parsing', false),
    ('load_hunter_geocoding', 'Geocoding', 'Enable location geocoding for loads', false),
    ('realtime_notifications', 'Realtime Notifications', 'Push notifications for load matches', false),
    ('bid_automation', 'Bid Automation', 'Automated bidding based on rules', false),
    ('multi_stop_loads', 'Multi-Stop Loads', 'Support for loads with multiple stops', true),
    ('fleet_financials', 'Fleet Financials', 'Financial reporting and analytics', true),
    ('driver_settlements', 'Driver Settlements', 'Driver payment settlement system', true)
ON CONFLICT (key) DO NOTHING;