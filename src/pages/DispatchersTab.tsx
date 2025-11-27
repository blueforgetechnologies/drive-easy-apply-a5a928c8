import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2 } from "lucide-react";

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
  notes: string | null;
  created_at: string;
}

export default function DispatchersTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const statusFilter = filter === "active" ? "active" : "inactive";
      
      const { data, error } = await supabase
        .from("dispatchers")
        .select("*")
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading dispatchers");
        return;
      }
      setDispatchers(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("dispatchers")
        .insert({
          ...formData,
          status: "active",
          hire_date: new Date().toISOString().split('T')[0],
        });

      if (error) throw error;
      toast.success("Dispatcher added successfully");
      setDialogOpen(false);
      setFormData({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add dispatcher: " + error.message);
    }
  };

  const handleDeleteDispatcher = async (id: string) => {
    try {
      const { error } = await supabase
        .from("dispatchers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Dispatcher deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete dispatcher: " + error.message);
    }
  };

  const filteredDispatchers = dispatchers.filter((dispatcher) => {
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${dispatcher.first_name} ${dispatcher.last_name}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      dispatcher.email.toLowerCase().includes(searchLower) ||
      (dispatcher.phone || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Dispatcher Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Dispatcher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Dispatcher</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDispatcher} className="space-y-4">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Add Dispatcher</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs and Search */}
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

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dispatchers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dispatchers</CardTitle>
          <CardDescription>Manage your dispatch team</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDispatchers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No dispatchers match your search" : "No dispatchers found"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Hire Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDispatchers.map((dispatcher) => (
                  <TableRow key={dispatcher.id}>
                    <TableCell className="font-medium">
                      {dispatcher.first_name} {dispatcher.last_name}
                    </TableCell>
                    <TableCell>{dispatcher.email}</TableCell>
                    <TableCell>{dispatcher.phone || "N/A"}</TableCell>
                    <TableCell>
                      {dispatcher.hire_date
                        ? format(new Date(dispatcher.hire_date), "MMM d, yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          dispatcher.status === "active"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-gray-500 hover:bg-gray-600"
                        }
                      >
                        {dispatcher.status.charAt(0).toUpperCase() + dispatcher.status.slice(1)}
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
                          onClick={() => handleDeleteDispatcher(dispatcher.id)}
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
