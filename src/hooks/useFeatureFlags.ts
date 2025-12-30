import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Release channel defaults - features are rolled out progressively
// internal → pilot → general
// This MUST mirror the logic in inspector-feature-flags edge function
const RELEASE_CHANNEL_DEFAULTS: Record<string, Record<string, boolean>> = {
  internal: {
    // Internal gets all experimental features
  },
  pilot: {
    // Pilot gets stable beta features
  },
  general: {
    // General gets fully stable features only
  },
};

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  default_enabled: boolean;
  is_killswitch: boolean;
}

interface TenantFeatureOverride {
  feature_flag_id: string;
  enabled: boolean;
}

interface FeatureFlagResolution {
  flag_key: string;
  effective_value: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default';
}

interface UseFeatureFlagsResult {
  flags: Map<string, boolean>;
  isEnabled: (flagKey: string) => boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getResolution: (flagKey: string) => FeatureFlagResolution | null;
}

/**
 * Shared hook for feature flag resolution.
 * Uses the SAME resolution logic as the backend:
 * 1. Killswitch check (if globally disabled via killswitch, always OFF)
 * 2. Tenant override (if exists)
 * 3. Release channel default (if exists)
 * 4. Global default
 */
export function useFeatureFlags(tenantId?: string): UseFeatureFlagsResult {
  const [flags, setFlags] = useState<Map<string, boolean>>(new Map());
  const [resolutions, setResolutions] = useState<Map<string, FeatureFlagResolution>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releaseChannel, setReleaseChannel] = useState<string | null>(null);

  const resolveFlags = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // Fetch all feature flags
      const { data: featureFlags, error: flagsError } = await supabase
        .from("feature_flags")
        .select("id, key, name, default_enabled, is_killswitch");

      if (flagsError) {
        setError(flagsError.message);
        setLoading(false);
        return;
      }

      // Get tenant's release channel and overrides if tenantId provided
      let tenantChannel: string | null = null;
      const tenantOverrides = new Map<string, boolean>();

      if (tenantId) {
        // Fetch tenant release channel
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("release_channel")
          .eq("id", tenantId)
          .single();

        if (!tenantError && tenant) {
          tenantChannel = tenant.release_channel;
          setReleaseChannel(tenant.release_channel);
        }

        // Fetch tenant-specific overrides
        const { data: overrides, error: overridesError } = await supabase
          .from("tenant_feature_flags")
          .select("feature_flag_id, enabled")
          .eq("tenant_id", tenantId);

        if (!overridesError && overrides) {
          for (const override of overrides) {
            tenantOverrides.set(override.feature_flag_id, override.enabled);
          }
        }
      }

      // Resolve effective value for each flag
      const resolvedFlags = new Map<string, boolean>();
      const flagResolutions = new Map<string, FeatureFlagResolution>();

      for (const flag of (featureFlags || [])) {
        const globalDefault = flag.default_enabled ?? false;
        const isKillswitch = flag.is_killswitch ?? false;

        // Check release channel defaults
        let releaseChannelValue: boolean | null = null;
        if (tenantChannel && RELEASE_CHANNEL_DEFAULTS[tenantChannel]) {
          const channelDefaults = RELEASE_CHANNEL_DEFAULTS[tenantChannel];
          if (flag.key in channelDefaults) {
            releaseChannelValue = channelDefaults[flag.key];
          }
        }

        // Check tenant override
        const tenantOverrideValue = tenantOverrides.has(flag.id)
          ? tenantOverrides.get(flag.id)!
          : null;

        // Determine effective value and source
        let effectiveValue: boolean;
        let source: 'tenant_override' | 'release_channel' | 'global_default';

        // Killswitch overrides everything - if globally disabled via killswitch, it's OFF
        if (isKillswitch && !globalDefault) {
          effectiveValue = false;
          source = 'global_default';
        } else if (tenantOverrideValue !== null) {
          effectiveValue = tenantOverrideValue;
          source = 'tenant_override';
        } else if (releaseChannelValue !== null) {
          effectiveValue = releaseChannelValue;
          source = 'release_channel';
        } else {
          effectiveValue = globalDefault;
          source = 'global_default';
        }

        resolvedFlags.set(flag.key, effectiveValue);
        flagResolutions.set(flag.key, {
          flag_key: flag.key,
          effective_value: effectiveValue,
          source,
        });
      }

      setFlags(resolvedFlags);
      setResolutions(flagResolutions);
    } catch (err) {
      console.error("Error resolving feature flags:", err);
      setError("Failed to resolve feature flags");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    resolveFlags();
  }, [resolveFlags]);

  const isEnabled = useCallback((flagKey: string): boolean => {
    return flags.get(flagKey) ?? false;
  }, [flags]);

  const getResolution = useCallback((flagKey: string): FeatureFlagResolution | null => {
    return resolutions.get(flagKey) ?? null;
  }, [resolutions]);

  return {
    flags,
    isEnabled,
    loading,
    error,
    refresh: resolveFlags,
    getResolution,
  };
}

/**
 * Simple helper to check a single feature flag.
 * For use in components that only need to check one flag.
 */
export function useFeatureFlag(flagKey: string, tenantId?: string): {
  enabled: boolean;
  loading: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default' | null;
} {
  const { isEnabled, loading, getResolution } = useFeatureFlags(tenantId);
  const resolution = getResolution(flagKey);

  return {
    enabled: isEnabled(flagKey),
    loading,
    source: resolution?.source ?? null,
  };
}
