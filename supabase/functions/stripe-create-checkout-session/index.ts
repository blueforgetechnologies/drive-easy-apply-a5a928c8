import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create Stripe checkout session for tenant self-serve upgrade
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[stripe-create-checkout] Missing STRIPE_SECRET_KEY');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const { plan_code, success_url, cancel_url } = await req.json();
    
    if (!plan_code) {
      return new Response(
        JSON.stringify({ error: 'plan_code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's tenant
    const { data: membership, error: membershipError } = await serviceClient
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ error: 'No tenant membership found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow admin/owner to upgrade
    if (!['admin', 'owner'].includes(membership.role || '')) {
      return new Response(
        JSON.stringify({ error: 'Only admins can manage billing' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = membership.tenant_id;

    // Get tenant details
    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .select('id, name, slug')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get plan with Stripe price
    const { data: plan, error: planError } = await serviceClient
      .from('plans')
      .select('id, code, name, stripe_price_id_base')
      .eq('code', plan_code)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!plan.stripe_price_id_base) {
      return new Response(
        JSON.stringify({ error: 'Plan has no Stripe price configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if tenant already has a Stripe customer
    const { data: existingCustomer } = await serviceClient
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // Create Stripe checkout session
    const checkoutParams: Record<string, unknown> = {
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id_base, quantity: 1 }],
      success_url: success_url || `${req.headers.get('origin')}/dashboard/settings?tab=billing&success=true`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/dashboard/settings?tab=billing&canceled=true`,
      metadata: { tenant_id: tenantId, plan_code: plan.code },
      subscription_data: {
        metadata: { tenant_id: tenantId, plan_code: plan.code }
      }
    };

    if (existingCustomer?.stripe_customer_id) {
      checkoutParams.customer = existingCustomer.stripe_customer_id;
    } else {
      checkoutParams.customer_email = user.email;
      checkoutParams.customer_creation = 'always';
    }

    // Call Stripe API
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(flattenForStripe(checkoutParams)).toString(),
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.json();
      console.error('[stripe-create-checkout] Stripe error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const session = await stripeResponse.json();
    console.log(`[stripe-create-checkout] Created session ${session.id} for tenant ${tenantId}`);

    return new Response(
      JSON.stringify({ 
        checkout_url: session.url,
        session_id: session.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[stripe-create-checkout] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper to flatten nested objects for Stripe's form encoding
function flattenForStripe(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}[${key}]` : key;
    
    if (value === null || value === undefined) {
      continue;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenForStripe(item as Record<string, unknown>, `${newKey}[${index}]`));
        } else {
          result[`${newKey}[${index}]`] = String(item);
        }
      });
    } else if (typeof value === 'object') {
      Object.assign(result, flattenForStripe(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = String(value);
    }
  }
  
  return result;
}