import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

/**
 * Feature Gate Resolution Result
 * 
 * A feature is accessible when:
 * 1. Feature is ENABLED for the tenant (via release-channel defaults + per-tenant override)
 * AND
 * 2. User is allowed (platform admin OR explicit user grant OR no user-level gating for that feature)
 */
interface FeatureGateResult {
  /** Whether the feature is enabled at the tenant level (channel + override) */
  isEnabledForTenant: boolean;
  /** Whether the current user can access (platform admin OR user grant) */
  canUserAccess: boolean;
  /** Combined: feature enabled AND user can access */
  isAccessible: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Resolution source for debugging */
  resolution: {
    tenantSource: 'killswitch' | 'tenant_override' | 'channel_default' | 'global_default' | 'not_found';
    userSource: 'platform_admin' | 'user_grant' | 'no_grant' | 'no_user_gating';
  } | null;
  /** Refresh the gate check */
  refresh: () => Promise<void>;
}

interface FeatureGateOptions {
  /** The feature key to check */
  featureKey: string;
  /** If true, user-level gating is enforced (requires explicit grant for non-admins) */
  requiresUserGrant?: boolean;
}

// Cache for feature flag definitions
let flagsCache: Map<string, {
  id: string;
  key: string;
  default_enabled: boolean;
  is_killswitch: boolean;
}> | null = null;
let flagsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Unified feature gate hook - SINGLE SOURCE OF TRUTH for feature access
 * 
 * Resolution order:
 * 1. Killswitch (if globally disabled via killswitch, always OFF)
 * 2. Tenant override (if exists in tenant_feature_flags)
 * 3. Release channel default (from release_channel_feature_flags)
 * 4. Global default (feature_flags.default_enabled)
 * 
 * Then, if requiresUserGrant is true:
 * - Platform admins always pass
 * - Others need explicit grant in tenant_feature_access
 */
