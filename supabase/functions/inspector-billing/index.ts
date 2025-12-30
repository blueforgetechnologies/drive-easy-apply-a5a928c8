import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TenantBillingInfo {
  tenant_id: string;
  tenant_name: string;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

interface PlanFeatureInfo {
  plan_code: string;
  plan_name: string;
  features: {
    feature_key: string;
    allowed: boolean;
    limit_value: number | null;
  }[];
}

interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  tenant_id: string;
  tenant_name: string;
  reason: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

// Inspector endpoint: Billing overview, plan matrix, impersonation sessions
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    // Verify platform admin
    const adminCheck = await assertPlatformAdmin(authHeader);
    if (!adminCheck.allowed) {
      return adminCheck.response!;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all data in parallel
    const [
      tenantsResult,
      plansResult,
      planFeaturesResult,
      subscriptionsResult,
      billingCustomersResult,
      impersonationResult,
      profilesResult
    ] = await Promise.all([
      serviceClient.from('tenants').select('id, name, plan_id'),
      serviceClient.from('plans').select('id, code, name, is_active, sort_order').order('sort_order'),
      serviceClient.from('plan_features').select('plan_id, feature_key, allowed, limit_value'),
      serviceClient.from('billing_subscriptions').select('tenant_id, status, current_period_end, cancel_at_period_end'),
      serviceClient.from('billing_customers').select('tenant_id, stripe_customer_id'),
      serviceClient.from('admin_impersonation_sessions')
        .select('id, admin_user_id, tenant_id, reason, created_at, expires_at, revoked_at')
        .order('created_at', { ascending: false })
        .limit(50),
      serviceClient.from('profiles').select('id, email')
    ]);

    // Build maps for efficient lookups
    const plansById = new Map(plansResult.data?.map(p => [p.id, p]) || []);
    const subscriptionsByTenant = new Map(subscriptionsResult.data?.map(s => [s.tenant_id, s]) || []);
    const billingByTenant = new Map(billingCustomersResult.data?.map(b => [b.tenant_id, b]) || []);
    const profilesById = new Map(profilesResult.data?.map(p => [p.id, p]) || []);
    const tenantsById = new Map(tenantsResult.data?.map(t => [t.id, t]) || []);

    // Build tenant billing info
    const tenantBilling: TenantBillingInfo[] = (tenantsResult.data || []).map(tenant => {
      const plan = tenant.plan_id ? plansById.get(tenant.plan_id) : null;
      const subscription = subscriptionsByTenant.get(tenant.id);
      const billing = billingByTenant.get(tenant.id);

      return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        plan_code: plan?.code || null,
        plan_name: plan?.name || null,
        subscription_status: subscription?.status || null,
        current_period_end: subscription?.current_period_end || null,
        cancel_at_period_end: subscription?.cancel_at_period_end || false,
        stripe_customer_id: billing?.stripe_customer_id || null
      };
    });

    // Build plan feature matrix
    const planFeatures: PlanFeatureInfo[] = (plansResult.data || []).map(plan => {
      const features = (planFeaturesResult.data || [])
        .filter(pf => pf.plan_id === plan.id)
        .map(pf => ({
          feature_key: pf.feature_key,
          allowed: pf.allowed,
          limit_value: pf.limit_value
        }));

      return {
        plan_code: plan.code,
        plan_name: plan.name,
        features
      };
    });

    // Build impersonation sessions
    const now = new Date();
    const impersonationSessions: ImpersonationSession[] = (impersonationResult.data || []).map(session => {
      const admin = profilesById.get(session.admin_user_id);
      const tenant = tenantsById.get(session.tenant_id);
      const expiresAt = new Date(session.expires_at);
      const isActive = !session.revoked_at && expiresAt > now;

      return {
        id: session.id,
        admin_user_id: session.admin_user_id,
        admin_email: admin?.email || null,
        tenant_id: session.tenant_id,
        tenant_name: tenant?.name || 'Unknown',
        reason: session.reason,
        created_at: session.created_at,
        expires_at: session.expires_at,
        revoked_at: session.revoked_at,
        is_active: isActive
      };
    });

    // Summary stats
    const summary = {
      total_tenants: tenantsResult.data?.length || 0,
      tenants_with_plan: tenantBilling.filter(t => t.plan_code).length,
      active_subscriptions: tenantBilling.filter(t => t.subscription_status === 'active').length,
      canceling_subscriptions: tenantBilling.filter(t => t.cancel_at_period_end).length,
      active_impersonations: impersonationSessions.filter(s => s.is_active).length
    };

    console.log(`[inspector-billing] Returning billing data: ${summary.total_tenants} tenants, ${planFeatures.length} plans`);

    return new Response(
      JSON.stringify({
        summary,
        tenant_billing: tenantBilling,
        plan_features: planFeatures,
        impersonation_sessions: impersonationSessions
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[inspector-billing] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});