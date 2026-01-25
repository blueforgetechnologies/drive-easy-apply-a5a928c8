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
import { Search, Plus, Edit, Trash2, ChevronLeft, ChevronRight, UserPlus, Users, User, Mail, Phone, Building2, CreditCard, Check, Briefcase, Truck, Factory, Copy, MoreHorizontal, Download, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { exportToExcel } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";

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

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface Carrier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_name: string | null;
}

export default function PayeesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [payees, setPayees] = useState<Payee[]>([]);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [addMode, setAddMode] = useState<"new" | "existing">("new");
  const [selectedSourceType, setSelectedSourceType] = useState<"dispatcher" | "driver" | "user" | "carrier">("dispatcher");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedPayee, setSelectedPayee] = useState<Payee | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Payee>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
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

  const { tenantId, shouldFilter } = useTenantFilter();

  useEffect(() => {
    loadData();
  }, [filter, tenantId, shouldFilter]);

  useEffect(() => {
    if (dialogOpen) {
      loadExistingUsers();
    }
  }, [dialogOpen, tenantId, shouldFilter]);

  const loadExistingUsers = async () => {
    try {
      let dispatchersQuery = supabase.from("dispatchers").select("id, first_name, last_name, email, phone, address").eq("status", "active");
      let driversQuery = supabase.from("applications").select("id, personal_info, bank_name, routing_number, checking_number, driver_address, cell_phone");
      let carriersQuery = supabase.from("carriers").select("id, name, email, phone, address, contact_name").eq("status", "active");
      
      // Apply tenant filter to tenant-scoped tables
      if (shouldFilter && tenantId) {
        dispatchersQuery = dispatchersQuery.eq("tenant_id", tenantId);
        driversQuery = driversQuery.eq("tenant_id", tenantId);
        carriersQuery = carriersQuery.eq("tenant_id", tenantId);
      }
      
      const [dispatchersRes, driversRes, usersRes, carriersRes] = await Promise.all([
        dispatchersQuery,
        driversQuery,
        supabase.from("profiles").select("id, full_name, email, phone, address, city, state, zip"),
        carriersQuery
      ]);
      
      if (dispatchersRes.data) setDispatchers(dispatchersRes.data);
      if (driversRes.data) setDrivers(driversRes.data as Driver[]);
      if (usersRes.data) setUsers(usersRes.data as UserProfile[]);
      if (carriersRes.data) setCarriers(carriersRes.data as Carrier[]);
    } catch (error) {
      console.error("Error loading existing users:", error);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("ID copied to clipboard");
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("payees" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      // Apply tenant filter
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
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
    
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    
    try {
      const { error } = await supabase
        .from("payees" as any)
        .insert({
          ...formData,
          status: "active",
          tenant_id: tenantId,
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

    let payeeData: Partial<Payee> = { status: "active", payment_method: "direct_deposit", tenant_id: tenantId } as any;

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
    } else if (selectedSourceType === "driver") {
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
    } else if (selectedSourceType === "user") {
      const user = users.find(u => u.id === selectedSourceId);
      if (user) {
        payeeData = {
          ...payeeData,
          name: user.full_name || user.email || "",
          type: "user",
          email: user.email || "",
          phone: user.phone || "",
          address: [user.address, user.city, user.state, user.zip].filter(Boolean).join(", ") || "",
        };
      }
    } else if (selectedSourceType === "carrier") {
      const carrier = carriers.find(c => c.id === selectedSourceId);
      if (carrier) {
        payeeData = {
          ...payeeData,
          name: carrier.name,
          type: "carrier",
          email: carrier.email || "",
          phone: carrier.phone || "",
          address: carrier.address || "",
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
    setSourceSearchQuery("");
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

  // Filter functions for source lists
  const filteredDispatchers = dispatchers.filter(d => {
    const search = sourceSearchQuery.toLowerCase();
    return (
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(search) ||
      d.email.toLowerCase().includes(search)
    );
  });

  const filteredDrivers = drivers.filter(d => {
    if (!d.personal_info?.firstName) return false;
    const search = sourceSearchQuery.toLowerCase();
    return (
      `${d.personal_info.firstName || ""} ${d.personal_info.lastName || ""}`.toLowerCase().includes(search) ||
      (d.personal_info.email || "").toLowerCase().includes(search)
    );
  });

  const filteredUsers = users.filter(u => {
    const search = sourceSearchQuery.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search)
    );
  });

  const filteredCarriers = carriers.filter(c => {
    const search = sourceSearchQuery.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(search) ||
      (c.email || "").toLowerCase().includes(search) ||
      (c.contact_name || "").toLowerCase().includes(search)
    );
  });

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

  const handleMultiDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("payees" as any)
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} payee(s) deleted successfully`);
      setSelectedIds(new Set());
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete payees: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedPayees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedPayees.map(p => p.id)));
    }
  };

  const toggleSelectPayee = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleOpenPayeeDetail = (payee: Payee) => {
    setSelectedPayee(payee);
    setEditFormData({
      name: payee.name,
      type: payee.type || "",
      payment_method: payee.payment_method || "",
      bank_name: payee.bank_name || "",
      account_number: payee.account_number || "",
      routing_number: payee.routing_number || "",
      email: payee.email || "",
      phone: payee.phone || "",
      address: payee.address || "",
      status: payee.status,
    });
    setDetailDialogOpen(true);
  };

  const handleSavePayee = async () => {
    if (!selectedPayee) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("payees" as any)
        .update(editFormData)
        .eq("id", selectedPayee.id);

      if (error) throw error;
      toast.success("Payee updated successfully");
      setDetailDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error("Failed to update payee: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayeeFromDetail = async () => {
    if (!selectedPayee) return;
    try {
      const { error } = await supabase
        .from("payees" as any)
        .delete()
        .eq("id", selectedPayee.id);

      if (error) throw error;
      toast.success("Payee deleted successfully");
      setDetailDialogOpen(false);
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
                  <div className="grid grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("dispatcher");
                        setSelectedSourceId("");
                        setSourceSearchQuery("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "dispatcher"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "dispatcher" && (
                        <div className="absolute top-1.5 right-1.5">
                          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        selectedSourceType === "dispatcher" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Briefcase className={cn(
                          "h-5 w-5",
                          selectedSourceType === "dispatcher" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-xs">Dispatcher</p>
                        <p className="text-xs text-muted-foreground">{dispatchers.length}</p>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("driver");
                        setSelectedSourceId("");
                        setSourceSearchQuery("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "driver"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "driver" && (
                        <div className="absolute top-1.5 right-1.5">
                          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        selectedSourceType === "driver" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Truck className={cn(
                          "h-5 w-5",
                          selectedSourceType === "driver" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-xs">Driver</p>
                        <p className="text-xs text-muted-foreground">{drivers.filter(d => d.personal_info?.firstName).length}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("user");
                        setSelectedSourceId("");
                        setSourceSearchQuery("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "user"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "user" && (
                        <div className="absolute top-1.5 right-1.5">
                          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        selectedSourceType === "user" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <User className={cn(
                          "h-5 w-5",
                          selectedSourceType === "user" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-xs">User</p>
                        <p className="text-xs text-muted-foreground">{users.length}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceType("carrier");
                        setSelectedSourceId("");
                        setSourceSearchQuery("");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
                        selectedSourceType === "carrier"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {selectedSourceType === "carrier" && (
                        <div className="absolute top-1.5 right-1.5">
                          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        selectedSourceType === "carrier" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Factory className={cn(
                          "h-5 w-5",
                          selectedSourceType === "carrier" ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-xs">Carrier</p>
                        <p className="text-xs text-muted-foreground">{carriers.length}</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* User Selection */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                    Select {selectedSourceType === "dispatcher" ? "Dispatcher" : selectedSourceType === "driver" ? "Driver" : selectedSourceType === "carrier" ? "Carrier" : "User"}
                  </Label>
                  {/* Search Field */}
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={`Search ${selectedSourceType}s...`}
                      value={sourceSearchQuery}
                      onChange={(e) => setSourceSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border bg-card">
                    {selectedSourceType === "dispatcher" ? (
                      filteredDispatchers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          {sourceSearchQuery ? "No matching dispatchers" : "No dispatchers found"}
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {filteredDispatchers.map((d, idx) => (
                            <label
                              key={d.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === d.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== filteredDispatchers.length - 1 && "border-b"
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
                    ) : selectedSourceType === "driver" ? (
                      filteredDrivers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          {sourceSearchQuery ? "No matching drivers" : "No drivers found"}
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {filteredDrivers.map((d, idx) => (
                            <label
                              key={d.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === d.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== filteredDrivers.length - 1 && "border-b"
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
                    ) : selectedSourceType === "user" ? (
                      filteredUsers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          {sourceSearchQuery ? "No matching users" : "No users found"}
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {filteredUsers.map((u, idx) => (
                            <label
                              key={u.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === u.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== filteredUsers.length - 1 && "border-b"
                              )}
                            >
                              <RadioGroupItem value={u.id} className="shrink-0" />
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-violet-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{u.full_name || "Unnamed User"}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
                              </div>
                              {selectedSourceId === u.id && (
                                <Badge variant="secondary" className="shrink-0 text-xs">Selected</Badge>
                              )}
                            </label>
                          ))}
                        </RadioGroup>
                      )
                    ) : (
                      filteredCarriers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          {sourceSearchQuery ? "No matching carriers" : "No carriers found"}
                        </div>
                      ) : (
                        <RadioGroup value={selectedSourceId} onValueChange={setSelectedSourceId}>
                          {filteredCarriers.map((c, idx) => (
                            <label
                              key={c.id}
                              className={cn(
                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                selectedSourceId === c.id ? "bg-primary/5" : "hover:bg-muted/50",
                                idx !== filteredCarriers.length - 1 && "border-b"
                              )}
                            >
                              <RadioGroupItem value={c.id} className="shrink-0" />
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center shrink-0">
                                <Factory className="h-4 w-4 text-orange-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{c.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{c.contact_name || c.email || "No contact"}</p>
                              </div>
                              {selectedSourceId === c.id && (
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
                    })() : selectedSourceType === "driver" ? (() => {
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
                    })() : selectedSourceType === "user" ? (() => {
                      const u = users.find(x => x.id === selectedSourceId);
                      return u ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{u.full_name || "Unnamed User"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{u.email || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{u.phone || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="text-xs">User</Badge>
                          </div>
                        </div>
                      ) : null;
                    })() : (() => {
                      const c = carriers.find(x => x.id === selectedSourceId);
                      return c ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Factory className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{c.email || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{c.phone || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Factory className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="text-xs">Carrier</Badge>
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
                  Add {selectedSourceType === "dispatcher" ? "Dispatcher" : selectedSourceType === "driver" ? "Driver" : selectedSourceType === "carrier" ? "Carrier" : "User"} as Payee
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Row */}
      {(() => {
        const statusCounts = {
          all: payees.length,
          active: payees.filter(p => p.status === "active").length,
          inactive: payees.filter(p => p.status === "inactive").length,
          pending: payees.filter(p => p.status === "pending").length,
        };

        return (
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
            <div className="flex items-center gap-0">
              {[
                { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
                { key: "active", label: "Active", count: statusCounts.active, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
                { key: "inactive", label: "Inactive", count: statusCounts.inactive, activeClass: "btn-glossy", badgeClass: "badge-inset", softBadgeClass: "badge-inset" },
                { key: "pending", label: "Pending", count: statusCounts.pending, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
              ].map((status) => (
                <Button
                  key={status.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchParams({ filter: status.key });
                    setSearchQuery("");
                  }}
                  className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                    filter === status.key 
                      ? `${status.activeClass} text-white` 
                      : 'btn-glossy text-gray-700'
                  }`}
                >
                  {status.label}
                  <span className={`${filter === status.key ? status.badgeClass : status.softBadgeClass} text-[10px] h-5`}>{status.count}</span>
                </Button>
              ))}
            </div>
          </div>
        );
      })()}

      <Card className="flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payees</CardTitle>
              <CardDescription>Manage payee information and payment details</CardDescription>
            </div>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleMultiDelete}
                disabled={isDeleting}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col p-0 flex-1 overflow-hidden">
          {filteredPayees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No payees match your search" : "No payees found"}
            </p>
          ) : (
            <>
            <div className="flex-1 overflow-auto overflow-x-auto px-4 pt-4">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    <TableHead className="py-2 px-2 w-[40px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={paginatedPayees.length > 0 && selectedIds.size === paginatedPayees.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[120px]">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">
                      <div>Name</div>
                      <div className="text-xs font-normal text-muted-foreground">Type</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">
                      <div>Email</div>
                      <div className="text-xs font-normal text-muted-foreground">Phone</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide hidden lg:table-cell">
                      <div>Payment Method</div>
                      <div className="text-xs font-normal text-muted-foreground">Bank</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide hidden xl:table-cell">Address</TableHead>
                    <TableHead className="py-2 px-2 w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPayees.map((payee) => (
                    <TableRow 
                      key={payee.id} 
                      className={cn(
                        "h-10 cursor-pointer hover:bg-muted/30 transition-colors",
                        selectedIds.has(payee.id) && "bg-primary/5"
                      )}
                      onClick={() => handleOpenPayeeDetail(payee)}
                    >
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(payee.id)}
                          onCheckedChange={() => toggleSelectPayee(payee.id)}
                        />
                      </TableCell>
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <div className={cn(
                            "w-6 h-6 rounded flex items-center justify-center font-bold text-xs text-white",
                            payee.status === "active" && "bg-green-600",
                            payee.status === "pending" && "bg-orange-500",
                            payee.status === "inactive" && "bg-gray-500"
                          )}>
                            0
                          </div>
                          <Select
                            value={payee.status}
                            onValueChange={(value) => handleStatusChange(payee.id, value)}
                          >
                            <SelectTrigger className={cn(
                              "w-[80px] h-6 text-sm px-1",
                              payee.status === "active" && "bg-green-100 text-green-800 border-green-200",
                              payee.status === "pending" && "bg-orange-100 text-orange-800 border-orange-200",
                              payee.status === "inactive" && "bg-gray-100 text-gray-800 border-gray-200"
                            )}>
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
                        <div className="font-medium">{payee.name}</div>
                        <div className="text-xs text-muted-foreground">{payee.type || "N/A"}</div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div>{payee.email || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{payee.phone || "N/A"}</div>
                      </TableCell>
                      <TableCell className="py-1 px-2 hidden lg:table-cell">
                        <div>{payee.payment_method || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{payee.bank_name || "N/A"}</div>
                      </TableCell>
                      <TableCell className="py-1 px-2 hidden xl:table-cell text-muted-foreground text-xs">{payee.address || "N/A"}</TableCell>
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleCopyId(payee.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy ID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPayeeDetail(payee)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeletePayee(payee.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0">
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

      {/* Payee Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="block">{selectedPayee?.name || "Payee Details"}</span>
                <Badge variant="outline" className={cn(
                  "text-xs mt-1",
                  editFormData.status === "active" && "bg-green-100 text-green-800 border-green-200",
                  editFormData.status === "pending" && "bg-orange-100 text-orange-800 border-orange-200",
                  editFormData.status === "inactive" && "bg-gray-100 text-gray-800 border-gray-200"
                )}>
                  {editFormData.status}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <User className="h-4 w-4" />
                Basic Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-type">Type</Label>
                  <Input
                    id="edit-type"
                    value={editFormData.type || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                    placeholder="e.g., Driver, Dispatcher"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editFormData.email || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editFormData.phone || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    value={editFormData.address || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={editFormData.status || "active"} 
                    onValueChange={(v) => setEditFormData({ ...editFormData, status: v })}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Payment Info Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <CreditCard className="h-4 w-4" />
                Payment Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-payment-method">Payment Method</Label>
                  <Select 
                    value={editFormData.payment_method || "direct_deposit"} 
                    onValueChange={(v) => setEditFormData({ ...editFormData, payment_method: v })}
                  >
                    <SelectTrigger id="edit-payment-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_deposit">Direct Deposit</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="wire">Wire Transfer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-bank">Bank Name</Label>
                  <Input
                    id="edit-bank"
                    value={editFormData.bank_name || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-routing">Routing Number</Label>
                  <Input
                    id="edit-routing"
                    value={editFormData.routing_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, routing_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-account">Account Number</Label>
                  <Input
                    id="edit-account"
                    value={editFormData.account_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, account_number: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleDeletePayeeFromDetail}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setDetailDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSavePayee}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
