import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM decryption using Web Crypto API
async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

// Sanitize error messages to prevent credential leakage
function sanitizeError(message: string): string {
  let sanitized = message.slice(0, 500);
  sanitized = sanitized.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]');
  sanitized = sanitized.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]');
  sanitized = sanitized.replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]');
  return sanitized || 'Unknown error';
}

// Provider-specific test functions
async function testSamsara(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.api_key;
  if (!apiKey) return { success: false, message: 'API key not configured' };
  
  try {
    const response = await fetch('https://api.samsara.com/fleet/vehicles?limit=1', {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, message: `Connected. Found ${data.data?.length || 0} vehicles.` };
    } else if (response.status === 401) {
      return { success: false, message: 'Invalid API key' };
    }
    return { success: false, message: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

async function testResend(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.api_key;
  if (!apiKey) return { success: false, message: 'API key not configured' };
  
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    if (response.ok) return { success: true, message: 'API key validated successfully' };
    if (response.status === 401) return { success: false, message: 'Invalid API key' };
    return { success: false, message: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

async function testMapbox(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const token = credentials.token;
  if (!token) return { success: false, message: 'Access token not configured' };
  
  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${token}&limit=1`);
    if (response.ok) return { success: true, message: 'Token validated successfully' };
    if (response.status === 401) return { success: false, message: 'Invalid access token' };
    return { success: false, message: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

async function testWeather(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.api_key;
  if (!apiKey) return { success: false, message: 'API key not configured' };
  
  try {
    const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=New York`);
    if (response.ok) return { success: true, message: 'API key validated successfully' };
    if (response.status === 401 || response.status === 403) return { success: false, message: 'Invalid API key' };
    return { success: false, message: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

async function testHighway(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.api_key;
  if (!apiKey) return { success: false, message: 'API key not configured' };
  
  try {
    const response = await fetch('https://api.highway.com/v2/carriers?limit=1', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (response.ok) return { success: true, message: 'API key validated successfully' };
    if (response.status === 401) return { success: false, message: 'Invalid API key' };
    return { success: false, message: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

async function testOtrSolutions(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.api_key;
  const username = credentials.username;
  const password = credentials.password;
  
  // First try global secrets if tenant credentials not available
  const subscriptionKey = apiKey || Deno.env.get('OTR_API_KEY');
  const otrUsername = username || Deno.env.get('OTR_USERNAME');
  const otrPassword = password || Deno.env.get('OTR_PASSWORD');
  
  if (!subscriptionKey) return { success: false, message: 'API subscription key not configured' };
  if (!otrUsername || !otrPassword) return { success: false, message: 'OTR username/password not configured' };
  
  try {
    // OTR Solutions API - test authentication first
    const formData = new URLSearchParams();
    formData.append('username', otrUsername);
    formData.append('password', otrPassword);
    
    const authResponse = await fetch('https://servicesstg.otrsolutions.com/carrier-tms/2/auth/token', {
      method: 'POST',
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': subscriptionKey,
        'x-is-test': 'false'
      },
      body: formData.toString()
    });
    
    if (!authResponse.ok) {
      if (authResponse.status === 401 || authResponse.status === 403) {
        return { success: false, message: 'Invalid credentials or access denied' };
      }
      return { success: false, message: `Authentication failed: ${authResponse.status}` };
    }
    
    const tokenData = await authResponse.json();
    if (!tokenData.access_token) {
      return { success: false, message: 'No access token received' };
    }
    
    // Now test a broker check with the token
    const checkResponse = await fetch('https://servicesstg.otrsolutions.com/carrier-tms/2/broker-check/123456', {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'ocp-apim-subscription-key': subscriptionKey,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'x-is-test': 'false'
      }
    });
    
    // 404 = MC not found (which means API works), 200 = success
    if (checkResponse.ok || checkResponse.status === 404) {
      return { success: true, message: 'OTR Solutions API connected successfully' };
    }
    if (checkResponse.status === 401 || checkResponse.status === 403) {
      return { success: false, message: 'Token valid but access denied to broker check' };
    }
    return { success: false, message: `Broker check API error: ${checkResponse.status}` };
  } catch (error) {
    return { success: false, message: sanitizeError(error instanceof Error ? error.message : 'Connection failed') };
  }
}

// Global integrations that use the resolver pattern
const GLOBAL_INTEGRATIONS = ['mapbox', 'resend', 'weather', 'highway'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, provider } = body;

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

    // Get master key
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client after access verified
    const adminClient = getServiceClient();

    let credentials: Record<string, string>;
    let integration: { id?: string; is_enabled?: boolean; use_global?: boolean } = {};

    // For global integrations (mapbox, resend, weather, highway), use the resolver pattern
    if (GLOBAL_INTEGRATIONS.includes(provider)) {
      // Get platform integration config
      const { data: platformIntegration } = await adminClient
        .from('platform_integrations')
        .select('*')
        .eq('integration_key', provider)
        .single();

      // Get tenant override if exists
      const { data: tenantIntegration } = await adminClient
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('provider', provider)
        .single();

      integration = tenantIntegration || {};

      // Determine which config to use (resolver logic)
      if (tenantIntegration?.use_global === false && tenantIntegration?.override_config) {
        // Use tenant override
        try {
          const decrypted = await decrypt(tenantIntegration.override_config, masterKey);
          credentials = JSON.parse(decrypted);
        } catch (e) {
          console.error('Decryption failed for tenant override:', e);
          return new Response(
            JSON.stringify({ status: 'failed', message: 'Failed to decrypt tenant credentials' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else if (platformIntegration?.config?.encrypted) {
        // Use global config
        if (!platformIntegration.is_enabled) {
          return new Response(
            JSON.stringify({ status: 'disabled', message: 'Integration is disabled globally' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        try {
          const decrypted = await decrypt(platformIntegration.config.encrypted, masterKey);
          credentials = JSON.parse(decrypted);
        } catch (e) {
          console.error('Decryption failed for platform config:', e);
          return new Response(
            JSON.stringify({ status: 'failed', message: 'Failed to decrypt platform credentials' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ status: 'not_configured', message: 'No credentials configured for this integration' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Legacy tenant-only integrations (samsara, otr_solutions, etc.)
      const { data: tenantIntegration, error: fetchError } = await adminClient
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('provider', provider)
        .single();

      if (fetchError || !tenantIntegration) {
        return new Response(
          JSON.stringify({ error: 'Integration not configured' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      integration = tenantIntegration;

      // CONSTRAINT B: If disabled, do not test - preserve 'disabled' status
      if (tenantIntegration.is_enabled === false) {
        return new Response(
          JSON.stringify({ 
            status: 'disabled',
            message: 'Integration is disabled. Enable it before testing.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!tenantIntegration.credentials_encrypted) {
        return new Response(
          JSON.stringify({ error: 'No credentials configured for this integration' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Decrypt credentials
      try {
        const decrypted = await decrypt(tenantIntegration.credentials_encrypted, masterKey);
        credentials = JSON.parse(decrypted);
      } catch (e) {
        console.error('Decryption failed:', e);
        return new Response(
          JSON.stringify({ error: 'Failed to decrypt credentials' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Test the integration based on provider
    let result: { success: boolean; message: string };
    
    switch (provider) {
      case 'samsara':
        result = await testSamsara(credentials);
        break;
      case 'resend':
        result = await testResend(credentials);
        break;
      case 'mapbox':
        result = await testMapbox(credentials);
        break;
      case 'weather':
        result = await testWeather(credentials);
        break;
      case 'highway':
        result = await testHighway(credentials);
        break;
      case 'otr_solutions':
        result = await testOtrSolutions(credentials);
        break;
      default:
        result = { success: false, message: `Unknown provider: ${provider}` };
    }

    // Update tenant_integrations status if record exists
    if (integration.id) {
      await adminClient
        .from('tenant_integrations')
        .update({
          sync_status: result.success ? 'healthy' : 'failed',
          error_message: result.success ? null : sanitizeError(result.message),
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);
    }

    // Log usage event for global integrations
    if (GLOBAL_INTEGRATIONS.includes(provider)) {
      await adminClient.from('integration_usage_events').insert({
        tenant_id,
        integration_key: provider,
        event_type: result.success ? 'success' : 'error',
        meta: { action: 'test', message: result.message },
      });
    }

    console.log(`[test-tenant-integration] provider=${provider} tenant=${tenant_id} result=${result.success ? 'healthy' : 'failed'}`);

    return new Response(
      JSON.stringify({ 
        status: result.success ? 'healthy' : 'failed',
        message: result.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-tenant-integration:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
