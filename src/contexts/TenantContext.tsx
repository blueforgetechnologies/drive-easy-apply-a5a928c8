import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'tms.currentTenantId';

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

interface TenantContextValue {
  currentTenant: Tenant | null;
  memberships: TenantMembership[];
  loading: boolean;
  isPlatformAdmin: boolean;
  switchTenant: (tenantId: string) => void;
  getCurrentRole: () => string | null;
  refreshMemberships: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

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
    } catch (err) {
      console.error('[TenantContext] Error loading tenant memberships:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemberships();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadMemberships();
    });

    return () => subscription.unsubscribe();
  }, [loadMemberships]);

  const switchTenant = useCallback((tenantId: string) => {
    const membership = memberships.find(m => m.tenant.id === tenantId);
    if (membership) {
      console.log('[TenantContext] Switching tenant to:', membership.tenant.name);
      setCurrentTenant(membership.tenant);
      localStorage.setItem(STORAGE_KEY, tenantId);
      
      // Invalidate all queries to force refetch with new tenant context
      console.log('[TenantContext] Invalidating all queries');
      queryClient.invalidateQueries();
    }
  }, [memberships, queryClient]);

  const getCurrentRole = useCallback(() => {
    if (!currentTenant) return null;
    const membership = memberships.find(m => m.tenant.id === currentTenant.id);
    return membership?.role || null;
  }, [currentTenant, memberships]);

  return (
    <TenantContext.Provider value={{
      currentTenant,
      memberships,
      loading,
      isPlatformAdmin,
      switchTenant,
      getCurrentRole,
      refreshMemberships: loadMemberships
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
