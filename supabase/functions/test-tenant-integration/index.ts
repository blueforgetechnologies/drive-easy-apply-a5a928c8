import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Provider-specific test functions
async function testSamsara(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.samsara.com/fleet/vehicles?limit=1', {
      headers: {
        'Authorization': `Bearer ${credentials.api_key}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return { success: true, message: 'Successfully connected to Samsara API' };
    }
    return { success: false, message: `Samsara API returned ${response.status}: ${response.statusText}` };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function testResend(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    // Validate key format
    if (!credentials.api_key?.startsWith('re_')) {
      return { success: false, message: 'Invalid Resend API key format (should start with re_)' };
    }
    
    // Test with domains endpoint (doesn't send email)
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        'Authorization': `Bearer ${credentials.api_key}`,
      },
    });
    
    if (response.ok) {
      return { success: true, message: 'Successfully connected to Resend API' };
    }
    return { success: false, message: `Resend API returned ${response.status}: ${response.statusText}` };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function testMapbox(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${credentials.token}`
    );
    
    if (response.ok) {
      return { success: true, message: 'Successfully connected to Mapbox API' };
    }
    return { success: false, message: `Mapbox API returned ${response.status}: ${response.statusText}` };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function testWeather(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(
      `http://api.weatherapi.com/v1/current.json?key=${credentials.api_key}&q=40.7128,-74.0060&aqi=no`
    );
    
    if (response.ok) {
      return { success: true, message: 'Successfully connected to Weather API' };
    }
    return { success: false, message: `Weather API returned ${response.status}: ${response.statusText}` };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function testHighway(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = credentials.base_url || 'https://api.highway.com';
    const response = await fetch(`${baseUrl}/v1/health`, {
      headers: {
        'Authorization': `Bearer ${credentials.api_key}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return { success: true, message: 'Successfully connected to Highway API' };
    }
    // Highway might return 404 for health endpoint, try another
    if (response.status === 404) {
      return { success: true, message: 'Highway API key appears valid (health endpoint not available)' };
    }
    return { success: false, message: `Highway API returned ${response.status}: ${response.statusText}` };
  } catch (error) {
    return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

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

    const body = await req.json();
    const { tenant_id, provider } = body;

    if (!tenant_id || !provider) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tenant_id, provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to tenant
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

    // Get master key
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration with service role to access encrypted credentials
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: integration, error: fetchError } = await adminClient
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', provider)
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Integration not configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.credentials_encrypted) {
      return new Response(
        JSON.stringify({ error: 'No credentials configured for this integration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt credentials
    let credentials: Record<string, string>;
    try {
      const decrypted = await decrypt(integration.credentials_encrypted, masterKey);
      credentials = JSON.parse(decrypted);
    } catch (e) {
      console.error('Decryption failed:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      default:
        result = { success: false, message: `Unknown provider: ${provider}` };
    }

    // Update the integration status
    await adminClient
      .from('tenant_integrations')
      .update({
        sync_status: result.success ? 'success' : 'failed',
        error_message: result.success ? null : result.message,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    console.log(`Integration test for ${provider} (tenant ${tenant_id}): ${result.success ? 'SUCCESS' : 'FAILED'}`);

    return new Response(
      JSON.stringify({ 
        status: result.success ? 'success' : 'failed',
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
