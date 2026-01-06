import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deriveTenantFromJWT, assertTenantAccess, getServiceClient } from '../_shared/assertTenantAccess.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    // Step 1: Derive tenant_id + user_id from JWT
    const derived = await deriveTenantFromJWT(authHeader);
    if (derived.error) {
      console.log('[gmail-tenant-mapping] JWT derivation failed');
      return derived.error;
    }

    const { tenant_id: actorTenantId, user_id: userId } = derived;

    if (!actorTenantId) {
      console.log('[gmail-tenant-mapping] No active tenant membership for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - No active tenant membership' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Assert tenant access (validates membership or platform admin)
    const accessResult = await assertTenantAccess(authHeader, actorTenantId);
    if (!accessResult.allowed) {
      console.log('[gmail-tenant-mapping] Tenant access denied:', accessResult.reason);
      return accessResult.response!;
    }

    // Step 3: Get service client AFTER security checks pass
    const serviceClient = getServiceClient();

    // Step 4: Check platform admin status
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('[gmail-tenant-mapping] Error checking admin status:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.is_platform_admin) {
      console.log('[gmail-tenant-mapping] Access denied - user is not platform admin:', userId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Verify actor's tenant is in internal release channel
    const { data: actorTenant, error: tenantError } = await serviceClient
      .from('tenants')
      .select('id, release_channel')
      .eq('id', actorTenantId)
      .single();

    if (tenantError || !actorTenant) {
      console.error('[gmail-tenant-mapping] Error fetching actor tenant:', tenantError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify tenant' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (actorTenant.release_channel !== 'internal') {
      console.log('[gmail-tenant-mapping] Access denied - actor tenant not in internal channel:', actorTenant.release_channel);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Internal release channel required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[gmail-tenant-mapping] Platform admin in internal channel verified:', userId, 'tenant:', actorTenantId);

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // Get actor email for audit logging
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } }
    });
    const { data: { user } } = await userClient.auth.getUser();
    const actorEmail = user?.email || 'unknown';

    if (action === 'list') {
      // Fetch gmail_tokens and tenants
      const [tokensRes, tenantsRes] = await Promise.all([
        serviceClient
          .from('gmail_tokens')
          .select('id, user_email, tenant_id, created_at, updated_at')
          .order('created_at', { ascending: false }),
        serviceClient
          .from('tenants')
          .select('id, name, slug')
          .order('name')
      ]);

      if (tokensRes.error) {
        console.error('[gmail-tenant-mapping] Error fetching tokens:', tokensRes.error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch Gmail tokens' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (tenantsRes.error) {
        console.error('[gmail-tenant-mapping] Error fetching tenants:', tenantsRes.error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch tenants' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[gmail-tenant-mapping] Returning ${tokensRes.data?.length || 0} tokens, ${tenantsRes.data?.length || 0} tenants`);

      return new Response(
        JSON.stringify({ 
          tokens: tokensRes.data || [],
          tenants: tenantsRes.data || []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'update') {
      const tokenId = body.token_id as string;
      const newTenantId = body.tenant_id as string | null;

      if (!tokenId) {
        return new Response(
          JSON.stringify({ error: 'Missing token_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch current token state for audit log
      const { data: currentToken, error: fetchError } = await serviceClient
        .from('gmail_tokens')
        .select('id, user_email, tenant_id')
        .eq('id', tokenId)
        .single();

      if (fetchError || !currentToken) {
        console.error('[gmail-tenant-mapping] Token not found:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Token not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update the token
      const { error: updateError } = await serviceClient
        .from('gmail_tokens')
        .update({ 
          tenant_id: newTenantId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      if (updateError) {
        console.error('[gmail-tenant-mapping] Update failed:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get tenant names for audit notes
      let oldTenantName = 'None';
      let newTenantName = 'None';
      
      const tenantIdsToFetch = [currentToken.tenant_id, newTenantId].filter(Boolean) as string[];
      if (tenantIdsToFetch.length > 0) {
        const { data: tenantNames } = await serviceClient
          .from('tenants')
          .select('id, name')
          .in('id', tenantIdsToFetch);
        
        if (tenantNames) {
          oldTenantName = tenantNames.find(t => t.id === currentToken.tenant_id)?.name || 'None';
          newTenantName = tenantNames.find(t => t.id === newTenantId)?.name || 'None';
        }
      }

      // Build detailed audit notes with all mapping details
      const auditNotes = JSON.stringify({
        gmail_user_email: currentToken.user_email,
        old_tenant_id: currentToken.tenant_id || null,
        old_tenant_name: oldTenantName,
        new_tenant_id: newTenantId || null,
        new_tenant_name: newTenantName
      });

      // Log to audit_logs
      // CRITICAL: tenant_id MUST be the actor's effective tenant (derived from JWT)
      // NOT the target tenant being assigned to the gmail token
      const { error: auditError } = await serviceClient
        .from('audit_logs')
        .insert({
          entity_type: 'gmail_tokens',
          entity_id: tokenId,
          action: 'set_tenant',
          old_value: currentToken.tenant_id || null,
          new_value: newTenantId || null,
          notes: auditNotes,
          user_id: userId,
          user_name: actorEmail,
          tenant_id: actorTenantId // Actor's effective tenant - NOT the target tenant
        });

      if (auditError) {
        // Log but don't fail the operation
        console.warn('[gmail-tenant-mapping] Audit log failed:', auditError);
      } else {
        console.log('[gmail-tenant-mapping] Audit logged under actor tenant:', actorTenantId);
      }

      console.log(`[gmail-tenant-mapping] Updated token ${tokenId}: ${currentToken.tenant_id} -> ${newTenantId}`);

      return new Response(
        JSON.stringify({ 
          success: true,
          token_id: tokenId,
          old_tenant_id: currentToken.tenant_id,
          new_tenant_id: newTenantId
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "list" or "update"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[gmail-tenant-mapping] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
