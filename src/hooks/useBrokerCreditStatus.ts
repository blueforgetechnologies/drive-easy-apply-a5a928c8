import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

interface BrokerCreditStatus {
  status: string;
  brokerName?: string;
  mcNumber?: string;
  checkedAt?: string;
  customerId?: string;
}

/**
 * Hook to fetch broker credit statuses for a list of load email IDs.
 * Returns a Map<loadEmailId, BrokerCreditStatus> for quick lookups.
 * 
 * Fresh OTR checks are triggered by the VPS worker when matches are created.
 * This hook ONLY reads cached results - no frontend API calls.
 * Deduplication by order_number happens in the worker.
 */
export function useBrokerCreditStatus(
  loadEmailIds: string[]
) {
  const { tenantId } = useTenantFilter();
  const [statusMap, setStatusMap] = useState<Map<string, BrokerCreditStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  // Track the last fetched key (tenant + ids) to know when to refetch
  const lastFetchedKeyRef = useRef<string>('');

  // Memoize the IDs to prevent unnecessary refetches
  const idString = useMemo(() => loadEmailIds.filter(Boolean).sort().join(','), [loadEmailIds]);
  
  // Combine tenant and IDs for cache key - forces refetch on tenant change
  const cacheKey = useMemo(() => `${tenantId || ''}::${idString}`, [tenantId, idString]);

  // Fetch function that can be called on-demand
  const fetchCachedStatus = useCallback(async (ids: string[], forceRefresh = false) => {
    if (!tenantId || ids.length === 0) return;

    setIsLoading(true);
    try {
      const { data: checkData, error: checkError } = await supabase
        .from('broker_credit_checks')
        .select('load_email_id, approval_status, broker_name, mc_number, checked_at, customer_id')
        .eq('tenant_id', tenantId)
        .in('load_email_id', ids)
        .order('checked_at', { ascending: false });

      if (checkError) {
        console.error('[useBrokerCreditStatus] Query error:', checkError);
        return;
      }

      // Build map from cached data - always use most recent check per load_email_id
      // Track which IDs we've seen so we only take the first (most recent) per ID
      const seenIds = new Set<string>();
      
      setStatusMap((prev) => {
        // If force refresh, start fresh; otherwise merge with existing
        const newMap = forceRefresh ? new Map<string, BrokerCreditStatus>() : new Map(prev);
        
        for (const row of checkData || []) {
          // Only take the first result per load_email_id (most recent due to ordering)
          if (row.load_email_id && !seenIds.has(row.load_email_id)) {
            seenIds.add(row.load_email_id);
            newMap.set(row.load_email_id, {
              status: row.approval_status || 'unchecked',
              brokerName: row.broker_name,
              mcNumber: row.mc_number,
              checkedAt: row.checked_at,
              customerId: row.customer_id,
            });
          }
        }
        
        return newMap;
      });
    } catch (err) {
      console.error('[useBrokerCreditStatus] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  // Fetch cached broker credit check results when IDs or tenant change
  useEffect(() => {
    if (!tenantId || !idString) {
      setStatusMap(new Map());
      lastFetchedKeyRef.current = '';
      return;
    }

    const ids = idString.split(',').filter(Boolean);
    if (ids.length === 0) {
      setStatusMap(new Map());
      return;
    }

    // Always refetch if cacheKey changed (tenant or IDs changed)
    // This ensures fresh data when navigating back to the tab or switching tenants
    const shouldRefresh = lastFetchedKeyRef.current !== cacheKey;
    
    if (shouldRefresh) {
      lastFetchedKeyRef.current = cacheKey;
      fetchCachedStatus(ids, true);
    }
  }, [tenantId, idString, cacheKey, fetchCachedStatus]);

  // Subscribe to realtime updates for broker_credit_checks (INSERT and UPDATE)
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel('broker-credit-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to both INSERT and UPDATE
          schema: 'public',
          table: 'broker_credit_checks',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow?.load_email_id) {
            setStatusMap((prev) => {
              const updated = new Map(prev);
              updated.set(newRow.load_email_id, {
                status: newRow.approval_status || 'unchecked',
                brokerName: newRow.broker_name,
                mcNumber: newRow.mc_number,
                checkedAt: newRow.checked_at,
                customerId: newRow.customer_id,
              });
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Expose a manual refetch for when new matches arrive
  const refetch = useCallback(() => {
    if (!tenantId || !idString) return;
    const ids = idString.split(',').filter(Boolean);
    fetchCachedStatus(ids, true);
  }, [tenantId, idString, fetchCachedStatus]);

  return { statusMap, isLoading, refetch };
}
