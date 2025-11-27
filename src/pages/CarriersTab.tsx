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

interface Carrier {
  id: string;
  name: string;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
}

export default function CarriersTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    mc_number: "",
    dot_number: "",
    contact_name: "",
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
      const statusFilter = filter === "active" ? "active" : "inactive";
      
      const { data, error } = await supabase
        .from("carriers")
        .select("*")
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading carriers");
        return;
      }
      setCarriers(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("carriers")
        .insert({
          ...formData,
          status: "active",
        });

      if (error) throw error;
      toast.success("Carrier added successfully");
      setDialogOpen(false);
      setFormData({
        name: "",
        mc_number: "",
        dot_number: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add carrier: " + error.message);
    }
  };

  const handleDeleteCarrier = async (id: string) => {
    try {
      const { error } = await supabase
        .from("carriers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Carrier deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete carrier: " + error.message);
    }
  };

  const filteredCarriers = carriers.filter((carrier) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (carrier.name || "").toLowerCase().includes(searchLower) ||
      (carrier.mc_number || "").toLowerCase().includes(searchLower) ||
      (carrier.dot_number || "").toLowerCase().includes(searchLower) ||
      (carrier.contact_name || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Carrier Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Carrier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Carrier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCarrier} className="space-y-4">
              <div>
                <Label htmlFor="name">Carrier Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mc_number">MC Number</Label>
                <Input
                  id="mc_number"
                  value={formData.mc_number}
                  onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dot_number">DOT Number</Label>
                <Input
                  id="dot_number"
                  value={formData.dot_number}
                  onChange={(e) => setFormData({ ...formData, dot_number: e.target.value })}
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
              <Button type="submit" className="w-full">Add Carrier</Button>
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
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search carriers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carriers</CardTitle>
          <CardDescription>Manage carrier companies</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCarriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No carriers match your search" : "No carriers found"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier Name</TableHead>
                  <TableHead>MC Number</TableHead>
                  <TableHead>DOT Number</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCarriers.map((carrier) => (
                  <TableRow key={carrier.id}>
                    <TableCell className="font-medium">{carrier.name}</TableCell>
                    <TableCell>{carrier.mc_number || "N/A"}</TableCell>
                    <TableCell>{carrier.dot_number || "N/A"}</TableCell>
                    <TableCell>{carrier.contact_name || "N/A"}</TableCell>
                    <TableCell>{carrier.phone || "N/A"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          carrier.status === "active"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-gray-500 hover:bg-gray-600"
                        }
                      >
                        {carrier.status.charAt(0).toUpperCase() + carrier.status.slice(1)}
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
                          onClick={() => handleDeleteCarrier(carrier.id)}
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
