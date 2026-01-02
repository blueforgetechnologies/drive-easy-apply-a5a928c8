import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM encryption using Web Crypto API
async function encrypt(plaintext: string, masterKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encoder.encode(plaintext)
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

function generateHint(credentials: Record<string, string>): string {
  // Find the primary key (api_key, token, etc.)
  const keyNames = ['api_key', 'apiKey', 'token', 'secret', 'key'];
  for (const keyName of keyNames) {
    if (credentials[keyName]) {
      const value = credentials[keyName];
      if (value.length >= 4) {
        return '••••' + value.slice(-4);
      }
      return '••••';
    }
  }
  return '••••••••';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, provider, is_enabled, credentials, settings } = body;

    // CONSTRAINT A: Use assertTenantAccess at the top
    const authHeader = req.headers.get('Authorization');
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get master key for encryption
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      console.error('INTEGRATIONS_MASTER_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client after access verified
    const adminClient = getServiceClient();

    // Check if this is a status change to disabled
    const isDisabling = is_enabled === false;

    // Prepare data for upsert
    const updateData: Record<string, unknown> = {
      tenant_id,
      provider,
      is_enabled: is_enabled ?? true,
      settings: settings || {},
      updated_at: new Date().toISOString(),
    };

    // CONSTRAINT B: sync_status contract enforcement
    if (isDisabling) {
      // When disabling, set status to 'disabled'
      updateData.sync_status = 'disabled';
    } else if (credentials && Object.keys(credentials).length > 0) {
      // Credentials changed/added => sync_status='pending', clear error_message
      const encrypted = await encrypt(JSON.stringify(credentials), masterKey);
      updateData.credentials_encrypted = encrypted;
      updateData.credentials_hint = generateHint(credentials);
      updateData.sync_status = 'pending';
      updateData.error_message = null;
    }

    const { data, error } = await adminClient
      .from('tenant_integrations')
      .upsert(updateData, {
        onConflict: 'tenant_id,provider'
      })
      .select('id, provider, is_enabled, credentials_hint, settings, sync_status')
      .single();

    if (error) {
      console.error('Error saving integration:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save integration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[set-tenant-integration] provider=${provider} tenant=${tenant_id} user=${accessCheck.user_id} sync_status=${data.sync_status}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        integration: data 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in set-tenant-integration:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
