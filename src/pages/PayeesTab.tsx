import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Payee Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
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
            className={filter === "inactive" ? "bg-muted text-muted-foreground" : ""}
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
            placeholder="Search payees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayees.map((payee) => (
                  <TableRow key={payee.id}>
                    <TableCell className="font-medium">{payee.name}</TableCell>
                    <TableCell>{payee.type || "N/A"}</TableCell>
                    <TableCell>{payee.payment_method || "N/A"}</TableCell>
                    <TableCell>{payee.bank_name || "N/A"}</TableCell>
                    <TableCell>{payee.email || "N/A"}</TableCell>
                    <TableCell>{payee.phone || "N/A"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          payee.status === "active"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-gray-500 hover:bg-gray-600"
                        }
                      >
                        {payee.status.charAt(0).toUpperCase() + payee.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleDeletePayee(payee.id)}
                        >
                          <Trash2 className="h-4 w-4" />
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
