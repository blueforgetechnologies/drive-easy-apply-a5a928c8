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
  
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

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

function generateHint(config: Record<string, string>): string {
  const keyNames = ['api_key', 'apiKey', 'token', 'secret', 'key'];
  for (const keyName of keyNames) {
    if (config[keyName]) {
      const value = config[keyName];
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
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
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
    const { action, integration_key, is_enabled, config } = body;

    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list') {
      // List all platform integrations
      const { data: integrations, error } = await adminClient
        .from('platform_integrations')
        .select('*')
        .order('integration_key');

      if (error) throw error;

      return new Response(
        JSON.stringify({ integrations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get') {
      if (!integration_key) {
        return new Response(
          JSON.stringify({ error: 'integration_key required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: integration, error } = await adminClient
        .from('platform_integrations')
        .select('*')
        .eq('integration_key', integration_key)
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ integration }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update') {
      if (!integration_key) {
        return new Response(
          JSON.stringify({ error: 'integration_key required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      if (typeof is_enabled === 'boolean') {
        updateData.is_enabled = is_enabled;
      }

      if (config && Object.keys(config).length > 0) {
        // Encrypt and store the config
        const encryptedConfig = await encrypt(JSON.stringify(config), masterKey);
        updateData.config = { encrypted: encryptedConfig };
        updateData.config_hint = generateHint(config);
      }

      const { data: updated, error } = await adminClient
        .from('platform_integrations')
        .update(updateData)
        .eq('integration_key', integration_key)
        .select()
        .single();

      if (error) throw error;

      console.log(`[manage-platform-integration] ${integration_key} updated by ${user.id}`);

      return new Response(
        JSON.stringify({ success: true, integration: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[manage-platform-integration] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
