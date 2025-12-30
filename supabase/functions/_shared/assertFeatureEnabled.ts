import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface FeatureGateResult {
  allowed: boolean;
  reason?: string;
  response?: Response;
  tenant_id?: string;
  user_id?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Server-side feature gate helper.
 * DERIVES tenant_id from auth context (never trusts client-provided tenant_id).
 * 
 * Resolution order:
 * 1. Killswitch (if globally disabled, always OFF)
 * 2. Tenant override (if exists)
 * 3. Release channel default (from release_channel_feature_flags table)
 * 4. Global default
 * 
 * @returns FeatureGateResult with allowed=true if feature is enabled, or a 403 Response if blocked
 */
export async function assertFeatureEnabled(options: {
  flag_key: string;
  authHeader: string | null;
  overrideTenantId?: string; // ONLY for platform admins to test other tenants
}): Promise<FeatureGateResult> {
  const { flag_key, authHeader, overrideTenantId } = options;

  // Verify auth header exists
  if (!authHeader) {
    console.log('[assertFeatureEnabled] Missing authorization header');
    return {
      allowed: false,
      reason: 'Missing authorization header',
      response: new Response(
        JSON.stringify({ error: 'Unauthorized', reason: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
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
    console.log('[assertFeatureEnabled] User auth failed:', userError?.message);
    return {
      allowed: false,
      reason: 'User authentication failed',
      response: new Response(
        JSON.stringify({ error: 'Unauthorized', reason: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Use service role for privileged lookups
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // DERIVE tenant_id from user's membership (NOT from client)
  let tenant_id: string | null = null;
  let isPlatformAdmin = false;

  // Check if user is platform admin
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  isPlatformAdmin = profile?.is_platform_admin === true;

  // If platform admin and overrideTenantId provided, use that (for testing)
  if (isPlatformAdmin && overrideTenantId) {
    // Validate the override tenant exists
    const { data: tenantCheck } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('id', overrideTenantId)
      .single();
    
    if (tenantCheck) {
      tenant_id = overrideTenantId;
      console.log(`[assertFeatureEnabled] Platform admin using override tenant: ${tenant_id}`);
    }
  }

  // If no override, derive from user's tenant membership
  if (!tenant_id) {
    const { data: membership } = await serviceClient
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    tenant_id = membership?.tenant_id || null;
  }

  // If still no tenant, user has no tenant access
  if (!tenant_id) {
    console.log(`[assertFeatureEnabled] User ${user.id} has no tenant membership`);
    // Platform admins without tenant membership still need to pass - use default tenant
    if (isPlatformAdmin) {
      const { data: defaultTenant } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('slug', 'default')
        .single();
      tenant_id = defaultTenant?.id || null;
    }
    
    if (!tenant_id) {
      return {
        allowed: false,
        reason: 'User has no tenant membership',
        user_id: user.id,
        response: new Response(
          JSON.stringify({ error: 'No tenant access', reason: 'User is not a member of any tenant' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
  }

  console.log(`[assertFeatureEnabled] Checking flag '${flag_key}' for tenant ${tenant_id}, user ${user.id}`);

  // Get the feature flag
  const { data: flag, error: flagError } = await serviceClient
    .from('feature_flags')
    .select('id, key, default_enabled, is_killswitch')
    .eq('key', flag_key)
    .single();

  if (flagError || !flag) {
    console.log(`[assertFeatureEnabled] Feature flag '${flag_key}' not found`);
    // If flag doesn't exist, default to disabled for safety
    return {
      allowed: false,
      reason: `Feature flag '${flag_key}' not found`,
      tenant_id,
      user_id: user.id,
      response: new Response(
        JSON.stringify({ error: 'Feature not available', flag_key }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const globalDefault = flag.default_enabled ?? false;
  const isKillswitch = flag.is_killswitch ?? false;

  // Killswitch check - if globally disabled via killswitch, always OFF
  if (isKillswitch && !globalDefault) {
    console.log(`[assertFeatureEnabled] Feature '${flag_key}' is killed globally`);
    return {
      allowed: false,
      reason: 'Feature is disabled globally (killswitch)',
      tenant_id,
      user_id: user.id,
      response: new Response(
        JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'killswitch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Get tenant's release channel
  const { data: tenant, error: tenantError } = await serviceClient
    .from('tenants')
    .select('release_channel')
    .eq('id', tenant_id)
    .single();

  if (tenantError || !tenant) {
    console.log(`[assertFeatureEnabled] Tenant '${tenant_id}' not found`);
    return {
      allowed: false,
      reason: 'Tenant not found',
      tenant_id,
      user_id: user.id,
      response: new Response(
        JSON.stringify({ error: 'Tenant not found', tenant_id }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const releaseChannel = tenant.release_channel || 'general';

  // Check for tenant-specific override
  const { data: tenantOverride } = await serviceClient
    .from('tenant_feature_flags')
    .select('enabled')
    .eq('tenant_id', tenant_id)
    .eq('feature_flag_id', flag.id)
    .single();

  if (tenantOverride !== null && tenantOverride !== undefined) {
    const overrideEnabled = tenantOverride.enabled;
    console.log(`[assertFeatureEnabled] Tenant override for '${flag_key}': ${overrideEnabled}`);
    
    if (!overrideEnabled) {
      return {
        allowed: false,
        reason: 'Feature disabled by tenant override',
        tenant_id,
        user_id: user.id,
        response: new Response(
          JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'tenant_override' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    return { allowed: true, tenant_id, user_id: user.id };
  }

  // Check release channel default from database
  const { data: channelDefault } = await serviceClient
    .from('release_channel_feature_flags')
    .select('enabled')
    .eq('release_channel', releaseChannel)
    .eq('feature_flag_id', flag.id)
    .single();

  if (channelDefault !== null && channelDefault !== undefined) {
    const channelEnabled = channelDefault.enabled;
    console.log(`[assertFeatureEnabled] Channel default for '${flag_key}' on '${releaseChannel}': ${channelEnabled}`);
    
    if (!channelEnabled) {
      return {
        allowed: false,
        reason: `Feature disabled for '${releaseChannel}' release channel`,
        tenant_id,
        user_id: user.id,
        response: new Response(
          JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'release_channel', channel: releaseChannel }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    return { allowed: true, tenant_id, user_id: user.id };
  }

  // Fall back to global default
  console.log(`[assertFeatureEnabled] Global default for '${flag_key}': ${globalDefault}`);
  
  if (!globalDefault) {
    return {
      allowed: false,
      reason: 'Feature disabled by global default',
      tenant_id,
      user_id: user.id,
      response: new Response(
        JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'global_default' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { allowed: true, tenant_id, user_id: user.id };
}
