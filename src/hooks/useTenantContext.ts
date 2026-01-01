import { useState, useEffect, useCallback } from 'react';
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

export function useTenantContext() {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const loadMemberships = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMemberships([]);
        setCurrentTenant(null);
        setLoading(false);
        return;
      }

      // Check platform admin status
      const { data: adminCheck } = await supabase.rpc('is_platform_admin', { _user_id: user.id });
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

      if (error) throw error;

      const membershipList: TenantMembership[] = (tenantUsers || [])
        .filter(tu => tu.tenant)
        .map(tu => ({
          tenant: tu.tenant as unknown as Tenant,
          role: tu.role
        }));

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
        localStorage.setItem(STORAGE_KEY, selectedTenant.id);
        setCurrentTenant(selectedTenant);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setCurrentTenant(null);
      }
    } catch (err) {
      console.error('Error loading tenant memberships:', err);
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
      setCurrentTenant(membership.tenant);
      localStorage.setItem(STORAGE_KEY, tenantId);
    }
  }, [memberships]);

  const getCurrentRole = useCallback(() => {
    if (!currentTenant) return null;
    const membership = memberships.find(m => m.tenant.id === currentTenant.id);
    return membership?.role || null;
  }, [currentTenant, memberships]);

  return {
    currentTenant,
    memberships,
    loading,
    isPlatformAdmin,
    switchTenant,
    getCurrentRole,
    refreshMemberships: loadMemberships
  };
}
