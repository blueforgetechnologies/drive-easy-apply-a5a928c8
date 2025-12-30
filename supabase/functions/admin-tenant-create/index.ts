import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin-only: Create a new tenant
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

    const { name, slug, release_channel, plan_code } = await req.json();

    if (!name || !slug) {
      return new Response(
        JSON.stringify({ error: 'name and slug are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(
        JSON.stringify({ error: 'slug must contain only lowercase letters, numbers, and hyphens' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if slug already exists
    const { data: existingTenant } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingTenant) {
      return new Response(
        JSON.stringify({ error: 'A tenant with this slug already exists' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get plan_id if plan_code provided
    let planId: string | null = null;
    if (plan_code) {
      const { data: plan } = await serviceClient
        .from('plans')
        .select('id')
        .eq('code', plan_code)
        .eq('is_active', true)
        .maybeSingle();
      
      planId = plan?.id || null;
    }

    // Create tenant
    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .insert({
        name,
        slug,
        release_channel: release_channel || 'general',
        plan_id: planId,
        status: 'active',
        is_paused: false
      })
      .select()
      .single();

    if (tenantError) {
      console.error('[admin-tenant-create] Error creating tenant:', tenantError);
      return new Response(
        JSON.stringify({ error: 'Failed to create tenant', details: tenantError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-tenant-create] Created tenant ${tenant.id} (${slug}) by admin ${adminCheck.user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          release_channel: tenant.release_channel,
          plan_id: tenant.plan_id
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-tenant-create] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});