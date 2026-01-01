import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { tenant_id, provider, is_enabled, credentials, settings } = body;

    if (!tenant_id || !provider) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tenant_id, provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to tenant
    const { data: membership, error: membershipError } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (membershipError || !membership) {
      // Also check if platform admin
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

    // Get master key for encryption
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      console.error('INTEGRATIONS_MASTER_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare data for upsert
    const updateData: Record<string, unknown> = {
      tenant_id,
      provider,
      is_enabled: is_enabled ?? true,
      settings: settings || {},
      updated_at: new Date().toISOString(),
    };

    // Encrypt credentials if provided
    if (credentials && Object.keys(credentials).length > 0) {
      const encrypted = await encrypt(JSON.stringify(credentials), masterKey);
      updateData.credentials_encrypted = encrypted;
      updateData.credentials_hint = generateHint(credentials);
    }

    // Use service role for the actual write (since we've verified access)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

    console.log(`Integration ${provider} configured for tenant ${tenant_id} by user ${user.id}`);

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
