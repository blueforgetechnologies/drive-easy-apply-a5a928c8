import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin-only: Start impersonation session for a tenant
// Creates a short-lived token that provides tenant-scoped context without admin privileges
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

    const { tenant_id, reason, duration_minutes } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reason || reason.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'reason is required and must be at least 10 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .select('id, name, slug')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing active session for this admin/tenant combo
    const { data: existingSession } = await serviceClient
      .from('admin_impersonation_sessions')
      .select('id')
      .eq('admin_user_id', adminCheck.user_id!)
      .eq('tenant_id', tenant_id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingSession) {
      return new Response(
        JSON.stringify({ error: 'You already have an active impersonation session for this tenant' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Max duration is 60 minutes, default is 30
    const maxDuration = 60;
    const sessionDuration = Math.min(duration_minutes || 30, maxDuration);
    const expiresAt = new Date(Date.now() + sessionDuration * 60 * 1000);

    // Create impersonation session
    const { data: session, error: sessionError } = await serviceClient
      .from('admin_impersonation_sessions')
      .insert({
        admin_user_id: adminCheck.user_id,
        tenant_id,
        reason: reason.trim(),
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      console.error('[admin-start-impersonation] Error creating session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create impersonation session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-start-impersonation] Admin ${adminCheck.user_id} started impersonation of tenant ${tenant_id} (${tenant.slug}). Session: ${session.id}, expires: ${expiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        session: {
          id: session.id,
          tenant_id: session.tenant_id,
          tenant_name: tenant.name,
          tenant_slug: tenant.slug,
          expires_at: session.expires_at,
          duration_minutes: sessionDuration
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-start-impersonation] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});