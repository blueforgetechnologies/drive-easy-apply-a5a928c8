import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SetGlobalDefaultRequest {
  action: 'set_global_default';
  feature_flag_id: string;
  enabled: boolean;
}

interface SetAllGlobalDefaultsOffRequest {
  action: 'set_all_global_defaults_off';
}

interface SetChannelDefaultRequest {
  action: 'set_channel_default';
  feature_flag_id: string;
  release_channel: 'internal' | 'pilot' | 'general';
  enabled: boolean;
}

interface ClearChannelDefaultRequest {
  action: 'clear_channel_default';
  feature_flag_id: string;
  release_channel: 'internal' | 'pilot' | 'general';
}

interface ClearAllChannelDefaultsRequest {
  action: 'clear_all_channel_defaults';
  feature_flag_id: string;
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

interface ClearAllTenantOverridesRequest {
  action: 'clear_all_tenant_overrides';
  feature_flag_id: string;
}

type RolloutRequest = 
  | SetGlobalDefaultRequest 
  | SetAllGlobalDefaultsOffRequest
  | SetChannelDefaultRequest 
  | ClearChannelDefaultRequest
  | ClearAllChannelDefaultsRequest
  | SetTenantOverrideRequest 
  | RemoveTenantOverrideRequest
  | ClearAllTenantOverridesRequest;

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  is_killswitch: boolean;
  default_enabled: boolean;
}

