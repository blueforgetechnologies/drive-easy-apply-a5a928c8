import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'tms.currentTenantId';
const IMPERSONATION_STORAGE_KEY = 'tms.adminImpersonationSession';
const VALIDATION_INTERVAL_MS = 30000; // 30 seconds

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
  release_channel: string;
  status: string;
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
  const validationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousEffectiveTenantIdRef = useRef<string | null>(null);
  const isValidatingRef = useRef(false);

  // Clear impersonation without invalidating queries (let effectiveTenant change trigger that)
  const clearImpersonation = useCallback((reason?: string) => {
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    setImpersonatedTenant(null);
    
    if (reason) {
      toast.info(`Impersonation ended: ${reason}`);
    }
  }, []);

  // Validate impersonation session via edge function
  const validateImpersonationSession = useCallback(async (sessionId: string): Promise<ImpersonationSession | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-get-impersonation-session', {
        body: { session_id: sessionId },
      });

      // Handle 403 - session not owned by this admin
      if (error?.message?.includes('403') || error?.message?.includes('forbidden')) {
        console.log('[TenantContext] Impersonation session forbidden - not owner');
        return null;
      }

      if (error) {
        console.error('[TenantContext] Error validating impersonation session:', error);
        return null;
      }

      if (!data?.valid) {
        console.log('[TenantContext] Impersonation session invalid:', data?.reason);
        return null;
      }

      // Return authoritative session from server
      return {
        session_id: data.session.id,
        tenant_id: data.session.tenant_id,
        tenant_name: data.session.tenant_name,
        tenant_slug: data.session.tenant_slug,
        release_channel: data.session.release_channel || 'unknown',
        status: data.session.status || 'active',
        expires_at: data.session.expires_at,
        reason: data.session.reason,
      };
    } catch (err) {
      console.error('[TenantContext] Failed to validate impersonation session:', err);
      return null;
    }
  }, []);

  // Check for active impersonation session
  const checkImpersonation = useCallback(async () => {
    // Prevent concurrent validation
    if (isValidatingRef.current) return;
    isValidatingRef.current = true;

    try {
      const stored = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
      if (!stored) {
        if (impersonatedTenant) {
          clearImpersonation();
        }
        return;
      }

      let storedSession: ImpersonationSession;
      try {
        storedSession = JSON.parse(stored);
      } catch {
        clearImpersonation('Invalid session data');
        return;
      }

      const sessionId = storedSession?.session_id;
      
      if (!sessionId) {
        clearImpersonation('Invalid session data');
        return;
      }

      // Quick client-side expiration check first
      const expiresAt = new Date(storedSession.expires_at).getTime();
      if (expiresAt <= Date.now()) {
        clearImpersonation('Session expired');
        return;
      }

      // Validate with server
      const validatedSession = await validateImpersonationSession(sessionId);
      
      if (!validatedSession) {
        clearImpersonation('Session no longer valid');
        return;
      }

      // Only update state if tenant_id changed OR impersonatedTenant is null
      const newTenantId = validatedSession.tenant_id;
      const currentTenantId = impersonatedTenant?.id;
      
      if (currentTenantId !== newTenantId) {
        setImpersonatedTenant({
          id: validatedSession.tenant_id,
          name: validatedSession.tenant_name,
          slug: validatedSession.tenant_slug,
          release_channel: validatedSession.release_channel,
          status: validatedSession.status,
        });

        // Update localStorage with authoritative data
        localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(validatedSession));
      }
    } finally {
      isValidatingRef.current = false;
    }
  }, [impersonatedTenant, clearImpersonation, validateImpersonationSession]);

  // Set up validation interval when impersonating
  useEffect(() => {
    if (impersonatedTenant) {
      // Start periodic validation (only validates, doesn't invalidate queries)
      validationIntervalRef.current = setInterval(checkImpersonation, VALIDATION_INTERVAL_MS);
    } else {
      // Clear interval when not impersonating
      if (validationIntervalRef.current) {
        clearInterval(validationIntervalRef.current);
        validationIntervalRef.current = null;
      }
    }

    return () => {
      if (validationIntervalRef.current) {
        clearInterval(validationIntervalRef.current);
        validationIntervalRef.current = null;
      }
    };
  }, [impersonatedTenant, checkImpersonation]);

  // Listen for impersonation changes from ImpersonationContext
  useEffect(() => {
    // Initial check on mount
    checkImpersonation();

    // Listen for storage changes (impersonation start/stop from other components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === IMPERSONATION_STORAGE_KEY) {
        checkImpersonation();
      }
    };

    // Listen for custom events (same-window impersonation changes)
    const handleImpersonationChange = () => {
      checkImpersonation();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('impersonation-changed', handleImpersonationChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('impersonation-changed', handleImpersonationChange);
    };
  }, [checkImpersonation]);

  // Compute effective tenant (impersonated takes priority)
  const effectiveTenant = useMemo(() => {
    return impersonatedTenant || currentTenant;
  }, [impersonatedTenant, currentTenant]);

  // Invalidate queries ONLY when effective tenant ID changes
  useEffect(() => {
    const newEffectiveId = effectiveTenant?.id || null;
    const previousId = previousEffectiveTenantIdRef.current;
    
    // Only invalidate if we had a previous value and it changed
    if (previousId !== null && previousId !== newEffectiveId) {
      console.log('[TenantContext] Effective tenant changed from', previousId, 'to', newEffectiveId, '- invalidating queries');
      queryClient.invalidateQueries();
    }
    
    previousEffectiveTenantIdRef.current = newEffectiveId;
  }, [effectiveTenant?.id, queryClient]);

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
      toast.warning('Cannot switch tenants while impersonating. Stop impersonation first.');
      return;
    }

    const membership = memberships.find(m => m.tenant.id === tenantId);
    if (membership) {
      console.log('[TenantContext] Switching tenant to:', membership.tenant.name);
      setCurrentTenant(membership.tenant);
      localStorage.setItem(STORAGE_KEY, tenantId);
      // Note: Query invalidation happens via the effectiveTenant change effect
    }
  }, [memberships, impersonatedTenant]);

  const getCurrentRole = useCallback(() => {
    if (!currentTenant) return null;
    const membership = memberships.find(m => m.tenant.id === currentTenant.id);
    return membership?.role || null;
  }, [currentTenant, memberships]);

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
