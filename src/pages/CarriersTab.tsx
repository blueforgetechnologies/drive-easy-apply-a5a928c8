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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2, FileText, RefreshCw, CheckSquare, Square, ChevronLeft, ChevronRight, LayoutDashboard, Copy, MoreHorizontal, Download, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { exportToExcel } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";

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
  safer_status: string | null;
  safety_rating: string | null;
  created_at: string;
  show_in_fleet_financials: boolean;
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
  const [usdotLookup, setUsdotLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([]);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const ROWS_PER_PAGE = 50;

  const { tenantId, shouldFilter } = useTenantFilter();

  useEffect(() => {
    loadData();
  }, [filter, tenantId, shouldFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("carriers" as any)
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
        toast.error("Error loading carriers");
        return;
      }
      setCarriers((data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("ID copied to clipboard");
  };

  const handleAddCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .insert({
          ...formData,
          status: "active",
          tenant_id: tenantId,
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
        .from("carriers" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Carrier deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete carrier: " + error.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCarriers.length === 0) return;
    
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .delete()
        .in("id", selectedCarriers);

      if (error) throw error;
      toast.success(`${selectedCarriers.length} carrier(s) deleted successfully`);
      setSelectedCarriers([]);
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete carriers: " + error.message);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedCarriers.length === 0) return;
    
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .update({ status: newStatus })
        .in("id", selectedCarriers);

      if (error) throw error;
      toast.success(`${selectedCarriers.length} carrier(s) updated to ${newStatus}`);
      setSelectedCarriers([]);
      loadData();
    } catch (error: any) {
      toast.error("Failed to update carriers: " + error.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const handleFleetFinancialsToggle = async (id: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .update({ show_in_fleet_financials: !currentValue })
        .eq("id", id);

      if (error) throw error;
      toast.success(currentValue ? "Hidden from Fleet$" : "Visible in Fleet$");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update: " + error.message);
    }
  };

  // Import carriers from Excel/CSV
  const handleImportCarriers = async (data: any[]): Promise<{ success: number; errors: string[] }> => {
    if (!tenantId) {
      return { success: 0, errors: ["No tenant selected"] };
    }

    let success = 0;
    const errors: string[] = [];

    const normalizeName = (name: any) => String(name || "").trim().toLowerCase();
    const normalizeValue = (val: any) => String(val || "").trim();

    // Load existing carriers for upsert matching
    const { data: existingCarriers, error: existingError } = await supabase
      .from("carriers")
      .select("id, name, mc_number, dot_number")
      .eq("tenant_id", tenantId);

    if (existingError) {
      errors.push(`Failed to load existing carriers: ${existingError.message}`);
    }

    const existingByName = new Map<string, string>();
    const existingByMC = new Map<string, string>();
    const existingByDOT = new Map<string, string>();
    
    (existingCarriers || []).forEach((c: any) => {
      const name = normalizeName(c.name);
      const mc = normalizeValue(c.mc_number);
      const dot = normalizeValue(c.dot_number);
      if (name) existingByName.set(name, c.id);
      if (mc) existingByMC.set(mc, c.id);
      if (dot) existingByDOT.set(dot, c.id);
    });

    for (const item of data) {
      try {
        const name = normalizeValue(item.name);
        if (!name) {
          errors.push(`Missing Name for row`);
          continue;
        }

        const rowData: any = {
          name: name,
          status: normalizeValue(item.status) || "active",
          mc_number: normalizeValue(item.mc_number) || null,
          dot_number: normalizeValue(item.dot_number) || null,
          contact_name: normalizeValue(item.contact_name) || null,
          email: normalizeValue(item.email) || null,
          phone: normalizeValue(item.phone) || null,
          address: normalizeValue(item.address) || null,
          safer_status: normalizeValue(item.safer_status) || null,
          safety_rating: normalizeValue(item.safety_rating) || null,
          dispatch_name: normalizeValue(item.dispatch_name) || null,
          dispatch_phone: normalizeValue(item.dispatch_phone) || null,
          dispatch_email: normalizeValue(item.dispatch_email) || null,
          after_hours_phone: normalizeValue(item.after_hours_phone) || null,
          emergency_contact_name: normalizeValue(item.emergency_contact_name) || null,
          emergency_contact_cell_phone: normalizeValue(item.emergency_contact_cell_phone) || null,
          show_in_fleet_financials: item.show_in_fleet_financials === true || item.show_in_fleet_financials === "Yes",
          tenant_id: tenantId,
        };

        // Find existing carrier by MC#, DOT#, or name
        const mc = normalizeValue(item.mc_number);
        const dot = normalizeValue(item.dot_number);
        const existingId = (mc && existingByMC.get(mc)) || 
                          (dot && existingByDOT.get(dot)) || 
                          existingByName.get(normalizeName(name));

        if (existingId) {
          // Update existing carrier
          delete rowData.tenant_id; // Don't update tenant_id
          const { error } = await supabase.from("carriers").update(rowData).eq("id", existingId);
          if (error) {
            errors.push(`${name}: ${error.message}`);
          } else {
            success++;
          }
        } else {
          // Insert new carrier
          const { error } = await supabase.from("carriers").insert(rowData);
          if (error) {
            errors.push(`${name}: ${error.message}`);
          } else {
            success++;
          }
        }
      } catch (err: any) {
        errors.push(`Row error: ${err.message}`);
      }
    }

    if (success > 0) {
      loadData();
    }

    return { success, errors };
  };

  const toggleSelectAll = () => {
    if (selectedCarriers.length === filteredCarriers.length) {
      setSelectedCarriers([]);
    } else {
      setSelectedCarriers(filteredCarriers.map(c => c.id));
    }
  };

  const toggleSelectCarrier = (id: string) => {
    setSelectedCarriers(prev => 
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const handleSyncAllCarriers = async () => {
    setSyncLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-carriers-fmcsa', {
        method: 'POST',
      });

      if (error) {
        throw error;
      }

      toast.success(`Synced ${data.successCount} carriers successfully`);
      loadData(); // Reload data to show updated status
    } catch (error: any) {
      toast.error('Failed to sync carriers: ' + error.message);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUsdotLookup = async () => {
    if (!usdotLookup.trim()) {
      toast.error("Please enter a USDOT number");
      return;
    }

    setLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ usdot: usdotLookup }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Carrier not found");
      }

      const data = await response.json();
      
      setFormData({
        name: data.dba_name || data.name || "",
        mc_number: data.mc_number || "",
        dot_number: data.usdot || usdotLookup,
        contact_name: "",
        email: "",
        phone: data.phone || "",
        address: data.physical_address || "",
      });
      
      toast.success("Carrier information loaded successfully");
    } catch (error: any) {
      toast.error("Failed to fetch carrier data: " + error.message);
    } finally {
      setLookupLoading(false);
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

  // Pagination
  const totalPages = Math.ceil(filteredCarriers.length / ROWS_PER_PAGE);
  const paginatedCarriers = filteredCarriers.slice(
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
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">Carrier Management</h2>
          {selectedCarriers.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCarriers.length} selected
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5">
          {showCheckboxes && selectedCarriers.length > 0 && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8"
                onClick={() => handleBulkStatusChange("active")}
              >
                Set Active
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8"
                onClick={() => handleBulkStatusChange("inactive")}
              >
                Set Inactive
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </>
          )}
          {!showCheckboxes && (
            <Button 
              variant="outline" 
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setShowCheckboxes(true)}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Select
            </Button>
          )}
          {showCheckboxes && (
            <Button 
              variant="outline" 
              size="sm"
              className="h-8"
              onClick={() => {
                setShowCheckboxes(false);
                setSelectedCarriers([]);
              }}
            >
              Cancel
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => {
              exportToExcel(filteredCarriers, 'carriers');
              toast.success(`Exported ${filteredCarriers.length} carriers`);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleSyncAllCarriers}
            disabled={syncLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
            {syncLoading ? 'Syncing...' : 'Sync FMCSA'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" />
                Add Carrier
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Carrier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCarrier} className="space-y-4">
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label htmlFor="usdot_lookup">USDOT Lookup</Label>
                <div className="flex gap-2">
                  <Input
                    id="usdot_lookup"
                    placeholder="Enter USDOT number"
                    value={usdotLookup}
                    onChange={(e) => setUsdotLookup(e.target.value)}
                  />
                  <Button 
                    type="button" 
                    onClick={handleUsdotLookup}
                    disabled={lookupLoading}
                  >
                    {lookupLoading ? "Loading..." : "Lookup"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a USDOT number to auto-fill carrier information from SaferWeb
                </p>
              </div>
              
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
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search carriers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-sm"
          />
        </div>
        <div className="flex items-center gap-0">
          {[
            { key: "all", label: "All", activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
            { key: "active", label: "Active", activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "inactive", label: "Inactive", activeClass: "btn-glossy", badgeClass: "badge-inset", softBadgeClass: "badge-inset" },
            { key: "pending", label: "Pending", activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
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
            </Button>
          ))}
        </div>
      </div>

      <Card className="flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <CardHeader className="flex-shrink-0">
          <CardTitle>Carriers</CardTitle>
          <CardDescription>Manage carrier companies</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col p-0 flex-1 overflow-hidden">
          {filteredCarriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No carriers match your search" : "No carriers found"}
            </p>
          ) : (
            <>
            <div className="flex-1 overflow-auto overflow-x-auto px-4 pt-4">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    {showCheckboxes && (
                      <TableHead className="py-2 px-2 w-[40px]">
                        <Checkbox
                          checked={selectedCarriers.length === filteredCarriers.length && filteredCarriers.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[80px]">ID</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[70px]">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">
                      <div>Carrier Name</div>
                      <div className="text-xs font-normal text-muted-foreground">USDOT #</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">
                      <div>Contact</div>
                      <div className="text-xs font-normal text-muted-foreground">Phone</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide hidden lg:table-cell">
                      <div>Address</div>
                      <div className="text-xs font-normal text-muted-foreground">Email</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide hidden xl:table-cell">
                      <div>Authority</div>
                      <div className="text-xs font-normal text-muted-foreground">Safety Rating</div>
                    </TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[70px] text-center">Fleet$</TableHead>
                    <TableHead className="py-2 px-2 w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCarriers.map((carrier) => (
                    <TableRow 
                      key={carrier.id} 
                      className="h-10 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                    >
                      {showCheckboxes && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedCarriers.includes(carrier.id)}
                            onCheckedChange={() => toggleSelectCarrier(carrier.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="py-1 px-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-muted-foreground">{carrier.id.slice(0, 8)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => { e.stopPropagation(); handleCopyId(carrier.id); }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell 
                        className="py-1 px-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs ${
                            carrier.status === "active" 
                              ? "bg-green-600" 
                              : carrier.status === "pending"
                              ? "bg-orange-500"
                              : "bg-gray-500"
                          }`}>
                            0
                          </div>
                          <Select
                            value={carrier.status}
                            onValueChange={(value) => handleStatusChange(carrier.id, value)}
                          >
                            <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                              carrier.status === "active"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : carrier.status === "pending"
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
                      <TableCell 
                        className="py-1 px-2 cursor-pointer"
                        onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                      >
                        <div className="font-medium text-blue-600 hover:underline">{carrier.name}</div>
                        <div className="text-xs text-muted-foreground">{carrier.dot_number || ""}</div>
                      </TableCell>
                      <TableCell 
                        className="py-1 px-2 cursor-pointer"
                        onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                      >
                        <div>{carrier.contact_name || ""}</div>
                        <div className="text-xs text-muted-foreground">{carrier.phone || ""}</div>
                      </TableCell>
                      <TableCell 
                        className="py-1 px-2 cursor-pointer hidden lg:table-cell"
                        onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                      >
                        <div className="truncate max-w-[200px]">{carrier.address || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{carrier.email || "—"}</div>
                      </TableCell>
                      <TableCell 
                        className="py-1 px-2 cursor-pointer hidden xl:table-cell"
                        onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                      >
                        <div className="text-sm">
                          {carrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') ? (
                            <span className="text-destructive font-medium">{carrier.safer_status}</span>
                          ) : (
                            <span className="text-green-700 font-medium">{carrier.safer_status || "AUTHORIZED FOR Property"}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {carrier.safety_rating?.toUpperCase() === 'CONDITIONAL' ? (
                            <span className="text-destructive">{carrier.safety_rating}</span>
                          ) : (
                            <span>{carrier.safety_rating || "None"}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        <Switch
                          checked={carrier.show_in_fleet_financials}
                          onCheckedChange={() => handleFleetFinancialsToggle(carrier.id, carrier.show_in_fleet_financials)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleCopyId(carrier.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy ID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/dashboard/carrier-dashboard?carrier=${carrier.id}`)}>
                              <LayoutDashboard className="h-4 w-4 mr-2" />
                              Dashboard
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteCarrier(carrier.id)}
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
            {/* Always visible pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                Showing {filteredCarriers.length === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredCarriers.length)} of {filteredCarriers.length}
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
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Import Dialog */}
      <ExcelImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entityType="carriers"
        entityLabel="Carriers"
        onImport={handleImportCarriers}
      />
    </div>
  );
}