// Safe audit log writer - tries feature_flag_audit_log first, falls back to audit_logs
async function writeAudit(
  serviceClient: any,
  params: {
    tenant_id: string | null;
    admin_user_id: string;
    action: string;
    feature_flag_id: string | null;
    metadata: Record<string, unknown>;
  }
) {
  try {
    // Try feature_flag_audit_log first
    const { error: ffAuditError } = await serviceClient
      .from('feature_flag_audit_log')
      .insert({
        feature_flag_id: params.feature_flag_id,
        action: params.action,
        changed_by: params.admin_user_id,
        tenant_id: params.tenant_id,
        old_value: params.metadata.old_value || null,
        new_value: params.metadata.new_value || null,
      });

    if (!ffAuditError) {
      console.log(`[platform-rollout-control] Audit logged to feature_flag_audit_log: ${params.action}`);
      return;
    }

    // Fallback to audit_logs (requires tenant_id)
    if (params.tenant_id) {
      const { error: auditError } = await serviceClient
        .from('audit_logs')
        .insert({
          user_id: params.admin_user_id,
          action: params.action,
          entity_type: 'feature_flag',
          entity_id: params.feature_flag_id || 'system',
          tenant_id: params.tenant_id,
          new_value: JSON.stringify(params.metadata),
        });

      if (auditError) {
        console.error('[platform-rollout-control] Failed to write audit log:', auditError);
      } else {
        console.log(`[platform-rollout-control] Audit logged to audit_logs: ${params.action}`);
      }
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
      // ==================== GLOBAL DEFAULT CONTROLS ====================
      case 'set_global_default': {
        const { feature_flag_id, enabled } = body as SetGlobalDefaultRequest;

        if (!feature_flag_id || typeof enabled !== 'boolean') {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id and enabled are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch flag
        const { data: flag, error: flagError } = await serviceClient
          .from('feature_flags')
          .select('id, key, name, is_killswitch, default_enabled')
          .eq('id', feature_flag_id)
          .single();

        if (flagError || !flag) {
          return new Response(
            JSON.stringify({ error: 'Feature flag not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const oldValue = flag.default_enabled;

        // Update feature_flags.default_enabled
        const { error: updateError } = await serviceClient
          .from('feature_flags')
          .update({ default_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('id', feature_flag_id);

        if (updateError) {
          console.error('Error updating global default:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update global default' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id: null,
          admin_user_id: adminUserId,
          action: 'global_default_changed',
          feature_flag_id,
          metadata: {
            flag_key: flag.key,
            old_value: { default_enabled: oldValue },
            new_value: { default_enabled: enabled },
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} set global default: ${flag.key} = ${enabled}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action,
            feature_flag_id,
            enabled,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'set_all_global_defaults_off': {
        // Fetch all non-killswitch flags that are currently enabled
        const { data: flags, error: flagsError } = await serviceClient
          .from('feature_flags')
          .select('id, key, name, default_enabled')
          .eq('default_enabled', true);

        if (flagsError) {
          console.error('Error fetching flags:', flagsError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch feature flags' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!flags || flags.length === 0) {
          return new Response(
            JSON.stringify({ success: true, action, updated_count: 0 }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const flagIds = flags.map(f => f.id);

        // Update all to default_enabled = false
        const { error: updateError } = await serviceClient
          .from('feature_flags')
          .update({ default_enabled: false, updated_at: new Date().toISOString() })
          .in('id', flagIds);

        if (updateError) {
          console.error('Error updating global defaults:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update global defaults' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log for each
        for (const flag of flags) {
          await writeAudit(serviceClient, {
            tenant_id: null,
            admin_user_id: adminUserId,
            action: 'global_default_changed_bulk',
            feature_flag_id: flag.id,
            metadata: {
              flag_key: flag.key,
              old_value: { default_enabled: true },
              new_value: { default_enabled: false },
              bulk_operation: 'set_all_global_defaults_off',
            },
          });
        }

        console.log(`[platform-rollout-control] Admin ${adminUserId} set all global defaults OFF (${flags.length} flags)`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            action,
            updated_count: flags.length,
            updated_flags: flags.map(f => f.key),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ==================== CHANNEL DEFAULT CONTROLS ====================
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
          feature_flag_id,
          metadata: {
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

      case 'clear_channel_default': {
        const { feature_flag_id, release_channel } = body as ClearChannelDefaultRequest;

        if (!feature_flag_id || !release_channel) {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id and release_channel are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch flag for audit
        const { data: flag } = await serviceClient
          .from('feature_flags')
          .select('key')
          .eq('id', feature_flag_id)
          .single();

        // Get current value for audit log
        const { data: existingDefault } = await serviceClient
          .from('release_channel_feature_flags')
          .select('id, enabled')
          .eq('feature_flag_id', feature_flag_id)
          .eq('release_channel', release_channel)
          .maybeSingle();

        if (!existingDefault) {
          return new Response(
            JSON.stringify({ success: true, action, message: 'No channel default to clear' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete the channel default
        const { error: deleteError } = await serviceClient
          .from('release_channel_feature_flags')
          .delete()
          .eq('feature_flag_id', feature_flag_id)
          .eq('release_channel', release_channel);

        if (deleteError) {
          console.error('Error deleting channel default:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to clear channel default' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id: null,
          admin_user_id: adminUserId,
          action: 'channel_default_cleared',
          feature_flag_id,
          metadata: {
            flag_key: flag?.key,
            release_channel,
            old_value: { enabled: existingDefault.enabled },
            new_value: null,
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} cleared channel default: ${flag?.key} on ${release_channel}`);

        return new Response(
          JSON.stringify({ success: true, action, feature_flag_id, release_channel }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'clear_all_channel_defaults': {
        const { feature_flag_id } = body as ClearAllChannelDefaultsRequest;

        if (!feature_flag_id) {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch flag for audit
        const { data: flag } = await serviceClient
          .from('feature_flags')
          .select('key')
          .eq('id', feature_flag_id)
          .single();

        // Get current values for audit log
        const { data: existingDefaults } = await serviceClient
          .from('release_channel_feature_flags')
          .select('release_channel, enabled')
          .eq('feature_flag_id', feature_flag_id);

        if (!existingDefaults || existingDefaults.length === 0) {
          return new Response(
            JSON.stringify({ success: true, action, cleared_count: 0 }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete all channel defaults for this flag
        const { error: deleteError } = await serviceClient
          .from('release_channel_feature_flags')
          .delete()
          .eq('feature_flag_id', feature_flag_id);

        if (deleteError) {
          console.error('Error deleting channel defaults:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to clear channel defaults' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id: null,
          admin_user_id: adminUserId,
          action: 'channel_defaults_cleared_all',
          feature_flag_id,
          metadata: {
            flag_key: flag?.key,
            old_value: existingDefaults,
            new_value: null,
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} cleared all channel defaults for: ${flag?.key}`);

        return new Response(
          JSON.stringify({ success: true, action, feature_flag_id, cleared_count: existingDefaults.length }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ==================== TENANT OVERRIDE CONTROLS ====================
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
          feature_flag_id,
          metadata: {
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
          feature_flag_id,
          metadata: {
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

      case 'clear_all_tenant_overrides': {
        const { feature_flag_id } = body as ClearAllTenantOverridesRequest;

        if (!feature_flag_id) {
          return new Response(
            JSON.stringify({ error: 'feature_flag_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch flag for audit
        const { data: flag } = await serviceClient
          .from('feature_flags')
          .select('key')
          .eq('id', feature_flag_id)
          .single();

        // Get current overrides for audit log
        const { data: existingOverrides } = await serviceClient
          .from('tenant_feature_flags')
          .select('tenant_id, enabled')
          .eq('feature_flag_id', feature_flag_id);

        if (!existingOverrides || existingOverrides.length === 0) {
          return new Response(
            JSON.stringify({ success: true, action, cleared_count: 0 }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete all tenant overrides for this flag
        const { error: deleteError } = await serviceClient
          .from('tenant_feature_flags')
          .delete()
          .eq('feature_flag_id', feature_flag_id);

        if (deleteError) {
          console.error('Error deleting tenant overrides:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to clear tenant overrides' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Audit log
        await writeAudit(serviceClient, {
          tenant_id: null,
          admin_user_id: adminUserId,
          action: 'tenant_overrides_cleared_all',
          feature_flag_id,
          metadata: {
            flag_key: flag?.key,
            old_value: existingOverrides,
            new_value: null,
          },
        });

        console.log(`[platform-rollout-control] Admin ${adminUserId} cleared all tenant overrides for: ${flag?.key}`);

        return new Response(
          JSON.stringify({ success: true, action, feature_flag_id, cleared_count: existingOverrides.length }),
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
