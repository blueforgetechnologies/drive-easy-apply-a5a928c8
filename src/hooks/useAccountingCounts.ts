/**
 * Hook for tenant-scoped accounting counts
 * 
 * Provides counts for:
 * - Ready for Audit (delivered loads not yet invoiced)
 * - Invoices (total and by status)
 * - Settlements (total and by status)
 * - Audit Logs
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface InvoiceCounts {
  pending: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
}

interface SettlementCounts {
  pending: number;
  approved: number;
  paid: number;
}

interface AccountingCounts {
  readyForAudit: number;
  invoices: number;
  invoicesByStatus: InvoiceCounts;
  settlements: number;
  settlementsByStatus: SettlementCounts;
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
        return { 
          readyForAudit: 0, 
          invoices: 0, 
          invoicesByStatus: { pending: 0, draft: 0, sent: 0, paid: 0, overdue: 0 },
          settlements: 0, 
          settlementsByStatus: { pending: 0, approved: 0, paid: 0 },
          auditLogs: 0 
        };
      }

      // Fetch all counts in parallel
      const [
        readyForAuditResult,
        pendingInvoicesResult,
        draftInvoicesResult,
        sentInvoicesResult,
        paidInvoicesResult,
        overdueInvoicesResult,
        pendingSettlementsResult,
        approvedSettlementsResult,
        paidSettlementsResult,
        auditLogsResult,
      ] = await Promise.all([
        // Ready for Audit: loads with financial_status = pending_invoice
        query("loads")
          .select("id", { count: "exact", head: true })
          .eq("financial_status", "pending_invoice"),
        
        // Invoice counts by status - pending is loads with financial_status = pending_invoice
        query("loads")
          .select("id", { count: "exact", head: true })
          .eq("financial_status", "pending_invoice"),
        query("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
        query("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent"),
        query("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid"),
        query("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "overdue"),
        
        // Settlement counts by status
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid"),
        
        // Audit logs count
        query("audit_logs")
          .select("id", { count: "exact", head: true }),
      ]);

      const invoicesByStatus = {
        pending: pendingInvoicesResult.count ?? 0,
        draft: draftInvoicesResult.count ?? 0,
        sent: sentInvoicesResult.count ?? 0,
        paid: paidInvoicesResult.count ?? 0,
        overdue: overdueInvoicesResult.count ?? 0,
      };

      const settlementsByStatus = {
        pending: pendingSettlementsResult.count ?? 0,
        approved: approvedSettlementsResult.count ?? 0,
        paid: paidSettlementsResult.count ?? 0,
      };

      const totalInvoices = invoicesByStatus.draft + invoicesByStatus.sent + invoicesByStatus.paid + invoicesByStatus.overdue;
      const totalSettlements = settlementsByStatus.pending + settlementsByStatus.approved + settlementsByStatus.paid;

      return {
        readyForAudit: readyForAuditResult.count ?? 0,
        invoices: totalInvoices,
        invoicesByStatus,
        settlements: totalSettlements,
        settlementsByStatus,
        auditLogs: auditLogsResult.count ?? 0,
      };
    },
    enabled: isReady,
    placeholderData: { 
      readyForAudit: 0, 
      invoices: 0, 
      invoicesByStatus: { pending: 0, draft: 0, sent: 0, paid: 0, overdue: 0 },
      settlements: 0, 
      settlementsByStatus: { pending: 0, approved: 0, paid: 0 },
      auditLogs: 0 
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    readyForAudit: data?.readyForAudit ?? 0,
    invoices: data?.invoices ?? 0,
    invoicesByStatus: data?.invoicesByStatus ?? { pending: 0, draft: 0, sent: 0, paid: 0, overdue: 0 },
    settlements: data?.settlements ?? 0,
    settlementsByStatus: data?.settlementsByStatus ?? { pending: 0, approved: 0, paid: 0 },
    auditLogs: data?.auditLogs ?? 0,
    isLoading,
  };
}
