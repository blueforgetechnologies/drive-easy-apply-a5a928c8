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
  // Show last 4 of API key
  const apiKey = credentials.api_key || credentials.apiKey || '';
  if (apiKey.length >= 4) {
    return '••••' + apiKey.slice(-4);
  }
  return '••••••••';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, provider, is_enabled, credentials, settings, action } = body;

    // Validate tenant access
    const authHeader = req.headers.get('Authorization');
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    // Default provider to OTR Solutions
    const factProvider = provider || 'otr_solutions';

    // Get master key for encryption
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      console.error('INTEGRATIONS_MASTER_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = getServiceClient();

    // Handle test action
    if (action === 'test') {
      // Test OTR API connection with provided credentials
      const testResult = await testOtrConnection(credentials);
      
      // Update sync_status based on test result
      await adminClient
        .from('tenant_factoring_config')
        .update({
          sync_status: testResult.success ? 'healthy' : 'failed',
          error_message: testResult.success ? null : testResult.error,
          last_checked_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id)
        .eq('provider', factProvider);

      return new Response(
        JSON.stringify(testResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare data for upsert
    const updateData: Record<string, unknown> = {
      tenant_id,
      provider: factProvider,
      is_enabled: is_enabled ?? false,
      settings: settings || {},
      updated_at: new Date().toISOString(),
    };

    // If credentials provided, encrypt them
    if (credentials && Object.keys(credentials).length > 0) {
      // Validate required OTR fields
      if (factProvider === 'otr_solutions') {
        if (!credentials.api_key) {
          return new Response(
            JSON.stringify({ error: 'OTR API Key is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const encrypted = await encrypt(JSON.stringify(credentials), masterKey);
      updateData.credentials_encrypted = encrypted;
      updateData.credentials_hint = generateHint(credentials);
      updateData.sync_status = 'pending';
      updateData.error_message = null;
    }

    // If disabling, update status
    if (is_enabled === false) {
      updateData.sync_status = 'not_configured';
    }

    const { data, error } = await adminClient
      .from('tenant_factoring_config')
      .upsert(updateData, {
        onConflict: 'tenant_id,provider'
      })
      .select('id, provider, is_enabled, credentials_hint, settings, sync_status, error_message, last_checked_at')
      .single();

    if (error) {
      console.error('Error saving factoring config:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save factoring configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[set-factoring-config] provider=${factProvider} tenant=${tenant_id} user=${accessCheck.user_id} sync_status=${data.sync_status}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        config: data 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in set-factoring-config:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Test OTR API connection
async function testOtrConnection(credentials: Record<string, string>): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const { api_key, username, password } = credentials;
    
    if (!api_key) {
      return { success: false, error: 'API Key is required' };
    }

    // OTR requires OAuth token first
    const tokenUrl = 'https://api.otrusa.com/oauth/token';
    const tokenBody = new URLSearchParams({
      grant_type: 'password',
      username: username || '',
      password: password || '',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': api_key,
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error('[OTR Test] Token request failed:', tokenRes.status, errorText);
      
      if (tokenRes.status === 401) {
        return { success: false, error: 'Invalid API key or credentials' };
      }
      if (tokenRes.status === 403) {
        return { success: false, error: 'API key not authorized' };
      }
      return { success: false, error: `OTR API error: ${tokenRes.status}` };
    }

    const tokenData = await tokenRes.json();
    
    if (!tokenData.access_token) {
      return { success: false, error: 'Failed to obtain access token' };
    }

    console.log('[OTR Test] Successfully obtained access token');
    return { 
      success: true, 
      message: 'OTR API connection successful' 
    };

  } catch (error) {
    console.error('[OTR Test] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}
