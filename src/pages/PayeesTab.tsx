import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2 } from "lucide-react";

interface Payee {
  id: string;
  name: string;
  type: string | null;
  payment_method: string | null;
  bank_name: string | null;
  account_number: string | null;
  routing_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
}

export default function PayeesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "driver",
    payment_method: "direct_deposit",
    bank_name: "",
    account_number: "",
    routing_number: "",
    email: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("payees" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (filter !== "all") {
        const statusFilter = filter === "active" ? "active" : "inactive";
        query = query.eq("status", statusFilter);
      }
      
      const { data, error } = await query;

      if (error) {
        toast.error("Error loading payees");
        return;
      }
      setPayees((data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPayee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("payees" as any)
        .insert({
          ...formData,
          status: "active",
        });

      if (error) throw error;
      toast.success("Payee added successfully");
      setDialogOpen(false);
      setFormData({
        name: "",
        type: "driver",
        payment_method: "direct_deposit",
        bank_name: "",
        account_number: "",
        routing_number: "",
        email: "",
        phone: "",
        address: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add payee: " + error.message);
    }
  };

  const handleDeletePayee = async (id: string) => {
    try {
      const { error } = await supabase
        .from("payees" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Payee deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete payee: " + error.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("payees" as any)
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const filteredPayees = payees.filter((payee) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (payee.name || "").toLowerCase().includes(searchLower) ||
      (payee.type || "").toLowerCase().includes(searchLower) ||
      (payee.email || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Payee Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" />
              Add Payee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Payee</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPayee} className="space-y-4">
              <div>
                <Label htmlFor="name">Payee Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="e.g., Driver, Contractor, Vendor"
                />
              </div>
              <div>
                <Label htmlFor="payment_method">Payment Method</Label>
                <Input
                  id="payment_method"
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="bank_name">Bank Name</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="routing_number">Routing Number</Label>
                <Input
                  id="routing_number"
                  value={formData.routing_number}
                  onChange={(e) => setFormData({ ...formData, routing_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="account_number">Account Number</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
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
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">Add Payee</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <Button
            variant={filter === "active" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 ${filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
          >
            Active
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 ${filter === "inactive" ? "bg-muted text-muted-foreground" : ""}`}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
          >
            Inactive
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 ${filter === "all" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}`}
            onClick={() => {
              setSearchParams({ filter: "all" });
              setSearchQuery("");
            }}
          >
            All
          </Button>
        </div>

        <div className="relative w-48 ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search payees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-sm"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payees</CardTitle>
          <CardDescription>Manage payee information and payment details</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPayees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No payees match your search" : "No payees found"}
            </p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Type</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Payment Method</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Bank</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Email</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Phone</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Status</TableHead>
                  <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayees.map((payee) => (
                  <TableRow key={payee.id} className="h-10 cursor-pointer hover:bg-muted/50">
                    <TableCell className="py-1 px-2 font-medium">{payee.name}</TableCell>
                    <TableCell className="py-1 px-2">{payee.type || "N/A"}</TableCell>
                    <TableCell className="py-1 px-2">{payee.payment_method || "N/A"}</TableCell>
                    <TableCell className="py-1 px-2">{payee.bank_name || "N/A"}</TableCell>
                    <TableCell className="py-1 px-2">{payee.email || "N/A"}</TableCell>
                    <TableCell className="py-1 px-2">{payee.phone || "N/A"}</TableCell>
                    <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs ${
                          payee.status === "active" 
                            ? "bg-green-600" 
                            : payee.status === "pending"
                            ? "bg-orange-500"
                            : "bg-gray-500"
                        }`}>
                          0
                        </div>
                        <Select
                          value={payee.status}
                          onValueChange={(value) => handleStatusChange(payee.id, value)}
                        >
                          <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                            payee.status === "active"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : payee.status === "pending"
                              ? "bg-orange-100 text-orange-800 border-orange-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active" className="text-sm">Active</SelectItem>
                            <SelectItem value="pending" className="text-sm">Pending</SelectItem>
                            <SelectItem value="inactive" className="text-sm">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleDeletePayee(payee.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
