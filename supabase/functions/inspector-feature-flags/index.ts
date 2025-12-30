import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeatureFlagResolution {
  flag_key: string;
  flag_name: string;
  global_default: boolean;
  release_channel_value: boolean | null;
  tenant_override_value: boolean | null;
  effective_value: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default';
  is_killswitch: boolean;
}

interface ReleaseChannelDefaults {
  [key: string]: { [flagKey: string]: boolean };
}

// Release channel defaults - features are rolled out progressively
// internal → pilot → general
const RELEASE_CHANNEL_DEFAULTS: ReleaseChannelDefaults = {
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

    // Parse query params
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id');

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

    // If tenant_id is provided, get tenant details and overrides
    let tenantOverrides: Map<string, boolean> = new Map();
    let releaseChannel: string | null = null;

    if (tenantId) {
      // Get tenant's release channel
      const { data: tenant, error: tenantError } = await serviceClient
        .from('tenants')
        .select('release_channel')
        .eq('id', tenantId)
        .single();

      if (tenantError) {
        console.error('Error fetching tenant:', tenantError);
        return new Response(
          JSON.stringify({ error: 'Tenant not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      releaseChannel = tenant?.release_channel || null;

      // Get tenant-specific overrides
      const { data: overrides, error: overridesError } = await serviceClient
        .from('tenant_feature_flags')
        .select('feature_flag_id, enabled')
        .eq('tenant_id', tenantId);

      if (overridesError) {
        console.error('Error fetching tenant overrides:', overridesError);
      } else if (overrides) {
        // Map flag_id to enabled value
        for (const override of overrides) {
          tenantOverrides.set(override.feature_flag_id, override.enabled);
        }
      }
    }

    // Resolve effective value for each flag
    const resolutions: FeatureFlagResolution[] = featureFlags.map((flag) => {
      const globalDefault = flag.default_enabled ?? false;
      const isKillswitch = flag.is_killswitch ?? false;

      // Check release channel defaults
      let releaseChannelValue: boolean | null = null;
      if (releaseChannel && RELEASE_CHANNEL_DEFAULTS[releaseChannel]) {
        const channelDefaults = RELEASE_CHANNEL_DEFAULTS[releaseChannel];
        if (flag.key in channelDefaults) {
          releaseChannelValue = channelDefaults[flag.key];
        }
      }

      // Check tenant override
      const tenantOverrideValue = tenantOverrides.has(flag.id) 
        ? tenantOverrides.get(flag.id)! 
        : null;

      // Determine effective value and source
      let effectiveValue: boolean;
      let source: 'tenant_override' | 'release_channel' | 'global_default';

      // Killswitch overrides everything - if globally disabled via killswitch, it's OFF
      if (isKillswitch && !globalDefault) {
        effectiveValue = false;
        source = 'global_default';
      } else if (tenantOverrideValue !== null) {
        effectiveValue = tenantOverrideValue;
        source = 'tenant_override';
      } else if (releaseChannelValue !== null) {
        effectiveValue = releaseChannelValue;
        source = 'release_channel';
      } else {
        effectiveValue = globalDefault;
        source = 'global_default';
      }

      return {
        flag_key: flag.key,
        flag_name: flag.name,
        global_default: globalDefault,
        release_channel_value: releaseChannelValue,
        tenant_override_value: tenantOverrideValue,
        effective_value: effectiveValue,
        source,
        is_killswitch: isKillswitch,
      };
    });

    console.log(`Returning ${resolutions.length} feature flag resolutions`);

    return new Response(
      JSON.stringify({ 
        flags: resolutions,
        tenant_id: tenantId,
        release_channel: releaseChannel,
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
