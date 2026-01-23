import { useEffect, useState, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, FileText, Send, CheckCircle, Clock, Undo2, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import InvoicePreview from "@/components/InvoicePreview";
import { OtrVerificationDialog } from "@/components/OtrVerificationDialog";
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
  advance_issued: number | null;
  expected_deposit: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  otr_status: string | null;
  otr_submitted_at: string | null;
  otr_invoice_id: string | null;
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
  factoring_approval: string | null;
  mc_number: string | null;
}

interface PendingLoad {
  id: string;
  load_number: string;
  invoice_number: string | null;
  reference_number: string | null;
  rate: number | null;
  pickup_date: string | null;
  delivery_date: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  completed_at: string | null;
  notes: string | null;
  broker_name: string | null;
  customer_id: string | null;
  customers: { name: string; factoring_approval: string | null; mc_number: string | null } | null;
  carriers: { name: string } | null;
}

interface FactoringCompany {
  factoring_company_name: string | null;
}

export default function InvoicesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, shouldFilter } = useTenantFilter();
  const filter = searchParams.get("filter") || "pending";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingLoads, setPendingLoads] = useState<PendingLoad[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [factoringCompany, setFactoringCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [sendingOtrLoadId, setSendingOtrLoadId] = useState<string | null>(null);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [selectedLoadForOtr, setSelectedLoadForOtr] = useState<PendingLoad | null>(null);
  const [verifiedLoadIds, setVerifiedLoadIds] = useState<Set<string>>(new Set());
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
    loadFactoringCompany();
  }, [filter, tenantId, shouldFilter]);

  const setInvoiceFilter = (nextFilter: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("subtab", "invoices");
    next.set("filter", nextFilter);
    setSearchParams(next);
    setSearchQuery("");
  };

  const loadFactoringCompany = async () => {
    if (shouldFilter && !tenantId) return;
    
    try {
      let query = supabase
        .from("company_profile")
        .select("factoring_company_name")
        .limit(1);
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setFactoringCompany((data[0] as any).factoring_company_name);
      }
    } catch (error) {
      console.error("Error loading factoring company:", error);
    }
  };

  const loadData = async () => {
    if (shouldFilter && !tenantId) return;
    
    setLoading(true);
    try {
      if (filter === "pending") {
        // Load pending invoices from loads table
        let query = supabase
          .from("loads")
          .select(`
            id,
            load_number,
            invoice_number,
            reference_number,
            rate,
            pickup_date,
            delivery_date,
            pickup_city,
            pickup_state,
            delivery_city,
            delivery_state,
            completed_at,
            notes,
            broker_name,
            customer_id,
            customers(name, factoring_approval, mc_number),
            carriers(name)
          `)
          .eq("financial_status", "pending_invoice")
          .order("completed_at", { ascending: false });
        
        if (shouldFilter && tenantId) {
          query = query.eq("tenant_id", tenantId);
        }

        const { data, error } = await query;

        if (error) throw error;
        setPendingLoads((data as PendingLoad[]) || []);
        setInvoices([]);
      } else {
        // Load regular invoices
        let query = supabase
          .from("invoices" as any)
          .select("*")
          .eq("status", filter)
          .order("created_at", { ascending: false });
        
        if (shouldFilter && tenantId) {
          query = query.eq("tenant_id", tenantId);
        }

        const { data, error } = await query;

        if (error) throw error;
        setInvoices((data as any) || []);
        setPendingLoads([]);
      }
    } catch (error) {
      toast.error("Error loading data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const sendBackToAudit = async (loadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("loads")
        .update({ 
          status: "ready_for_audit",
          financial_status: null,
          invoice_number: null
        })
        .eq("id", loadId);

      if (error) throw error;
      
      toast.success("Load sent back to audit");
      loadData();
    } catch (error) {
      console.error("Error sending back to audit:", error);
      toast.error("Failed to send back to audit");
    }
  };

  const openOtrVerification = (load: PendingLoad, e: React.MouseEvent) => {
    e.stopPropagation();
    // If already verified, go straight to send
    if (verifiedLoadIds.has(load.id)) {
      setSelectedLoadForOtr(load);
      confirmSendToOtr(load);
      return;
    }
    setSelectedLoadForOtr(load);
    setVerificationDialogOpen(true);
  };

  const handleVerificationComplete = (loadId: string) => {
    setVerifiedLoadIds(prev => new Set(prev).add(loadId));
  };

  const confirmSendToOtr = async (loadOverride?: PendingLoad) => {
    const load = loadOverride || selectedLoadForOtr;
    if (!load || !tenantId) {
      toast.error("No load selected or tenant context missing");
      return;
    }

    setSendingOtrLoadId(load.id);

    try {
      // First, create an invoice for this load
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

      // Create invoice
      const invoiceData = {
        tenant_id: tenantId,
        invoice_number: String(nextNumber),
        customer_name: load.customers?.name || load.broker_name,
        customer_id: load.customer_id,
        billing_party: factoringCompany || 'OTR Solutions',
        invoice_date: format(new Date(), "yyyy-MM-dd"),
        due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
        payment_terms: "Net 30",
        status: "sent",
        subtotal: load.rate || 0,
        tax: 0,
        total_amount: load.rate || 0,
        amount_paid: 0,
        balance_due: load.rate || 0,
        sent_at: new Date().toISOString(),
      };

      const { data: newInvoice, error: invoiceError } = await supabase
        .from("invoices" as any)
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError || !newInvoice) {
        throw new Error("Failed to create invoice");
      }

      // Link load to invoice
      await supabase
        .from("invoice_loads" as any)
        .insert({
          tenant_id: tenantId,
          invoice_id: (newInvoice as any).id,
          load_id: load.id,
          description: `Load ${load.load_number}`,
          amount: load.rate || 0,
        });

      // Update load financial status
      await supabase
        .from("loads")
        .update({
          financial_status: "invoiced",
          invoice_number: String(nextNumber),
        })
        .eq("id", load.id);

      // Call OTR submit edge function
      const { data: otrResult, error: otrError } = await supabase.functions.invoke(
        "submit-otr-invoice",
        {
          body: {
            tenant_id: tenantId,
            invoice_id: (newInvoice as any).id,
            broker_mc: load.customers?.mc_number,
            broker_name: load.customers?.name || load.broker_name,
          },
        }
      );

      if (otrError) {
        console.error("OTR submission error:", otrError);
        toast.error(`Invoice created but OTR submission failed: ${otrError.message}`);
      } else if (otrResult?.success) {
        toast.success(`Invoice ${nextNumber} submitted to OTR Solutions`);
      } else {
        toast.warning(`Invoice created but OTR returned: ${otrResult?.error || 'Unknown error'}`);
      }

      // Switch to Sent so the newly created invoice is visible immediately
      setInvoiceFilter("sent");
    } catch (error) {
      console.error("Error submitting to OTR:", error);
      toast.error(`Failed to submit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSendingOtrLoadId(null);
      setSelectedLoadForOtr(null);
    }
  };

  const loadCustomers = async () => {
    if (shouldFilter && !tenantId) return;
    
    try {
      let query = supabase
        .from("customers" as any)
        .select("*")
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

      // Get the highest invoice number and increment
      const { data: lastInvoice } = await supabase
        .from("invoices" as any)
        .select("invoice_number")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let nextNumber = 1000001; // Start from 1000001
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

  const handleSendInvoice = async (id: string) => {
    try {
      const { error } = await supabase
        .from("invoices" as any)
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Invoice sent successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to send invoice: " + error.message);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const invoice = invoices.find(inv => inv.id === id);
      if (!invoice) return;

      const { error } = await supabase
        .from("invoices" as any)
        .update({
          status: "paid",
          amount_paid: invoice.total_amount,
          balance_due: 0,
          paid_at: new Date().toISOString(),
          payment_date: format(new Date(), "yyyy-MM-dd"),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Invoice marked as paid");
      loadData();
    } catch (error: any) {
      toast.error("Failed to mark as paid: " + error.message);
    }
  };

  const viewInvoiceDetail = (id: string) => {
    navigate(`/dashboard/invoice/${id}`);
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

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: "Draft", className: "bg-gray-500 hover:bg-gray-600" },
      sent: { label: "Billed", className: "bg-amber-500 hover:bg-amber-600" },
      paid: { label: "Paid", className: "bg-green-500 hover:bg-green-600" },
      overdue: { label: "Overdue", className: "bg-red-500 hover:bg-red-600" },
      cancelled: { label: "Cancelled", className: "bg-gray-700 hover:bg-gray-800" },
    };
    const config = configs[status] || configs.draft;
    return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
  };

  const getOtrStatusBadge = (invoice: Invoice) => {
    if (!invoice.otr_status) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    
    switch (invoice.otr_status) {
      case 'submitted':
      case 'received':
        return (
          <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Submitted
          </Badge>
        );
      case 'failed':
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
      case 'pending':
        return (
          <Badge variant="secondary" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {invoice.otr_status}
          </Badge>
        );
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(searchLower) ||
      (invoice.customer_name || "").toLowerCase().includes(searchLower)
    );
  });

  const filteredPendingLoads = pendingLoads.filter((load) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      load.load_number?.toLowerCase().includes(searchLower) ||
      load.reference_number?.toLowerCase().includes(searchLower) ||
      (load.customers?.name || "").toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return format(new Date(date), "MMM d, yyyy");
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div /> {/* Spacer for alignment */}
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
        <div className="flex items-center gap-0">
          {[
            { key: "pending", label: "Pending", icon: Clock, activeClass: "btn-glossy-warning", softBadgeClass: "badge-inset-soft-orange" },
            { key: "draft", label: "Draft", icon: null, activeClass: "btn-glossy", softBadgeClass: "badge-inset" },
            { key: "sent", label: "Sent", icon: null, activeClass: "btn-glossy-primary", softBadgeClass: "badge-inset-soft-blue" },
            { key: "paid", label: "Paid", icon: null, activeClass: "btn-glossy-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "overdue", label: "Overdue", icon: null, activeClass: "btn-glossy-danger", softBadgeClass: "badge-inset-soft-red" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => setInvoiceFilter(status.key)}
              className={`h-[28px] px-3 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                filter === status.key 
                  ? `${status.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {status.icon && <status.icon className="h-3 w-3" />}
              {status.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {filter === "pending" ? filteredPendingLoads.length : filteredInvoices.length} {filter === "pending" ? "loads" : "invoices"}
          </Badge>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={filter === "pending" ? "Search loads..." : "Search invoices..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        {filter === "pending" ? (
          // Pending loads table
          filteredPendingLoads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No pending loads</p>
              <p className="text-sm">Approved loads awaiting invoice creation will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-l-4 border-l-amber-500 border-b-0 bg-background">
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Number</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Customer</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Factoring</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Billing Party</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Billing Date</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Days</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Amount</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Advance Issued</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Expected Deposit</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Balance</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Status</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Notes</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPendingLoads.map((load) => {
                  const billingDate = load.completed_at || load.delivery_date || load.pickup_date;
                  const daysSinceBilling = billingDate
                    ? Math.floor((Date.now() - new Date(billingDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;

                  const invoiceAmount = load.rate || 0;
                  const advanceIssued = 0;
                  const expectedDeposit = invoiceAmount - advanceIssued;
                  const balance = invoiceAmount;

                  const isExpanded = expandedLoadId === load.id;

                  return (
                    <Fragment key={load.id}>
                      <TableRow
                        className={`hover:bg-muted/50 border-l-4 border-l-amber-500 ${isExpanded ? 'bg-muted/30' : ''}`}
                      >
                        <TableCell 
                          className="font-medium text-primary cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedLoadId(isExpanded ? null : load.id);
                          }}
                        >
                          {load.invoice_number || load.load_number}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{load.customers?.name || "—"}</div>
                            {load.customers?.mc_number && (
                              <div className="text-xs text-muted-foreground">MC-{load.customers.mc_number}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {load.customers?.factoring_approval === 'approved' ? (
                            <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">Approved</Badge>
                          ) : load.customers?.factoring_approval === 'pending' ? (
                            <Badge variant="secondary" className="text-xs">Pending</Badge>
                          ) : load.customers?.factoring_approval === 'denied' ? (
                            <Badge variant="destructive" className="text-xs">Denied</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Show factoring company as billing party for approved customers */}
                          {load.customers?.factoring_approval === 'approved' && factoringCompany
                            ? factoringCompany
                            : (load.customers?.name || load.broker_name || "—")}
                        </TableCell>
                        <TableCell>{billingDate ? format(new Date(billingDate), "M/d/yyyy") : "—"}</TableCell>
                        <TableCell className={daysSinceBilling > 30 ? "text-destructive font-medium" : ""}>
                          {daysSinceBilling}
                        </TableCell>
                        <TableCell>{formatCurrency(load.rate)}</TableCell>
                        <TableCell>{formatCurrency(0)}</TableCell>
                        <TableCell>{formatCurrency(expectedDeposit)}</TableCell>
                        <TableCell>{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Pending</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={load.notes || ""}>
                          {load.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {load.customers?.factoring_approval === 'approved' && (
                              <Button
                                variant={verifiedLoadIds.has(load.id) ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => openOtrVerification(load, e)}
                                disabled={sendingOtrLoadId === load.id}
                                className={verifiedLoadIds.has(load.id) 
                                  ? "bg-amber-500 hover:bg-amber-600 text-white" 
                                  : "text-blue-600 border-blue-300 hover:bg-blue-50"}
                              >
                                {sendingOtrLoadId === load.id ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : verifiedLoadIds.has(load.id) ? (
                                  <Send className="h-4 w-4 mr-1" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                )}
                                {verifiedLoadIds.has(load.id) ? "Send Invoice" : "Verify Info"}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => sendBackToAudit(load.id, e)}
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Undo2 className="h-4 w-4 mr-1" />
                              Back to Audit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <tr>
                          <td colSpan={13} className="p-0">
                            <InvoicePreview 
                              loadId={load.id} 
                              onClose={() => setExpandedLoadId(null)} 
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : (
          // Regular invoices table
          filteredInvoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No invoices match your search" : `No ${filter} invoices found`}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-l-4 border-l-primary border-b-0 bg-background">
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Number</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Customer</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Billing Party</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Billing Date</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Days</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Amount</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Advance Issued</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Expected Deposit</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Balance</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Invoice Status</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">OTR Status</TableHead>
                  <TableHead className="text-primary font-medium uppercase text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const daysSinceBilling = invoice.invoice_date 
                    ? Math.floor((Date.now() - new Date(invoice.invoice_date).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const advanceIssued = invoice.advance_issued || 0;
                  
                  return (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewInvoiceDetail(invoice.id)}>
                      <TableCell className="font-medium text-primary">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.customer_name || "—"}</TableCell>
                      <TableCell>{invoice.billing_party || "—"}</TableCell>
                      <TableCell>{invoice.invoice_date ? format(new Date(invoice.invoice_date), "M/d/yyyy") : "—"}</TableCell>
                      <TableCell className={daysSinceBilling > 30 ? "text-destructive font-medium" : ""}>
                        {daysSinceBilling}
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                      <TableCell className={advanceIssued > 0 ? "text-destructive" : ""}>
                        {advanceIssued > 0 ? `(${formatCurrency(advanceIssued)})` : formatCurrency(0)}
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.expected_deposit)}</TableCell>
                      <TableCell>{formatCurrency(invoice.balance_due)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>{getOtrStatusBadge(invoice)}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={invoice.notes || ""}>
                        {invoice.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        )}
      </div>

      {/* OTR Verification Dialog */}
      {selectedLoadForOtr && tenantId && (
        <OtrVerificationDialog
          open={verificationDialogOpen}
          onOpenChange={setVerificationDialogOpen}
          load={selectedLoadForOtr}
          tenantId={tenantId}
          factoringCompany={factoringCompany}
          onConfirmSend={() => confirmSendToOtr()}
          onVerificationComplete={handleVerificationComplete}
        />
      )}
    </div>
  );
}
