import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertTenantAccess, getServiceClient, deriveTenantFromJWT } from "../_shared/assertTenantAccess.ts";

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
// UI renders forms from these definitions - no local catalog
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
  { 
    id: 'gmail', 
    name: 'Gmail', 
    description: 'Email integration for Load Hunter',
    icon: 'inbox',
    credentialFields: [
      { key: 'client_id', label: 'Client ID', type: 'text' as const, placeholder: 'Google OAuth Client ID', required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password' as const, placeholder: 'Google OAuth Client Secret', required: true }
    ],
    settingsFields: [
      { key: 'watch_email', label: 'Email to Watch', type: 'email' as const, placeholder: 'loads@yourdomain.com', required: true }
    ]
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    let { tenant_id } = body;

    // Step 1: Derive tenant from JWT if not provided (shared helper)
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

    // Step 2: CONSTRAINT A - assertTenantAccess immediately after derivation
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    // Step 3: Only after allowed=true, use service-role for queries
    const adminClient = getServiceClient();

    // Query the SAFE view (never exposes credentials_encrypted)
    const { data: configuredIntegrations, error: fetchError } = await adminClient
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
    const integrations = PROVIDER_CATALOG.map(provider => {
      const configured = configuredIntegrations?.find(i => i.provider === provider.id);
      
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
    console.error('Error in check-tenant-integrations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
