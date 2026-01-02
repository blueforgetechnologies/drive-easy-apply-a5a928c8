import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess } from "../_shared/assertTenantAccess.ts";
import { deriveTenantFromJWT } from "../_shared/deriveTenantFromJWT.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Field definition for dynamic form rendering
interface FieldDef {
  key: string;
  label: string;
  type: 'password' | 'text' | 'email';
  placeholder: string;
  required: boolean;
}

// SINGLE SOURCE OF TRUTH: Provider catalog with field schemas
// Gmail removed for MVP - requires OAuth flow implementation
const PROVIDER_CATALOG = [
  { 
    id: 'samsara', 
    name: 'Samsara API', 
    description: 'Vehicle telematics and fleet tracking',
    icon: 'truck',
    credentialFields: [
      { key: 'api_key', label: 'API Key', type: 'password' as const, placeholder: 'Enter your Samsara API key', required: true }
    ],
    settingsFields: [] as FieldDef[]
  },
  { 
    id: 'resend', 
    name: 'Resend Email', 
    description: 'Transactional email service',
    icon: 'mail',
    credentialFields: [
      { key: 'api_key', label: 'API Key', type: 'password' as const, placeholder: 're_xxxxxx...', required: true }
    ],
    settingsFields: [
      { key: 'from_email', label: 'From Email', type: 'email' as const, placeholder: 'noreply@yourdomain.com', required: true }
    ]
  },
  { 
    id: 'mapbox', 
    name: 'Mapbox', 
    description: 'Maps and geocoding services',
    icon: 'map',
    credentialFields: [
      { key: 'token', label: 'Access Token', type: 'password' as const, placeholder: 'pk.xxxxxx...', required: true }
    ],
    settingsFields: [] as FieldDef[]
  },
  { 
    id: 'weather', 
    name: 'Weather API', 
    description: 'Real-time weather data for locations',
    icon: 'cloud',
    credentialFields: [
      { key: 'api_key', label: 'API Key', type: 'password' as const, placeholder: 'Enter your Weather API key', required: true }
    ],
    settingsFields: [] as FieldDef[]
  },
  { 
    id: 'highway', 
    name: 'Highway', 
    description: 'Carrier identity verification and fraud prevention',
    icon: 'shield',
    credentialFields: [
      { key: 'api_key', label: 'API Key', type: 'password' as const, placeholder: 'Enter your Highway API key', required: true }
    ],
    settingsFields: [] as FieldDef[]
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Step 1: Parse auth header
    const authHeader = req.headers.get('Authorization');
    
    // Step 2: Parse optional tenant_id from request body
    const body = await req.json().catch(() => ({}));
    let { tenant_id } = body;

    // Step 3: If tenant_id is missing, derive from JWT
    if (!tenant_id) {
      const derived = await deriveTenantFromJWT(authHeader);
      if (derived.error) {
        return derived.error;
      }
      tenant_id = derived.tenant_id;
    }

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'No tenant context available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Call assertTenantAccess
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    // Step 5: Create auth-bound client (anon key + Authorization header)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } }
    });

    // Step 6: Query integrations via SECURITY DEFINER function (tenant access validated inside function)
    const { data: configuredIntegrations, error: fetchError } = await authClient
      .rpc('get_tenant_integrations_safe', { p_tenant_id: tenant_id });

    if (fetchError) {
      console.error('[check-tenant-integrations] Error fetching integrations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 7: Merge catalog with configured data
    interface ConfiguredIntegration {
      id: string;
      tenant_id: string;
      provider: string;
      is_enabled: boolean;
      credentials_hint: string | null;
      settings: Record<string, unknown> | null;
      sync_status: string | null;
      error_message: string | null;
      last_checked_at: string | null;
      last_sync_at: string | null;
      is_configured: boolean;
    }
    const integrations = PROVIDER_CATALOG.map(provider => {
      const configured = (configuredIntegrations as ConfiguredIntegration[] | null)?.find(i => i.provider === provider.id);
      
      if (configured) {
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          icon: provider.icon,
          credentialFields: provider.credentialFields,
          settingsFields: provider.settingsFields,
          is_configured: configured.is_configured === true,
          is_enabled: configured.is_enabled ?? false,
          credentials_hint: configured.credentials_hint,
          settings: configured.settings,
          sync_status: configured.sync_status || 'not_configured',
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
        credentialFields: provider.credentialFields,
        settingsFields: provider.settingsFields,
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
    console.error('[check-tenant-integrations] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
