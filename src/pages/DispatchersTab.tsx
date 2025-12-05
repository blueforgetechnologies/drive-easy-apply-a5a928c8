import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2, FileText, User } from "lucide-react";

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
  pay_percentage: number | null;
  assigned_trucks: number | null;
  dob: string | null;
  license_number: string | null;
  license_expiration_date: string | null;
  application_status: string | null;
  contract_agreement: string | null;
  notes: string | null;
  created_at: string;
}

export default function DispatchersTab() {
  const navigate = useNavigate();
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
      let query = supabase
        .from("dispatchers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      
      const { data, error } = await query;

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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("dispatchers")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
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
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Dispatcher Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" />
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

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
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
            variant={filter === "pending" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 ${filter === "pending" ? "bg-orange-500 text-white hover:bg-orange-600" : ""}`}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
          >
            Pending
          </Button>
        </div>

        <div className="relative w-48 ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search dispatchers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-sm"
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
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-12">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Phone</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Pay %</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Trucks</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Address</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Email</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Age</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">License</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DOB</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Exp Date</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">App</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DD</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Contract</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Hired</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Term</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDispatchers.map((dispatcher) => {
                    const age = dispatcher.dob 
                      ? Math.floor((new Date().getTime() - new Date(dispatcher.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    
                    return (
                      <TableRow key={dispatcher.id} className="h-10 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}>
                        <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs ${
                              dispatcher.status === "active" 
                                ? "bg-green-600" 
                                : dispatcher.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}>
                              0
                            </div>
                            <Select
                              value={dispatcher.status}
                              onValueChange={(value) => handleStatusChange(dispatcher.id, value)}
                            >
                              <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                                dispatcher.status === "active"
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : dispatcher.status === "pending"
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
                        <TableCell className="py-1 px-2 font-medium">
                          {dispatcher.first_name} {dispatcher.last_name}
                        </TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.phone || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.pay_percentage || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.assigned_trucks || "0"}</TableCell>
                        <TableCell className="py-1 px-2 max-w-[150px] truncate">{dispatcher.address || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.email}</TableCell>
                        <TableCell className="py-1 px-2">{age || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.license_number || "-"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.dob ? format(new Date(dispatcher.dob), "MM/dd/yy") : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.license_expiration_date 
                            ? format(new Date(dispatcher.license_expiration_date), "MM/dd/yy") 
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.application_status || "-"}</TableCell>
                        <TableCell className="py-1 px-2">-</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.contract_agreement ? "Yes" : "-"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.hire_date
                            ? format(new Date(dispatcher.hire_date), "MM/dd/yy")
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.termination_date
                            ? format(new Date(dispatcher.termination_date), "MM/dd/yy")
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <div className="flex gap-1 justify-end">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                            >
                              <User className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
