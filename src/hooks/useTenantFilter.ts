import { useTenantContext } from '@/contexts/TenantContext';

/**
 * SECURITY: Tenant filtering is ALWAYS ON for all normal screens.
 * 
 * There is NO bypass capability in this hook anymore.
 * "All Tenants" mode ONLY exists inside Platform Inspector tools
 * via a separate hook (useInspectorAllTenantsMode) that normal
 * screens cannot access.
 * 
 * Rules enforced:
 * - shouldFilter: always true when tenantId exists
 * - No showAllTenants toggle
 * - No bypass option
 */

/**
 * Hook that provides tenant filtering capabilities for queries.
 * 
 * Returns:
 * - tenantId: The effective tenant ID (impersonation-aware)
 * - shouldFilter: ALWAYS true when tenantId exists (no bypass)
 * - isPlatformAdmin: Whether user can access admin features
 * - isInternalChannel: Whether current tenant is "internal" release channel
 * - tenantEpoch: Increments on tenant switch (for cache invalidation)
 */
export function useTenantFilter() {
  const { effectiveTenant, isPlatformAdmin, tenantEpoch } = useTenantContext();
  
  const tenantId = effectiveTenant?.id ?? null;
  
  // SECURITY: Check if current tenant is "internal" release channel
  const isInternalChannel = effectiveTenant?.release_channel === 'internal';
  
  // SECURITY: Tenant filtering is ALWAYS ON when tenantId exists
  // There is NO bypass for normal screens
  const shouldFilter = !!tenantId;
  
  return {
    tenantId,
    tenantSlug: effectiveTenant?.slug ?? null,
    shouldFilter,
    isPlatformAdmin,
    isInternalChannel,
    tenantEpoch: tenantEpoch ?? 0,
  };
}

/**
 * INSPECTOR-ONLY: Hook for "All Tenants" bypass mode.
 * 
 * This hook is ONLY to be used by Platform Inspector components.
 * It provides a toggle to view cross-tenant data, but ONLY when:
 * - User is a platform admin
 * - Current tenant is in "internal" release channel
 * - Explicit toggle is ON (default OFF, not persisted)
 * 
 * Normal screens MUST use useTenantFilter() which has no bypass.
 */
export function useInspectorAllTenantsMode() {
  const { effectiveTenant, isPlatformAdmin } = useTenantContext();
  const [allTenantsEnabled, setAllTenantsEnabled] = useState(false);
  
  const isInternalChannel = effectiveTenant?.release_channel === 'internal';
  const canUseAllTenantsMode = isPlatformAdmin && isInternalChannel;
  
  // SECURITY: Force OFF when not authorized
  useEffect(() => {
    if (allTenantsEnabled && !canUseAllTenantsMode) {
      console.warn('[InspectorAllTenantsMode] Forcing OFF - not authorized');
      setAllTenantsEnabled(false);
    }
  }, [effectiveTenant?.id, canUseAllTenantsMode, allTenantsEnabled]);
  
  const setAllTenants = useCallback((value: boolean) => {
    if (value && !canUseAllTenantsMode) {
      console.error('[InspectorAllTenantsMode] BLOCKED: requires platform admin + internal channel');
      return;
    }
    setAllTenantsEnabled(value);
  }, [canUseAllTenantsMode]);
  
  return {
    allTenantsEnabled: canUseAllTenantsMode && allTenantsEnabled,
    setAllTenantsEnabled: setAllTenants,
    canUseAllTenantsMode,
    // When all tenants is enabled, shouldFilter is false
    shouldFilter: !(canUseAllTenantsMode && allTenantsEnabled),
  };
}

// Need these imports for the inspector hook
import { useState, useEffect, useCallback } from 'react';
