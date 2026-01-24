/**
 * Hook for tenant-scoped accounting counts
 * 
 * Provides counts for:
 * - Ready for Audit (delivered loads not yet invoiced)
 * - Invoices by operational status (needs_setup, ready, delivered, failed, paid, overdue)
 * - Settlements (total and by status)
 * - Audit Logs
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface InvoiceCounts {
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
    "tenant-accounting-counts-v2",
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
          invoicesByStatus: { needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
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
          .select("id, status, billing_method, customer_id, otr_submitted_at, otr_status, customers(email, billing_email)"),
        
        // Email logs for delivery status - limit for performance
        query("invoice_email_log")
          .select("invoice_id, status")
          .order("created_at", { ascending: false })
          .limit(2000),
        
        // Company profile for accounting email check
        query("company_profile")
          .select("accounting_email")
          .limit(1),
        
        // Invoice loads for document check
        query("invoice_loads")
          .select("invoice_id, load_id"),
        
        // Load documents - limit for performance
        query("load_documents")
          .select("load_id, document_type")
          .order("uploaded_at", { ascending: false })
          .limit(2000),
        
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

      // Build latest email log per invoice (first seen = latest due to DESC order)
      const latestLogByInvoice = new Map<string, string>();
      for (const log of emailLogs) {
        if (!latestLogByInvoice.has(log.invoice_id)) {
          latestLogByInvoice.set(log.invoice_id, log.status);
        }
      }

      // Build deduplicated docs per load (newest RC and newest BOL/POD per load)
      const docsPerLoad = new Map<string, { hasRc: boolean; hasBol: boolean }>();
      for (const doc of loadDocs) {
        if (!docsPerLoad.has(doc.load_id)) {
          docsPerLoad.set(doc.load_id, { hasRc: false, hasBol: false });
        }
        const entry = docsPerLoad.get(doc.load_id)!;
        if (doc.document_type === 'rate_confirmation' && !entry.hasRc) {
          entry.hasRc = true;
        }
        if ((doc.document_type === 'bill_of_lading' || doc.document_type === 'pod') && !entry.hasBol) {
          entry.hasBol = true;
        }
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
        needs_setup: 0, 
        ready: 0, 
        delivered: 0, 
        failed: 0, 
        paid: 0, 
        overdue: 0 
      };

      for (const inv of invoices) {
        // Paid and overdue are based on invoice.status
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

        // Check if valid billing method
        const hasValidBillingMethod = inv.billing_method === 'otr' || inv.billing_method === 'direct_email';
        
        // Check emails
        const customerEmail = inv.customers?.billing_email || inv.customers?.email;
        const hasToEmail = !!customerEmail;
        const hasCcEmail = !!accountingEmail;

        // Check docs
        const loadIds = loadsByInvoice.get(inv.id) || [];
        let hasRc = false;
        let hasBol = false;
        for (const lid of loadIds) {
          const docs = docsPerLoad.get(lid);
          if (docs?.hasRc) hasRc = true;
          if (docs?.hasBol) hasBol = true;
        }

        const latestLogStatus = latestLogByInvoice.get(inv.id);
        
        let deliveryStatus: 'needs_setup' | 'ready' | 'delivered' | 'failed' = 'needs_setup';
        
        if (!hasValidBillingMethod) {
          deliveryStatus = 'needs_setup';
        } else if (inv.billing_method === 'otr') {
          if (inv.otr_submitted_at) {
            deliveryStatus = 'delivered';
          } else if (inv.otr_status === 'failed') {
            deliveryStatus = 'failed';
          } else if (hasToEmail && hasCcEmail) {
            // OTR doesn't require RC/BOL for submission
            deliveryStatus = 'ready';
          }
        } else if (inv.billing_method === 'direct_email') {
          if (latestLogStatus === 'sent') {
            deliveryStatus = 'delivered';
          } else if (latestLogStatus === 'failed') {
            deliveryStatus = 'failed';
          } else if (hasToEmail && hasCcEmail && hasRc && hasBol) {
            deliveryStatus = 'ready';
          }
        }

        counts[deliveryStatus]++;
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
      invoicesByStatus: { needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
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
    invoicesByStatus: data?.invoicesByStatus ?? { needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
    settlements: data?.settlements ?? 0,
    settlementsByStatus: data?.settlementsByStatus ?? { pending: 0, approved: 0, paid: 0 },
    auditLogs: data?.auditLogs ?? 0,
    isLoading,
  };
}
