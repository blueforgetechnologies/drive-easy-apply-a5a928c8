import { useState, useEffect, useMemo } from "react";
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

  // Memoize the IDs to prevent unnecessary refetches
  const idString = useMemo(() => loadEmailIds.filter(Boolean).sort().join(','), [loadEmailIds]);

  // Fetch cached broker credit check results (OTR checks are triggered by VPS worker)
  useEffect(() => {
    if (!tenantId || !idString) {
      setStatusMap(new Map());
      return;
    }

    const ids = idString.split(',').filter(Boolean);
    if (ids.length === 0) {
      setStatusMap(new Map());
      return;
    }

    const fetchCachedStatus = async () => {
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
        }

        // Build map from cached data (most recent check per load_email_id)
        const newMap = new Map<string, BrokerCreditStatus>();
        
        for (const row of checkData || []) {
          if (row.load_email_id && !newMap.has(row.load_email_id)) {
            newMap.set(row.load_email_id, {
              status: row.approval_status || 'unchecked',
              brokerName: row.broker_name,
              mcNumber: row.mc_number,
              checkedAt: row.checked_at,
              customerId: row.customer_id,
            });
          }
        }

        setStatusMap(newMap);
      } catch (err) {
        console.error('[useBrokerCreditStatus] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCachedStatus();
  }, [tenantId, idString]);

  // Subscribe to realtime updates for broker_credit_checks
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel('broker-credit-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
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

  return { statusMap, isLoading };
}
