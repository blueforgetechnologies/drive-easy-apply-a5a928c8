import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;

    // If tenant_id provided, verify access
    if (tenant_id) {
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('tenant_id', tenant_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!membership) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_platform_admin')
          .eq('id', user.id)
          .single();
        
        if (!profile?.is_platform_admin) {
          return new Response(
            JSON.stringify({ error: 'Access denied to this tenant' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Use the safe view that excludes credentials
    let query = supabase
      .from('tenant_integrations_safe')
      .select('*');

    if (tenant_id) {
      query = query.eq('tenant_id', tenant_id);
    }

    const { data: integrations, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching integrations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Define all available providers with metadata
    const allProviders = [
      { id: 'samsara', name: 'Samsara API', description: 'Vehicle telematics and fleet tracking' },
      { id: 'resend', name: 'Resend Email', description: 'Transactional email service' },
      { id: 'mapbox', name: 'Mapbox', description: 'Maps and geocoding services' },
      { id: 'weather', name: 'Weather API', description: 'Real-time weather data for locations' },
      { id: 'highway', name: 'Highway', description: 'Carrier identity verification and fraud prevention' },
      { id: 'gmail', name: 'Gmail', description: 'Email integration for Load Hunter' },
    ];

    // Merge configured integrations with all available providers
    const result = allProviders.map(provider => {
      const configured = integrations?.find(i => i.provider === provider.id);
      
      if (configured) {
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          is_configured: true,
          is_enabled: configured.is_enabled,
          credentials_hint: configured.credentials_hint,
          settings: configured.settings,
          sync_status: configured.sync_status || 'unknown',
          error_message: configured.error_message,
          last_checked_at: configured.last_checked_at,
          last_sync_at: configured.last_sync_at,
        };
      }
      
      return {
        id: provider.id,
        name: provider.name,
        description: provider.description,
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
    const issueCount = result.filter(
      i => i.is_configured && i.is_enabled && (i.sync_status === 'failed' || i.sync_status === 'partial')
    ).length;

    return new Response(
      JSON.stringify({ 
        integrations: result,
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
