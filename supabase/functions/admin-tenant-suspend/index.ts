import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin-only: Suspend or unsuspend a tenant
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

    const { tenant_id, suspend, reason } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof suspend !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'suspend must be a boolean' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify tenant exists
    const { data: existingTenant, error: fetchError } = await serviceClient
      .from('tenants')
      .select('id, name, status, is_paused')
      .eq('id', tenant_id)
      .single();

    if (fetchError || !existingTenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update tenant status
    const { data: updatedTenant, error: updateError } = await serviceClient
      .from('tenants')
      .update({
        status: suspend ? 'suspended' : 'active',
        is_paused: suspend
      })
      .eq('id', tenant_id)
      .select()
      .single();

    if (updateError) {
      console.error('[admin-tenant-suspend] Error updating tenant:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update tenant status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const action = suspend ? 'suspended' : 'unsuspended';
    console.log(`[admin-tenant-suspend] Tenant ${tenant_id} ${action} by admin ${adminCheck.user_id}. Reason: ${reason || 'Not provided'}`);

    // Log to audit (tenant_audit_log is triggered automatically)

    return new Response(
      JSON.stringify({ 
        success: true, 
        tenant_id,
        action,
        status: updatedTenant.status,
        is_paused: updatedTenant.is_paused
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-tenant-suspend] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});