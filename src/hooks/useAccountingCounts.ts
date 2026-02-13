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

// Helper to chunk arrays for IN queries
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get tenant-scoped accounting counts for badges
 */
export function useAccountingCounts(): AccountingCounts {
  const { query, tenantId, shouldFilter, isPlatformAdmin, isReady } = useTenantQuery();

  const queryKey = [
    "tenant-accounting-counts-v3",
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

      // Fetch base counts and invoices in parallel
      const [
        readyForAuditResult,
        allInvoicesResult,
        companyProfileResult,
        pendingSettlementsResult,
        approvedSettlementsResult,
        paidSettlementsResult,
        auditLogsResult,
      ] = await Promise.all([
        query("loads")
          .select("id", { count: "exact", head: true })
          .or("status.in.(ready_for_audit,set_aside),financial_status.eq.pending_invoice")
          .or("financial_status.is.null,financial_status.neq.invoiced"),
        query("invoices")
          .select("id, status, billing_method, customer_id, otr_submitted_at, otr_status, customers(email, billing_email, otr_approval_status, factoring_approval)"),
        query("company_profile")
          .select("accounting_email")
          .limit(1),
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        query("settlements")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid"),
        query("audit_logs")
          .select("id", { count: "exact", head: true }),
      ]);

      const invoices = (allInvoicesResult.data as any[]) || [];
      const invoiceIds = invoices.map((inv: any) => inv.id);
      const accountingEmail = (companyProfileResult.data as any[])?.[0]?.accounting_email || null;

      if (invoiceIds.length === 0) {
        return {
          readyForAudit: readyForAuditResult.count ?? 0,
          invoices: 0,
          invoicesByStatus: { needs_setup: 0, ready: 0, delivered: 0, failed: 0, paid: 0, overdue: 0 },
          settlements: (pendingSettlementsResult.count ?? 0) + (approvedSettlementsResult.count ?? 0) + (paidSettlementsResult.count ?? 0),
          settlementsByStatus: {
            pending: pendingSettlementsResult.count ?? 0,
            approved: approvedSettlementsResult.count ?? 0,
            paid: paidSettlementsResult.count ?? 0,
          },
          auditLogs: auditLogsResult.count ?? 0,
        };
      }

      // Fetch invoice_loads for these invoices (parallelized chunks)
      const invoiceChunks = chunkArray(invoiceIds, 200);
      
      const invoiceLoadsResults = await Promise.all(
        invoiceChunks.map(chunk => 
          query("invoice_loads")
            .select("invoice_id, load_id")
            .in("invoice_id", chunk)
        )
      );
      const allInvoiceLoads = invoiceLoadsResults.flatMap(r => (r.data as any[]) || []);
      
      const loadIds = [...new Set(allInvoiceLoads.map(il => il.load_id))];

      // Parallel fetch: email logs and load_documents
      const [emailLogsResults, loadDocsResults] = await Promise.all([
        // Email logs (parallelized chunks)
        Promise.all(
          invoiceChunks.map(chunk => 
            query("invoice_email_log")
              .select("invoice_id, status")
              .in("invoice_id", chunk)
              .order("created_at", { ascending: false })
          )
        ),
        // Load documents (parallelized chunks)
        loadIds.length > 0 ? Promise.all(
          chunkArray(loadIds, 200).map(chunk => 
            query("load_documents")
              .select("load_id, document_type")
              .in("load_id", chunk)
              .order("uploaded_at", { ascending: false })
          )
        ) : Promise.resolve([])
      ]);

      const allEmailLogs = emailLogsResults.flatMap(r => (r.data as any[]) || []);
      const allLoadDocs = loadDocsResults.flatMap(r => (r.data as any[]) || []);

      // Build latest email log per invoice (first seen = latest due to DESC order)
      const latestLogByInvoice = new Map<string, string>();
      for (const log of allEmailLogs) {
        if (!latestLogByInvoice.has(log.invoice_id)) {
          latestLogByInvoice.set(log.invoice_id, log.status);
        }
      }

      // Build docs-per-load map (checks existence of each doc type per load)
      const docsPerLoad = new Map<string, { hasRc: boolean; hasBol: boolean }>();
      for (const doc of allLoadDocs) {
        if (!docsPerLoad.has(doc.load_id)) {
          docsPerLoad.set(doc.load_id, { hasRc: false, hasBol: false });
        }
        const entry = docsPerLoad.get(doc.load_id)!;
        if (doc.document_type === 'rate_confirmation') {
          entry.hasRc = true;
        }
        if (doc.document_type === 'bill_of_lading' || doc.document_type === 'pod' || doc.document_type === 'proof_of_delivery') {
          entry.hasBol = true;
        }
      }

      // Build invoice-to-loads map
      const loadsByInvoice = new Map<string, string[]>();
      for (const il of allInvoiceLoads) {
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

      // Helper to normalize credit approval
      const normalizeCreditApproval = (otrStatus: string | null, factoringStatus: string | null): string => {
        const status = otrStatus || factoringStatus;
        if (!status) return 'unknown';
        const normalized = status.toLowerCase().trim();
        if (normalized === 'approved') return 'approved';
        return normalized;
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

        const hasValidBillingMethod = inv.billing_method === 'otr' || inv.billing_method === 'direct_email';
        const customerEmail = inv.customers?.billing_email || inv.customers?.email;
        const hasToEmail = !!customerEmail;
        const hasCcEmail = !!accountingEmail;

        // Check per-load doc coverage
        const loadIdsForInv = loadsByInvoice.get(inv.id) || [];
        const hasLoads = loadIdsForInv.length > 0;
        let allLoadsHaveRc = hasLoads;
        let allLoadsHaveBol = hasLoads;
        
        for (const lid of loadIdsForInv) {
          const docs = docsPerLoad.get(lid);
          if (!docs?.hasRc) allLoadsHaveRc = false;
          if (!docs?.hasBol) allLoadsHaveBol = false;
        }

        const latestLogStatus = (latestLogByInvoice.get(inv.id) || '').toLowerCase();
        
        // Credit approval check for OTR
        const creditApproval = normalizeCreditApproval(
          inv.customers?.otr_approval_status || null,
          inv.customers?.factoring_approval || null
        );
        
        let deliveryStatus: 'needs_setup' | 'ready' | 'delivered' | 'failed' = 'needs_setup';
        
        // No billing method OR no loads => needs_setup
        if (!hasValidBillingMethod || !hasLoads) {
          deliveryStatus = 'needs_setup';
        } else if (inv.billing_method === 'otr') {
          if (inv.otr_submitted_at) {
            deliveryStatus = 'delivered';
          } else if (inv.otr_status === 'failed') {
            deliveryStatus = 'failed';
          } else if (!hasToEmail || !hasCcEmail) {
            // Check email fields first before credit check
            deliveryStatus = 'needs_setup';
          } else if (creditApproval !== 'approved') {
            // OTR requires credit approval
            deliveryStatus = 'needs_setup';
          } else {
            deliveryStatus = 'ready';
          }
        } else if (inv.billing_method === 'direct_email') {
          // Robust status mapping
          if (latestLogStatus === 'sent' || latestLogStatus === 'delivered') {
            deliveryStatus = 'delivered';
          } else if (['failed', 'bounced', 'rejected', 'error'].includes(latestLogStatus)) {
            deliveryStatus = 'failed';
          } else if (['queued', 'sending', 'retrying', 'pending'].includes(latestLogStatus)) {
            // In-progress treated as ready (will show in Ready tab)
            deliveryStatus = 'ready';
          } else if (latestLogStatus && latestLogStatus.length > 0) {
            // Unknown non-empty status - treat as in-progress
            deliveryStatus = 'ready';
          } else if (hasToEmail && hasCcEmail && allLoadsHaveRc && allLoadsHaveBol) {
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
