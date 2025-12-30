-- =====================================================
-- PHASE 5: Business Layer - Billing, Plans & Impersonation
-- =====================================================

-- 1. Plans table (defines available subscription plans)
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  stripe_price_id_base text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Plans are readable by authenticated users
CREATE POLICY "Authenticated users can view active plans"
ON public.plans FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Platform admins can manage all plans
CREATE POLICY "Platform admins can manage plans"
ON public.plans FOR ALL
USING (is_user_platform_admin(auth.uid()));

-- 2. Plan Features table (what features each plan includes)
CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  limit_value integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(plan_id, feature_key)
);

-- Enable RLS
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

-- Plan features are readable by authenticated users
CREATE POLICY "Authenticated users can view plan features"
ON public.plan_features FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Platform admins can manage plan features
CREATE POLICY "Platform admins can manage plan features"
ON public.plan_features FOR ALL
USING (is_user_platform_admin(auth.uid()));

-- 3. Billing Customers table (links tenants to Stripe customers)
CREATE TABLE public.billing_customers (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE NOT NULL,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their billing customer (summary only)
CREATE POLICY "Tenant members can view their billing customer"
ON public.billing_customers FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR is_user_platform_admin(auth.uid()));

-- Only service role can write (via edge functions)
-- No INSERT/UPDATE/DELETE policies for regular users

-- 4. Billing Subscriptions table
CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  plan_id uuid REFERENCES public.plans(id),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their subscriptions
CREATE POLICY "Tenant members can view their subscriptions"
ON public.billing_subscriptions FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR is_user_platform_admin(auth.uid()));

-- Only service role can write (via Stripe webhook)

-- 5. Usage Meter Events table (for metered billing)
CREATE TABLE public.usage_meter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  source text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.usage_meter_events ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their usage
CREATE POLICY "Tenant members can view their usage"
ON public.usage_meter_events FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR is_user_platform_admin(auth.uid()));

-- Only service role can write

-- Create index for efficient querying
CREATE INDEX idx_usage_meter_events_tenant_type ON public.usage_meter_events(tenant_id, event_type, created_at DESC);

-- 6. Admin Impersonation Sessions table
CREATE TABLE public.admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all impersonation sessions
CREATE POLICY "Platform admins can view impersonation sessions"
ON public.admin_impersonation_sessions FOR SELECT
USING (is_user_platform_admin(auth.uid()));

-- Only service role can write

-- Create indexes
CREATE INDEX idx_impersonation_sessions_admin ON public.admin_impersonation_sessions(admin_user_id, created_at DESC);
CREATE INDEX idx_impersonation_sessions_tenant ON public.admin_impersonation_sessions(tenant_id, created_at DESC);
CREATE INDEX idx_impersonation_sessions_active ON public.admin_impersonation_sessions(expires_at) WHERE revoked_at IS NULL;

-- 7. Add plan_id to tenants table
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id);

-- 8. Insert default plans
INSERT INTO public.plans (code, name, description, is_active, sort_order) VALUES
  ('free', 'Free', 'Basic features for small operations', true, 0),
  ('starter', 'Starter', 'Essential features for growing teams', true, 1),
  ('professional', 'Professional', 'Advanced features for established operations', true, 2),
  ('enterprise', 'Enterprise', 'Full platform access with premium support', true, 3);

-- 9. Insert plan features (feature_key references feature_flags.key)
-- Free plan: limited features
INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'geocoding_enabled', true, 100 FROM public.plans p WHERE p.code = 'free';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'ai_parsing_enabled', false, NULL FROM public.plans p WHERE p.code = 'free';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'load_hunter_enabled', false, NULL FROM public.plans p WHERE p.code = 'free';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'bid_automation_enabled', false, NULL FROM public.plans p WHERE p.code = 'free';

-- Starter plan: core features
INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'geocoding_enabled', true, 500 FROM public.plans p WHERE p.code = 'starter';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'ai_parsing_enabled', true, 200 FROM public.plans p WHERE p.code = 'starter';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'load_hunter_enabled', true, 3 FROM public.plans p WHERE p.code = 'starter';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'bid_automation_enabled', false, NULL FROM public.plans p WHERE p.code = 'starter';

-- Professional plan: advanced features
INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'geocoding_enabled', true, 2000 FROM public.plans p WHERE p.code = 'professional';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'ai_parsing_enabled', true, 1000 FROM public.plans p WHERE p.code = 'professional';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'load_hunter_enabled', true, 10 FROM public.plans p WHERE p.code = 'professional';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'bid_automation_enabled', true, 100 FROM public.plans p WHERE p.code = 'professional';

-- Enterprise plan: unlimited
INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'geocoding_enabled', true, NULL FROM public.plans p WHERE p.code = 'enterprise';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'ai_parsing_enabled', true, NULL FROM public.plans p WHERE p.code = 'enterprise';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'load_hunter_enabled', true, NULL FROM public.plans p WHERE p.code = 'enterprise';

INSERT INTO public.plan_features (plan_id, feature_key, allowed, limit_value)
SELECT p.id, 'bid_automation_enabled', true, NULL FROM public.plans p WHERE p.code = 'enterprise';

-- 10. Create function to check plan feature access
CREATE OR REPLACE FUNCTION public.check_plan_feature_access(
  p_tenant_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_feature RECORD;
  v_result jsonb;
BEGIN
  -- Get tenant's plan
  SELECT plan_id INTO v_plan_id FROM public.tenants WHERE id = p_tenant_id;
  
  -- If no plan assigned, deny by default
  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_plan',
      'limit_value', NULL
    );
  END IF;
  
  -- Get plan feature settings
  SELECT * INTO v_plan_feature
  FROM public.plan_features
  WHERE plan_id = v_plan_id AND feature_key = p_feature_key;
  
  -- If no feature config, use plan default (allow)
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'no_restriction',
      'limit_value', NULL
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_plan_feature.allowed,
    'reason', CASE WHEN v_plan_feature.allowed THEN 'plan_allows' ELSE 'plan_blocks' END,
    'limit_value', v_plan_feature.limit_value
  );
END;
$$;

-- 11. Trigger for updated_at timestamps
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_billing_subscriptions_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();