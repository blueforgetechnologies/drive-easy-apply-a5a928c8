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
import { Search, Plus, Edit, Trash2, ChevronLeft, ChevronRight, UserPlus, Users, User, Mail, Phone, Building2, CreditCard, Check, Briefcase, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
}

interface Driver {
  id: string;
  personal_info: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  bank_name: string | null;
  routing_number: string | null;
  checking_number: string | null;
  driver_address: string | null;
  cell_phone: string | null;
}

export default function PayeesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [payees, setPayees] = useState<Payee[]>([]);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [addMode, setAddMode] = useState<"new" | "existing">("new");
  const [selectedSourceType, setSelectedSourceType] = useState<"dispatcher" | "driver">("dispatcher");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const ROWS_PER_PAGE = 50;
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

  useEffect(() => {
    // Load dispatchers and drivers when dialog opens
    if (dialogOpen) {
      loadExistingUsers();
    }
  }, [dialogOpen]);

  const loadExistingUsers = async () => {
    try {
      const [dispatchersRes, driversRes] = await Promise.all([
        supabase.from("dispatchers").select("id, first_name, last_name, email, phone, address").eq("status", "active"),
        supabase.from("applications").select("id, personal_info, bank_name, routing_number, checking_number, driver_address, cell_phone")
      ]);
      
      if (dispatchersRes.data) setDispatchers(dispatchersRes.data);
      if (driversRes.data) setDrivers(driversRes.data as Driver[]);
    } catch (error) {
      console.error("Error loading existing users:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("payees" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
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
      resetDialogState();
      loadData();
    } catch (error: any) {
      toast.error("Failed to add payee: " + error.message);
    }
  };

  const handleAddFromExisting = async () => {
    if (!selectedSourceId) {
      toast.error("Please select a user");
      return;
    }

    let payeeData: Partial<Payee> = { status: "active", payment_method: "direct_deposit" };

    if (selectedSourceType === "dispatcher") {
      const dispatcher = dispatchers.find(d => d.id === selectedSourceId);
      if (dispatcher) {
        payeeData = {
          ...payeeData,
          name: `${dispatcher.first_name} ${dispatcher.last_name}`.trim(),
          type: "dispatcher",
          email: dispatcher.email,
          phone: dispatcher.phone || "",
          address: dispatcher.address || "",
        };
      }
    } else {
      const driver = drivers.find(d => d.id === selectedSourceId);
      if (driver) {
        const pi = driver.personal_info || {};
        payeeData = {
          ...payeeData,
          name: `${pi.firstName || ""} ${pi.lastName || ""}`.trim(),
          type: "driver",
          email: pi.email || "",
          phone: driver.cell_phone || pi.phone || "",
          address: driver.driver_address || [pi.address, pi.city, pi.state, pi.zip].filter(Boolean).join(", ") || "",
          bank_name: driver.bank_name || "",
          routing_number: driver.routing_number || "",
          account_number: driver.checking_number || "",
        };
      }
    }

    try {
      const { error } = await supabase
        .from("payees" as any)
        .insert(payeeData);

      if (error) throw error;
      toast.success("Payee added successfully");
      resetDialogState();
      loadData();
    } catch (error: any) {
      toast.error("Failed to add payee: " + error.message);
    }
  };

  const resetDialogState = () => {
    setDialogOpen(false);
    setAddMode("new");
    setSelectedSourceType("dispatcher");
    setSelectedSourceId("");
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

  // Pagination
  const totalPages = Math.ceil(filteredPayees.length / ROWS_PER_PAGE);
  const paginatedPayees = filteredPayees.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Payee</DialogTitle>
            </DialogHeader>
            
            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "new" | "existing")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="new" className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  New Payee
                </TabsTrigger>
                <TabsTrigger value="existing" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  From Existing
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="new" className="mt-0">
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
              </TabsContent>
              
              <TabsContent value="existing" className="mt-0 space-y-5">
                {/* Type Selection Cards */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 block">
                    Select Source Type
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("dispatcher");
                        setSelectedSourceId("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "dispatcher"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "dispatcher" && (
                        <div className="absolute top-2 right-2">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center",
                        selectedSourceType === "dispatcher" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Briefcase className={cn(
                          "h-6 w-6",
                          selectedSourceType === "dispatcher" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Dispatcher</p>
                        <p className="text-xs text-muted-foreground">{dispatchers.length} available</p>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("driver");
                        setSelectedSourceId("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "driver"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "driver" && (
                        <div className="absolute top-2 right-2">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center",
                        selectedSourceType === "driver" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Truck className={cn(
                          "h-6 w-6",
                          selectedSourceType === "driver" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Driver</p>
                        <p className="text-xs text-muted-foreground">{drivers.filter(d => d.personal_info?.firstName).length} available</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* User Selection */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 block">
                    Select {selectedSourceType === "dispatcher" ? "Dispatcher" : "Driver"}
                  </Label>
                  <div className="max-h-[200px] overflow-y-auto rounded-xl border bg-card">
                    {selectedSourceType === "dispatcher" ? (
                      dispatchers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No dispatchers found
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {dispatchers.map((d, idx) => (
                            <label
                              key={d.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === d.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== dispatchers.length - 1 && "border-b"
                              )}
                            >
                              <RadioGroupItem value={d.id} className="shrink-0" />
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{d.first_name} {d.last_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                              </div>
                              {selectedSourceId === d.id && (
                                <Badge variant="secondary" className="shrink-0 text-xs">Selected</Badge>
                              )}
                            </label>
                          ))}
                        </RadioGroup>
                      )
                    ) : (
                      drivers.filter(d => d.personal_info?.firstName).length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No drivers found
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {drivers.filter(d => d.personal_info?.firstName).map((d, idx, arr) => (
                            <label
                              key={d.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === d.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== arr.length - 1 && "border-b"
                              )}
                            >
                              <RadioGroupItem value={d.id} className="shrink-0" />
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center shrink-0">
                                <Truck className="h-4 w-4 text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{d.personal_info?.firstName} {d.personal_info?.lastName}</p>
                                <p className="text-xs text-muted-foreground truncate">{d.personal_info?.email || d.cell_phone || "No contact"}</p>
                              </div>
                              {selectedSourceId === d.id && (
                                <Badge variant="secondary" className="shrink-0 text-xs">Selected</Badge>
                              )}
                            </label>
                          ))}
                        </RadioGroup>
                      )
                    )}
                  </div>
                </div>
                
                {/* Preview Card */}
                {selectedSourceId && (
                  <div className="rounded-xl border bg-gradient-to-br from-muted/50 to-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="font-semibold text-sm">Ready to Add</p>
                    </div>
                    {selectedSourceType === "dispatcher" ? (() => {
                      const d = dispatchers.find(x => x.id === selectedSourceId);
                      return d ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.first_name} {d.last_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.phone || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="text-xs">Dispatcher</Badge>
                          </div>
                        </div>
                      ) : null;
                    })() : (() => {
                      const d = drivers.find(x => x.id === selectedSourceId);
                      return d ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.personal_info?.firstName} {d.personal_info?.lastName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.personal_info?.email || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.cell_phone || d.personal_info?.phone || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.bank_name || "No bank info"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm col-span-full">
                            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="text-xs">Driver</Badge>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
                
                <Button 
                  type="button" 
                  onClick={handleAddFromExisting} 
                  className="w-full h-11 text-sm font-medium gap-2"
                  disabled={!selectedSourceId}
                >
                  <Plus className="h-4 w-4" />
                  Add {selectedSourceType === "dispatcher" ? "Dispatcher" : "Driver"} as Payee
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search payees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-sm"
          />
        </div>
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
                {paginatedPayees.map((payee) => (
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
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {filteredPayees.length === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredPayees.length)} of {filteredPayees.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
