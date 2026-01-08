-- =============================================
-- FREIGHTTMS MIGRATION - PART 3 OF 3
-- FUNCTIONS, TRIGGERS, AND RLS POLICIES
-- Run this THIRD in your Supabase SQL Editor
-- =============================================

-- =============================================
-- SECTION 1: REMAINING TABLES
-- =============================================

-- Email processing queue
CREATE TABLE public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT NOT NULL,
  gmail_history_id TEXT,
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  dedupe_key TEXT,
  payload_url TEXT,
  to_email TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  from_email TEXT,
  from_name TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE
);
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- Gmail tokens
CREATE TABLE public.gmail_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

-- PubSub tracking
CREATE TABLE public.pubsub_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  history_id TEXT,
  email_address TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.pubsub_tracking ENABLE ROW LEVEL SECURITY;

-- Processing state
CREATE TABLE public.processing_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.processing_state ENABLE ROW LEVEL SECURITY;

-- Billing tables
CREATE TABLE public.billing_customers (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan_id UUID REFERENCES public.plans(id),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usage tracking tables
CREATE TABLE public.ai_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  user_id UUID,
  feature TEXT DEFAULT 'unknown'
);
ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.geocoding_api_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  user_id UUID,
  location_query TEXT,
  was_cache_hit BOOLEAN DEFAULT false
);
ALTER TABLE public.geocoding_api_tracking ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.directions_api_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  load_id TEXT,
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM')
);
ALTER TABLE public.directions_api_tracking ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_send_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  email_type TEXT NOT NULL,
  recipient_email TEXT,
  success BOOLEAN DEFAULT true
);
ALTER TABLE public.email_send_tracking ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_volume_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hour_start TIMESTAMP WITH TIME ZONE NOT NULL,
  emails_received INTEGER NOT NULL DEFAULT 0,
  emails_processed INTEGER NOT NULL DEFAULT 0,
  emails_pending INTEGER NOT NULL DEFAULT 0,
  emails_failed INTEGER NOT NULL DEFAULT 0,
  avg_processing_time_ms INTEGER,
  matches_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.email_volume_stats ENABLE ROW LEVEL SECURITY;

-- Geocode cache
CREATE TABLE public.geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key TEXT NOT NULL UNIQUE,
  city TEXT,
  state TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  hit_count INTEGER DEFAULT 1,
  month_created TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.geocode_cache_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  total_locations INTEGER NOT NULL DEFAULT 0,
  total_hits INTEGER NOT NULL DEFAULT 0,
  new_locations_today INTEGER NOT NULL DEFAULT 0,
  hits_today INTEGER NOT NULL DEFAULT 0,
  estimated_savings NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.geocode_cache_daily_stats ENABLE ROW LEVEL SECURITY;

-- Mapbox usage
CREATE TABLE public.mapbox_monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  api_type TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  estimated_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(month_year, api_type)
);
ALTER TABLE public.mapbox_monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mapbox_billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL UNIQUE,
  total_requests INTEGER DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  geocoding_requests INTEGER DEFAULT 0,
  directions_requests INTEGER DEFAULT 0,
  static_map_requests INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.mapbox_billing_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.map_load_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  user_id UUID,
  view_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.map_load_tracking ENABLE ROW LEVEL SECURITY;

-- Spend alerts
CREATE TABLE public.spend_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  threshold_amount NUMERIC NOT NULL,
  current_amount NUMERIC DEFAULT 0,
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP WITH TIME ZONE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.spend_alerts ENABLE ROW LEVEL SECURITY;

-- GCP usage baselines
CREATE TABLE public.gcp_usage_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_days INTEGER NOT NULL,
  notes TEXT,
  source TEXT DEFAULT 'gcp_console',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT
);
ALTER TABLE public.gcp_usage_baselines ENABLE ROW LEVEL SECURITY;

-- Cleanup job logs
CREATE TABLE public.cleanup_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  records_affected INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER
);
ALTER TABLE public.cleanup_job_logs ENABLE ROW LEVEL SECURITY;

-- Usage meter events
CREATE TABLE public.usage_meter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.usage_meter_events ENABLE ROW LEVEL SECURITY;

-- Screen share sessions
CREATE TABLE public.screen_share_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL UNIQUE,
  host_user_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.screen_share_sessions ENABLE ROW LEVEL SECURITY;

-- UI action registry
CREATE TABLE public.ui_action_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key TEXT NOT NULL UNIQUE,
  action_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_enabled BOOLEAN DEFAULT true,
  requires_confirmation BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.ui_action_registry ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 2: CORE FUNCTIONS
-- =============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Alias for is_platform_admin
CREATE OR REPLACE FUNCTION public.is_user_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Check if user is tenant member
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
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

-- Check if user can access tenant
CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    is_platform_admin(_user_id) 
    OR is_tenant_member(_user_id, _tenant_id)
$$;

-- Get user's tenant ID
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
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

