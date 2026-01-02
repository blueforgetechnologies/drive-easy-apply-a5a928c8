import { useState, useEffect, useCallback } from 'react';
import { useTenantContext } from '@/contexts/TenantContext';

/**
 * SECURITY: "All Tenants" mode is strictly controlled:
 * - ONLY available to platform admins in the "internal" release channel
 * - NEVER persisted (ephemeral state only)
 * - Auto-resets on tenant switch, refresh, logout
 * - Hard-blocked for pilot/general tenants
 */

/**
 * Hook that provides tenant filtering capabilities for queries.
 * 
 * Returns:
 * - tenantId: The effective tenant ID (impersonation-aware)
 * - showAllTenants: Whether to bypass tenant filtering (internal admins only)
 * - setShowAllTenants: Toggle function (gated by channel + admin check)
 * - shouldFilter: Whether queries should include tenant_id filter
 * - isPlatformAdmin: Whether user can access admin features
 * - isInternalChannel: Whether current tenant is "internal" release channel
 */
export function useTenantFilter() {
  const { effectiveTenant, isPlatformAdmin } = useTenantContext();
  
  // SECURITY: Ephemeral state only - NEVER persisted to localStorage
  const [showAllTenants, setShowAllTenantsState] = useState<boolean>(false);
  
  // SECURITY: Check if current tenant is "internal" release channel
  const isInternalChannel = effectiveTenant?.release_channel === 'internal';
  
  // SECURITY: "All Tenants" is ONLY allowed for platform admins in internal channel
  const canUseAllTenantsMode = isPlatformAdmin && isInternalChannel;
  
  // SECURITY: Force OFF when tenant changes or channel restrictions apply
  useEffect(() => {
    if (showAllTenants && !canUseAllTenantsMode) {
      console.warn('[TenantFilter] Forcing All Tenants OFF - not allowed for this tenant/channel');
      setShowAllTenantsState(false);
    }
  }, [effectiveTenant?.id, canUseAllTenantsMode, showAllTenants]);

  const setShowAllTenants = useCallback((value: boolean) => {
    // SECURITY: Hard block - only internal platform admins can enable
    if (value && !canUseAllTenantsMode) {
      console.error('[TenantFilter] BLOCKED: All Tenants mode requires platform admin + internal channel');
      return;
    }
    setShowAllTenantsState(value);
  }, [canUseAllTenantsMode]);

  // Apply filter unless explicitly in All Tenants mode (and authorized)
  const effectiveShowAllTenants = canUseAllTenantsMode && showAllTenants;
  const shouldFilter = !effectiveShowAllTenants;
  
  return {
    tenantId: effectiveTenant?.id ?? null,
    tenantSlug: effectiveTenant?.slug ?? null,
    showAllTenants: effectiveShowAllTenants,
    setShowAllTenants,
    shouldFilter,
    isPlatformAdmin,
    isInternalChannel,
    canUseAllTenantsMode,
  };
}
