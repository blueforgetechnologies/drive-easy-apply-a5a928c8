import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface FeatureGateResult {
  allowed: boolean;
  reason?: string;
  response?: Response;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Server-side feature gate helper.
 * Verifies caller identity and checks if a feature is enabled for a tenant.
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
  tenant_id: string;
  flag_key: string;
  authHeader: string | null;
}): Promise<FeatureGateResult> {
  const { tenant_id, flag_key, authHeader } = options;

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
        response: new Response(
          JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'tenant_override' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    return { allowed: true };
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
        response: new Response(
          JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'release_channel', channel: releaseChannel }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    return { allowed: true };
  }

  // Fall back to global default
  console.log(`[assertFeatureEnabled] Global default for '${flag_key}': ${globalDefault}`);
  
  if (!globalDefault) {
    return {
      allowed: false,
      reason: 'Feature disabled by global default',
      response: new Response(
        JSON.stringify({ error: 'Feature disabled', flag_key, reason: 'global_default' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { allowed: true };
}

/**
 * Simplified helper for quick feature checks without blocking response.
 * Returns just the boolean result.
 */
export async function isFeatureEnabled(options: {
  tenant_id: string;
  flag_key: string;
  serviceClient: ReturnType<typeof createClient>;
}): Promise<boolean> {
  const { tenant_id, flag_key, serviceClient } = options;

  try {
    // Get the feature flag
    const { data: flag, error: flagError } = await serviceClient
      .from('feature_flags')
      .select('id, key, default_enabled, is_killswitch')
      .eq('key', flag_key)
      .single();

    if (flagError || !flag) {
      return false;
    }

    // Cast to avoid type inference issues
    const flagData = flag as { id: string; key: string; default_enabled: boolean | null; is_killswitch: boolean | null };
    const globalDefault = flagData.default_enabled ?? false;
    const isKillswitch = flagData.is_killswitch ?? false;

    // Killswitch check
    if (isKillswitch && !globalDefault) {
      return false;
    }

    // Get tenant's release channel
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('release_channel')
      .eq('id', tenant_id)
      .single();

    const tenantData = tenant as { release_channel: string | null } | null;
    const releaseChannel = tenantData?.release_channel || 'general';

    // Check for tenant-specific override
    const { data: tenantOverride } = await serviceClient
      .from('tenant_feature_flags')
      .select('enabled')
      .eq('tenant_id', tenant_id)
      .eq('feature_flag_id', flagData.id)
      .single();

    const overrideData = tenantOverride as { enabled: boolean } | null;
    if (overrideData !== null && overrideData !== undefined) {
      return overrideData.enabled;
    }

    // Check release channel default from database
    const { data: channelDefault } = await serviceClient
      .from('release_channel_feature_flags')
      .select('enabled')
      .eq('release_channel', releaseChannel)
      .eq('feature_flag_id', flagData.id)
      .single();

    const channelData = channelDefault as { enabled: boolean } | null;
    if (channelData !== null && channelData !== undefined) {
      return channelData.enabled;
    }

    // Fall back to global default
    return globalDefault;
  } catch (error) {
    console.error('[isFeatureEnabled] Error:', error);
    return false;
  }
}
