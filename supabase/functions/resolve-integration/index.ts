import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess } from "../_shared/assertTenantAccess.ts";
import { deriveTenantFromJWT } from "../_shared/deriveTenantFromJWT.ts";

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

interface ResolvedConfig {
  source: 'global' | 'tenant_override' | 'global_disabled' | 'not_configured';
  is_enabled: boolean;
  config?: Record<string, string>;
  config_hint?: string;
  error?: string;
  integration_key: string;
}

/**
 * Resolves integration configuration for a tenant
 * Priority: tenant_override (if use_global=false) > global
 * 
 * This is the SINGLE SOURCE OF TRUTH for integration config
 * All edge functions should call this to get the correct config
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    let { tenant_id, integration_key, decrypt_config = false } = body;

    // Derive tenant from JWT if not provided
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

    if (!integration_key) {
      return new Response(
        JSON.stringify({ error: 'integration_key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify tenant access
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY')!;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get global platform config
    const { data: platform } = await adminClient
      .from('platform_integrations')
      .select('*')
      .eq('integration_key', integration_key)
      .single();

    // Get tenant-specific config
    const { data: tenant } = await adminClient
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', integration_key)
      .single();

    let result: ResolvedConfig;

    // Resolution logic - same as DB function but with decryption capability
    if (tenant?.use_global === false && tenant?.override_config) {
      // Tenant override
      let config: Record<string, string> | undefined;
      if (decrypt_config && tenant.override_config) {
        try {
          const decrypted = await decrypt(tenant.override_config, masterKey);
          config = JSON.parse(decrypted);
        } catch (e) {
          console.error('[resolve-integration] Failed to decrypt tenant config:', e);
        }
      }

      result = {
        source: 'tenant_override',
        is_enabled: tenant.is_enabled ?? true,
        config,
        config_hint: tenant.override_hint,
        integration_key,
      };
    } else if (platform) {
      // Global config
      if (!platform.is_enabled) {
        // Check if tenant has an override that enables it
        if (tenant?.use_global === false && tenant?.is_enabled) {
          let config: Record<string, string> | undefined;
          if (decrypt_config && tenant.override_config) {
            try {
              const decrypted = await decrypt(tenant.override_config, masterKey);
              config = JSON.parse(decrypted);
            } catch (e) {
              console.error('[resolve-integration] Failed to decrypt tenant config:', e);
            }
          }
          result = {
            source: 'tenant_override',
            is_enabled: true,
            config,
            config_hint: tenant.override_hint,
            integration_key,
          };
        } else {
          result = {
            source: 'global_disabled',
            is_enabled: false,
            error: 'Integration is disabled globally',
            integration_key,
          };
        }
      } else {
        // Global is enabled
        let config: Record<string, string> | undefined;
        if (decrypt_config && platform.config?.encrypted) {
          try {
            const decrypted = await decrypt(platform.config.encrypted, masterKey);
            config = JSON.parse(decrypted);
          } catch (e) {
            console.error('[resolve-integration] Failed to decrypt platform config:', e);
          }
        }

        result = {
          source: 'global',
          is_enabled: true,
          config,
          config_hint: platform.config_hint,
          integration_key,
        };
      }
    } else {
      // No config found anywhere
      result = {
        source: 'not_configured',
        is_enabled: false,
        error: 'Integration not configured',
        integration_key,
      };
    }

    // Log usage for analytics (if config was requested for actual use)
    if (decrypt_config && result.is_enabled) {
      await adminClient.from('integration_usage_events').insert({
        tenant_id,
        integration_key,
        event_type: 'request',
        meta: { source: result.source },
      });
    }

    console.log(`[resolve-integration] tenant=${tenant_id} key=${integration_key} source=${result.source} enabled=${result.is_enabled}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[resolve-integration] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
