import { useEffect, useState, useMemo } from "react";
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
import { Search, Plus, FileText, Loader2, RefreshCw, AlertCircle, CheckCircle2, Settings, AlertTriangle, XCircle, Mail } from "lucide-react";
import { useTenantFilter } from "@/hooks/useTenantFilter";

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
  billing_method: 'unknown' | 'otr' | 'direct_email' | null;
  customers?: { 
    mc_number: string | null; 
    email: string | null; 
    billing_email: string | null;
    otr_approval_status: string | null;
  } | null;
}

interface InvoiceWithDeliveryInfo extends Invoice {
  delivery_status: 'needs_setup' | 'ready' | 'delivered' | 'failed';
  missing_info: string[];
  has_rc: boolean;
  has_bol: boolean;
  last_attempt_at: string | null;
  last_attempt_status: string | null;
  last_attempt_error: string | null;
  broker_approved: boolean;
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

type OperationalTab = 'needs_setup' | 'ready' | 'delivered' | 'failed' | 'paid' | 'overdue';

export default function InvoicesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, shouldFilter } = useTenantFilter();
  const filter = (searchParams.get("filter") || "needs_setup") as OperationalTab;
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loadDocuments, setLoadDocuments] = useState<LoadDocument[]>([]);
  const [invoiceLoads, setInvoiceLoads] = useState<{ invoice_id: string; load_id: string }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accountingEmail, setAccountingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retryingInvoiceId, setRetryingInvoiceId] = useState<string | null>(null);
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
      // Load ALL invoices (only invoices, not loads)
      let invoicesQuery = supabase
        .from("invoices" as any)
        .select("*, customers(mc_number, email, billing_email, otr_approval_status)")
        .order("created_at", { ascending: false });
      
      if (shouldFilter && tenantId) {
        invoicesQuery = invoicesQuery.eq("tenant_id", tenantId);
      }

      // Load email logs - LIMIT to last 2000 rows for performance, ordered by created_at DESC
      let emailLogsQuery = supabase
        .from("invoice_email_log" as any)
        .select("id, invoice_id, status, created_at, error")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (shouldFilter && tenantId) {
        emailLogsQuery = emailLogsQuery.eq("tenant_id", tenantId);
      }

      // Load invoice_loads for document lookup
      let invoiceLoadsQuery = supabase
        .from("invoice_loads" as any)
        .select("invoice_id, load_id");

      if (shouldFilter && tenantId) {
        invoiceLoadsQuery = invoiceLoadsQuery.eq("tenant_id", tenantId);
      }

      // Load load_documents - LIMIT to 2000 rows for performance, ordered by uploaded_at DESC
      let loadDocsQuery = supabase
        .from("load_documents" as any)
        .select("id, load_id, document_type, uploaded_at")
        .order("uploaded_at", { ascending: false })
        .limit(2000);

      if (shouldFilter && tenantId) {
        loadDocsQuery = loadDocsQuery.eq("tenant_id", tenantId);
      }

      const [invoicesResult, emailLogsResult, invoiceLoadsResult, loadDocsResult] = await Promise.all([
        invoicesQuery,
        emailLogsQuery,
        invoiceLoadsQuery,
        loadDocsQuery,
      ]);

      if (invoicesResult.error) throw invoicesResult.error;

      setAllInvoices((invoicesResult.data as any) || []);
      setEmailLogs((emailLogsResult.data as any) || []);
      setInvoiceLoads((invoiceLoadsResult.data as any) || []);
      setLoadDocuments((loadDocsResult.data as any) || []);
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

  // Build deduplicated docs per load (newest RC and newest BOL/POD per load)
  const docsPerLoad = useMemo(() => {
    const map = new Map<string, { newestRc: LoadDocument | null; newestBol: LoadDocument | null }>();
    
    // Documents are already sorted by uploaded_at DESC
    for (const doc of loadDocuments) {
      if (!map.has(doc.load_id)) {
        map.set(doc.load_id, { newestRc: null, newestBol: null });
      }
      const entry = map.get(doc.load_id)!;
      
      // Check for RC (only set if not already set - first one is newest)
      if (doc.document_type === 'rate_confirmation' && !entry.newestRc) {
        entry.newestRc = doc;
      }
      // Check for BOL/POD (bill_of_lading or pod)
      if ((doc.document_type === 'bill_of_lading' || doc.document_type === 'pod') && !entry.newestBol) {
        entry.newestBol = doc;
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

  // Compute delivery info for each invoice
  const invoicesWithDeliveryInfo = useMemo((): InvoiceWithDeliveryInfo[] => {
    return allInvoices.map(invoice => {
      const missing: string[] = [];
      
      // RULE: If billing_method is null/unknown => ALWAYS needs_setup
      const hasValidBillingMethod = invoice.billing_method === 'otr' || invoice.billing_method === 'direct_email';
      
      if (!hasValidBillingMethod) {
        missing.push('billing_method');
      }
      
      // Check customer email
      const customerEmail = invoice.customers?.billing_email || invoice.customers?.email;
      if (!customerEmail) {
        missing.push('to_email');
      }
      
      // Check accounting email (CC)
      if (!accountingEmail) {
        missing.push('cc_email');
      }
      
      // Get load IDs for this invoice and check documents (deduplicated)
      const loadIds = loadsByInvoice.get(invoice.id) || [];
      
      // Check for RC and BOL/POD using deduplicated docs
      let hasRc = false;
      let hasBol = false;
      for (const loadId of loadIds) {
        const docs = docsPerLoad.get(loadId);
        if (docs?.newestRc) hasRc = true;
        if (docs?.newestBol) hasBol = true;
      }
      
      if (!hasRc) missing.push('rate_confirmation');
      if (!hasBol) missing.push('bol_pod');
      
      // Get latest email log for this invoice
      const latestLog = latestLogByInvoice.get(invoice.id) || null;
      
      // Broker approved is TRUE if and only if billing_method = 'otr'
      // This ensures consistency: OTR method means broker was approved
      const brokerApproved = invoice.billing_method === 'otr';
      
      // Determine delivery status
      let delivery_status: 'needs_setup' | 'ready' | 'delivered' | 'failed' = 'needs_setup';
      
      // If no valid billing method, always needs_setup
      if (!hasValidBillingMethod) {
        delivery_status = 'needs_setup';
      } else if (invoice.billing_method === 'otr') {
        // OTR: delivered if otr_submitted_at exists
        if (invoice.otr_submitted_at) {
          delivery_status = 'delivered';
        } else if (invoice.otr_status === 'failed') {
          delivery_status = 'failed';
        } else {
          // OTR doesn't require RC/BOL for submission - only check email fields
          const otrMissing = missing.filter(m => m !== 'rate_confirmation' && m !== 'bol_pod');
          if (otrMissing.length === 0) {
            delivery_status = 'ready';
          } else {
            delivery_status = 'needs_setup';
          }
        }
      } else if (invoice.billing_method === 'direct_email') {
        // Direct email: check email logs
        if (latestLog?.status === 'sent') {
          delivery_status = 'delivered';
        } else if (latestLog?.status === 'failed') {
          delivery_status = 'failed';
        } else if (missing.length === 0) {
          // All checks pass (including RC/BOL for direct email)
          delivery_status = 'ready';
        } else {
          delivery_status = 'needs_setup';
        }
      }
      
      return {
        ...invoice,
        delivery_status,
        missing_info: missing,
        has_rc: hasRc,
        has_bol: hasBol,
        last_attempt_at: latestLog?.created_at || null,
        last_attempt_status: latestLog?.status || null,
        last_attempt_error: latestLog?.error || null,
        broker_approved: brokerApproved,
      };
    });
  }, [allInvoices, latestLogByInvoice, loadsByInvoice, docsPerLoad, accountingEmail]);

  // Categorize invoices into tabs
  const categorizedInvoices = useMemo(() => {
    const needs_setup: InvoiceWithDeliveryInfo[] = [];
    const ready: InvoiceWithDeliveryInfo[] = [];
    const delivered: InvoiceWithDeliveryInfo[] = [];
    const failed: InvoiceWithDeliveryInfo[] = [];
    const paid: InvoiceWithDeliveryInfo[] = [];
    const overdue: InvoiceWithDeliveryInfo[] = [];

    for (const inv of invoicesWithDeliveryInfo) {
      // Paid and overdue are based on invoice.status (lifecycle)
      if (inv.status === 'paid') {
        paid.push(inv);
        continue;
      }
      if (inv.status === 'overdue') {
        overdue.push(inv);
        continue;
      }
      if (inv.status === 'cancelled') {
        continue; // Skip cancelled
      }

      // Categorize by delivery status
      switch (inv.delivery_status) {
        case 'needs_setup':
          needs_setup.push(inv);
          break;
        case 'ready':
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

    return { needs_setup, ready, delivered, failed, paid, overdue };
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
      } else if (otrResult?.success) {
        toast.success(`Invoice ${invoice.invoice_number} resubmitted to OTR Solutions`);
        loadData();
      } else {
        toast.error(`OTR returned: ${otrResult?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error retrying OTR submission:", error);
      toast.error(`Failed to retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRetryingInvoiceId(null);
    }
  };

  const viewInvoiceDetail = (id: string) => {
    navigate(`/dashboard/invoice/${id}`);
  };

  const getDeliveryStatusBadge = (inv: InvoiceWithDeliveryInfo) => {
    switch (inv.delivery_status) {
      case 'delivered':
        return <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">Delivered</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      case 'ready':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">Ready</Badge>;
      case 'needs_setup':
      default:
        return <Badge variant="outline" className="text-xs">Needs Setup</Badge>;
    }
  };
  
  const getBillingMethodBadge = (method: string | null) => {
    switch (method) {
      case 'otr':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">OTR</Badge>;
      case 'direct_email':
        return <Badge variant="secondary" className="text-xs">Direct Email</Badge>;
      default:
        return <Badge variant="outline" className="text-xs text-muted-foreground">Not Set</Badge>;
    }
  };

  const getBrokerApprovedBadge = (inv: InvoiceWithDeliveryInfo) => {
    if (inv.broker_approved) {
      return <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">Yes</Badge>;
    }
    // Not approved or unknown
    if (inv.billing_method === 'direct_email') {
      return <Badge variant="outline" className="text-xs text-muted-foreground">No</Badge>;
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  };

  const getDocsChecklist = (inv: InvoiceWithDeliveryInfo) => {
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
              <span className={inv.has_rc ? "text-green-500" : "text-red-500"}>
                {inv.has_rc ? "✓" : "✗"} RC
              </span>
            </TooltipTrigger>
            <TooltipContent>Rate Confirmation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-muted-foreground">/</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={inv.has_bol ? "text-green-500" : "text-red-500"}>
                {inv.has_bol ? "✓" : "✗"} BOL
              </span>
            </TooltipTrigger>
            <TooltipContent>Bill of Lading / POD</TooltipContent>
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
        <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Submitted
        </Badge>
      );
    }
    
    if (invoice.otr_status === 'failed') {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
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
      );
    }
    
    return (
      <Badge variant="outline" className="text-xs">
        {invoice.otr_status || 'Pending'}
      </Badge>
    );
  };

  const getMissingInfoTooltip = (inv: InvoiceWithDeliveryInfo) => {
    if (inv.missing_info.length === 0) return null;
    
    const labels: Record<string, string> = {
      billing_method: 'Billing method not set',
      to_email: 'Customer email missing',
      cc_email: 'Accounting email missing',
      rate_confirmation: 'Rate Confirmation missing',
      bol_pod: 'BOL/POD missing',
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
        <div className="flex items-center gap-0 flex-wrap">
          {[
            { key: "needs_setup", label: "Needs Setup", icon: Settings, activeClass: "btn-glossy-dark", activeBadgeClass: "badge-inset", softBadgeClass: "badge-inset" },
            { key: "ready", label: "Ready to Send", icon: Mail, activeClass: "btn-glossy-primary", activeBadgeClass: "badge-inset-dark", softBadgeClass: "badge-inset-soft-blue" },
            { key: "delivered", label: "Delivered", icon: CheckCircle2, activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "failed", label: "Failed", icon: XCircle, activeClass: "btn-glossy-danger", activeBadgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red" },
            { key: "paid", label: "Paid", icon: null, activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "overdue", label: "Overdue", icon: null, activeClass: "btn-glossy-danger", activeBadgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => setInvoiceFilter(status.key)}
              className={`h-[28px] px-3 text-[12px] font-medium gap-1.5 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
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
          ))}
        </div>

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
              <TableHead className="text-primary font-medium uppercase text-xs">Invoice #</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Customer</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Method</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Broker Approved</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">To Email</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">CC (Acct)</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Docs</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Delivery</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Last Attempt</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Amount</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Balance</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">OTR Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-12 text-center">
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
                    <TableCell className="font-medium text-primary">
                      <div className="flex items-center gap-2">
                        {invoice.invoice_number}
                        {getMissingInfoTooltip(invoice)}
                      </div>
                    </TableCell>
                    <TableCell>
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
                    <TableCell>{getBillingMethodBadge(invoice.billing_method)}</TableCell>
                    <TableCell>{getBrokerApprovedBadge(invoice)}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={customerEmail || ""}>
                      {customerEmail || <span className="text-red-500">Missing</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={accountingEmail || ""}>
                      {accountingEmail || <span className="text-red-500">Missing</span>}
                    </TableCell>
                    <TableCell>{getDocsChecklist(invoice)}</TableCell>
                    <TableCell>{getDeliveryStatusBadge(invoice)}</TableCell>
                    <TableCell className="text-xs">
                      {invoice.last_attempt_at ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={invoice.last_attempt_status === 'failed' ? 'text-red-500' : ''}>
                                {formatDistanceToNow(new Date(invoice.last_attempt_at), { addSuffix: true })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <p>{format(new Date(invoice.last_attempt_at), "MMM d, yyyy h:mm a")}</p>
                                {invoice.last_attempt_error && (
                                  <p className="text-red-400 mt-1">{invoice.last_attempt_error}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                    <TableCell>{formatCurrency(invoice.balance_due)}</TableCell>
                    <TableCell>{getOtrStatusBadge(invoice)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
