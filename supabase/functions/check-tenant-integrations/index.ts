import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SINGLE SOURCE OF TRUTH: Provider catalog lives only in this edge function
// UI renders whatever this function returns - no duplication
const PROVIDER_CATALOG = [
  { 
    id: 'samsara', 
    name: 'Samsara API', 
    description: 'Vehicle telematics and fleet tracking',
    icon: 'truck'
  },
  { 
    id: 'resend', 
    name: 'Resend Email', 
    description: 'Transactional email service',
    icon: 'mail'
  },
  { 
    id: 'mapbox', 
    name: 'Mapbox', 
    description: 'Maps and geocoding services',
    icon: 'map'
  },
  { 
    id: 'weather', 
    name: 'Weather API', 
    description: 'Real-time weather data for locations',
    icon: 'cloud'
  },
  { 
    id: 'highway', 
    name: 'Highway', 
    description: 'Carrier identity verification and fraud prevention',
    icon: 'shield'
  },
  { 
    id: 'gmail', 
    name: 'Gmail', 
    description: 'Email integration for Load Hunter',
    icon: 'inbox'
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant_id from request body (optional for platform admins)
    const body = await req.json().catch(() => ({}));
    let { tenant_id } = body;

    // If no tenant_id provided, derive from user's membership
    if (!tenant_id) {
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      tenant_id = membership?.tenant_id;
    }

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'No tenant context available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify tenant access (assertTenantAccess equivalent)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();
    
    const isPlatformAdmin = profile?.is_platform_admin === true;

    if (!isPlatformAdmin) {
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('tenant_id', tenant_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this tenant' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Query the SAFE view (never exposes credentials_encrypted)
    const { data: configuredIntegrations, error: fetchError } = await supabase
      .from('tenant_integrations_safe')
      .select('*')
      .eq('tenant_id', tenant_id);

    if (fetchError) {
      console.error('Error fetching integrations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SERVER-SIDE CATALOG MERGE: Combine catalog with configured data
    // This ensures Talbi (zero rows) still sees all providers
    const integrations = PROVIDER_CATALOG.map(provider => {
      const configured = configuredIntegrations?.find(i => i.provider === provider.id);
      
      if (configured) {
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          icon: provider.icon,
          is_configured: configured.is_configured === true,
          is_enabled: configured.is_enabled ?? false,
          credentials_hint: configured.credentials_hint,
          settings: configured.settings,
          sync_status: configured.sync_status || 'unknown',
          error_message: configured.error_message,
          last_checked_at: configured.last_checked_at,
          last_sync_at: configured.last_sync_at,
        };
      }
      
      // Not configured - return catalog defaults
      return {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        icon: provider.icon,
        is_configured: false,
        is_enabled: false,
        credentials_hint: null,
        settings: null,
        sync_status: 'not_configured',
        error_message: null,
        last_checked_at: null,
        last_sync_at: null,
      };
    });

    // Count issues for badge
    const issueCount = integrations.filter(
      i => i.is_configured && i.is_enabled && (i.sync_status === 'failed' || i.sync_status === 'partial')
    ).length;

    console.log(`[check-tenant-integrations] tenant=${tenant_id} providers=${integrations.length} issues=${issueCount}`);

    return new Response(
      JSON.stringify({ 
        integrations,
        issue_count: issueCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-tenant-integrations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
