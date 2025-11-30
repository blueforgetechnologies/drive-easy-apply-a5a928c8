import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";

interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  phone_mobile: string | null;
  phone_fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  payment_terms: string | null;
  credit_limit: number | null;
  notes: string | null;
}

export default function CustomersTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const aiUpdateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-update-customers');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`AI update complete: ${data.created} created, ${data.updated} updated from ${data.processed} emails`);
      if (data.errors > 0) {
        toast.warning(`${data.errors} emails had parsing errors`);
      }
      loadData();
    },
    onError: (error: any) => {
      toast.error(`AI update failed: ${error.message}`);
    },
  });
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    email: "",
    email_secondary: "",
    phone: "",
    phone_secondary: "",
    phone_mobile: "",
    phone_fax: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    payment_terms: "Net 30",
    credit_limit: "",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("customers" as any)
        .select("*")
        .order("name", { ascending: true });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomers((data as any) || []);
    } catch (error) {
      toast.error("Error loading customers");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customerData = {
        ...formData,
        credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : null,
        status: filter,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from("customers" as any)
          .update(customerData)
          .eq("id", editingCustomer.id);
        if (error) throw error;
        toast.success("Customer updated successfully");
      } else {
        const { error } = await supabase
          .from("customers" as any)
          .insert(customerData);
        if (error) throw error;
        toast.success("Customer created successfully");
      }

      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error("Failed to save customer: " + error.message);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "",
      contact_name: customer.contact_name || "",
      email: customer.email || "",
      email_secondary: customer.email_secondary || "",
      phone: customer.phone || "",
      phone_secondary: customer.phone_secondary || "",
      phone_mobile: customer.phone_mobile || "",
      phone_fax: customer.phone_fax || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zip: customer.zip || "",
      payment_terms: customer.payment_terms || "Net 30",
      credit_limit: customer.credit_limit?.toString() || "",
      notes: customer.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    try {
      const { error } = await supabase
        .from("customers" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Customer deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete customer: " + error.message);
    }
  };

  const resetForm = () => {
    setEditingCustomer(null);
    setFormData({
      name: "",
      contact_name: "",
      email: "",
      email_secondary: "",
      phone: "",
      phone_secondary: "",
      phone_mobile: "",
      phone_fax: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      payment_terms: "Net 30",
      credit_limit: "",
      notes: "",
    });
  };

  const filteredCustomers = customers.filter((customer) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchLower) ||
      (customer.contact_name || "").toLowerCase().includes(searchLower) ||
      (customer.email || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Customers</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => aiUpdateMutation.mutate()}
            disabled={aiUpdateMutation.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {aiUpdateMutation.isPending ? "Updating..." : "AI Update"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Customer
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="contact_name">Contact Name</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email_secondary">Secondary Email</Label>
                  <Input
                    id="email_secondary"
                    type="email"
                    value={formData.email_secondary}
                    onChange={(e) => setFormData({ ...formData, email_secondary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_secondary">Secondary Phone</Label>
                  <Input
                    id="phone_secondary"
                    type="tel"
                    value={formData.phone_secondary}
                    onChange={(e) => setFormData({ ...formData, phone_secondary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_mobile">Mobile</Label>
                  <Input
                    id="phone_mobile"
                    type="tel"
                    value={formData.phone_mobile}
                    onChange={(e) => setFormData({ ...formData, phone_mobile: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_fax">Fax</Label>
                  <Input
                    id="phone_fax"
                    type="tel"
                    value={formData.phone_fax}
                    onChange={(e) => setFormData({ ...formData, phone_fax: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="e.g., CA"
                  />
                </div>
                <div>
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="payment_terms">Payment Terms</Label>
                  <Input
                    id="payment_terms"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    placeholder="e.g., Net 30"
                  />
                </div>
                <div>
                  <Label htmlFor="credit_limit">Credit Limit ($)</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    step="0.01"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  {editingCustomer ? "Update" : "Create"} Customer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
            className={filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Active
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
            className={filter === "inactive" ? "bg-gray-500 text-white hover:bg-gray-600" : ""}
          >
            Inactive
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "all" });
              setSearchQuery("");
            }}
            className={filter === "all" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
          >
            All
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredCustomers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No customers match your search" : `No ${filter} customers found`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Company Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Credit Limit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.contact_name || "—"}</TableCell>
                      <TableCell>{customer.email || "—"}</TableCell>
                      <TableCell>{customer.phone || "—"}</TableCell>
                      <TableCell>
                        {customer.city && customer.state ? `${customer.city}, ${customer.state}` : "—"}
                      </TableCell>
                      <TableCell>{customer.payment_terms || "—"}</TableCell>
                      <TableCell>
                        {customer.credit_limit ? `$${customer.credit_limit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={customer.status === "active" ? "bg-green-600" : "bg-gray-500"}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(customer)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(customer.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
