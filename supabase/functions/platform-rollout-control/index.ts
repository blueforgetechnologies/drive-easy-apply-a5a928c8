import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SetChannelDefaultRequest {
  action: 'set_channel_default';
  feature_flag_id: string;
  release_channel: 'internal' | 'pilot' | 'general';
  enabled: boolean;
}

interface SetTenantOverrideRequest {
  action: 'set_tenant_override';
  feature_flag_id: string;
  tenant_id: string;
  enabled: boolean;
}

interface RemoveTenantOverrideRequest {
  action: 'remove_tenant_override';
  feature_flag_id: string;
  tenant_id: string;
}

type RolloutRequest = SetChannelDefaultRequest | SetTenantOverrideRequest | RemoveTenantOverrideRequest;

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  is_killswitch: boolean;
  default_enabled: boolean;
}

// Safe audit log writer - tries tenant_audit_log first, falls back to audit_logs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAudit(
  serviceClient: any,
  params: {
    tenant_id: string | null;
    admin_user_id: string;
    action: string;
    metadata: Record<string, unknown>;
  }
) {
  try {
    // Try tenant_audit_log first
    const { error: tenantAuditError } = await serviceClient
      .from('tenant_audit_log')
      .insert({
        tenant_id: params.tenant_id,
        action: params.action,
        changed_by: params.admin_user_id,
        old_value: params.metadata.old_value || null,
        new_value: params.metadata.new_value || null,
      });

    if (!tenantAuditError) {
      console.log(`[platform-rollout-control] Audit logged to tenant_audit_log: ${params.action}`);
      return;
    }

    // Fallback to audit_logs
    const { error: auditError } = await serviceClient
      .from('audit_logs')
      .insert({
        user_id: params.admin_user_id,
        action: params.action,
        entity_type: 'feature_flag',
        entity_id: params.metadata.feature_flag_id as string || 'system',
        new_value: JSON.stringify(params.metadata),
      });

    if (auditError) {
      console.error('[platform-rollout-control] Failed to write audit log:', auditError);
    } else {
      console.log(`[platform-rollout-control] Audit logged to audit_logs: ${params.action}`);
    }
  } catch (err) {
    // Never fail the main action due to audit logging
    console.error('[platform-rollout-control] Audit logging error (non-fatal):', err);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require platform admin
    const authHeader = req.headers.get('Authorization');
    const adminCheck = await assertPlatformAdmin(authHeader);
    
    if (!adminCheck.allowed) {
      return adminCheck.response!;
    }

    const adminUserId = adminCheck.user_id!;

    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: RolloutRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = body;
    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Helper to fetch and validate flag with killswitch check
    async function getFeatureFlagWithKillswitchCheck(
      featureFlagId: string,
      enableAttempt: boolean
    ): Promise<{ flag: FeatureFlag | null; error?: Response }> {
      const { data: flag, error: flagError } = await serviceClient
        .from('feature_flags')
        .select('id, key, name, is_killswitch, default_enabled')
        .eq('id', featureFlagId)
        .single();

      if (flagError || !flag) {
        return {
          flag: null,
          error: new Response(
            JSON.stringify({ error: 'Feature flag not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        };
      }

      // KILLSWITCH RULE: If is_killswitch=true AND default_enabled=false, cannot enable anywhere
      if (flag.is_killswitch && !flag.default_enabled && enableAttempt) {
        console.log(`[platform-rollout-control] Blocked enabling killswitch flag: ${flag.key}`);
        return {
          flag: null,
          error: new Response(
            JSON.stringify({ 
              error: 'killswitch_cannot_enable', 
              flag_key: flag.key,
              message: `Cannot enable "${flag.name}" - killswitch is globally disabled`
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        };
      }

      return { flag: flag as FeatureFlag };
    }

    // Handle each action type
    switch (action) {
      case 'set_channel_default': {
        const { feature_flag_id, release_channel, enabled } = body as SetChannelDefaultRequest;

        // Validate inputs
        if (!feature_flag_id || !release_channel || typeof enabled !== 'boolean') {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id, release_channel, and enabled are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const validChannels = ['internal', 'pilot', 'general'];
        if (!validChannels.includes(release_channel)) {
          return new Response(
            JSON.stringify({ error: `Invalid release_channel. Must be one of: ${validChannels.join(', ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate feature flag exists and check killswitch
        const { flag, error: flagCheckError } = await getFeatureFlagWithKillswitchCheck(feature_flag_id, enabled);
        if (flagCheckError) return flagCheckError;

        // Get current value for audit log
        const { data: existingDefault } = await serviceClient
          .from('release_channel_feature_flags')
          .select('id, enabled')
          .eq('feature_flag_id', feature_flag_id)
          .eq('release_channel', release_channel)
          .maybeSingle();

        const oldValue = existingDefault?.enabled ?? null;

        // Upsert the channel default
        const { error: upsertError } = await serviceClient
          .from('release_channel_feature_flags')
          .upsert({
            feature_flag_id,
            release_channel,
            enabled,
          }, {
            onConflict: 'feature_flag_id,release_channel',
          });

        if (upsertError) {
          console.error('Error upserting channel default:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to update channel default' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id: null, // Channel defaults are global
          admin_user_id: adminUserId,
          action: 'channel_default_change',
          metadata: {
            feature_flag_id,
            flag_key: flag!.key,
            release_channel,
            old_value: { enabled: oldValue },
            new_value: { enabled },
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} set channel default: ${flag!.key} on ${release_channel} = ${enabled}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action,
            feature_flag_id,
            release_channel,
            enabled,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'set_tenant_override': {
        const { feature_flag_id, tenant_id, enabled } = body as SetTenantOverrideRequest;

        // Validate inputs
        if (!feature_flag_id || !tenant_id || typeof enabled !== 'boolean') {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id, tenant_id, and enabled are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate feature flag exists and check killswitch
        const { flag, error: flagCheckError } = await getFeatureFlagWithKillswitchCheck(feature_flag_id, enabled);
        if (flagCheckError) return flagCheckError;

        // Validate tenant exists
        const { data: tenant, error: tenantError } = await serviceClient
          .from('tenants')
          .select('id, name')
          .eq('id', tenant_id)
          .single();

        if (tenantError || !tenant) {
          return new Response(
            JSON.stringify({ error: 'Tenant not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get current value for audit log
        const { data: existingOverride } = await serviceClient
          .from('tenant_feature_flags')
          .select('id, enabled')
          .eq('feature_flag_id', feature_flag_id)
          .eq('tenant_id', tenant_id)
          .maybeSingle();

        const oldValue = existingOverride?.enabled ?? null;

        // Upsert the tenant override
        const { error: upsertError } = await serviceClient
          .from('tenant_feature_flags')
          .upsert({
            feature_flag_id,
            tenant_id,
            enabled,
          }, {
            onConflict: 'tenant_id,feature_flag_id',
          });

        if (upsertError) {
          console.error('Error upserting tenant override:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to update tenant override' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id,
          admin_user_id: adminUserId,
          action: 'tenant_override_change',
          metadata: {
            feature_flag_id,
            flag_key: flag!.key,
            tenant_name: tenant.name,
            old_value: { enabled: oldValue },
            new_value: { enabled },
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} set tenant override: ${flag!.key} for ${tenant.name} = ${enabled}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action,
            feature_flag_id,
            tenant_id,
            enabled,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'remove_tenant_override': {
        const { feature_flag_id, tenant_id } = body as RemoveTenantOverrideRequest;

        // Validate inputs
        if (!feature_flag_id || !tenant_id) {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id and tenant_id are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate feature flag exists (no killswitch check needed for removal)
        const { data: flag, error: flagError } = await serviceClient
          .from('feature_flags')
          .select('id, key, name')
          .eq('id', feature_flag_id)
          .single();

        if (flagError || !flag) {
          return new Response(
            JSON.stringify({ error: 'Feature flag not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate tenant exists
        const { data: tenant, error: tenantError } = await serviceClient
          .from('tenants')
          .select('id, name')
          .eq('id', tenant_id)
          .single();

        if (tenantError || !tenant) {
          return new Response(
            JSON.stringify({ error: 'Tenant not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get current value for audit log
        const { data: existingOverride } = await serviceClient
          .from('tenant_feature_flags')
          .select('id, enabled')
          .eq('feature_flag_id', feature_flag_id)
          .eq('tenant_id', tenant_id)
          .maybeSingle();

        if (!existingOverride) {
          return new Response(
            JSON.stringify({ error: 'Override not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete the override
        const { error: deleteError } = await serviceClient
          .from('tenant_feature_flags')
          .delete()
          .eq('feature_flag_id', feature_flag_id)
          .eq('tenant_id', tenant_id);

        if (deleteError) {
          console.error('Error deleting tenant override:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to remove tenant override' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id,
          admin_user_id: adminUserId,
          action: 'tenant_override_removed',
          metadata: {
            feature_flag_id,
            flag_key: flag.key,
            tenant_name: tenant.name,
            old_value: { enabled: existingOverride.enabled },
            new_value: null,
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} removed tenant override: ${flag.key} for ${tenant.name}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action,
            feature_flag_id,
            tenant_id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[platform-rollout-control] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
