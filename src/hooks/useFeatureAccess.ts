import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

interface FeatureAccessResult {
  canAccess: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

interface FeatureAccessOptions {
  featureKey: string;
}

/**
 * Hook to check if the current user can access a specific feature.
 * 
 * Access is granted if:
 * - User is a platform admin (profiles.is_platform_admin = true)
 * - OR user has an explicit grant in tenant_feature_access
 * 
 * This is the single source of truth for feature access checks.
 */
export function useFeatureAccess({ featureKey }: FeatureAccessOptions): FeatureAccessResult {
  const { effectiveTenant, isPlatformAdmin, loading: tenantLoading } = useTenantContext();
  const [canAccess, setCanAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAccess = useCallback(async () => {
    // Platform admins always have access
    if (isPlatformAdmin) {
      setCanAccess(true);
      setIsLoading(false);
      return;
    }

    // No tenant context means no access
    if (!effectiveTenant?.id) {
      setCanAccess(false);
      setIsLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCanAccess(false);
        setIsLoading(false);
        return;
      }

      // Check tenant_feature_access for explicit grant
      const { data, error } = await supabase
        .from("tenant_feature_access")
        .select("is_enabled")
        .eq("tenant_id", effectiveTenant.id)
        .eq("user_id", user.id)
        .eq("feature_key", featureKey)
        .eq("is_enabled", true)
        .maybeSingle();

      if (error) {
        console.error("Error checking feature access:", error);
        setCanAccess(false);
      } else {
        setCanAccess(!!data);
      }
    } catch (error) {
      console.error("Error checking feature access:", error);
      setCanAccess(false);
    } finally {
      setIsLoading(false);
    }
  }, [featureKey, effectiveTenant?.id, isPlatformAdmin]);

  useEffect(() => {
    if (!tenantLoading) {
      setIsLoading(true);
      checkAccess();
    }
  }, [checkAccess, tenantLoading, effectiveTenant?.id]);

  return {
    canAccess,
    isLoading: isLoading || tenantLoading,
    refresh: checkAccess,
  };
}

/**
 * Utility function to check feature access (for use outside React components)
 * Returns a promise that resolves to whether access is granted.
 */
export async function canAccessFeature(
  featureKey: string,
  options: {
    isPlatformAdmin: boolean;
    tenantId: string | null;
    userId: string | null;
  }
): Promise<boolean> {
  const { isPlatformAdmin, tenantId, userId } = options;

  // Platform admins always have access
  if (isPlatformAdmin) {
    return true;
  }

  // No tenant or user means no access
  if (!tenantId || !userId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("tenant_feature_access")
      .select("is_enabled")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("feature_key", featureKey)
      .eq("is_enabled", true)
      .maybeSingle();

    if (error) {
      console.error("Error checking feature access:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Error checking feature access:", error);
    return false;
  }
}