export function useFeatureGate({ featureKey, requiresUserGrant = true }: FeatureGateOptions): FeatureGateResult {
  const { effectiveTenant, isPlatformAdmin, loading: tenantLoading } = useTenantContext();
  const [isEnabledForTenant, setIsEnabledForTenant] = useState(false);
  const [canUserAccess, setCanUserAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resolution, setResolution] = useState<FeatureGateResult['resolution']>(null);

  const checkGate = useCallback(async () => {
    // Wait for tenant context
    if (tenantLoading) return;

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // No user = no access
      if (!user) {
        setIsEnabledForTenant(false);
        setCanUserAccess(false);
        setResolution(null);
        setIsLoading(false);
        return;
      }

      const tenantId = effectiveTenant?.id;

      // === STEP 1: Check tenant-level feature enablement ===
      let tenantEnabled = false;
      let tenantSource: FeatureGateResult['resolution'] extends { tenantSource: infer T } ? T : never = 'not_found';

      // Refresh cache if stale
      if (!flagsCache || Date.now() - flagsCacheTime > CACHE_TTL) {
        const { data: flags } = await supabase
          .from("feature_flags")
          .select("id, key, default_enabled, is_killswitch");
        
        flagsCache = new Map((flags || []).map(f => [f.key, f]));
        flagsCacheTime = Date.now();
      }

      const flag = flagsCache.get(featureKey);

      if (!flag) {
        // Feature not defined - default to disabled for safety
        tenantEnabled = false;
        tenantSource = 'not_found';
      } else if (flag.is_killswitch && !flag.default_enabled) {
        // Killswitch is ON (feature globally disabled)
        tenantEnabled = false;
        tenantSource = 'killswitch';
      } else if (tenantId) {
        // Check tenant override first
        const { data: tenantOverride } = await supabase
          .from("tenant_feature_flags")
          .select("enabled")
          .eq("tenant_id", tenantId)
          .eq("feature_flag_id", flag.id)
          .maybeSingle();

        if (tenantOverride !== null) {
          tenantEnabled = tenantOverride.enabled;
          tenantSource = 'tenant_override';
        } else {
          // Check release channel default
          const releaseChannel = effectiveTenant?.release_channel || 'general';
          const { data: channelDefault } = await supabase
            .from("release_channel_feature_flags")
            .select("enabled")
            .eq("feature_flag_id", flag.id)
            .eq("release_channel", releaseChannel)
            .maybeSingle();

          if (channelDefault !== null) {
            tenantEnabled = channelDefault.enabled;
            tenantSource = 'channel_default';
          } else {
            // Fall back to global default
            tenantEnabled = flag.default_enabled;
            tenantSource = 'global_default';
          }
        }
      } else {
        // No tenant context - use global default
        tenantEnabled = flag.default_enabled;
        tenantSource = 'global_default';
      }

      setIsEnabledForTenant(tenantEnabled);

      // === STEP 2: Check user-level access ===
      let userAllowed = false;
      let userSource: FeatureGateResult['resolution'] extends { userSource: infer T } ? T : never = 'no_grant';

      if (!requiresUserGrant) {
        // No user-level gating for this feature
        userAllowed = true;
        userSource = 'no_user_gating';
      } else if (isPlatformAdmin) {
        // Platform admins always have access
        userAllowed = true;
        userSource = 'platform_admin';
      } else if (tenantId) {
        // Check for explicit user grant
        const { data: grant } = await supabase
          .from("tenant_feature_access")
          .select("is_enabled")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("feature_key", featureKey)
          .eq("is_enabled", true)
          .maybeSingle();

        if (grant) {
          userAllowed = true;
          userSource = 'user_grant';
        } else {
          userAllowed = false;
          userSource = 'no_grant';
        }
      }

      setCanUserAccess(userAllowed);
      setResolution({ tenantSource, userSource });

      // Debug logging for nav gating verification
      if (featureKey === 'analytics') {
        console.log(`[useFeatureGate] analytics: tenantEnabled=${tenantEnabled} (${tenantSource}), userAllowed=${userAllowed} (${userSource}), isAccessible=${tenantEnabled && userAllowed}`);
      }

    } catch (error) {
      console.error("[useFeatureGate] Error checking gate:", error);
      setIsEnabledForTenant(false);
      setCanUserAccess(false);
      setResolution(null);
    } finally {
      setIsLoading(false);
    }
  }, [featureKey, requiresUserGrant, effectiveTenant?.id, effectiveTenant?.release_channel, isPlatformAdmin, tenantLoading]);

  // Single effect to handle tenant changes and gate checks
  // Reset state immediately when tenant changes, then run check
  const prevTenantRef = useRef<string | undefined>(effectiveTenant?.id);
  
  useEffect(() => {
    if (tenantLoading) return;

    // If tenant changed, reset state immediately before running check
    if (prevTenantRef.current !== effectiveTenant?.id) {
      setIsEnabledForTenant(false);
      setCanUserAccess(false);
      setIsLoading(true);
      prevTenantRef.current = effectiveTenant?.id;
    }

    // Run the gate check
    checkGate();
  }, [checkGate, effectiveTenant?.id, tenantLoading]);

  // Combined access: feature enabled at tenant level AND user has access
  const isAccessible = useMemo(() => {
    return isEnabledForTenant && canUserAccess;
  }, [isEnabledForTenant, canUserAccess]);

  return {
    isEnabledForTenant,
    canUserAccess,
    isAccessible,
    isLoading: isLoading || tenantLoading,
    resolution,
    refresh: checkGate,
  };
}

/**
 * Non-React helper for checking feature gate outside components
 */
