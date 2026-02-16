import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

/**
 * Batched feature gate hook - fetches ALL feature flags in a single set of queries
 * instead of N individual queries. This eliminates the "tabs loading one by one" effect.
 *
 * Resolution order (same as useFeatureGate):
 * 1. Killswitch (globally disabled → OFF)
 * 2. Tenant override (tenant_feature_flags)
 * 3. Release channel default (release_channel_feature_flags)
 * 4. Global default (feature_flags.default_enabled)
 */

interface FeatureGatesResult {
  /** Check if a feature is enabled at the tenant level */
  isEnabledForTenant: (key: string) => boolean;
  /** Whether all gates have been resolved */
  isLoading: boolean;
  /** Refresh all gates */
  refresh: () => Promise<void>;
}

export function useFeatureGates(featureKeys: string[]): FeatureGatesResult {
  const { effectiveTenant, isPlatformAdmin, loading: tenantLoading } = useTenantContext();
  const [enabledMap, setEnabledMap] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const prevTenantRef = useRef<string | undefined>(effectiveTenant?.id);

  const resolveAll = useCallback(async () => {
    if (tenantLoading) return;

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEnabledMap(new Map());
        setIsLoading(false);
        return;
      }

      const tenantId = effectiveTenant?.id;
      const releaseChannel = effectiveTenant?.release_channel || "general";

      // 1. Fetch ALL feature flags in one query
      const { data: allFlags } = await supabase
        .from("feature_flags")
        .select("id, key, default_enabled, is_killswitch");

      if (!allFlags) {
        setEnabledMap(new Map());
        setIsLoading(false);
        return;
      }

      // Build lookup: key → flag
      const flagsByKey = new Map(allFlags.map(f => [f.key, f]));

      // 2. Fetch ALL tenant overrides in one query (if tenant exists)
      const tenantOverrides = new Map<string, boolean>();
      if (tenantId) {
        const { data: overrides } = await supabase
          .from("tenant_feature_flags")
          .select("feature_flag_id, enabled")
          .eq("tenant_id", tenantId);

        overrides?.forEach(o => tenantOverrides.set(o.feature_flag_id, o.enabled));
      }

      // 3. Fetch ALL channel defaults in one query
      const channelDefaults = new Map<string, boolean>();
      if (releaseChannel) {
        const { data: channelRows } = await supabase
          .from("release_channel_feature_flags")
          .select("feature_flag_id, enabled")
          .eq("release_channel", releaseChannel);

        channelRows?.forEach(r => channelDefaults.set(r.feature_flag_id, r.enabled));
      }

      // 4. Resolve each requested key
      const result = new Map<string, boolean>();
      for (const key of featureKeys) {
        const flag = flagsByKey.get(key);
        if (!flag) {
          result.set(key, false);
          continue;
        }

        // Killswitch
        if (flag.is_killswitch && !flag.default_enabled) {
          result.set(key, false);
          continue;
        }

        // Tenant override
        if (tenantOverrides.has(flag.id)) {
          result.set(key, tenantOverrides.get(flag.id)!);
          continue;
        }

        // Channel default
        if (channelDefaults.has(flag.id)) {
          result.set(key, channelDefaults.get(flag.id)!);
          continue;
        }

        // Global default
        result.set(key, flag.default_enabled);
      }

      setEnabledMap(result);
    } catch (error) {
      console.error("[useFeatureGates] Error:", error);
      setEnabledMap(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [tenantLoading, effectiveTenant?.id, effectiveTenant?.release_channel, featureKeys.join(",")]);

  // Reset on tenant change, then resolve
  useEffect(() => {
    if (tenantLoading) return;

    if (prevTenantRef.current !== effectiveTenant?.id) {
      setEnabledMap(new Map());
      setIsLoading(true);
      prevTenantRef.current = effectiveTenant?.id;
    }

    resolveAll();
  }, [resolveAll, effectiveTenant?.id, tenantLoading]);

  const isEnabledForTenant = useCallback(
    (key: string) => enabledMap.get(key) ?? false,
    [enabledMap]
  );

  return { isEnabledForTenant, isLoading, refresh: resolveAll };
}
