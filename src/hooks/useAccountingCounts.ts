/**
 * Hook for tenant-scoped accounting counts
 * 
 * Provides counts for:
 * - Ready for Audit (delivered loads not yet invoiced)
 * - Invoices by operational status (pending, needs_setup, ready, delivered, failed, paid, overdue)
 * - Settlements (total and by status)
 * - Audit Logs
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";
import { supabase } from "@/integrations/supabase/client";

interface InvoiceCounts {
  pending: number;
  needs_setup: number;
  ready: number;
  delivered: number;
  failed: number;
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
          invoicesByStatus: { pending: 0, needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
          settlements: 0, 
          settlementsByStatus: { pending: 0, approved: 0, paid: 0 },
          auditLogs: 0 
        };
      }

      // Fetch counts in parallel
      const [
        readyForAuditResult,
        allInvoicesResult,
        emailLogsResult,
        companyProfileResult,
        invoiceLoadsResult,
        loadDocsResult,
        pendingSettlementsResult,
        approvedSettlementsResult,
        paidSettlementsResult,
        auditLogsResult,
      ] = await Promise.all([
        // Ready for Audit: loads with financial_status = pending_invoice
        query("loads")
          .select("id", { count: "exact", head: true })
          .eq("financial_status", "pending_invoice"),
        
        // All invoices for categorization
        query("invoices")
          .select("id, status, billing_method, customer_id, otr_submitted_at, otr_status, customers(email, billing_email, otr_approval_status)"),
        
        // Email logs for delivery status
        query("invoice_email_log")
          .select("invoice_id, status, created_at")
          .order("created_at", { ascending: false }),
        
        // Company profile for accounting email check
        query("company_profile")
          .select("accounting_email")
          .limit(1),
        
        // Invoice loads for document check
        query("invoice_loads")
          .select("invoice_id, load_id"),
        
        // Load documents for RC/BOL check
        query("load_documents")
          .select("load_id, document_type"),
        
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

      const invoices = (allInvoicesResult.data as any[]) || [];
      const emailLogs = (emailLogsResult.data as any[]) || [];
      const accountingEmail = (companyProfileResult.data as any[])?.[0]?.accounting_email || null;
      const invoiceLoads = (invoiceLoadsResult.data as any[]) || [];
      const loadDocs = (loadDocsResult.data as any[]) || [];

      // Build email log map (latest per invoice)
      const latestLogByInvoice = new Map<string, { status: string }>();
      for (const log of emailLogs) {
        if (!latestLogByInvoice.has(log.invoice_id)) {
          latestLogByInvoice.set(log.invoice_id, { status: log.status });
        }
      }

      // Build load docs map
      const loadDocsByLoadId = new Map<string, Set<string>>();
      for (const doc of loadDocs) {
        if (!loadDocsByLoadId.has(doc.load_id)) {
          loadDocsByLoadId.set(doc.load_id, new Set());
        }
        loadDocsByLoadId.get(doc.load_id)!.add(doc.document_type);
      }

      // Build invoice-to-loads map
      const loadsByInvoice = new Map<string, string[]>();
      for (const il of invoiceLoads) {
        if (!loadsByInvoice.has(il.invoice_id)) {
          loadsByInvoice.set(il.invoice_id, []);
        }
        loadsByInvoice.get(il.invoice_id)!.push(il.load_id);
      }

      // Categorize invoices
      const counts = { 
        pending: readyForAuditResult.count ?? 0, 
        needs_setup: 0, 
        ready: 0, 
        delivered: 0, 
        failed: 0, 
        paid: 0, 
        overdue: 0 
      };

      for (const inv of invoices) {
        if (inv.status === 'paid') {
          counts.paid++;
          continue;
        }
        if (inv.status === 'overdue') {
          counts.overdue++;
          continue;
        }
        if (inv.status === 'cancelled') {
          continue;
        }

        // Determine delivery status
        const customerEmail = inv.customers?.billing_email || inv.customers?.email;
        const missing: string[] = [];
        
        if (!inv.billing_method || inv.billing_method === 'unknown') missing.push('billing_method');
        if (!customerEmail) missing.push('to_email');
        if (!accountingEmail) missing.push('cc_email');
        
        const loadIds = loadsByInvoice.get(inv.id) || [];
        const hasRc = loadIds.some(lid => loadDocsByLoadId.get(lid)?.has('rate_confirmation'));
        const hasBol = loadIds.some(lid => {
          const docs = loadDocsByLoadId.get(lid);
          return docs?.has('bill_of_lading') || docs?.has('proof_of_delivery');
        });
        
        if (!hasRc) missing.push('rate_confirmation');
        if (!hasBol) missing.push('bol_pod');

        const latestLog = latestLogByInvoice.get(inv.id);
        
        let deliveryStatus: 'needs_setup' | 'ready' | 'delivered' | 'failed' = 'needs_setup';
        
        if (inv.billing_method === 'otr') {
          if (inv.otr_submitted_at) {
            deliveryStatus = 'delivered';
          } else if (inv.otr_status === 'failed') {
            deliveryStatus = 'failed';
          } else if (missing.filter(m => m !== 'rate_confirmation' && m !== 'bol_pod').length === 0) {
            deliveryStatus = 'ready';
          }
        } else if (inv.billing_method === 'direct_email') {
          if (latestLog?.status === 'sent') {
            deliveryStatus = 'delivered';
          } else if (latestLog?.status === 'failed') {
            deliveryStatus = 'failed';
          } else if (missing.length === 0) {
            deliveryStatus = 'ready';
          }
        }

        if (deliveryStatus === 'needs_setup') counts.needs_setup++;
        else if (deliveryStatus === 'ready') counts.ready++;
        else if (deliveryStatus === 'delivered') counts.delivered++;
        else if (deliveryStatus === 'failed') counts.failed++;
      }

      const settlementsByStatus = {
        pending: pendingSettlementsResult.count ?? 0,
        approved: approvedSettlementsResult.count ?? 0,
        paid: paidSettlementsResult.count ?? 0,
      };

      const totalInvoices = counts.needs_setup + counts.ready + counts.delivered + counts.failed + counts.paid + counts.overdue;
      const totalSettlements = settlementsByStatus.pending + settlementsByStatus.approved + settlementsByStatus.paid;

      return {
        readyForAudit: readyForAuditResult.count ?? 0,
        invoices: totalInvoices,
        invoicesByStatus: counts,
        settlements: totalSettlements,
        settlementsByStatus,
        auditLogs: auditLogsResult.count ?? 0,
      };
    },
    enabled: isReady,
    placeholderData: { 
      readyForAudit: 0, 
      invoices: 0, 
      invoicesByStatus: { pending: 0, needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
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
    invoicesByStatus: data?.invoicesByStatus ?? { pending: 0, needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
    settlements: data?.settlements ?? 0,
    settlementsByStatus: data?.settlementsByStatus ?? { pending: 0, approved: 0, paid: 0 },
    auditLogs: data?.auditLogs ?? 0,
    isLoading,
  };
}