export async function canAccessFeatureGate(
  featureKey: string,
  options: {
    isPlatformAdmin: boolean;
    tenantId: string | null;
    releaseChannel?: string;
    userId: string | null;
    requiresUserGrant?: boolean;
  }
): Promise<{ isAccessible: boolean; reason: string }> {
  const { isPlatformAdmin, tenantId, releaseChannel = 'general', userId, requiresUserGrant = true } = options;

  if (!userId) {
    return { isAccessible: false, reason: 'no_user' };
  }

  try {
    // Get feature flag
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("id, default_enabled, is_killswitch")
      .eq("key", featureKey)
      .maybeSingle();

    if (!flag) {
      return { isAccessible: false, reason: 'flag_not_found' };
    }

    if (flag.is_killswitch && !flag.default_enabled) {
      return { isAccessible: false, reason: 'killswitch' };
    }

    // Check tenant enablement
    let tenantEnabled = flag.default_enabled;

    if (tenantId) {
      const { data: tenantOverride } = await supabase
        .from("tenant_feature_flags")
        .select("enabled")
        .eq("tenant_id", tenantId)
        .eq("feature_flag_id", flag.id)
        .maybeSingle();

      if (tenantOverride !== null) {
        tenantEnabled = tenantOverride.enabled;
      } else {
        const { data: channelDefault } = await supabase
          .from("release_channel_feature_flags")
          .select("enabled")
          .eq("feature_flag_id", flag.id)
          .eq("release_channel", releaseChannel)
          .maybeSingle();

        if (channelDefault !== null) {
          tenantEnabled = channelDefault.enabled;
        }
      }
    }

    if (!tenantEnabled) {
      return { isAccessible: false, reason: 'tenant_disabled' };
    }

    // Check user access
    if (!requiresUserGrant) {
      return { isAccessible: true, reason: 'no_user_gating' };
    }

    if (isPlatformAdmin) {
      return { isAccessible: true, reason: 'platform_admin' };
    }

    if (tenantId) {
      const { data: grant } = await supabase
        .from("tenant_feature_access")
        .select("is_enabled")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("feature_key", featureKey)
        .eq("is_enabled", true)
        .maybeSingle();

      if (grant) {
        return { isAccessible: true, reason: 'user_grant' };
      }
    }

    return { isAccessible: false, reason: 'no_user_grant' };
  } catch (error) {
    console.error("[canAccessFeatureGate] Error:", error);
    return { isAccessible: false, reason: 'error' };
  }
}

/**
 * Feature key definitions for all gated features
 * Use these constants throughout the app for consistency
 */
export const FEATURE_KEYS = {
  // Navigation tabs (tenant-level gating via release channel/override)
  ANALYTICS: 'analytics',
  LOAD_HUNTER: 'load_hunter_enabled',
  USAGE: 'usage_dashboard', // Internal only
  DEVELOPMENT: 'development_tools', // Internal only
  INSPECTOR: 'inspector_tools', // Platform admin only
  
  // Premium features (may require user-level grants)
  AI_PARSING: 'ai_parsing_enabled',
  BID_AUTOMATION: 'bid_automation_enabled',
  GEOCODING: 'geocoding_enabled',
  
  // Standard features (tenant-level only, no user grants)
  FLEET_FINANCIALS: 'fleet_financials',
  DRIVER_SETTLEMENTS: 'driver_settlements',
  MULTI_STOP_LOADS: 'multi_stop_loads',
} as const;

/**
 * Feature metadata for the Feature Access Manager UI
 */
export const FEATURE_METADATA: Record<string, {
  label: string;
  description: string;
  icon?: string;
  requiresUserGrant: boolean;
  category: 'navigation' | 'premium' | 'standard';
}> = {
  [FEATURE_KEYS.ANALYTICS]: {
    label: 'Analytics',
    description: 'Access to load analytics dashboard with charts and insights',
    requiresUserGrant: false, // Gated by tenant feature flag + role permission, no per-user grant needed
    category: 'navigation',
  },
  [FEATURE_KEYS.LOAD_HUNTER]: {
    label: 'Load Hunter',
    description: 'Email ingestion and automated load matching',
    requiresUserGrant: false,
    category: 'navigation',
  },
  [FEATURE_KEYS.AI_PARSING]: {
    label: 'AI Parsing',
    description: 'AI-powered email parsing for better accuracy',
    requiresUserGrant: false,
    category: 'premium',
  },
  [FEATURE_KEYS.BID_AUTOMATION]: {
    label: 'Bid Automation',
    description: 'Automated bidding based on rules',
    requiresUserGrant: false,
    category: 'premium',
  },
  [FEATURE_KEYS.GEOCODING]: {
    label: 'Geocoding',
    description: 'Location geocoding for loads',
    requiresUserGrant: false,
    category: 'premium',
  },
  [FEATURE_KEYS.FLEET_FINANCIALS]: {
    label: 'Fleet Financials',
    description: 'Fleet financial reporting',
    requiresUserGrant: false,
    category: 'standard',
  },
  [FEATURE_KEYS.USAGE]: {
    label: 'Usage Dashboard',
    description: 'API usage and cost tracking (internal only)',
    requiresUserGrant: false,
    category: 'navigation',
  },
};

/**
 * Clear the flags cache (useful after admin updates)
 */
export function clearFeatureGateCache() {
  flagsCache = null;
  flagsCacheTime = 0;
}
