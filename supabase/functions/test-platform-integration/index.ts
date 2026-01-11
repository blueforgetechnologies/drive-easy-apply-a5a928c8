import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM decryption
async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      keyMaterial,
      data
    );
    
    return decoder.decode(decrypted);
  } catch {
    throw new Error('Failed to decrypt configuration');
  }
}

async function testMapbox(token: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${token}&limit=1`
    );
    
    if (response.ok) {
      return { success: true, message: 'Mapbox API connection successful' };
    } else if (response.status === 401) {
      return { success: false, message: 'Invalid Mapbox token' };
    } else {
      return { success: false, message: `Mapbox API error: ${response.status}` };
    }
  } catch (e) {
    return { success: false, message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

async function testResend(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    if (response.ok) {
      return { success: true, message: 'Resend API connection successful' };
    } else if (response.status === 401) {
      return { success: false, message: 'Invalid Resend API key' };
    } else {
      return { success: false, message: `Resend API error: ${response.status}` };
    }
  } catch (e) {
    return { success: false, message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

async function testWeather(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=New+York`
    );
    
    if (response.ok) {
      return { success: true, message: 'Weather API connection successful' };
    } else if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid Weather API key' };
    } else {
      return { success: false, message: `Weather API error: ${response.status}` };
    }
  } catch (e) {
    return { success: false, message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

async function testHighway(apiKey: string): Promise<{ success: boolean; message: string }> {
  // Highway API test - placeholder since we don't have real endpoint details
  if (!apiKey || apiKey.length < 10) {
    return { success: false, message: 'Invalid Highway API key format' };
  }
  return { success: true, message: 'Highway API key format validated (connection test not available)' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY')!;
    
    // Create auth client to verify user
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is platform admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { integration_key } = body;

    if (!integration_key) {
      return new Response(
        JSON.stringify({ error: 'integration_key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get platform integration config
    const { data: integration, error: fetchError } = await adminClient
      .from('platform_integrations')
      .select('*')
      .eq('integration_key', integration_key)
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Integration not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.config?.encrypted) {
      return new Response(
        JSON.stringify({ status: 'not_configured', message: 'No API key configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt config
    let config: Record<string, string>;
    try {
      const decrypted = await decrypt(integration.config.encrypted, masterKey);
      config = JSON.parse(decrypted);
    } catch {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Failed to decrypt configuration' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test the integration
    let result: { success: boolean; message: string };

    switch (integration_key) {
      case 'mapbox':
        result = await testMapbox(config.token || config.api_key || '');
        break;
      case 'resend':
        result = await testResend(config.api_key || '');
        break;
      case 'weather':
        result = await testWeather(config.api_key || '');
        break;
      case 'highway':
        result = await testHighway(config.api_key || '');
        break;
      default:
        result = { success: false, message: 'Unknown integration type' };
    }

    console.log(`[test-platform-integration] ${integration_key} test by ${user.id}: ${result.success ? 'success' : 'failed'}`);

    return new Response(
      JSON.stringify({ 
        status: result.success ? 'healthy' : 'error',
        message: result.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-platform-integration] Error:', error);
    return new Response(
      JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
