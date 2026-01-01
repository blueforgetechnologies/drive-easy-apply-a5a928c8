import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Validates an impersonation session is:
 * 1. Active (not revoked)
 * 2. Not expired
 * 3. Owned by the requesting platform admin
 * 
 * Returns authoritative tenant info if valid, or null if invalid.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require platform admin
    const authHeader = req.headers.get('Authorization');
    const adminCheck = await assertPlatformAdmin(authHeader);
    
    if (!adminCheck.allowed) {
      return adminCheck.response!;
    }

    const adminUserId = adminCheck.user_id!;

    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: { session_id: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { session_id } = body;
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'session_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Query the session with tenant join
    const { data: session, error: sessionError } = await serviceClient
      .from('admin_impersonation_sessions')
      .select(`
        id,
        admin_user_id,
        tenant_id,
        expires_at,
        revoked_at,
        reason,
        tenant:tenants (
          id,
          name,
          slug,
          release_channel,
          status
        )
      `)
      .eq('id', session_id)
      .maybeSingle();

    if (sessionError) {
      console.error('[admin-get-impersonation-session] Query error:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to query session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Session not found
    if (!session) {
      console.log(`[admin-get-impersonation-session] Session ${session_id} not found`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'session_not_found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Session not owned by this admin
    if (session.admin_user_id !== adminUserId) {
      console.log(`[admin-get-impersonation-session] Session ${session_id} not owned by admin ${adminUserId}`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'not_owner' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Session revoked
    if (session.revoked_at) {
      console.log(`[admin-get-impersonation-session] Session ${session_id} was revoked`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'revoked' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Session expired
    const expiresAt = new Date(session.expires_at).getTime();
    if (expiresAt <= Date.now()) {
      console.log(`[admin-get-impersonation-session] Session ${session_id} has expired`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tenant not found (shouldn't happen but safety check)
    const tenant = session.tenant as unknown as { id: string; name: string; slug: string; release_channel: string; status: string } | null;
    if (!tenant) {
      console.log(`[admin-get-impersonation-session] Tenant for session ${session_id} not found`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'tenant_not_found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-get-impersonation-session] Session ${session_id} is valid, tenant: ${tenant.name}`);

    // Return authoritative session info
    return new Response(
      JSON.stringify({
        valid: true,
        session: {
          id: session.id,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          tenant_slug: tenant.slug,
          release_channel: tenant.release_channel,
          status: tenant.status,
          expires_at: session.expires_at,
          reason: session.reason,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-get-impersonation-session] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
