import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Release channel defaults - MUST mirror useFeatureFlags.ts and inspector-feature-flags
const RELEASE_CHANNEL_DEFAULTS: Record<string, Record<string, boolean>> = {
  internal: {
    // Internal gets all experimental features
  },
  pilot: {
    // Pilot gets stable beta features
  },
  general: {
    // General gets fully stable features only
  },
};

interface TenantReleaseInfo {
  tenant_id: string;
  tenant_name: string;
  release_channel: string;
  status: string;
  features_from_channel: string[];
  features_from_override: string[];
  all_effective_features: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
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
      console.log('User auth failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Use service role client for privileged operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check platform admin status via profiles.is_platform_admin
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error checking admin status:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.is_platform_admin) {
      console.log('Access denied - user is not platform admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Platform admin verified');

    // Parse request
    const url = new URL(req.url);
    const method = req.method;

    // Handle POST for updating release channel
    if (method === 'POST') {
      const body = await req.json();
      const { tenant_id, release_channel } = body;

      if (!tenant_id || !release_channel) {
        return new Response(
          JSON.stringify({ error: 'tenant_id and release_channel are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate release channel
      const validChannels = ['internal', 'pilot', 'general'];
      if (!validChannels.includes(release_channel)) {
        return new Response(
          JSON.stringify({ error: `Invalid release_channel. Must be one of: ${validChannels.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get current tenant state for audit log
      const { data: currentTenant, error: currentError } = await serviceClient
        .from('tenants')
        .select('release_channel, name')
        .eq('id', tenant_id)
        .single();

      if (currentError) {
        return new Response(
          JSON.stringify({ error: 'Tenant not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update tenant release channel
      const { error: updateError } = await serviceClient
        .from('tenants')
        .update({ 
          release_channel,
          updated_at: new Date().toISOString()
        })
        .eq('id', tenant_id);

      if (updateError) {
        console.error('Error updating release channel:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update release channel' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the change to feature_flag_audit_log
      await serviceClient.from('feature_flag_audit_log').insert({
        action: 'release_channel_change',
        tenant_id,
        changed_by: user.id,
        old_value: { release_channel: currentTenant.release_channel },
        new_value: { release_channel },
      });

      console.log(`Updated tenant ${currentTenant.name} release channel: ${currentTenant.release_channel} → ${release_channel}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          tenant_id,
          old_channel: currentTenant.release_channel,
          new_channel: release_channel,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET: Fetch all tenants with their release control info
    // Fetch all tenants
    const { data: tenants, error: tenantsError } = await serviceClient
      .from('tenants')
      .select('id, name, status, release_channel')
      .order('name');

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tenants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all feature flags
    const { data: featureFlags, error: flagsError } = await serviceClient
      .from('feature_flags')
      .select('id, key, name, default_enabled, is_killswitch')
      .order('key');

    if (flagsError) {
      console.error('Error fetching feature flags:', flagsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch feature flags' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all tenant feature flag overrides
    const { data: allOverrides, error: overridesError } = await serviceClient
      .from('tenant_feature_flags')
      .select('tenant_id, feature_flag_id, enabled');

    if (overridesError) {
      console.error('Error fetching overrides:', overridesError);
    }

    // Build flag ID to key map
    const flagIdToKey = new Map<string, string>();
    const flagKeyToName = new Map<string, string>();
    for (const flag of (featureFlags || [])) {
      flagIdToKey.set(flag.id, flag.key);
      flagKeyToName.set(flag.key, flag.name);
    }

    // Build override map per tenant
    const tenantOverridesMap = new Map<string, Map<string, boolean>>();
    for (const override of (allOverrides || [])) {
      if (!tenantOverridesMap.has(override.tenant_id)) {
        tenantOverridesMap.set(override.tenant_id, new Map());
      }
      const flagKey = flagIdToKey.get(override.feature_flag_id);
      if (flagKey) {
        tenantOverridesMap.get(override.tenant_id)!.set(flagKey, override.enabled);
      }
    }

    // Build release info for each tenant
    const releaseInfo: TenantReleaseInfo[] = [];

    for (const tenant of (tenants || [])) {
      const channel = tenant.release_channel || 'general';
      const channelDefaults = RELEASE_CHANNEL_DEFAULTS[channel] || {};
      const overrides = tenantOverridesMap.get(tenant.id) || new Map();

      const featuresFromChannel: string[] = [];
      const featuresFromOverride: string[] = [];
      const allEffectiveFeatures: string[] = [];

      for (const flag of (featureFlags || [])) {
        const globalDefault = flag.default_enabled ?? false;
        const isKillswitch = flag.is_killswitch ?? false;

        // Killswitch check
        if (isKillswitch && !globalDefault) {
          continue; // Feature is killed, skip
        }

        const channelValue = flag.key in channelDefaults ? channelDefaults[flag.key] : null;
        const overrideValue = overrides.has(flag.key) ? overrides.get(flag.key) : null;

        let effectiveValue: boolean;
        let source: string;

        if (overrideValue !== null) {
          effectiveValue = overrideValue;
          source = 'override';
        } else if (channelValue !== null) {
          effectiveValue = channelValue;
          source = 'channel';
        } else {
          effectiveValue = globalDefault;
          source = 'global';
        }

        if (effectiveValue) {
          allEffectiveFeatures.push(flag.key);
          if (source === 'channel') {
            featuresFromChannel.push(flag.key);
          } else if (source === 'override') {
            featuresFromOverride.push(flag.key);
          }
        }
      }

      releaseInfo.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        release_channel: channel,
        status: tenant.status,
        features_from_channel: featuresFromChannel,
        features_from_override: featuresFromOverride,
        all_effective_features: allEffectiveFeatures,
      });
    }

    // Channel summary
    const channelSummary = {
      internal: tenants?.filter(t => t.release_channel === 'internal').length || 0,
      pilot: tenants?.filter(t => t.release_channel === 'pilot').length || 0,
      general: tenants?.filter(t => (t.release_channel || 'general') === 'general').length || 0,
    };

    console.log(`Returning release info for ${releaseInfo.length} tenants`);

    return new Response(
      JSON.stringify({
        tenants: releaseInfo,
        channel_summary: channelSummary,
        feature_flags: featureFlags?.map(f => ({
          key: f.key,
          name: f.name,
          default_enabled: f.default_enabled,
          is_killswitch: f.is_killswitch,
        })),
        release_channel_defaults: RELEASE_CHANNEL_DEFAULTS,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
