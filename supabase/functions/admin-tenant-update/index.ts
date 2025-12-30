import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin-only: Update tenant settings (release_channel, plan, rate limits)
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

    const { 
      tenant_id, 
      release_channel, 
      plan_code, 
      rate_limit_per_minute, 
      rate_limit_per_day,
      name 
    } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify tenant exists
    const { data: existingTenant, error: fetchError } = await serviceClient
      .from('tenants')
      .select('id, name, release_channel, plan_id')
      .eq('id', tenant_id)
      .single();

    if (fetchError || !existingTenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (release_channel !== undefined) {
      if (!['general', 'pilot', 'internal'].includes(release_channel)) {
        return new Response(
          JSON.stringify({ error: 'Invalid release_channel. Must be: general, pilot, or internal' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      updates.release_channel = release_channel;
    }

    if (plan_code !== undefined) {
      if (plan_code === null) {
        updates.plan_id = null;
      } else {
        const { data: plan } = await serviceClient
          .from('plans')
          .select('id')
          .eq('code', plan_code)
          .eq('is_active', true)
          .maybeSingle();
        
        if (!plan) {
          return new Response(
            JSON.stringify({ error: 'Plan not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        updates.plan_id = plan.id;
      }
    }

    if (rate_limit_per_minute !== undefined) {
      updates.rate_limit_per_minute = rate_limit_per_minute;
    }

    if (rate_limit_per_day !== undefined) {
      updates.rate_limit_per_day = rate_limit_per_day;
    }

    if (name !== undefined) {
      updates.name = name;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No updates provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply updates
    const { data: updatedTenant, error: updateError } = await serviceClient
      .from('tenants')
      .update(updates)
      .eq('id', tenant_id)
      .select()
      .single();

    if (updateError) {
      console.error('[admin-tenant-update] Error updating tenant:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update tenant', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-tenant-update] Updated tenant ${tenant_id} by admin ${adminCheck.user_id}:`, updates);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tenant: updatedTenant,
        changes: updates
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-tenant-update] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});