-- Get current tenant ID from auth context
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_users
  WHERE user_id = v_user_id AND is_active = true
  LIMIT 1;
  
  RETURN v_tenant_id;
END;
$$;

-- Get default tenant ID
CREATE OR REPLACE FUNCTION public.get_default_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1
$$;

-- Check tenant role
CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id UUID, _tenant_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
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

-- Check if email is invited
CREATE OR REPLACE FUNCTION public.is_email_invited(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invites
    WHERE LOWER(email) = LOWER(check_email)
    AND accepted_at IS NULL
  )
$$;

-- Check permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 
      FROM user_custom_roles ucr
      JOIN role_permissions rp ON rp.role_id = ucr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ucr.user_id = _user_id AND p.code = _permission_code
    )
$$;

-- Can manage roles
CREATE OR REPLACE FUNCTION public.can_manage_roles(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(_user_id, 'admin'::app_role) 
    OR EXISTS (
      SELECT 1 
      FROM user_custom_roles ucr
      JOIN role_permissions rp ON rp.role_id = ucr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ucr.user_id = _user_id AND p.code = 'manage_roles'
    )
$$;

-- Feature flag check
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
  SELECT * INTO v_flag FROM public.feature_flags WHERE key = _feature_key;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  IF v_flag.is_killswitch AND NOT v_flag.default_enabled THEN
    RETURN false;
  END IF;
  
  SELECT * INTO v_override 
  FROM public.tenant_feature_flags 
  WHERE tenant_id = _tenant_id AND feature_flag_id = v_flag.id;
  
  IF FOUND THEN
    IF v_override.enabled_for_roles IS NOT NULL AND array_length(v_override.enabled_for_roles, 1) > 0 THEN
      IF _user_role IS NULL OR NOT (_user_role = ANY(v_override.enabled_for_roles)) THEN
        RETURN false;
      END IF;
    END IF;
    RETURN v_override.enabled;
  END IF;
  
  RETURN v_flag.default_enabled;
END;
$$;

-- Can access feature (per-user check)
CREATE OR REPLACE FUNCTION public.can_access_feature(p_user_id UUID, p_tenant_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    is_platform_admin(p_user_id)
    OR
    EXISTS (
      SELECT 1 
      FROM public.tenant_feature_access 
      WHERE tenant_id = p_tenant_id 
        AND user_id = p_user_id 
        AND feature_key = p_feature_key 
        AND is_enabled = true
    )
$$;

-- =============================================
-- SECTION 3: UTILITY FUNCTIONS
-- =============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Handle new user (create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_exists BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  
  SELECT EXISTS (
    SELECT 1 FROM public.invites 
    WHERE email = new.email AND accepted_at IS NULL
  ) INTO invite_exists;
  
  IF invite_exists THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin');
    
    UPDATE public.invites 
    SET accepted_at = now()
    WHERE email = new.email;
  END IF;
  
  RETURN new;
END;
$$;

-- Generate load ID for date
CREATE OR REPLACE FUNCTION public.generate_load_id_for_date(target_date TIMESTAMP WITH TIME ZONE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_prefix TEXT;
  seq_val INTEGER;
BEGIN
  date_prefix := 'LH-' || TO_CHAR(target_date, 'YYMMDD');
  seq_val := nextval('load_email_seq');
  RETURN date_prefix || '-' || seq_val::TEXT;
END;
$$;

-- Set load ID trigger function
CREATE OR REPLACE FUNCTION public.set_load_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.load_id IS NULL THEN
    NEW.load_id := generate_load_id_for_date(NEW.received_at);
  END IF;
  RETURN NEW;
END;
$$;

-- Accept tenant invitation
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  SELECT * INTO v_invitation 
  FROM public.tenant_invitations 
  WHERE token = p_token 
    AND accepted_at IS NULL 
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;
  
  IF LOWER(v_invitation.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation is for a different email address');
  END IF;
  
  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (v_invitation.tenant_id, v_user_id, v_invitation.role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = v_invitation.role, is_active = true;
  
  UPDATE public.tenant_invitations 
  SET accepted_at = now() 
  WHERE id = v_invitation.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'tenant_id', v_invitation.tenant_id,
    'role', v_invitation.role
  );
END;
$$;

-- =============================================
-- SECTION 4: TRIGGERS
-- =============================================

-- Create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loads_updated_at
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carriers_updated_at
  BEFORE UPDATE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dispatchers_updated_at
  BEFORE UPDATE ON public.dispatchers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_load_emails_updated_at
  BEFORE UPDATE ON public.load_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Set load ID on insert
CREATE TRIGGER set_load_email_load_id
  BEFORE INSERT ON public.load_emails
  FOR EACH ROW EXECUTE FUNCTION public.set_load_id();

-- =============================================
-- SECTION 5: RLS POLICIES - PROFILES & USERS
-- =============================================

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Platform admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_user_platform_admin(auth.uid()));

-- User roles policies
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- SECTION 6: RLS POLICIES - TENANTS
-- =============================================

-- Tenants policies
CREATE POLICY "Users can view their tenants"
  ON public.tenants FOR SELECT
  USING (
    is_platform_admin(auth.uid()) 
    OR EXISTS (
      SELECT 1 FROM tenant_users 
      WHERE tenant_users.tenant_id = tenants.id 
      AND tenant_users.user_id = auth.uid() 
      AND tenant_users.is_active = true
    )
  );

CREATE POLICY "Platform admins can manage tenants"
  ON public.tenants FOR ALL
  USING (is_platform_admin(auth.uid()));

-- Tenant users policies
CREATE POLICY "Users can view their tenant memberships"
  ON public.tenant_users FOR SELECT
  USING (
    user_id = auth.uid() 
    OR is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = tenant_users.tenant_id 
      AND tu.user_id = auth.uid() 
      AND tu.role IN ('owner', 'admin')
    )
  );

-- Admin impersonation sessions
CREATE POLICY "Platform admins can view impersonation sessions"
  ON public.admin_impersonation_sessions FOR SELECT
  USING (is_user_platform_admin(auth.uid()));

-- =============================================
-- SECTION 7: RLS POLICIES - TENANT-SCOPED DATA
-- =============================================

-- Generic tenant access policy template (apply to all tenant-owned tables)
-- For each table with tenant_id, create policies like:

-- Loads
CREATE POLICY "Users can view loads in their tenant"
  ON public.loads FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can insert loads in their tenant"
  ON public.loads FOR INSERT
  WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can update loads in their tenant"
  ON public.loads FOR UPDATE
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can delete loads in their tenant"
  ON public.loads FOR DELETE
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Vehicles
CREATE POLICY "Users can view vehicles in their tenant"
  ON public.vehicles FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage vehicles in their tenant"
  ON public.vehicles FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Customers
CREATE POLICY "Users can view customers in their tenant"
  ON public.customers FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage customers in their tenant"
  ON public.customers FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Carriers
CREATE POLICY "Users can view carriers in their tenant"
  ON public.carriers FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage carriers in their tenant"
  ON public.carriers FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Dispatchers
CREATE POLICY "Users can view dispatchers in their tenant"
  ON public.dispatchers FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage dispatchers in their tenant"
  ON public.dispatchers FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Load emails
CREATE POLICY "Users can view load_emails in their tenant"
  ON public.load_emails FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage load_emails in their tenant"
  ON public.load_emails FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Hunt plans
CREATE POLICY "Users can view hunt_plans in their tenant"
  ON public.hunt_plans FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage hunt_plans in their tenant"
  ON public.hunt_plans FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Invoices
CREATE POLICY "Users can view invoices in their tenant"
  ON public.invoices FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage invoices in their tenant"
  ON public.invoices FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Settlements
CREATE POLICY "Users can view settlements in their tenant"
  ON public.settlements FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage settlements in their tenant"
  ON public.settlements FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Payees
CREATE POLICY "Users can view payees in their tenant"
  ON public.payees FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage payees in their tenant"
  ON public.payees FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Expenses
CREATE POLICY "Users can view expenses in their tenant"
  ON public.expenses FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can manage expenses in their tenant"
  ON public.expenses FOR ALL
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Audit logs
CREATE POLICY "Users can view audit_logs in their tenant"
  ON public.audit_logs FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Applications  
CREATE POLICY "Applications require valid invite"
  ON public.applications FOR INSERT
  WITH CHECK (
    invite_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM driver_invites 
      WHERE driver_invites.id = invite_id
    )
  );

CREATE POLICY "Tenant users can view applications"
  ON public.applications FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

-- =============================================
-- SECTION 8: STORAGE BUCKETS
-- =============================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('load-documents', 'load-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('email-payloads', 'email-payloads', false);

-- Storage policies
CREATE POLICY "Public can view company logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can upload company logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view load documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'load-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload load documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'load-documents' AND auth.role() = 'authenticated');

-- =============================================
-- SECTION 9: CREATE DEFAULT TENANT
-- =============================================

INSERT INTO public.tenants (name, slug, release_channel, status)
VALUES ('Default', 'default', 'general', 'active')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- SECTION 10: SEED FEATURE FLAGS
-- =============================================

INSERT INTO public.feature_flags (key, name, description, default_enabled) VALUES
  ('load_hunter', 'Load Hunter', 'Email-based load matching system', true),
  ('fleet_financials', 'Fleet Financials', 'Financial tracking and reporting', true),
  ('inspector', 'Inspector Tools', 'Platform admin inspector tools', false),
  ('realtime_tracking', 'Realtime Tracking', 'Live vehicle location tracking', true),
  ('settlements', 'Settlements', 'Driver/carrier settlement processing', true),
  ('invoicing', 'Invoicing', 'Customer invoicing system', true)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- END OF PART 3
-- =============================================
-- Your database is now fully set up!
