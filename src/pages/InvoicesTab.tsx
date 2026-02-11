import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Search, Plus, FileText, Loader2, RefreshCw, AlertCircle, CheckCircle2, Settings, AlertTriangle, XCircle, Mail, HelpCircle, Undo2, Send } from "lucide-react";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import ReturnToAuditDialog from "@/components/ReturnToAuditDialog";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string | null;
  billing_party: string | null;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  notes: string | null;
  created_at: string;
  sent_at: string | null;
  otr_status: string | null;
  otr_submitted_at: string | null;
  otr_invoice_id: string | null;
  otr_error_message: string | null;
  otr_raw_response: any | null;
  otr_failed_at: string | null;
  payment_status: 'pending' | 'paid' | null;
  paid_at: string | null;
  paid_by_name: string | null;
  billing_method: 'unknown' | 'otr' | 'direct_email' | null;
  customers?: { 
    mc_number: string | null; 
    email: string | null; 
    billing_email: string | null;
    otr_approval_status: string | null;
    factoring_approval: string | null;
  } | null;
}

interface LoadDocStatus {
  load_id: string;
  load_number: string;
  hasRc: boolean;
  hasBol: boolean;
}

interface LoadInfo {
  id: string;
  load_number: string;
  reference_number: string | null;
}

interface InvoiceWithDeliveryInfo extends Invoice {
  delivery_status: 'needs_setup' | 'ready' | 'delivered' | 'failed' | 'sending';
  missing_info: string[];
  load_doc_status: LoadDocStatus[];
  rc_coverage: { have: number; total: number };
  bol_coverage: { have: number; total: number };
  all_loads_have_rc: boolean;
  all_loads_have_bol: boolean;
  last_attempt_at: string | null;
  last_attempt_status: string | null;
  last_attempt_error: string | null;
  credit_approval_status: 'approved' | 'denied' | 'pending' | 'unknown';
  credit_approval_source: 'otr' | 'factoring' | null;
  customer_load_ids: string[];
}

interface Customer {
  id: string;
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  payment_terms: string;
  mc_number: string | null;
}

interface EmailLog {
  id: string;
  invoice_id: string;
  status: string;
  created_at: string;
  error: string | null;
}

interface LoadDocument {
  id: string;
  load_id: string;
  document_type: string;
  uploaded_at: string;
}

type OperationalTab = 'needs_setup' | 'ready' | 'delivered' | 'failed' | 'pending_payment' | 'paid' | 'overdue';

