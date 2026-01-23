/**
 * Hook for tenant-scoped accounting counts
 * 
 * Provides counts for:
 * - Ready for Audit (delivered loads not yet invoiced)
 * - Invoices
 * - Settlements
 * - Audit Logs
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface AccountingCounts {
  readyForAudit: number;
  invoices: number;
  settlements: number;
  auditLogs: number;
  isLoading: boolean;
}

/**
 * Get tenant-scoped accounting counts for badges
 */
export function useAccountingCounts(): AccountingCounts {
  const { query, tenantId, shouldFilter, isPlatformAdmin, isReady } = useTenantQuery();

  const queryKey = [
    "tenant-accounting-counts",
    tenantId,
    shouldFilter,
    isPlatformAdmin,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady) {
        return { readyForAudit: 0, invoices: 0, settlements: 0, auditLogs: 0 };
      }

      // Fetch all counts in parallel
      const [loadsResult, invoicesResult, settlementsResult, auditLogsResult] = await Promise.all([
        // Ready for Audit: delivered loads
        query("loads")
          .select("id", { count: "exact", head: true })
          .eq("status", "delivered"),
        
        // Invoices count
        query("invoices")
          .select("id", { count: "exact", head: true }),
        
        // Settlements count
        query("settlements")
          .select("id", { count: "exact", head: true }),
        
        // Audit logs count
        query("audit_logs")
          .select("id", { count: "exact", head: true }),
      ]);

      return {
        readyForAudit: loadsResult.count ?? 0,
        invoices: invoicesResult.count ?? 0,
        settlements: settlementsResult.count ?? 0,
        auditLogs: auditLogsResult.count ?? 0,
      };
    },
    enabled: isReady,
    placeholderData: { readyForAudit: 0, invoices: 0, settlements: 0, auditLogs: 0 },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    readyForAudit: data?.readyForAudit ?? 0,
    invoices: data?.invoices ?? 0,
    settlements: data?.settlements ?? 0,
    auditLogs: data?.auditLogs ?? 0,
    isLoading,
  };
}
