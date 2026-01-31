import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

interface BrokerCreditStatus {
  status: string;
  brokerName?: string;
  mcNumber?: string;
  checkedAt?: string;
  customerId?: string;
}

interface LoadEmailBrokerInfo {
  loadEmailId: string;
  brokerName?: string;
  mcNumber?: string;
}

/**
 * Hook to fetch broker credit statuses for a list of load email IDs.
 * Returns a Map<loadEmailId, BrokerCreditStatus> for quick lookups.
 * 
 * UPDATED: Now automatically triggers fresh OTR checks for brokers with MC numbers.
 * Checks are always live from OTR, not relying on cached statuses.
 */
export function useBrokerCreditStatus(
  loadEmailIds: string[],
  loadEmailBrokerInfos?: LoadEmailBrokerInfo[]
) {
  const { tenantId } = useTenantFilter();
  const [statusMap, setStatusMap] = useState<Map<string, BrokerCreditStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  
  // Track which emails we've already triggered checks for to avoid duplicates
  const triggeredChecksRef = useRef<Set<string>>(new Set());

  // Memoize the IDs to prevent unnecessary refetches
  const idString = useMemo(() => loadEmailIds.filter(Boolean).sort().join(','), [loadEmailIds]);

  // Initial fetch - get cached data for immediate display, then trigger fresh checks
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

    const fetchAndTriggerChecks = async () => {
      setIsLoading(true);
      try {
        // Step 1: Fetch cached data for immediate display
        const { data: checkData, error: checkError } = await supabase
          .from('broker_credit_checks')
          .select('load_email_id, approval_status, broker_name, mc_number, checked_at, customer_id')
          .eq('tenant_id', tenantId)
          .in('load_email_id', ids)
          .order('checked_at', { ascending: false });

        if (checkError) {
          console.error('[useBrokerCreditStatus] Query error:', checkError);
        }

        // Build initial map from cached data
        const newMap = new Map<string, BrokerCreditStatus>();
        const cachedMcNumbers = new Map<string, string>(); // loadEmailId -> mcNumber
        
        for (const row of checkData || []) {
          if (row.load_email_id && !newMap.has(row.load_email_id)) {
            newMap.set(row.load_email_id, {
              status: row.approval_status || 'unchecked',
              brokerName: row.broker_name,
              mcNumber: row.mc_number,
              checkedAt: row.checked_at,
              customerId: row.customer_id,
            });
            if (row.mc_number) {
              cachedMcNumbers.set(row.load_email_id, row.mc_number);
            }
          }
        }

        // Step 2: Build list of brokers that need fresh checks
        // Priority: Use MC from broker info (parsed email), then from cached checks
        const brokersToCheck: { loadEmailId: string; mcNumber: string; brokerName?: string }[] = [];
        
        for (const info of loadEmailBrokerInfos || []) {
          const mc = info.mcNumber || cachedMcNumbers.get(info.loadEmailId);
          if (mc && !triggeredChecksRef.current.has(info.loadEmailId)) {
            brokersToCheck.push({
              loadEmailId: info.loadEmailId,
              mcNumber: mc,
              brokerName: info.brokerName,
            });
          }
        }

        // Also check for emails with MC from cached data but not in broker infos
        for (const [emailId, mcNumber] of cachedMcNumbers) {
          if (!triggeredChecksRef.current.has(emailId) && 
              !brokersToCheck.some(b => b.loadEmailId === emailId)) {
            brokersToCheck.push({
              loadEmailId: emailId,
              mcNumber,
              brokerName: newMap.get(emailId)?.brokerName,
            });
          }
        }

        // Set initial state from cache
        setStatusMap(newMap);

        // Step 3: Trigger fresh OTR checks in parallel (limit concurrency)
        if (brokersToCheck.length > 0) {
          // Mark as triggered to prevent re-checks
          for (const b of brokersToCheck) {
            triggeredChecksRef.current.add(b.loadEmailId);
            // Set status to 'checking' for UI feedback
            newMap.set(b.loadEmailId, {
              ...newMap.get(b.loadEmailId),
              status: 'checking',
              mcNumber: b.mcNumber,
              brokerName: b.brokerName,
            });
          }
          setStatusMap(new Map(newMap));

          // Trigger checks in batches of 5 to avoid overwhelming the API
          const BATCH_SIZE = 5;
          for (let i = 0; i < brokersToCheck.length; i += BATCH_SIZE) {
            const batch = brokersToCheck.slice(i, i + BATCH_SIZE);
            
            await Promise.all(
              batch.map(async (broker) => {
                try {
                  const { data, error } = await supabase.functions.invoke('check-broker-credit', {
                    body: {
                      tenant_id: tenantId,
                      mc_number: broker.mcNumber,
                      broker_name: broker.brokerName,
                      load_email_id: broker.loadEmailId,
                    },
                  });

                  if (!error && data) {
                    // Update the map with fresh result
                    setStatusMap((prev) => {
                      const updated = new Map(prev);
                      updated.set(broker.loadEmailId, {
                        status: data.approval_status || 'unchecked',
                        brokerName: data.broker_name || broker.brokerName,
                        mcNumber: broker.mcNumber,
                        checkedAt: new Date().toISOString(),
                        customerId: data.customer_id,
                      });
                      return updated;
                    });
                  } else {
                    console.warn(`[useBrokerCreditStatus] Check failed for ${broker.mcNumber}:`, error);
                    // Keep cached status but mark as potentially stale
                  }
                } catch (err) {
                  console.error(`[useBrokerCreditStatus] Error checking ${broker.mcNumber}:`, err);
                }
              })
            );
          }
        }
      } catch (err) {
        console.error('[useBrokerCreditStatus] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndTriggerChecks();
  }, [tenantId, idString, loadEmailBrokerInfos]);

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