// Helper to chunk arrays for IN queries
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function InvoicesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, shouldFilter } = useTenantFilter();
  const filter = (searchParams.get("filter") || "needs_setup") as OperationalTab;
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loadDocuments, setLoadDocuments] = useState<LoadDocument[]>([]);
  const [invoiceLoads, setInvoiceLoads] = useState<{ invoice_id: string; load_id: string }[]>([]);
  const [loadInfoMap, setLoadInfoMap] = useState<Map<string, LoadInfo>>(new Map());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accountingEmail, setAccountingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retryingInvoiceId, setRetryingInvoiceId] = useState<string | null>(null);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [invoiceToReturn, setInvoiceToReturn] = useState<InvoiceWithDeliveryInfo | null>(null);
  const [formData, setFormData] = useState({
    customer_id: "",
    invoice_date: format(new Date(), "yyyy-MM-dd"),
    due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    payment_terms: "Net 30",
  });

  useEffect(() => {
    loadData();
    loadCustomers();
    loadCompanyProfile();
  }, [tenantId, shouldFilter]);

  const setInvoiceFilter = (nextFilter: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("subtab", "invoices");
    next.set("filter", nextFilter);
    setSearchParams(next);
    setSearchQuery("");
  };

  const loadCompanyProfile = async () => {
    if (shouldFilter && !tenantId) return;
    
    try {
      let query = supabase
        .from("company_profile")
        .select("accounting_email")
        .limit(1);
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setAccountingEmail((data[0] as any).accounting_email || null);
      }
    } catch (error) {
      console.error("Error loading company profile:", error);
    }
  };

  const loadData = async () => {
    if (shouldFilter && !tenantId) return;
    
    setLoading(true);
    try {
      // Step 1: Load ALL invoices first
      let invoicesQuery = supabase
        .from("invoices" as any)
        .select("*, customers(mc_number, email, billing_email, otr_approval_status, factoring_approval)")
        .order("created_at", { ascending: false });
      
      if (shouldFilter && tenantId) {
        invoicesQuery = invoicesQuery.eq("tenant_id", tenantId);
      }

      const invoicesResult = await invoicesQuery;
      if (invoicesResult.error) throw invoicesResult.error;
      
      const invoices = (invoicesResult.data as any) || [];
      const invoiceIds = invoices.map((inv: any) => inv.id);
      
      if (invoiceIds.length === 0) {
        setAllInvoices([]);
        setEmailLogs([]);
        setInvoiceLoads([]);
        setLoadDocuments([]);
        setLoading(false);
        return;
      }

      // Step 2: Load invoice_loads for these invoices (parallelized chunks)
      const invoiceChunks = chunkArray(invoiceIds, 200);
      
      const invoiceLoadsResults = await Promise.all(
        invoiceChunks.map(async (chunk) => {
          let ilQuery = supabase
            .from("invoice_loads" as any)
            .select("invoice_id, load_id")
            .in("invoice_id", chunk);

          if (shouldFilter && tenantId) {
            ilQuery = ilQuery.eq("tenant_id", tenantId);
          }

          const ilResult = await ilQuery;
          return (ilResult.data as any) || [];
        })
      );
      const allInvoiceLoads = invoiceLoadsResults.flat();
      
      const loadIds = [...new Set(allInvoiceLoads.map(il => il.load_id))];

      // Step 3: Parallel fetch - email logs AND load info
      const loadChunks = loadIds.length > 0 ? chunkArray(loadIds, 200) : [];
      
      const [emailLogsResults, loadInfoResults] = await Promise.all([
        // Email logs (parallelized chunks)
        Promise.all(
          invoiceChunks.map(async (chunk) => {
            let elQuery = supabase
              .from("invoice_email_log" as any)
              .select("id, invoice_id, status, created_at, error")
              .in("invoice_id", chunk)
              .order("created_at", { ascending: false });

            if (shouldFilter && tenantId) {
              elQuery = elQuery.eq("tenant_id", tenantId);
            }

            const elResult = await elQuery;
            return (elResult.data as any[]) || [];
          })
        ),
        // Load info for load_number (parallelized chunks) - always return array of arrays
        Promise.all(
          loadChunks.map(async (chunk) => {
            let loadQuery = supabase
              .from("loads" as any)
              .select("id, load_number, reference_number")
              .in("id", chunk);

            if (shouldFilter && tenantId) {
              loadQuery = loadQuery.eq("tenant_id", tenantId);
            }

            const loadResult = await loadQuery;
            return (loadResult.data as any[]) || [];
          })
        )
      ]);
      
      const allEmailLogs: EmailLog[] = emailLogsResults.flat();
      const allLoadInfo: LoadInfo[] = loadInfoResults.flat();
      
      // Build load info map
      const loadInfoMapData = new Map<string, LoadInfo>();
      for (const load of allLoadInfo) {
        loadInfoMapData.set(load.id, load);
      }

      // Step 4: Load load_documents for these loads (parallelized chunks)
      let allLoadDocs: LoadDocument[] = [];
      if (loadIds.length > 0) {
        const loadChunks = chunkArray(loadIds, 200);
        const loadDocsResults = await Promise.all(
          loadChunks.map(async (chunk) => {
            let ldQuery = supabase
              .from("load_documents" as any)
              .select("id, load_id, document_type, uploaded_at")
              .in("load_id", chunk)
              .order("uploaded_at", { ascending: false });

            if (shouldFilter && tenantId) {
              ldQuery = ldQuery.eq("tenant_id", tenantId);
            }

            const ldResult = await ldQuery;
            return (ldResult.data as any) || [];
          })
        );
        allLoadDocs = loadDocsResults.flat();
      }

      setAllInvoices(invoices);
      setEmailLogs(allEmailLogs);
      setInvoiceLoads(allInvoiceLoads);
      setLoadInfoMap(loadInfoMapData);
      setLoadDocuments(allLoadDocs);
    } catch (error) {
      toast.error("Error loading data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Build latest email log per invoice (first seen = latest due to DESC order)
  const latestLogByInvoice = useMemo(() => {
    const map = new Map<string, EmailLog>();
    for (const log of emailLogs) {
      if (!map.has(log.invoice_id)) {
        map.set(log.invoice_id, log);
      }
    }
    return map;
  }, [emailLogs]);

  // Build docs-per-load map (checks existence of each doc type per load)
  const docsPerLoad = useMemo(() => {
    const map = new Map<string, { hasRc: boolean; hasBol: boolean }>();
    
    // Check existence of each document type per load
    for (const doc of loadDocuments) {
      if (!map.has(doc.load_id)) {
        map.set(doc.load_id, { hasRc: false, hasBol: false });
      }
      const entry = map.get(doc.load_id)!;
      
      // Check for RC existence
      if (doc.document_type === 'rate_confirmation') {
        entry.hasRc = true;
      }
      // Check for BOL/POD existence - accept both 'pod' and 'proof_of_delivery'
      if (doc.document_type === 'bill_of_lading' || doc.document_type === 'pod' || doc.document_type === 'proof_of_delivery') {
        entry.hasBol = true;
      }
    }
    return map;
  }, [loadDocuments]);

  // Build invoice-to-loads map
  const loadsByInvoice = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const il of invoiceLoads) {
      if (!map.has(il.invoice_id)) {
        map.set(il.invoice_id, []);
      }
      map.get(il.invoice_id)!.push(il.load_id);
    }
    return map;
  }, [invoiceLoads]);

  // Normalize approval status with source tracking
  const normalizeCreditApproval = (otrStatus: string | null, factoringStatus: string | null): { status: 'approved' | 'denied' | 'pending' | 'unknown'; source: 'otr' | 'factoring' | null } => {
    // Prefer OTR status if present
    if (otrStatus) {
      const normalized = otrStatus.toLowerCase().trim();
      if (normalized === 'approved') return { status: 'approved', source: 'otr' };
      if (normalized === 'denied' || normalized === 'rejected') return { status: 'denied', source: 'otr' };
      if (normalized === 'pending') return { status: 'pending', source: 'otr' };
      return { status: 'unknown', source: 'otr' };
    }
    // Fall back to factoring status
    if (factoringStatus) {
      const normalized = factoringStatus.toLowerCase().trim();
      if (normalized === 'approved') return { status: 'approved', source: 'factoring' };
      if (normalized === 'denied' || normalized === 'rejected') return { status: 'denied', source: 'factoring' };
      if (normalized === 'pending') return { status: 'pending', source: 'factoring' };
      return { status: 'unknown', source: 'factoring' };
    }
    return { status: 'unknown', source: null };
  };

  // Compute delivery info for each invoice
  const invoicesWithDeliveryInfo = useMemo((): InvoiceWithDeliveryInfo[] => {
    return allInvoices.map(invoice => {
      const missing: string[] = [];
      
      // Check billing method
      const hasValidBillingMethod = invoice.billing_method === 'otr' || invoice.billing_method === 'direct_email';
      
      if (!hasValidBillingMethod) {
        missing.push('billing_method');
      }
      
      // Check customer email (not needed for OTR billing)
      const customerEmail = invoice.customers?.billing_email || invoice.customers?.email;
      if (!customerEmail && invoice.billing_method !== 'otr') {
        missing.push('to_email');
      }
      
      // Check accounting email (CC)
      if (!accountingEmail) {
        missing.push('cc_email');
      }
      
      // Get load IDs and compute per-load doc status with load_number
      const loadIds = loadsByInvoice.get(invoice.id) || [];
      
      // Check for no loads
      if (loadIds.length === 0) {
        missing.push('no_loads');
      }
      
      const loadDocStatus: LoadDocStatus[] = loadIds.map(load_id => {
        const docs = docsPerLoad.get(load_id);
        const loadInfo = loadInfoMap.get(load_id);
        return {
          load_id,
          load_number: loadInfo?.load_number || load_id.slice(0, 8),
          hasRc: docs?.hasRc || false,
          hasBol: docs?.hasBol || false,
        };
      });
      
      // Compute coverage
      const rcHave = loadDocStatus.filter(x => x.hasRc).length;
      const bolHave = loadDocStatus.filter(x => x.hasBol).length;
      const totalLoads = loadDocStatus.length;
      
      const allLoadsHaveRc = totalLoads > 0 && rcHave === totalLoads;
      const allLoadsHaveBol = totalLoads > 0 && bolHave === totalLoads;
      
      // Only mark missing docs if we have loads
      if (totalLoads > 0 && !allLoadsHaveRc) missing.push('rate_confirmation');
      if (totalLoads > 0 && !allLoadsHaveBol) missing.push('bol_pod');
      
      // Get latest email log for this invoice
      const latestLog = latestLogByInvoice.get(invoice.id) || null;
      
      // Credit approval status from customer record
      const creditApproval = normalizeCreditApproval(
        invoice.customers?.otr_approval_status || null,
        invoice.customers?.factoring_approval || null
      );
      
      // Determine delivery status
      let delivery_status: 'needs_setup' | 'ready' | 'delivered' | 'failed' | 'sending' = 'needs_setup';
      
      // If no valid billing method OR no loads, always needs_setup
      if (!hasValidBillingMethod || loadIds.length === 0) {
        delivery_status = 'needs_setup';
      } else if (invoice.billing_method === 'otr') {
        // OTR: delivered if otr_submitted_at exists
        if (invoice.otr_submitted_at) {
          delivery_status = 'delivered';
        } else if (invoice.otr_status === 'failed') {
          delivery_status = 'failed';
        } else {
          // Check email fields first before credit check (to reduce tooltip noise)
          const emailChecksMissing = missing.filter(m => ['to_email', 'cc_email'].includes(m));
          if (emailChecksMissing.length > 0) {
            delivery_status = 'needs_setup';
          } else if (creditApproval.status !== 'approved') {
            // OTR requires credit approval - only add if email checks pass
            missing.push('credit_not_approved');
            delivery_status = 'needs_setup';
          } else {
            // OTR doesn't require RC/BOL for submission
            delivery_status = 'ready';
          }
        }
      } else if (invoice.billing_method === 'direct_email') {
        // Direct email: check email logs with robust status mapping
        const logStatus = latestLog?.status?.toLowerCase() || '';
        
        // Known delivered statuses
        if (logStatus === 'sent' || logStatus === 'delivered') {
          delivery_status = 'delivered';
        } 
        // Known failed statuses
        else if (['failed', 'bounced', 'rejected', 'error'].includes(logStatus)) {
          delivery_status = 'failed';
        }
        // Known in-progress statuses
        else if (['queued', 'sending', 'retrying', 'pending'].includes(logStatus)) {
          delivery_status = 'sending';
        }
        // Unknown non-empty status - treat as in-progress (show raw status in tooltip)
        else if (logStatus && logStatus.length > 0) {
          delivery_status = 'sending';
        }
        // No logs - check if ready
        else if (missing.length === 0) {
          delivery_status = 'ready';
        } else {
          delivery_status = 'needs_setup';
        }
      }
      
      // Collect customer load IDs (reference_number) from associated loads
      const customerLoadIds = loadIds
        .map(lid => loadInfoMap.get(lid)?.reference_number)
        .filter((r): r is string => !!r);

      return {
        ...invoice,
        delivery_status,
        missing_info: missing,
        load_doc_status: loadDocStatus,
        rc_coverage: { have: rcHave, total: totalLoads },
        bol_coverage: { have: bolHave, total: totalLoads },
        all_loads_have_rc: allLoadsHaveRc,
        all_loads_have_bol: allLoadsHaveBol,
        last_attempt_at: latestLog?.created_at || null,
        last_attempt_status: latestLog?.status || null,
        last_attempt_error: latestLog?.error || null,
        credit_approval_status: creditApproval.status,
        credit_approval_source: creditApproval.source,
        customer_load_ids: customerLoadIds,
      };
    });
  }, [allInvoices, latestLogByInvoice, loadsByInvoice, docsPerLoad, accountingEmail, loadInfoMap]);

  // Categorize invoices into tabs (sending invoices go to Ready tab with different badge)
  const categorizedInvoices = useMemo(() => {
    const needs_setup: InvoiceWithDeliveryInfo[] = [];
    const ready: InvoiceWithDeliveryInfo[] = [];
    const delivered: InvoiceWithDeliveryInfo[] = [];
    const failed: InvoiceWithDeliveryInfo[] = [];
    const pending_payment: InvoiceWithDeliveryInfo[] = [];
    const paid: InvoiceWithDeliveryInfo[] = [];
    const overdue: InvoiceWithDeliveryInfo[] = [];

    for (const inv of invoicesWithDeliveryInfo) {
      // Payment status: paid → Paid tab, pending → Pending tab
      if (inv.payment_status === 'paid' || inv.status === 'paid') {
        paid.push(inv);
        continue;
      }
      if (inv.payment_status === 'pending') {
        pending_payment.push(inv);
        continue;
      }
      if (inv.status === 'overdue') {
        overdue.push(inv);
        continue;
      }
      if (inv.status === 'cancelled') {
        continue;
      }

      // payment_status is NULL — route by delivery_status
      switch (inv.delivery_status) {
        case 'needs_setup':
          needs_setup.push(inv);
          break;
        case 'ready':
        case 'sending':
          ready.push(inv);
          break;
        case 'delivered':
          delivered.push(inv);
          break;
        case 'failed':
          failed.push(inv);
          break;
      }
    }

    return { needs_setup, ready, delivered, failed, pending_payment, paid, overdue };
  }, [invoicesWithDeliveryInfo]);

  // Get filtered invoices based on current tab
  const filteredInvoices = useMemo(() => {
    const list = categorizedInvoices[filter] || [];

    if (!searchQuery) return list;
    
    const searchLower = searchQuery.toLowerCase();
    return list.filter(inv => 
      inv.invoice_number.toLowerCase().includes(searchLower) ||
      (inv.customer_name || "").toLowerCase().includes(searchLower)
    );
  }, [filter, categorizedInvoices, searchQuery]);

  const loadCustomers = async () => {
    if (shouldFilter && !tenantId) return;
    
    try {
      let query = supabase
        .from("customers" as any)
        .select("id, name, email, address, city, state, zip, phone, payment_terms, mc_number")
        .eq("status", "active")
        .order("name", { ascending: true });
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomers((data as any) || []);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customer = customers.find(c => c.id === formData.customer_id);
      if (!customer) {
        toast.error("Please select a customer");
        return;
      }

      const { data: lastInvoice } = await supabase
        .from("invoices" as any)
        .select("invoice_number")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let nextNumber = 1000001;
      const invoiceRecord = lastInvoice as { invoice_number?: string } | null;
      if (invoiceRecord?.invoice_number) {
        const lastNum = parseInt(invoiceRecord.invoice_number, 10);
        if (!isNaN(lastNum)) {
          nextNumber = lastNum + 1;
        }
      }

      const invoiceData = {
        invoice_number: String(nextNumber),
        customer_name: customer.name,
        customer_email: customer.email,
        customer_address: customer.address,
        customer_phone: customer.phone,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        payment_terms: formData.payment_terms,
        status: "draft",
        subtotal: 0,
        tax: 0,
        total_amount: 0,
        amount_paid: 0,
        balance_due: 0,
      };

      const { data: invoice, error } = await supabase
        .from("invoices" as any)
        .insert(invoiceData)
        .select()
        .single();

      if (error) throw error;

      toast.success("Invoice created successfully");
      setDialogOpen(false);
      navigate(`/dashboard/invoice/${(invoice as any).id}`);
    } catch (error: any) {
      toast.error("Failed to create invoice: " + error.message);
    }
  };

  const retryOtrSubmission = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tenantId) {
      toast.error("Tenant context missing");
      return;
    }

    setRetryingInvoiceId(invoice.id);

    try {
      const { data: otrResult, error: otrError } = await supabase.functions.invoke(
        "submit-otr-invoice",
        {
          body: {
            tenant_id: tenantId,
            invoice_id: invoice.id,
            broker_name: invoice.customer_name,
          },
        }
      );

      if (otrError) {
        console.error("OTR retry error:", otrError);
        toast.error(`OTR retry failed: ${otrError.message}`);
        loadData();
      } else if (otrResult?.success) {
        toast.success(`Invoice ${invoice.invoice_number} resubmitted to OTR Solutions`);
        loadData();
      } else {
        toast.error(`OTR rejected: ${otrResult?.error || 'Unknown error'}`);
        loadData();
      }
    } catch (error) {
      console.error("Error retrying OTR submission:", error);
      toast.error(`Failed to retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRetryingInvoiceId(null);
    }
  };

  const handleBackToNeedsSetup = async (invoice: InvoiceWithDeliveryInfo) => {
    if (!tenantId) {
      toast.error("Tenant context missing");
      return;
    }

    try {
      const { error } = await supabase
        .from("invoices" as any)
        .update({ billing_method: null } as any)
        .eq("id", invoice.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;

      toast.success(`Invoice ${invoice.invoice_number} moved back to Needs Setup`);
      loadData();
    } catch (error: any) {
      toast.error(`Failed: ${error.message}`);
    }
  };

  const handleBackToReady = async (invoice: InvoiceWithDeliveryInfo) => {
    if (!tenantId) {
      toast.error("Tenant context missing");
      return;
    }

    try {
      const updatePayload: any = {
        status: 'ready',
        delivery_status: null,
      };

      // Clear OTR failure fields if OTR method
      if (invoice.billing_method === 'otr') {
        updatePayload.otr_status = null;
        updatePayload.otr_error_message = null;
        updatePayload.otr_failed_at = null;
        updatePayload.otr_submitted_at = null;
        updatePayload.otr_raw_response = null;
      }

      // Clear direct email failure fields
      updatePayload.sent_at = null;

      const { error } = await supabase
        .from("invoices" as any)
        .update(updatePayload)
        .eq("id", invoice.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;

      toast.success(`Invoice ${invoice.invoice_number} moved back to Ready to Send`);
      loadData();
    } catch (error: any) {
      toast.error(`Failed: ${error.message}`);
    }
  };

  const handleSendInvoice = async (invoice: InvoiceWithDeliveryInfo) => {
    if (!tenantId) {
      toast.error("Tenant context missing");
      return;
    }

    setSendingInvoiceId(invoice.id);

    try {
      if (invoice.billing_method === 'otr') {
        // OTR submission
        const { data: otrResult, error: otrError } = await supabase.functions.invoke(
          "submit-otr-invoice",
          {
            body: {
              tenant_id: tenantId,
              invoice_id: invoice.id,
              broker_name: invoice.customer_name,
            },
          }
        );

        if (otrError) {
          console.error("OTR submission error:", otrError);
          toast.error(`OTR submission failed: ${otrError.message}`);
          loadData();
        } else if (otrResult?.success) {
          toast.success(`Invoice ${invoice.invoice_number} submitted to OTR Solutions`);
          loadData();
        } else {
          toast.error(`OTR rejected: ${otrResult?.error || 'Unknown error'}`);
          loadData();
        }
      } else if (invoice.billing_method === 'direct_email') {
        // Direct email
        const { data: emailResult, error: emailError } = await supabase.functions.invoke(
          "send-invoice-email",
          {
            body: {
              tenant_id: tenantId,
              invoice_id: invoice.id,
            },
          }
        );

        if (emailError) {
          console.error("Email send error:", emailError);
          toast.error(`Email failed: ${emailError.message}`);
        } else if (emailResult?.success) {
          toast.success(`Invoice ${invoice.invoice_number} sent via email`);
          loadData();
        } else {
          toast.error(`Email failed: ${emailResult?.error || 'Unknown error'}`);
        }
      } else {
        toast.error("No billing method configured");
      }
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast.error(`Failed to send: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const viewInvoiceDetail = (id: string) => {
    navigate(`/dashboard/invoice/${id}`);
  };

  const getDeliveryStatusBadge = (inv: InvoiceWithDeliveryInfo) => {
    switch (inv.delivery_status) {
      case 'delivered':
        return <span className="badge-puffy badge-puffy-green text-xs">Delivered</span>;
      case 'failed':
        return <span className="badge-puffy badge-puffy-red text-xs">Failed</span>;
      case 'sending':
        const rawStatus = inv.last_attempt_status || 'sending';
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="badge-puffy badge-puffy-amber text-xs">Sending</span>
              </TooltipTrigger>
              <TooltipContent>Status: {rawStatus}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'ready':
        return <span className="badge-puffy badge-puffy-blue text-xs">Ready</span>;
      case 'needs_setup':
      default:
        return <span className="badge-puffy badge-puffy-outline text-xs">Needs Setup</span>;
    }
  };
  
  const getBillingMethodBadge = (method: string | null) => {
    switch (method) {
      case 'otr':
        return <span className="badge-puffy badge-puffy-amber text-xs">OTR Solutions</span>;
      case 'direct_email':
        return <span className="badge-puffy badge-puffy-secondary text-xs">Bill Broker</span>;
      default:
        return <span className="badge-puffy badge-puffy-outline text-xs">Not Set</span>;
    }
  };

  const getCreditApprovalBadge = (inv: InvoiceWithDeliveryInfo) => {
    const sourceLabel = inv.credit_approval_source === 'otr' ? 'OTR' : inv.credit_approval_source === 'factoring' ? 'Factoring' : null;
    
    const wrapWithSource = (badge: React.ReactNode) => {
      if (!sourceLabel) return badge;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{badge}</span>
            </TooltipTrigger>
            <TooltipContent>Source: {sourceLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    };
    
    switch (inv.credit_approval_status) {
      case 'approved':
        return wrapWithSource(<span className="badge-puffy badge-puffy-green text-xs">Approved</span>);
      case 'denied':
        return wrapWithSource(<span className="badge-puffy badge-puffy-red text-xs">Denied</span>);
      case 'pending':
        return wrapWithSource(<span className="badge-puffy badge-puffy-secondary text-xs">Pending</span>);
      case 'unknown':
      default:
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground text-xs flex items-center gap-1">
                  — <HelpCircle className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Not checked yet</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

  const getDocsChecklist = (inv: InvoiceWithDeliveryInfo) => {
    const { rc_coverage, bol_coverage, load_doc_status } = inv;
    
    // Handle no loads case
    if (load_doc_status.length === 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-red-500 text-xs">No loads</span>
            </TooltipTrigger>
            <TooltipContent>No loads attached to this invoice</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    // Find missing loads for tooltip - use load_number
    const missingRcLoads = load_doc_status.filter(x => !x.hasRc).map(x => x.load_number);
    const missingBolLoads = load_doc_status.filter(x => !x.hasBol).map(x => x.load_number);
    
    const rcComplete = rc_coverage.have === rc_coverage.total && rc_coverage.total > 0;
    const bolComplete = bol_coverage.have === bol_coverage.total && bol_coverage.total > 0;
    
    return (
      <div className="flex items-center gap-1 text-xs">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-green-500">✓ Inv</span>
            </TooltipTrigger>
            <TooltipContent>Invoice: Generated</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-muted-foreground">/</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={rcComplete ? "text-green-500" : "text-red-500"}>
                RC: {rc_coverage.have}/{rc_coverage.total}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p>Rate Confirmation: {rc_coverage.have}/{rc_coverage.total} loads</p>
                {missingRcLoads.length > 0 && (
                  <p className="text-red-400 mt-1">Missing RC: {missingRcLoads.join(', ')}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-muted-foreground">/</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={bolComplete ? "text-green-500" : "text-red-500"}>
                BOL: {bol_coverage.have}/{bol_coverage.total}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p>BOL/POD: {bol_coverage.have}/{bol_coverage.total} loads</p>
                {missingBolLoads.length > 0 && (
                  <p className="text-red-400 mt-1">Missing BOL: {missingBolLoads.join(', ')}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  const getOtrStatusBadge = (invoice: InvoiceWithDeliveryInfo) => {
    if (invoice.billing_method !== 'otr') {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    
    if (!invoice.otr_status && !invoice.otr_submitted_at) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    
    if (invoice.otr_submitted_at) {
      return (
        <span className="badge-puffy badge-puffy-green text-xs inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Submitted
        </span>
      );
    }
    
    if (invoice.otr_status === 'failed') {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="badge-puffy badge-puffy-red text-xs inline-flex items-center gap-1 cursor-help">
                    <AlertCircle className="h-3 w-3" />
                    Failed
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="font-semibold text-xs mb-1">OTR Response:</p>
                  <p className="text-xs">{invoice.otr_error_message || 'No error details available'}</p>
                  {invoice.otr_failed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Failed: {format(new Date(invoice.otr_failed_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={(e) => retryOtrSubmission(invoice, e)}
              disabled={retryingInvoiceId === invoice.id}
            >
              {retryingInvoiceId === invoice.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          {invoice.otr_error_message && (
            <span className="text-xs text-destructive truncate max-w-[200px]" title={invoice.otr_error_message}>
              {invoice.otr_error_message}
            </span>
          )}
        </div>
      );
    }
    
    return (
      <span className="badge-puffy badge-puffy-outline text-xs">
        {invoice.otr_status || '—'}
      </span>
    );
  };

  const getMissingInfoTooltip = (inv: InvoiceWithDeliveryInfo) => {
    if (inv.missing_info.length === 0) return null;
    
    const labels: Record<string, string> = {
      billing_method: 'Billing method not set',
      to_email: 'Customer email missing',
      cc_email: 'Accounting email missing',
      rate_confirmation: 'Rate Confirmation missing on some loads',
      bol_pod: 'BOL/POD missing on some loads',
      no_loads: 'No loads attached to invoice',
      credit_not_approved: 'Credit not approved (required for OTR)',
    };
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>
            <ul className="text-xs space-y-1">
              {inv.missing_info.map(m => (
                <li key={m}>• {labels[m] || m}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const tabCounts = {
    needs_setup: categorizedInvoices.needs_setup.length,
    ready: categorizedInvoices.ready.length,
    delivered: categorizedInvoices.delivered.length,
    failed: categorizedInvoices.failed.length,
    pending_payment: categorizedInvoices.pending_payment.length,
    paid: categorizedInvoices.paid.length,
    overdue: categorizedInvoices.overdue.length,
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div>
                <Label htmlFor="customer">Customer *</Label>
                <Select value={formData.customer_id} onValueChange={(value) => setFormData({ ...formData, customer_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoice_date">Invoice Date</Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="payment_terms">Payment Terms</Label>
                <Input
                  id="payment_terms"
                  value={formData.payment_terms}
                  onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">Create Invoice</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <TooltipProvider>
          <div className="flex items-center gap-0 flex-wrap">
            {[
              { key: "needs_setup", label: "Needs Setup", icon: Settings, activeClass: "btn-glossy-dark", activeBadgeClass: "badge-inset", softBadgeClass: "badge-inset", tooltip: "Invoices missing billing method, email, or documents" },
              { key: "ready", label: "Ready to Send", icon: Mail, activeClass: "btn-glossy-primary", activeBadgeClass: "badge-inset-dark", softBadgeClass: "badge-inset-soft-blue", tooltip: "Invoices ready to send — not yet sent" },
              { key: "delivered", label: "Delivered", icon: CheckCircle2, activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green", tooltip: "Successfully sent via email or OTR" },
              { key: "failed", label: "Failed", icon: XCircle, activeClass: "btn-glossy-danger", activeBadgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red", tooltip: "Delivery failed — retry available" },
              { key: "paid", label: "Paid", icon: null, activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green", tooltip: "Fully paid invoices" },
              { key: "pending_payment", label: "Pending", icon: null, activeClass: "btn-glossy-warning", activeBadgeClass: "badge-inset", softBadgeClass: "badge-inset-soft-amber", tooltip: "Delivered invoices awaiting payment" },
              { key: "overdue", label: "Overdue", icon: null, activeClass: "btn-glossy-danger", activeBadgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red", tooltip: "Past due date with balance remaining" },
            ].map((status, index, arr) => {
              // Insert a button-width spacer between "Failed" and "Paid"
              const isAfterFailed = status.key === 'paid';
              const isLastBeforeGap = status.key === 'failed';
              return (
                <React.Fragment key={status.key}>
                  {isAfterFailed && <div className="w-9" />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInvoiceFilter(status.key)}
                        className={`h-[28px] px-3 text-[12px] font-medium gap-1.5 border-0 ${
                          isLastBeforeGap ? 'rounded-none first:rounded-l-full rounded-r-full' :
                          isAfterFailed ? 'rounded-none rounded-l-full' :
                          'rounded-none first:rounded-l-full last:rounded-r-full'
                        } ${
                          filter === status.key 
                            ? `${status.activeClass} text-white` 
                            : 'btn-glossy text-gray-700'
                        }`}
                      >
                        {status.icon && <status.icon className="h-3 w-3" />}
                        {status.label}
                        <span className={`${filter === status.key ? status.activeBadgeClass : status.softBadgeClass} text-[10px] h-5`}>
                          {tabCounts[status.key as keyof typeof tabCounts]}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {status.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </React.Fragment>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {filteredInvoices.length} invoices
          </Badge>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
             <TableRow className="border-l-4 border-l-primary border-b-0 bg-background">
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>Invoice #</div>
                <div className="text-muted-foreground font-normal normal-case">Customer Load</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Customer</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>To Email</div>
                <div className="text-muted-foreground font-normal normal-case">CC (Acct)</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>Billing Method</div>
                <div className="text-muted-foreground font-normal normal-case">Credit Approval</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Docs</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Delivery</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>Amount</div>
                <div className="text-muted-foreground font-normal normal-case">Balance</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Payment</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>{['paid', 'pending_payment', 'overdue', 'delivered'].includes(filter) ? 'Delivered On' : 'Last Attempt'}</div>
                <div className="text-muted-foreground font-normal normal-case">
                  {filter === 'paid' ? 'Paid Date' : 'Notes'}
                </div>
              </TableHead>
              {(filter === 'paid' || filter === 'pending_payment') && (
                <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Marked By</TableHead>
              )}
              {(filter === 'needs_setup' || filter === 'ready' || filter === 'failed') && (
                <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={(filter === 'paid' || filter === 'pending_payment') ? 11 : (filter === 'needs_setup' || filter === 'ready' || filter === 'failed') ? 11 : 10} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-50" />
                    <p className="text-base font-medium">No {filter.replace('_', ' ')} invoices</p>
                    <p className="text-sm">{searchQuery ? "No invoices match your search" : `Invoices will appear here when they match this status`}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => {
                const customerEmail = invoice.customers?.billing_email || invoice.customers?.email;
                
                return (
                  <TableRow 
                    key={invoice.id} 
                    className="cursor-pointer hover:bg-muted/50" 
                    onClick={() => viewInvoiceDetail(invoice.id)}
                  >
                     <TableCell className="font-medium text-primary py-2 px-3">
                      <div className="flex items-center gap-2">
                        {invoice.invoice_number}
                        {getMissingInfoTooltip(invoice)}
                      </div>
                      {invoice.customer_load_ids.length > 0 && (
                        <div className="text-xs text-muted-foreground truncate max-w-[120px]" title={invoice.customer_load_ids.join(', ')}>
                          {invoice.customer_load_ids.join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      {invoice.customer_id ? (
                        <div
                          className="cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard/customer/${invoice.customer_id}`);
                          }}
                        >
                          <div className="text-primary text-sm">{invoice.customer_name || "—"}</div>
                          {invoice.customers?.mc_number && (
                            <div className="text-xs text-muted-foreground">MC-{invoice.customers.mc_number}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm">{invoice.customer_name || "—"}</div>
                      )}
                    </TableCell>
                    {/* To Email / CC (Acct) stacked */}
                    <TableCell className="py-2 px-3">
                      {invoice.billing_method === 'otr' ? (
                        <>
                          <div className="text-xs text-muted-foreground italic">Not Applicable</div>
                          <div className="text-xs text-muted-foreground max-w-[140px] truncate" title={accountingEmail || ""}>
                            {accountingEmail || <span className="text-destructive">Missing</span>}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs max-w-[140px] truncate" title={customerEmail || ""}>
                            {customerEmail || <span className="text-destructive">Missing</span>}
                          </div>
                          <div className="text-xs text-muted-foreground max-w-[140px] truncate" title={accountingEmail || ""}>
                            {accountingEmail || <span className="text-destructive">Missing</span>}
                          </div>
                        </>
                      )}
                    </TableCell>
                    {/* Billing Method / Credit Approval stacked */}
                    <TableCell className="py-2 px-3">
                      <div className="mb-1">{getBillingMethodBadge(invoice.billing_method)}</div>
                      <div>{getCreditApprovalBadge(invoice)}</div>
                    </TableCell>
                    <TableCell className="py-2 px-3">{getDocsChecklist(invoice)}</TableCell>
                    {/* Delivery standalone */}
                    <TableCell className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        {getDeliveryStatusBadge(invoice)}
                        {invoice.billing_method === 'otr' && invoice.otr_status === 'failed' && !invoice.otr_submitted_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={(e) => retryOtrSubmission(invoice, e)}
                            disabled={retryingInvoiceId === invoice.id}
                          >
                            {retryingInvoiceId === invoice.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                      {invoice.billing_method === 'otr' && invoice.otr_submitted_at && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="text-success font-medium">OTR Submitted</span>
                        </div>
                      )}
                    </TableCell>
                    {/* Amount / Balance stacked */}
                    <TableCell className="py-2 px-3">
                      <div className="font-medium text-sm">{formatCurrency(invoice.total_amount)}</div>
                      <div className="text-xs text-muted-foreground">{formatCurrency(invoice.balance_due)}</div>
                    </TableCell>
                    {/* Payment Status */}
                    <TableCell className="py-2 px-3">
                      <Select
                        value={(invoice as any).payment_status || '_unset'}
                        onValueChange={async (value) => {
                          try {
                            const actualValue = value === '_unset' ? null : value;
                            const updateData: any = { payment_status: actualValue };
                            // Get current user's name for any payment status change
                            const { data: { user } } = await supabase.auth.getUser();
                            let userName: string | null = null;
                            if (user) {
                              const { data: profile } = await supabase
                                .from('profiles')
                                .select('full_name')
                                .eq('id', user.id)
                                .single();
                              userName = profile?.full_name || user.email || null;
                            }
                            if (actualValue === 'paid') {
                              updateData.status = 'paid';
                              updateData.paid_at = new Date().toISOString();
                              updateData.paid_by_name = userName;
                            } else if (actualValue === 'pending') {
                              updateData.status = 'ready';
                              updateData.paid_at = null;
                              updateData.paid_by_name = userName;
                            } else {
                              updateData.paid_at = null;
                              updateData.paid_by_name = null;
                              updateData.status = 'ready';
                            }
                            const { error } = await supabase
                              .from('invoices' as any)
                              .update(updateData)
                              .eq('id', invoice.id);
                            if (error) throw error;
                            setAllInvoices(prev => prev.map(inv => 
                              inv.id === invoice.id ? { ...inv, payment_status: actualValue as any, status: updateData.status, paid_at: updateData.paid_at, paid_by_name: updateData.paid_by_name } : inv
                            ));
                            toast.success(`Payment status updated to ${actualValue || 'unset'}`);
                          } catch (err) {
                            toast.error('Failed to update payment status');
                            console.error(err);
                          }
                        }}
                      >
                        <SelectTrigger 
                          className={`h-7 w-[100px] text-xs font-medium border-0 ${
                            (invoice as any).payment_status === 'paid' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                              : (invoice as any).payment_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-muted/60 text-muted-foreground'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-yellow-500" />
                              Pending
                            </span>
                          </SelectItem>
                          <SelectItem value="paid">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                              Paid
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {/* Delivered On / Last Attempt + Notes stacked */}
                    <TableCell className="py-2 px-3">
                      <div className="text-xs">
                        {(() => {
                          const isDeliveredContext = ['paid', 'pending_payment', 'overdue', 'delivered'].includes(filter);
                          if (isDeliveredContext) {
                            // Show delivered/accepted date
                            const deliveredDate = invoice.billing_method === 'otr' 
                              ? invoice.otr_submitted_at 
                              : invoice.sent_at;
                            if (deliveredDate) {
                              return (
                                <span className="text-success">
                                  {format(new Date(deliveredDate), "MMM d, h:mm a")}
                                </span>
                              );
                            }
                            return <span className="text-muted-foreground">—</span>;
                          }
                          // Failed/other tabs: show last attempt
                          const attemptDate = invoice.billing_method === 'otr' && invoice.otr_failed_at
                            ? invoice.otr_failed_at
                            : invoice.last_attempt_at;
                          if (attemptDate) {
                            return (
                              <span className={invoice.last_attempt_status === 'failed' || invoice.otr_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                                {format(new Date(attemptDate), "MMM d, h:mm a")}
                              </span>
                            );
                          }
                          return <span className="text-muted-foreground">—</span>;
                        })()}
                      </div>
                      {filter === 'paid' ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(invoice as any).paid_at 
                            ? format(new Date((invoice as any).paid_at), "MMM d, h:mm a")
                            : '—'
                          }
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[320px]" title={
                          (invoice.billing_method === 'otr' && invoice.otr_error_message) 
                            ? invoice.otr_error_message 
                            : (invoice.last_attempt_error || invoice.notes || '')
                        }>
                          {(() => {
                            const noteText = invoice.billing_method === 'otr' && invoice.otr_error_message
                              ? invoice.otr_error_message
                              : (invoice.last_attempt_error || invoice.notes);
                            return noteText || '—';
                          })()}
                        </div>
                      )}
                    </TableCell>
                    {(filter === 'paid' || filter === 'pending_payment') && (
                      <TableCell className="py-2 px-3">
                        <span className="text-xs text-muted-foreground">
                          {(invoice as any).paid_by_name || '—'}
                        </span>
                      </TableCell>
                    )}
                    {filter === 'needs_setup' && (
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInvoiceToReturn(invoice);
                                  setReturnDialogOpen(true);
                                }}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Return
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[220px] text-xs">
                              <p className="font-medium mb-1">Return to Audit</p>
                              <p className="text-muted-foreground">
                                Allowed only if invoice is still internal (no email sent, no OTR submission, no payments).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    )}
                    {filter === 'ready' && (
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                            disabled={sendingInvoiceId === invoice.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendInvoice(invoice);
                            }}
                          >
                            {sendingInvoiceId === invoice.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            {invoice.billing_method === 'otr' ? 'Submit' : 'Send'}
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBackToNeedsSetup(invoice);
                                  }}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  Back to Need Setup
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[220px] text-xs">
                                <p className="font-medium mb-1">Back to Need Setup</p>
                                <p className="text-muted-foreground">
                                  Clears billing method so the invoice moves back to Needs Setup for reconfiguration.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    )}
                    {filter === 'failed' && (
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBackToReady(invoice);
                                }}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Back to Ready
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[220px] text-xs">
                              <p className="font-medium mb-1">Back to Ready to Send</p>
                              <p className="text-muted-foreground">
                                Clears failure state so the invoice can be re-submitted.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Return to Audit Dialog */}
      <ReturnToAuditDialog
        open={returnDialogOpen}
        onOpenChange={(open) => {
          setReturnDialogOpen(open);
          if (!open) setInvoiceToReturn(null);
        }}
        invoice={invoiceToReturn ? {
          id: invoiceToReturn.id,
          invoice_number: invoiceToReturn.invoice_number,
          customer_name: invoiceToReturn.customer_name,
          status: invoiceToReturn.status,
          billing_method: invoiceToReturn.billing_method,
          otr_submitted_at: invoiceToReturn.otr_submitted_at,
          otr_status: invoiceToReturn.otr_status,
          amount_paid: invoiceToReturn.amount_paid,
        } : null}
        onSuccess={loadData}
      />
    </div>
  );
}
