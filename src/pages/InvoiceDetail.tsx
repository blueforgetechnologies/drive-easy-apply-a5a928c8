import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Plus, Trash2, Save, Download, Loader2, RefreshCw, Pencil, Check, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantId } from "@/hooks/useTenantId";
import { InvoiceDeliveryPanel } from "@/components/InvoiceDeliveryPanel";

interface InvoiceLoad {
  id: string;
  load_id: string;
  amount: number;
  description: string;
  billing_reference_number: string | null;
  reference_number: string | null;
}

function BillingReferenceCell({ invoiceLoad, onSave }: {
  invoiceLoad: InvoiceLoad;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(invoiceLoad.billing_reference_number || invoiceLoad.reference_number || "");
  const display = invoiceLoad.billing_reference_number || invoiceLoad.reference_number || "—";
  const hasOverride = !!invoiceLoad.billing_reference_number && invoiceLoad.billing_reference_number !== invoiceLoad.reference_number;

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={invoiceLoad.reference_number || "Enter ID"}
          className="h-7 text-xs w-28"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(value).then(() => setEditing(false));
            } else if (e.key === "Escape") {
              setValue(invoiceLoad.billing_reference_number || invoiceLoad.reference_number || "");
              setEditing(false);
            }
          }}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" onClick={async () => {
          await onSave(value);
          setEditing(false);
        }}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
          setValue(invoiceLoad.billing_reference_number || invoiceLoad.reference_number || "");
          setEditing(false);
        }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className={`text-sm ${hasOverride ? "font-semibold text-primary" : ""}`}>
        {display}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceLoads, setInvoiceLoads] = useState<InvoiceLoad[]>([]);
  const [availableLoads, setAvailableLoads] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState("");
  const [refreshingOtrStatus, setRefreshingOtrStatus] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (invoiceError) throw invoiceError;
      setInvoice(invoiceData);

      // Load invoice loads with load reference_number
      const { data: loadsData } = await supabase
        .from("invoice_loads" as any)
        .select("*")
        .eq("invoice_id", id);
      
      const enrichedLoads = await Promise.all(
        ((loadsData as any) || []).map(async (il: any) => {
          const { data: loadInfo } = await supabase
            .from("loads" as any)
            .select("reference_number")
            .eq("id", il.load_id)
            .single();
          return {
            ...il,
            reference_number: (loadInfo as any)?.reference_number || null,
          };
        })
      );
      setInvoiceLoads(enrichedLoads);

      // Load company profile for logo
      const { data: companyData } = await supabase
        .from("company_profile" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      setCompanyProfile(companyData);

      // Load available completed loads
      const { data: availData } = await supabase
        .from("loads" as any)
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      setAvailableLoads((availData as any) || []);
    } catch (error: any) {
      toast.error("Error loading invoice details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (loads: InvoiceLoad[]) => {
    const subtotal = loads.reduce((sum, load) => sum + (load.amount || 0), 0);
    const tax = 0;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { subtotal, tax, total } = calculateTotals(invoiceLoads);
      const balanceDue = total - (invoice.amount_paid || 0);

      const { error } = await supabase
        .from("invoices" as any)
        .update({
          ...invoice,
          subtotal,
          tax,
          total_amount: total,
          balance_due: balanceDue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Invoice updated successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update invoice: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddLoad = async () => {
    if (!selectedLoad) {
      toast.error("Please select a load");
      return;
    }

    try {
      const load = availableLoads.find(l => l.id === selectedLoad);
      if (!load) return;

      const { error } = await supabase
        .from("invoice_loads" as any)
        .insert({
          invoice_id: id,
          load_id: load.id,
          amount: load.rate || 0,
          description: `Load ${load.load_number}: ${load.pickup_location} → ${load.delivery_location}`,
        });

      if (error) throw error;
      toast.success("Load added to invoice");
      setDialogOpen(false);
      setSelectedLoad("");
      loadData();
    } catch (error: any) {
      toast.error("Failed to add load: " + error.message);
    }
  };

  const handleDeleteLoad = async (loadId: string) => {
    try {
      const { error } = await supabase
        .from("invoice_loads" as any)
        .delete()
        .eq("id", loadId);

      if (error) throw error;
      toast.success("Load removed from invoice");
      loadData();
    } catch (error: any) {
      toast.error("Failed to remove load: " + error.message);
    }
  };

  const handleRefreshOtrStatus = async () => {
    if (!tenantId || !invoice.customer_id) {
      toast.error("Cannot refresh: missing customer or tenant context");
      return;
    }
    
    setRefreshingOtrStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-broker-credit", {
        body: {
          tenant_id: tenantId,
          customer_id: invoice.customer_id,
        },
      });
      
      if (error) throw error;
      
      if (data?.success) {
        const normalizedStatus = data.approval_status?.toLowerCase();
        const newBillingMethod = normalizedStatus === 'approved' ? 'otr' : 'direct_email';
        
        if (invoice.billing_method !== newBillingMethod) {
          await supabase
            .from("invoices" as any)
            .update({ billing_method: newBillingMethod })
            .eq("id", id);
          
          setInvoice({ ...invoice, billing_method: newBillingMethod });
        }
        
        toast.success(`OTR Status: ${data.approval_status} ${data.credit_limit ? `($${data.credit_limit.toLocaleString()})` : ''}`);
      } else {
        toast.warning(data?.error || "Could not determine OTR status");
      }
    } catch (error: any) {
      console.error("OTR status refresh error:", error);
      toast.error("Failed to refresh OTR status: " + error.message);
    } finally {
      setRefreshingOtrStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: "Open", className: "bg-muted text-muted-foreground border" },
      sent: { label: "Sent", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
      paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
      overdue: { label: "Overdue", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
      failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
      cancelled: { label: "Cancelled", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    };
    const config = configs[status] || configs.draft;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const getBillingMethodLabel = () => {
    switch (invoice.billing_method) {
      case 'otr': return 'OTR Factoring';
      case 'direct_email': return 'Bill Direct';
      default: return 'Not Set';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="text-center py-8 text-muted-foreground">Invoice not found</div>;
  }

  const { subtotal, tax, total } = calculateTotals(invoiceLoads);
  const companyName = companyProfile?.company_name || "Your Company";
  const companyAddress = [companyProfile?.address, companyProfile?.city, companyProfile?.state, companyProfile?.zip].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top action bar */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/accounting?subtab=invoices")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Button>
          <div className="flex gap-2 items-center">
            {invoice.customer_id && (
              <Button variant="outline" size="sm" onClick={handleRefreshOtrStatus} disabled={refreshingOtrStatus}>
                {refreshingOtrStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span className="ml-1.5 hidden sm:inline">Refresh OTR</span>
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} variant="outline" size="sm">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ==================== INVOICE DOCUMENT ==================== */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg border-0 overflow-hidden">
              <CardContent className="p-0">
                {/* Invoice Header - Company branding */}
                <div className="bg-gradient-to-r from-primary to-primary/80 p-6 md:p-8 text-primary-foreground">
                  <div className="flex items-start justify-between">
                    <div>
                      {companyProfile?.logo_url ? (
                        <img src={companyProfile.logo_url} alt={companyName} className="h-12 max-w-[180px] object-contain brightness-0 invert mb-2" />
                      ) : (
                        <h2 className="text-2xl font-bold tracking-tight mb-1">{companyName}</h2>
                      )}
                      {companyAddress && (
                        <p className="text-sm opacity-80">{companyAddress}</p>
                      )}
                      {companyProfile?.phone && (
                        <p className="text-sm opacity-80">{companyProfile.phone}</p>
                      )}
                      {companyProfile?.email && (
                        <p className="text-sm opacity-80">{companyProfile.email}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
                      <p className="text-lg font-semibold opacity-90 mt-1">#{invoice.invoice_number}</p>
                      <div className="mt-2">{getStatusBadge(invoice.status)}</div>
                    </div>
                  </div>
                </div>

                {/* Invoice Meta */}
                <div className="p-6 md:p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Bill To */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bill To</p>
                      <p className="font-semibold text-sm">{invoice.customer_name}</p>
                      {invoice.customer_address && (
                        <p className="text-sm text-muted-foreground">{invoice.customer_address}</p>
                      )}
                      {invoice.customer_email && (
                        <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>
                      )}
                    </div>
                    
                    {/* Invoice Info */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice Date</Label>
                          <Input
                            type="date"
                            value={invoice.invoice_date ? format(new Date(invoice.invoice_date), "yyyy-MM-dd") : ""}
                            onChange={(e) => setInvoice({ ...invoice, invoice_date: e.target.value })}
                            className="h-8 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Due Date</Label>
                          <Input
                            type="date"
                            value={invoice.due_date ? format(new Date(invoice.due_date), "yyyy-MM-dd") : ""}
                            onChange={(e) => setInvoice({ ...invoice, due_date: e.target.value })}
                            className="h-8 text-sm mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Terms</Label>
                          <Input
                            value={invoice.payment_terms || ""}
                            onChange={(e) => setInvoice({ ...invoice, payment_terms: e.target.value })}
                            className="h-8 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Billing Method</Label>
                          <p className="text-sm font-medium mt-2">{getBillingMethodLabel()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Line Items Table */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Line Items</p>
                      {(invoice.status === "draft" || invoice.status === "sent") && invoice.status !== "paid" && (
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                              <Plus className="h-3 w-3" />
                              Add Load
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Load to Invoice</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Select Load</Label>
                                <Select value={selectedLoad} onValueChange={setSelectedLoad}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a completed load" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableLoads.map((load) => (
                                      <SelectItem key={load.id} value={load.id}>
                                        {load.load_number} - {load.pickup_location} → {load.delivery_location} (${load.rate || 0})
                                      </SelectItem>
                                    ))}</SelectContent>
                                </Select>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                                  Cancel
                                </Button>
                                <Button onClick={handleAddLoad} className="flex-1">Add Load</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>

                    {invoiceLoads.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">No loads added yet</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Description</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Original Load ID</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-widest font-semibold">
                                Billing Load ID
                                <span className="text-muted-foreground font-normal ml-1">(click to edit)</span>
                              </TableHead>
                              <TableHead className="text-[10px] uppercase tracking-widest font-semibold text-right">Amount</TableHead>
                              {invoice.status === "draft" && <TableHead className="w-[40px]"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoiceLoads.map((load) => (
                              <TableRow key={load.id}>
                                <TableCell className="text-sm">{load.description}</TableCell>
                                <TableCell className="text-sm text-muted-foreground font-mono">
                                  {load.reference_number || "—"}
                                </TableCell>
                                <TableCell>
                                  <BillingReferenceCell
                                    invoiceLoad={load}
                                    onSave={async (newVal) => {
                                      try {
                                        const { error } = await supabase
                                          .from("invoice_loads" as any)
                                          .update({ billing_reference_number: newVal || null })
                                          .eq("id", load.id);
                                        if (error) throw error;
                                        toast.success("Billing Load ID updated");
                                        loadData();
                                      } catch (err: any) {
                                        toast.error("Failed to update: " + err.message);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold text-sm">${load.amount?.toFixed(2)}</TableCell>
                                {invoice.status === "draft" && (
                                  <TableCell>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteLoad(load.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="font-medium">${tax.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between pt-1">
                        <span className="font-bold text-base">Total Due</span>
                        <span className="font-bold text-xl text-primary">${total.toFixed(2)}</span>
                      </div>
                      {invoice.amount_paid > 0 && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Paid</span>
                            <span className="font-medium text-green-600">-${invoice.amount_paid.toFixed(2)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="font-bold">Balance</span>
                            <span className="font-bold text-lg">${(total - invoice.amount_paid).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {invoice.notes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ==================== SIDEBAR ==================== */}
          <div className="space-y-4">
            <InvoiceDeliveryPanel
              invoiceId={id!}
              invoice={{
                id: invoice.id,
                invoice_number: invoice.invoice_number,
                status: invoice.status,
                billing_method: invoice.billing_method,
                customer_id: invoice.customer_id,
                sent_at: invoice.sent_at,
                otr_submitted_at: invoice.otr_submitted_at,
                tenant_id: tenantId || undefined,
              }}
              onRefresh={loadData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
