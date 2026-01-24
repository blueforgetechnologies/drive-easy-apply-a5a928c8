import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Plus, Trash2, Save, Send, Download, DollarSign, Loader2, RefreshCw, Mail } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantId } from "@/hooks/useTenantId";
interface InvoiceLoad {
  id: string;
  load_id: string;
  amount: number;
  description: string;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingToOtr, setSubmittingToOtr] = useState(false);
  const [sendingDirectEmail, setSendingDirectEmail] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceLoads, setInvoiceLoads] = useState<InvoiceLoad[]>([]);
  const [availableLoads, setAvailableLoads] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState("");
  const [refreshingOtrStatus, setRefreshingOtrStatus] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (invoiceError) throw invoiceError;
      setInvoice(invoiceData);

      // Load invoice loads
      const { data: loadsData } = await supabase
        .from("invoice_loads" as any)
        .select("*")
        .eq("invoice_id", id);
      setInvoiceLoads((loadsData as any) || []);

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
    const tax = 0; // Can be customized
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

  const handleSendInvoice = async () => {
    await handleSave();
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

  const handleSubmitToOtr = async (quickPay = false) => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setSubmittingToOtr(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('submit-otr-invoice', {
        body: {
          tenant_id: tenantId,
          invoice_id: id,
          quick_pay: quickPay
        },
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to submit invoice');
      }

      const result = response.data;
      if (result.success) {
        toast.success(result.message || 'Invoice submitted to OTR (Staging)');
        loadData();
      } else {
        toast.error(result.error || 'Failed to submit invoice to OTR');
      }
    } catch (error: any) {
      console.error('OTR submission error:', error);
      toast.error("Failed to submit to OTR: " + error.message);
    } finally {
      setSubmittingToOtr(false);
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
      
      if (error) {
        throw error;
      }
      
      if (data?.success) {
        const normalizedStatus = data.approval_status?.toLowerCase();
        const newBillingMethod = normalizedStatus === 'approved' ? 'otr' : 'direct_email';
        
        // Update invoice billing_method if changed
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

  const handleSendDirectEmail = async () => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setSendingDirectEmail(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('send-invoice-email', {
        body: {
          tenant_id: tenantId,
          invoice_id: id,
        },
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send invoice email');
      }

      const result = response.data;
      if (result.success) {
        toast.success(`Invoice sent to ${result.to_email}`);
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach((warning: string) => {
            toast.warning(warning);
          });
        }
        loadData();
      } else {
        toast.error(result.error || 'Failed to send invoice email');
      }
    } catch (error: any) {
      console.error('Direct email error:', error);
      toast.error("Failed to send invoice: " + error.message);
    } finally {
      setSendingDirectEmail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: "Draft", className: "bg-gray-500 hover:bg-gray-600" },
      sent: { label: "Sent", className: "bg-blue-500 hover:bg-blue-600" },
      paid: { label: "Paid", className: "bg-green-600 hover:bg-green-700" },
      overdue: { label: "Overdue", className: "bg-red-500 hover:bg-red-600" },
    };
    const config = configs[status] || configs.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getOtrStatusBadge = () => {
    if (!invoice.otr_status) return null;
    const configs: Record<string, { label: string; className: string }> = {
      submitted: { label: "OTR: Submitted", className: "bg-blue-500 hover:bg-blue-600" },
      processing: { label: "OTR: Processing", className: "bg-yellow-500 hover:bg-yellow-600" },
      approved: { label: "OTR: Approved", className: "bg-green-500 hover:bg-green-600" },
      funded: { label: "OTR: Funded", className: "bg-green-600 hover:bg-green-700" },
      rejected: { label: "OTR: Rejected", className: "bg-red-500 hover:bg-red-600" },
    };
    const config = configs[invoice.otr_status] || { label: `OTR: ${invoice.otr_status}`, className: "bg-gray-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getBillingMethodBadge = () => {
    switch (invoice.billing_method) {
      case 'otr':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">OTR Factoring</Badge>;
      case 'direct_email':
        return <Badge variant="secondary">Direct Billing</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!invoice) {
    return <div className="text-center py-8">Invoice not found</div>;
  }

  const { subtotal, tax, total } = calculateTotals(invoiceLoads);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/dashboard/invoices")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">Invoice {invoice.invoice_number}</h1>
                {getBillingMethodBadge()}
              </div>
              <p className="text-muted-foreground">{invoice.customer_name}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Refresh OTR Status Button */}
            {invoice.customer_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshOtrStatus}
                disabled={refreshingOtrStatus}
              >
                {refreshingOtrStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh OTR Status
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} variant="outline">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            {invoice.status === "draft" && (
              <Button onClick={handleSendInvoice}>
                <Send className="h-4 w-4 mr-2" />
                Send Invoice
              </Button>
            )}
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            {/* OTR Factoring Submission - only for OTR billing method when not yet submitted */}
            {invoice.billing_method === 'otr' && !invoice.otr_submitted_at && (
              <Button 
                onClick={() => handleSubmitToOtr(false)} 
                disabled={submittingToOtr}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {submittingToOtr ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4 mr-2" />
                )}
                Submit to OTR (Staging)
              </Button>
            )}
            {/* Direct Email - only for direct_email billing method when not yet sent */}
            {invoice.billing_method === 'direct_email' && invoice.status !== 'sent' && invoice.status !== 'paid' && (
              <Button 
                onClick={handleSendDirectEmail} 
                disabled={sendingDirectEmail}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {sendingDirectEmail ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Send Direct Email
              </Button>
            )}
            {invoice.otr_submitted_at && getOtrStatusBadge()}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Invoice Details</CardTitle>
                  {getStatusBadge(invoice.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Invoice Date</Label>
                    <Input
                      type="date"
                      value={invoice.invoice_date ? format(new Date(invoice.invoice_date), "yyyy-MM-dd") : ""}
                      onChange={(e) => setInvoice({ ...invoice, invoice_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={invoice.due_date ? format(new Date(invoice.due_date), "yyyy-MM-dd") : ""}
                      onChange={(e) => setInvoice({ ...invoice, due_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Payment Terms</Label>
                    <Input
                      value={invoice.payment_terms || ""}
                      onChange={(e) => setInvoice({ ...invoice, payment_terms: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Customer Information</h3>
                  <p className="text-sm">{invoice.customer_name}</p>
                  {invoice.customer_address && <p className="text-sm text-muted-foreground">{invoice.customer_address}</p>}
                  {invoice.customer_email && <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>}
                  {invoice.customer_phone && <p className="text-sm text-muted-foreground">{invoice.customer_phone}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Line Items</CardTitle>
                  {invoice.status === "draft" && (
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-2">
                          <Plus className="h-4 w-4" />
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
                                ))}
                              </SelectContent>
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
              </CardHeader>
              <CardContent>
                {invoiceLoads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No loads added yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {invoice.status === "draft" && <TableHead className="w-[50px]"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceLoads.map((load) => (
                        <TableRow key={load.id}>
                          <TableCell>{load.description}</TableCell>
                          <TableCell className="text-right">${load.amount?.toFixed(2)}</TableCell>
                          {invoice.status === "draft" && (
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteLoad(load.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tax</span>
                  <span className="text-sm font-medium">${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold">Total Amount</span>
                  <span className="text-xl font-bold text-green-600">${total.toFixed(2)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Amount Paid</span>
                      <span className="text-sm font-medium text-green-600">-${invoice.amount_paid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Balance Due</span>
                      <span className="text-lg font-bold">${(total - invoice.amount_paid).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
