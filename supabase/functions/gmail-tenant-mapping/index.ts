import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[gmail-tenant-mapping] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user identity using their JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.log('[gmail-tenant-mapping] User auth failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[gmail-tenant-mapping] User authenticated:', user.id);

    // Use service role client for privileged operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check platform admin status via profiles.is_platform_admin
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[gmail-tenant-mapping] Error checking admin status:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.is_platform_admin) {
      console.log('[gmail-tenant-mapping] Access denied - user is not platform admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check release channel - must be internal
    const { data: tenantUser, error: tenantUserError } = await serviceClient
      .from('tenant_users')
      .select('tenant_id, tenants!inner(release_channel)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (tenantUserError) {
      console.error('[gmail-tenant-mapping] Error checking release channel:', tenantUserError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify release channel' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const releaseChannel = (tenantUser?.tenants as any)?.release_channel;
    if (releaseChannel !== 'internal') {
      console.log('[gmail-tenant-mapping] Access denied - not in internal channel:', releaseChannel);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Internal release channel required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[gmail-tenant-mapping] Platform admin in internal channel verified');

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

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
      
      if (currentToken.tenant_id || newTenantId) {
        const tenantIds = [currentToken.tenant_id, newTenantId].filter(Boolean);
        const { data: tenantNames } = await serviceClient
          .from('tenants')
          .select('id, name')
          .in('id', tenantIds);
        
        if (tenantNames) {
          oldTenantName = tenantNames.find(t => t.id === currentToken.tenant_id)?.name || 'None';
          newTenantName = tenantNames.find(t => t.id === newTenantId)?.name || 'None';
        }
      }

      // Get actor's tenant_id for audit log (their active membership)
      // Use the actor's tenant if available, otherwise use the new tenant being assigned
      // This ensures we have a valid tenant_id for the audit log
      const actorTenantId = tenantUser?.tenant_id || newTenantId || currentToken.tenant_id;

      // Log to audit_logs - use actor's tenant or the affected tenant
      // IMPORTANT: Do NOT fallback to arbitrary tenant
      const auditNotes = `Gmail account ${currentToken.user_email} tenant mapping changed from "${oldTenantName}" to "${newTenantName}"`;
      
      const { error: auditError } = await serviceClient
        .from('audit_logs')
        .insert({
          entity_type: 'gmail_tokens',
          entity_id: tokenId,
          action: 'set_tenant',
          old_value: currentToken.tenant_id || 'null',
          new_value: newTenantId || 'null',
          notes: auditNotes,
          user_id: user.id,
          user_name: user.email,
          // Use actor's tenant (the admin performing the action)
          // This is the correct approach - audit under the actor's tenant
          tenant_id: actorTenantId
        });

      if (auditError) {
        // Log but don't fail the operation
        console.warn('[gmail-tenant-mapping] Audit log failed:', auditError);
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
