import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'tms.currentTenantId';
const IMPERSONATION_STORAGE_KEY = 'tms.adminImpersonationSession';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
  release_channel: string;
  status: string;
}

interface TenantMembership {
  tenant: Tenant;
  role: string;
}

interface ImpersonationSession {
  session_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  expires_at: string;
  reason: string;
}

interface TenantContextValue {
  currentTenant: Tenant | null;
  memberships: TenantMembership[];
  loading: boolean;
  isPlatformAdmin: boolean;
  switchTenant: (tenantId: string) => void;
  getCurrentRole: () => string | null;
  refreshMemberships: () => Promise<void>;
  // Impersonation
  isImpersonating: boolean;
  impersonatedTenant: Tenant | null;
  effectiveTenant: Tenant | null; // Returns impersonated tenant if active, otherwise currentTenant
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [impersonatedTenant, setImpersonatedTenant] = useState<Tenant | null>(null);

  // Check for active impersonation session
  const checkImpersonation = useCallback(async () => {
    const stored = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!stored) {
      setImpersonatedTenant(null);
      return;
    }

    try {
      const session: ImpersonationSession = JSON.parse(stored);
      const expiresAt = new Date(session.expires_at).getTime();
      
      if (expiresAt <= Date.now()) {
        localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
        setImpersonatedTenant(null);
        return;
      }

      // Create a tenant object from impersonation session
      setImpersonatedTenant({
        id: session.tenant_id,
        name: session.tenant_name,
        slug: session.tenant_slug,
        release_channel: 'unknown',
        status: 'active',
      });
    } catch {
      localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      setImpersonatedTenant(null);
    }
  }, []);

  // Listen for impersonation changes
  useEffect(() => {
    checkImpersonation();

    // Listen for storage changes (impersonation start/stop)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === IMPERSONATION_STORAGE_KEY) {
        checkImpersonation();
        // Invalidate queries when impersonation changes
        queryClient.invalidateQueries();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically for expiration
    const interval = setInterval(checkImpersonation, 10000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [checkImpersonation, queryClient]);

  const loadMemberships = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[TenantContext] Current user:', user?.id, user?.email);
      
      if (!user) {
        console.log('[TenantContext] No user, clearing memberships');
        setMemberships([]);
        setCurrentTenant(null);
        setLoading(false);
        return;
      }

      // Check platform admin status
      const { data: adminCheck } = await supabase.rpc('is_platform_admin', { _user_id: user.id });
      console.log('[TenantContext] Platform admin check:', adminCheck);
      setIsPlatformAdmin(!!adminCheck);

      // Get user's tenant memberships with extended tenant fields
      const { data: tenantUsers, error } = await supabase
        .from('tenant_users')
        .select(`
          role,
          tenant:tenants (
            id,
            name,
            slug,
            logo_url,
            primary_color,
            release_channel,
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      console.log('[TenantContext] tenant_users query result:', { 
        count: tenantUsers?.length ?? 0, 
        error: error?.message,
        data: tenantUsers 
      });

      if (error) throw error;

      const membershipList: TenantMembership[] = (tenantUsers || [])
        .filter(tu => tu.tenant)
        .map(tu => ({
          tenant: tu.tenant as unknown as Tenant,
          role: tu.role
        }));
      
      console.log('[TenantContext] Processed memberships:', membershipList.length);

      setMemberships(membershipList);

      // Determine current tenant with priority logic
      const savedTenantId = localStorage.getItem(STORAGE_KEY);
      let selectedTenant: Tenant | null = null;

      // Priority 1: localStorage value if valid
      if (savedTenantId) {
        const savedMembership = membershipList.find(m => m.tenant.id === savedTenantId);
        if (savedMembership) {
          selectedTenant = savedMembership.tenant;
        }
      }

      // Priority 2: Exactly one tenant
      if (!selectedTenant && membershipList.length === 1) {
        selectedTenant = membershipList[0].tenant;
      }

      // Priority 3: Tenant with slug "default"
      if (!selectedTenant) {
        const defaultTenant = membershipList.find(m => m.tenant.slug === 'default');
        if (defaultTenant) {
          selectedTenant = defaultTenant.tenant;
        }
      }

      // Priority 4: First tenant in list
      if (!selectedTenant && membershipList.length > 0) {
        selectedTenant = membershipList[0].tenant;
      }

      // Persist and set
      if (selectedTenant) {
        console.log('[TenantContext] Selected tenant:', selectedTenant.name, selectedTenant.id);
        console.log('[TenantContext] Writing to localStorage:', STORAGE_KEY, selectedTenant.id);
        localStorage.setItem(STORAGE_KEY, selectedTenant.id);
        setCurrentTenant(selectedTenant);
      } else {
        console.log('[TenantContext] No tenant selected, clearing localStorage');
        localStorage.removeItem(STORAGE_KEY);
        setCurrentTenant(null);
      }

      // Check impersonation status
      await checkImpersonation();
    } catch (err) {
      console.error('[TenantContext] Error loading tenant memberships:', err);
    } finally {
      setLoading(false);
    }
  }, [checkImpersonation]);

  useEffect(() => {
    loadMemberships();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadMemberships();
    });

    return () => subscription.unsubscribe();
  }, [loadMemberships]);

  const switchTenant = useCallback((tenantId: string) => {
    // Don't allow switching while impersonating
    if (impersonatedTenant) {
      console.warn('[TenantContext] Cannot switch tenants while impersonating');
      return;
    }

    const membership = memberships.find(m => m.tenant.id === tenantId);
    if (membership) {
      console.log('[TenantContext] Switching tenant to:', membership.tenant.name);
      setCurrentTenant(membership.tenant);
      localStorage.setItem(STORAGE_KEY, tenantId);
      
      // Invalidate all queries to force refetch with new tenant context
      console.log('[TenantContext] Invalidating all queries');
      queryClient.invalidateQueries();
    }
  }, [memberships, queryClient, impersonatedTenant]);

  const getCurrentRole = useCallback(() => {
    if (!currentTenant) return null;
    const membership = memberships.find(m => m.tenant.id === currentTenant.id);
    return membership?.role || null;
  }, [currentTenant, memberships]);

  // Compute effective tenant (impersonated takes priority)
  const effectiveTenant = useMemo(() => {
    return impersonatedTenant || currentTenant;
  }, [impersonatedTenant, currentTenant]);

  const isImpersonating = !!impersonatedTenant;

  return (
    <TenantContext.Provider value={{
      currentTenant,
      memberships,
      loading,
      isPlatformAdmin,
      switchTenant,
      getCurrentRole,
      refreshMemberships: loadMemberships,
      isImpersonating,
      impersonatedTenant,
      effectiveTenant,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenantContext must be used within a TenantProvider');
  }
  return context;
}

// Re-export types for convenience
export type { Tenant, TenantMembership };
