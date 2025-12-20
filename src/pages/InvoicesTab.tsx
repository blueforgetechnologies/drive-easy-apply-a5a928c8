import { useEffect, useState } from "react";
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
import { Search, Plus, FileText, Send, CheckCircle } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  created_at: string;
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
}

export default function InvoicesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "draft";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: "",
    invoice_date: format(new Date(), "yyyy-MM-dd"),
    due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    payment_terms: "Net 30",
  });

  useEffect(() => {
    loadData();
    loadCustomers();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices" as any)
        .select("*")
        .eq("status", filter)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices((data as any) || []);
    } catch (error) {
      toast.error("Error loading invoices");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers" as any)
        .select("*")
        .eq("status", "active")
        .order("name", { ascending: true });

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

      const invoiceData = {
        invoice_number: `INV${Date.now()}`,
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

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: "Draft", className: "bg-gray-500 hover:bg-gray-600" },
      sent: { label: "Sent", className: "bg-blue-500 hover:bg-blue-600" },
      paid: { label: "Paid", className: "bg-green-600 hover:bg-green-700" },
      overdue: { label: "Overdue", className: "bg-red-500 hover:bg-red-600" },
      cancelled: { label: "Cancelled", className: "bg-gray-700 hover:bg-gray-800" },
    };
    const config = configs[status] || configs.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(searchLower) ||
      (invoice.customer_name || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Invoices</h2>
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "draft" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "draft" });
              setSearchQuery("");
            }}
            className={filter === "draft" ? "bg-gray-500 text-white hover:bg-gray-600" : ""}
          >
            Draft
          </Button>
          <Button
            variant={filter === "sent" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "sent" });
              setSearchQuery("");
            }}
            className={filter === "sent" ? "bg-blue-500 text-white hover:bg-blue-600" : ""}
          >
            Sent
          </Button>
          <Button
            variant={filter === "paid" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "paid" });
              setSearchQuery("");
            }}
            className={filter === "paid" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Paid
          </Button>
          <Button
            variant={filter === "overdue" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "overdue" });
              setSearchQuery("");
            }}
            className={filter === "overdue" ? "bg-red-500 text-white hover:bg-red-600" : ""}
          >
            Overdue
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {filteredInvoices.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {searchQuery ? "No invoices match your search" : `No ${filter} invoices found`}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-l-4 border-l-primary border-b-0 bg-background">
                <TableHead className="text-primary font-medium uppercase text-xs">Invoice #</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Customer</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Invoice Date</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Due Date</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Total</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Paid</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Balance</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Status</TableHead>
                <TableHead className="text-primary font-medium uppercase text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewInvoiceDetail(invoice.id)}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.customer_name}</TableCell>
                  <TableCell>{invoice.invoice_date ? format(new Date(invoice.invoice_date), "MM/dd/yyyy") : "—"}</TableCell>
                  <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), "MM/dd/yyyy") : "—"}</TableCell>
                  <TableCell>${invoice.total_amount?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell className="text-green-600">${invoice.amount_paid?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell className="font-semibold">${invoice.balance_due?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {invoice.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => handleSendInvoice(invoice.id)}>
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      {invoice.status === "sent" && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(invoice.id)}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => viewInvoiceDetail(invoice.id)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
