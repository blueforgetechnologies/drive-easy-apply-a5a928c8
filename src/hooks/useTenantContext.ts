import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
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

      // Get user's tenant memberships
      const { data: tenantUsers, error } = await supabase
        .from('tenant_users')
        .select(`
          role,
          tenant:tenants (
            id,
            name,
            slug,
            logo_url,
            primary_color
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

      // Set current tenant from localStorage or first available
      const savedTenantId = localStorage.getItem('currentTenantId');
      const savedTenant = membershipList.find(m => m.tenant.id === savedTenantId);
      
      if (savedTenant) {
        setCurrentTenant(savedTenant.tenant);
      } else if (membershipList.length > 0) {
        setCurrentTenant(membershipList[0].tenant);
        localStorage.setItem('currentTenantId', membershipList[0].tenant.id);
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
      localStorage.setItem('currentTenantId', tenantId);
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
