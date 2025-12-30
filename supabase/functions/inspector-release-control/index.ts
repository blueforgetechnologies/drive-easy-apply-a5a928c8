import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TenantReleaseInfo {
  tenant_id: string;
  tenant_name: string;
  release_channel: string;
  status: string;
  features_from_channel: string[];
  features_from_override: string[];
  all_effective_features: string[];
  flag_resolutions: FlagResolution[];
}

interface FlagResolution {
  flag_key: string;
  flag_name: string;
  enabled: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default' | 'killswitch';
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
      let body: any = {};
      try {
        const bodyText = await req.text();
        if (bodyText) {
          body = JSON.parse(bodyText);
        }
      } catch (e) {
        // Body might be empty or invalid
      }
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

    // Fetch release channel defaults from database
    const { data: channelDefaultsRaw, error: channelDefaultsError } = await serviceClient
      .from('release_channel_feature_flags')
      .select('release_channel, feature_flag_id, enabled');

    if (channelDefaultsError) {
      console.error('Error fetching channel defaults:', channelDefaultsError);
    }

    // Build channel defaults map: channel -> flagId -> enabled
    const channelDefaultsMap = new Map<string, Map<string, boolean>>();
    for (const row of (channelDefaultsRaw || [])) {
      if (!channelDefaultsMap.has(row.release_channel)) {
        channelDefaultsMap.set(row.release_channel, new Map());
      }
      channelDefaultsMap.get(row.release_channel)!.set(row.feature_flag_id, row.enabled);
    }

    // Fetch all tenant feature flag overrides
    const { data: allOverrides, error: overridesError } = await serviceClient
      .from('tenant_feature_flags')
      .select('tenant_id, feature_flag_id, enabled');

    if (overridesError) {
      console.error('Error fetching overrides:', overridesError);
    }

    // Build flag ID to key/name map
    const flagIdToKey = new Map<string, string>();
    const flagKeyToName = new Map<string, string>();
    const flagIdToInfo = new Map<string, { key: string; name: string; default_enabled: boolean; is_killswitch: boolean }>();
    for (const flag of (featureFlags || [])) {
      flagIdToKey.set(flag.id, flag.key);
      flagKeyToName.set(flag.key, flag.name);
      flagIdToInfo.set(flag.id, flag);
    }

    // Build override map per tenant: tenant -> flagId -> enabled
    const tenantOverridesMap = new Map<string, Map<string, boolean>>();
    for (const override of (allOverrides || [])) {
      if (!tenantOverridesMap.has(override.tenant_id)) {
        tenantOverridesMap.set(override.tenant_id, new Map());
      }
      tenantOverridesMap.get(override.tenant_id)!.set(override.feature_flag_id, override.enabled);
    }

    // Build release info for each tenant
    const releaseInfo: TenantReleaseInfo[] = [];

    for (const tenant of (tenants || [])) {
      const channel = tenant.release_channel || 'general';
      const channelDefaults = channelDefaultsMap.get(channel) || new Map();
      const overrides = tenantOverridesMap.get(tenant.id) || new Map();

      const featuresFromChannel: string[] = [];
      const featuresFromOverride: string[] = [];
      const allEffectiveFeatures: string[] = [];
      const flagResolutions: FlagResolution[] = [];

      for (const flag of (featureFlags || [])) {
        const globalDefault = flag.default_enabled ?? false;
        const isKillswitch = flag.is_killswitch ?? false;

        // Killswitch check
        if (isKillswitch && !globalDefault) {
          flagResolutions.push({
            flag_key: flag.key,
            flag_name: flag.name,
            enabled: false,
            source: 'killswitch',
          });
          continue;
        }

        const channelValue = channelDefaults.has(flag.id) ? channelDefaults.get(flag.id) : null;
        const overrideValue = overrides.has(flag.id) ? overrides.get(flag.id) : null;

        let effectiveValue: boolean;
        let source: 'tenant_override' | 'release_channel' | 'global_default';

        if (overrideValue !== null) {
          effectiveValue = overrideValue;
          source = 'tenant_override';
        } else if (channelValue !== null) {
          effectiveValue = channelValue;
          source = 'release_channel';
        } else {
          effectiveValue = globalDefault;
          source = 'global_default';
        }

        flagResolutions.push({
          flag_key: flag.key,
          flag_name: flag.name,
          enabled: effectiveValue,
          source,
        });

        if (effectiveValue) {
          allEffectiveFeatures.push(flag.key);
          if (source === 'release_channel') {
            featuresFromChannel.push(flag.key);
          } else if (source === 'tenant_override') {
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
        flag_resolutions: flagResolutions,
      });
    }

    // Channel summary
    const channelSummary = {
      internal: tenants?.filter(t => t.release_channel === 'internal').length || 0,
      pilot: tenants?.filter(t => t.release_channel === 'pilot').length || 0,
      general: tenants?.filter(t => (t.release_channel || 'general') === 'general').length || 0,
    };

    // Build channel defaults for response (readable format)
    const releaseChannelDefaults: Record<string, Record<string, boolean>> = {};
    for (const [channel, flagMap] of channelDefaultsMap) {
      releaseChannelDefaults[channel] = {};
      for (const [flagId, enabled] of flagMap) {
        const flagKey = flagIdToKey.get(flagId);
        if (flagKey) {
          releaseChannelDefaults[channel][flagKey] = enabled;
        }
      }
    }

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
        release_channel_defaults: releaseChannelDefaults,
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
