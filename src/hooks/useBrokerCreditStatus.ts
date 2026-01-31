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

interface LoadEmailBrokerInfo {
  loadEmailId: string;
  brokerName?: string;
}

/**
 * Hook to fetch broker credit statuses for a list of load email IDs.
 * Returns a Map<loadEmailId, BrokerCreditStatus> for quick lookups.
 * 
 * NEW: Also looks up customer OTR status by broker name when no direct
 * load_email check exists - this handles the case where a customer was
 * checked for one email but the status should apply to all emails from
 * that same broker.
 */
export function useBrokerCreditStatus(
  loadEmailIds: string[],
  loadEmailBrokerInfos?: LoadEmailBrokerInfo[]
) {
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

        // Build map with most recent status per load_email_id
        const newMap = new Map<string, BrokerCreditStatus>();
        const foundEmailIds = new Set<string>();
        
        for (const row of checkData || []) {
          if (row.load_email_id && !newMap.has(row.load_email_id)) {
            newMap.set(row.load_email_id, {
              status: row.approval_status || 'unchecked',
              brokerName: row.broker_name,
              mcNumber: row.mc_number,
              checkedAt: row.checked_at,
              customerId: row.customer_id,
            });
            foundEmailIds.add(row.load_email_id);
          }
        }

        // For emails without a direct check, try to find customer status by broker name
        // This handles the case where a customer was checked once and the status should
        // apply to all emails from that broker
        const missingIds = ids.filter(id => !foundEmailIds.has(id));
        
        if (missingIds.length > 0 && loadEmailBrokerInfos) {
          // Get unique broker names for missing emails
          const brokerNamesForMissing = loadEmailBrokerInfos
            .filter(info => missingIds.includes(info.loadEmailId) && info.brokerName)
            .map(info => info.brokerName!);
          
          const uniqueBrokerNames = [...new Set(brokerNamesForMissing)];
          
          if (uniqueBrokerNames.length > 0) {
            // Search for customers by name with OTR status set
            const { data: customerData } = await supabase
              .from('customers')
              .select('id, name, mc_number, otr_approval_status, otr_last_checked_at')
              .eq('tenant_id', tenantId)
              .not('otr_approval_status', 'is', null);
            
            // Create lookup map of broker name -> customer status (fuzzy match)
            const customerStatusMap = new Map<string, BrokerCreditStatus>();
            for (const customer of customerData || []) {
              if (customer.otr_approval_status) {
                const customerNameLower = customer.name?.toLowerCase() || '';
                customerStatusMap.set(customerNameLower, {
                  status: customer.otr_approval_status,
                  brokerName: customer.name,
                  mcNumber: customer.mc_number,
                  checkedAt: customer.otr_last_checked_at,
                  customerId: customer.id,
                });
              }
            }
            
            // Match missing emails to customer statuses
            for (const info of loadEmailBrokerInfos) {
              if (missingIds.includes(info.loadEmailId) && info.brokerName) {
                const brokerNameLower = info.brokerName.toLowerCase();
                
                // Try exact match first, then fuzzy match
                let matchedStatus: BrokerCreditStatus | undefined;
                
                for (const [custName, custStatus] of customerStatusMap) {
                  if (custName.includes(brokerNameLower) || brokerNameLower.includes(custName)) {
                    matchedStatus = custStatus;
                    break;
                  }
                }
                
                if (matchedStatus) {
                  newMap.set(info.loadEmailId, matchedStatus);
                }
              }
            }
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
