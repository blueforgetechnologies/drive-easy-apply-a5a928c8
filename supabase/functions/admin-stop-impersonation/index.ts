import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin-only: Stop/revoke an impersonation session
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

    const { session_id, tenant_id } = await req.json();

    if (!session_id && !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'session_id or tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    let query = serviceClient
      .from('admin_impersonation_sessions')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: adminCheck.user_id
      })
      .is('revoked_at', null);

    if (session_id) {
      // Revoke specific session
      query = query.eq('id', session_id);
    } else {
      // Revoke all active sessions for this admin on this tenant
      query = query
        .eq('admin_user_id', adminCheck.user_id!)
        .eq('tenant_id', tenant_id);
    }

    const { data: revokedSessions, error: revokeError } = await query.select();

    if (revokeError) {
      console.error('[admin-stop-impersonation] Error revoking session:', revokeError);
      return new Response(
        JSON.stringify({ error: 'Failed to revoke impersonation session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const revokedCount = revokedSessions?.length || 0;

    if (revokedCount === 0) {
      return new Response(
        JSON.stringify({ error: 'No active sessions found to revoke' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-stop-impersonation] Admin ${adminCheck.user_id} revoked ${revokedCount} impersonation session(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        revoked_count: revokedCount,
        revoked_sessions: revokedSessions?.map(s => s.id)
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-stop-impersonation] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});