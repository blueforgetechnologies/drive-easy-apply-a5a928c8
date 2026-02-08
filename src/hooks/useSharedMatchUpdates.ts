import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MatchUpdate {
  data: any[];
  lastUpdated: Date;
  isLoading: boolean;
}

// Per-tenant state cache - keyed by tenantId
const tenantStateCache = new Map<string, MatchUpdate>();
const tenantSubscribers = new Map<string, Set<() => void>>();
const tenantChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const tenantFetchPromises = new Map<string, Promise<any>>();

function getOrCreateState(tenantId: string): MatchUpdate {
  if (!tenantStateCache.has(tenantId)) {
    tenantStateCache.set(tenantId, {
      data: [],
      lastUpdated: new Date(0),
      isLoading: false
    });
  }
  return tenantStateCache.get(tenantId)!;
}

function getSubscribers(tenantId: string): Set<() => void> {
  if (!tenantSubscribers.has(tenantId)) {
    tenantSubscribers.set(tenantId, new Set());
  }
  return tenantSubscribers.get(tenantId)!;
}

function notifySubscribers(tenantId: string) {
  getSubscribers(tenantId).forEach(callback => callback());
}

// Tenant-scoped fetch function
async function fetchMatchesForTenant(tenantId: string): Promise<any[]> {
  // If a fetch is already in progress for this tenant, return that promise
  if (tenantFetchPromises.has(tenantId)) {
    return tenantFetchPromises.get(tenantId)!;
  }

  const state = getOrCreateState(tenantId);
  state.isLoading = true;
  notifySubscribers(tenantId);

  const fetchPromise = (async () => {
    try {
      console.log(`[SharedMatches] Fetching for tenant: ${tenantId}`);
      
      // CRITICAL: Always filter by tenant_id
      const { data, error } = await supabase
        .from('unreviewed_matches')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false });

      if (error) {
        console.error('[SharedMatches] Error fetching:', error);
        return state.data;
      }

      state.data = data || [];
      state.lastUpdated = new Date();
      console.log(`[SharedMatches] Loaded ${data?.length || 0} matches for tenant ${tenantId}`);
      return data || [];
    } finally {
      state.isLoading = false;
      tenantFetchPromises.delete(tenantId);
      notifySubscribers(tenantId);
    }
  })();

  tenantFetchPromises.set(tenantId, fetchPromise);
  return fetchPromise;
}

// Initialize tenant-scoped realtime channel
function initChannelForTenant(tenantId: string) {
  if (tenantChannels.has(tenantId)) return;

  console.log(`[SharedMatches] Initializing realtime channel for tenant: ${tenantId}`);
  
  const channel = supabase
    .channel(`shared-match-updates-${tenantId}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'load_hunt_matches',
        // NOW FILTERED BY tenant_id thanks to DB migration
        filter: `tenant_id=eq.${tenantId}`
      },
      (payload) => {
        // CODE GUARD: Double-check tenant_id matches
        const payloadTenantId = (payload.new as any)?.tenant_id || (payload.old as any)?.tenant_id;
        if (payloadTenantId && payloadTenantId !== tenantId) {
          console.warn('[SharedMatches] IGNORED cross-tenant match event:', payloadTenantId, 'vs', tenantId);
          return;
        }
        console.log(`[SharedMatches] Match change detected for tenant ${tenantId}, refetching`);
        fetchMatchesForTenant(tenantId);
      }
    )
    // load_emails subscription removed — uses 30s polling instead
    .subscribe((status) => {
      console.log(`[SharedMatches] Channel status for ${tenantId}:`, status);
    });

  tenantChannels.set(tenantId, channel);
}

// Cleanup tenant channel
function cleanupChannelForTenant(tenantId: string) {
  const subscribers = getSubscribers(tenantId);
  if (subscribers.size === 0 && tenantChannels.has(tenantId)) {
    console.log(`[SharedMatches] Cleaning up channel for tenant ${tenantId}`);
    const channel = tenantChannels.get(tenantId)!;
    supabase.removeChannel(channel);
    tenantChannels.delete(tenantId);
    // Also clear cached state for this tenant
    tenantStateCache.delete(tenantId);
  }
}

/**
 * Tenant-scoped hook for match updates.
 * 
 * CONTRACT: Caller MUST pass tenantId explicitly.
 * This hook does NOT call useTenantFilter() internally.
 * 
 * CRITICAL: This hook is now strictly tenant-scoped:
 * - Each tenant has its own cache, channel, and state
 * - No cross-tenant data sharing is possible
 * - All queries include tenant_id filter
 * - Realtime is filtered by tenant_id
 */
export function useSharedMatchUpdates(tenantId: string | null) {
  const [, forceUpdate] = useState({});
  const mountedRef = useRef(true);
  const currentTenantIdRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    if (mountedRef.current) {
      forceUpdate({});
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    // If no tenant, return empty state
    if (!tenantId) {
      return;
    }

    // If tenant changed, clean up old subscription
    if (currentTenantIdRef.current && currentTenantIdRef.current !== tenantId) {
      const oldTenantId = currentTenantIdRef.current;
      const oldSubscribers = getSubscribers(oldTenantId);
      oldSubscribers.delete(refresh);
      cleanupChannelForTenant(oldTenantId);
    }

    currentTenantIdRef.current = tenantId;
    
    // Subscribe to updates for this tenant
    getSubscribers(tenantId).add(refresh);
    
    // Initialize channel for this tenant
    initChannelForTenant(tenantId);
    
    // Fetch initial data if stale (older than 30 seconds)
    const state = getOrCreateState(tenantId);
    const isStale = Date.now() - state.lastUpdated.getTime() > 30000;
    if (isStale || state.data.length === 0) {
      fetchMatchesForTenant(tenantId);
    }

    return () => {
      mountedRef.current = false;
      if (tenantId) {
        getSubscribers(tenantId).delete(refresh);
        cleanupChannelForTenant(tenantId);
      }
    };
  }, [tenantId, refresh]);

  // Return tenant-specific state or empty defaults
  if (!tenantId) {
    return {
      matches: [],
      lastUpdated: new Date(0),
      isLoading: false,
      refetch: () => Promise.resolve([])
    };
  }

  const state = getOrCreateState(tenantId);
  return {
    matches: state.data,
    lastUpdated: state.lastUpdated,
    isLoading: state.isLoading,
    refetch: () => fetchMatchesForTenant(tenantId)
  };
}

/**
 * Tenant-scoped match counts.
 * 
 * CONTRACT: Caller MUST pass tenantId explicitly.
 */
export function useSharedMatchCounts(tenantId: string | null) {
  const { matches } = useSharedMatchUpdates(tenantId);

  return {
    unreviewedCount: matches.filter(m => m.match_status === 'active' && m.is_active).length,
    totalCount: matches.length
  };
}
