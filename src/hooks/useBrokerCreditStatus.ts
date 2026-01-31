import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

interface BrokerCreditStatus {
  status: string;
  brokerName?: string;
  mcNumber?: string;
  checkedAt?: string;
}

/**
 * Hook to fetch broker credit statuses for a list of load email IDs.
 * Returns a Map<loadEmailId, BrokerCreditStatus> for quick lookups.
 */
export function useBrokerCreditStatus(loadEmailIds: string[]) {
  const { tenantId } = useTenantFilter();
  const [statusMap, setStatusMap] = useState<Map<string, BrokerCreditStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Memoize the IDs to prevent unnecessary refetches
  const idString = useMemo(() => loadEmailIds.filter(Boolean).sort().join(','), [loadEmailIds]);

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

    const fetchStatuses = async () => {
      setIsLoading(true);
      try {
        // Fetch the most recent broker credit check for each load_email_id
        const { data, error } = await supabase
          .from('broker_credit_checks')
          .select('load_email_id, approval_status, broker_name, mc_number, checked_at')
          .eq('tenant_id', tenantId)
          .in('load_email_id', ids)
          .order('checked_at', { ascending: false });

        if (error) {
          console.error('[useBrokerCreditStatus] Query error:', error);
          return;
        }

        // Build map with most recent status per load_email_id
        const newMap = new Map<string, BrokerCreditStatus>();
        for (const row of data || []) {
          if (row.load_email_id && !newMap.has(row.load_email_id)) {
            newMap.set(row.load_email_id, {
              status: row.approval_status || 'unchecked',
              brokerName: row.broker_name,
              mcNumber: row.mc_number,
              checkedAt: row.checked_at,
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

    fetchStatuses();
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
