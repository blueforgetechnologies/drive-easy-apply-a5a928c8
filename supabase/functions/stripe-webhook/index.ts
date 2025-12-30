import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

// Stripe webhook handler - verifies signature and upserts billing data
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!stripeSecretKey || !stripeWebhookSecret) {
      console.error('[stripe-webhook] Missing Stripe configuration');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      console.error('[stripe-webhook] Missing stripe-signature header');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.text();
    
    // Verify webhook signature using Stripe's recommended method
    const crypto = globalThis.crypto;
    const encoder = new TextEncoder();
    
    // Parse the signature header
    const sigParts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    const timestamp = sigParts['t'];
    const expectedSig = sigParts['v1'];
    
    if (!timestamp || !expectedSig) {
      console.error('[stripe-webhook] Invalid signature format');
      return new Response(
        JSON.stringify({ error: 'Invalid signature format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Verify timestamp is within tolerance (5 minutes)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error('[stripe-webhook] Timestamp too old');
      return new Response(
        JSON.stringify({ error: 'Timestamp expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(stripeWebhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (computedSig !== expectedSig) {
      console.error('[stripe-webhook] Signature verification failed');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = JSON.parse(body);
    console.log(`[stripe-webhook] Received event: ${event.type}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case 'customer.created':
      case 'customer.updated': {
        const customer = event.data.object;
        const tenantId = customer.metadata?.tenant_id;
        
        if (!tenantId) {
          console.warn('[stripe-webhook] Customer has no tenant_id in metadata');
          break;
        }
        
        const { error } = await serviceClient
          .from('billing_customers')
          .upsert({
            tenant_id: tenantId,
            stripe_customer_id: customer.id,
            email: customer.email,
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id' });
        
        if (error) {
          console.error('[stripe-webhook] Error upserting customer:', error);
        } else {
          console.log(`[stripe-webhook] Upserted billing_customer for tenant ${tenantId}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        // Look up tenant from billing_customers
        const { data: billingCustomer, error: customerError } = await serviceClient
          .from('billing_customers')
          .select('tenant_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();
        
        if (customerError || !billingCustomer) {
          console.warn('[stripe-webhook] Could not find tenant for customer:', customerId);
          break;
        }
        
        const tenantId = billingCustomer.tenant_id;
        
        // Map Stripe price to plan
        const priceId = subscription.items?.data?.[0]?.price?.id;
        let planId: string | null = null;
        
        if (priceId) {
          const { data: plan } = await serviceClient
            .from('plans')
            .select('id')
            .eq('stripe_price_id_base', priceId)
            .maybeSingle();
          
          planId = plan?.id || null;
        }
        
        const { error } = await serviceClient
          .from('billing_subscriptions')
          .upsert({
            tenant_id: tenantId,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            plan_id: planId,
            current_period_start: subscription.current_period_start 
              ? new Date(subscription.current_period_start * 1000).toISOString() 
              : null,
            current_period_end: subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000).toISOString() 
              : null,
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            canceled_at: subscription.canceled_at 
              ? new Date(subscription.canceled_at * 1000).toISOString() 
              : null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'stripe_subscription_id' });
        
        if (error) {
          console.error('[stripe-webhook] Error upserting subscription:', error);
        } else {
          console.log(`[stripe-webhook] Upserted subscription for tenant ${tenantId}, status: ${subscription.status}`);
          
          // Update tenant's plan_id if subscription is active
          if (planId && (subscription.status === 'active' || subscription.status === 'trialing')) {
            await serviceClient
              .from('tenants')
              .update({ plan_id: planId })
              .eq('id', tenantId);
          }
        }
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`[stripe-webhook] Invoice ${invoice.id} payment ${event.type === 'invoice.payment_succeeded' ? 'succeeded' : 'failed'}`);
        // Could track payment history here if needed
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[stripe-webhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});