import { useState, useEffect, useCallback } from 'react';
import { useTenantContext } from '@/contexts/TenantContext';

const SHOW_ALL_TENANTS_KEY = 'showAllTenants';

/**
 * Hook that provides tenant filtering capabilities for queries.
 * 
 * Returns:
 * - tenantId: The effective tenant ID (impersonation-aware)
 * - showAllTenants: Whether to bypass tenant filtering (admin only)
 * - setShowAllTenants: Toggle function
 * - shouldFilter: Whether queries should include tenant_id filter
 * - isPlatformAdmin: Whether user can access showAllTenants toggle
 */
export function useTenantFilter() {
  const { effectiveTenant, isPlatformAdmin } = useTenantContext();
  
  const [showAllTenants, setShowAllTenantsState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SHOW_ALL_TENANTS_KEY) === 'true';
  });

  // Sync with localStorage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SHOW_ALL_TENANTS_KEY) {
        setShowAllTenantsState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setShowAllTenants = useCallback((value: boolean) => {
    // Only platform admins can enable this
    if (value && !isPlatformAdmin) {
      console.warn('Only platform admins can enable showAllTenants');
      return;
    }
    setShowAllTenantsState(value);
    localStorage.setItem(SHOW_ALL_TENANTS_KEY, String(value));
  }, [isPlatformAdmin]);

  // Non-admins always filter by tenant
  const shouldFilter = !isPlatformAdmin || !showAllTenants;
  
  return {
    tenantId: effectiveTenant?.id ?? null,
    tenantSlug: effectiveTenant?.slug ?? null,
    showAllTenants: isPlatformAdmin && showAllTenants,
    setShowAllTenants,
    shouldFilter,
    isPlatformAdmin,
  };
}
