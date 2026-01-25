import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
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
import { Search, Plus, Edit, Trash2, RefreshCw, ChevronLeft, ChevronRight, Download, Upload, ShieldCheck } from "lucide-react";
import { exportToExcel } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { useTenantFilter } from "@/hooks/useTenantFilter";
interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  payee_id: string | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  primary_dispatcher_id: string | null;
  asset_type: string | null;
  asset_subtype: string | null;
  dimensions_length: number | null;
  vehicle_size: number | null;
  dimensions_width: number | null;
  dimensions_height: number | null;
  payload: number | null;
  lift_gate: boolean;
  oil_change_remaining: number | null;
  registration_exp_date: string | null;
  insurance_expiry: string | null;
  status: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  created_at: string;
  requires_load_approval: boolean | null;
}

export default function VehiclesTab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId, shouldFilter } = useTenantFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showServiceDue, setShowServiceDue] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;
  const [driversMap, setDriversMap] = useState<Record<string, string>>({});
  const [dispatchersMap, setDispatchersMap] = useState<Record<string, string>>({});
  const [carriersMap, setCarriersMap] = useState<Record<string, string>>({});
  const [payeesMap, setPayeesMap] = useState<Record<string, string>>({});
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [availableDispatchers, setAvailableDispatchers] = useState<any[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogType, setAssignDialogType] = useState<"driver1" | "driver2" | "dispatcher">("driver1");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_number: "",
    carrier: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    license_plate: "",
  });

  // Reload data when filter/sortOrder/tenant changes
  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadData();
      loadAvailableDriversAndDispatchers();
    }
  }, [filter, sortOrder, tenantId, shouldFilter]);

  // Reload data when navigating back to this tab (e.g., after editing a vehicle)
  useEffect(() => {
    loadData();
  }, [location.key]);

  // Reload data when window regains focus (catches external changes)
  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [filter, sortOrder]);

  const loadAvailableDriversAndDispatchers = async () => {
    if (shouldFilter && !tenantId) {
      return; // Wait for tenant to load
    }
    
    try {
      // Load drivers - must filter by tenant
      let driversQuery = supabase
        .from("applications")
        .select("id, personal_info, driver_status")
        .in("driver_status", ["Active", "active", "ACTIVE"]);
      
      if (shouldFilter && tenantId) {
        driversQuery = driversQuery.eq("tenant_id", tenantId);
      }

      const { data: driversData, error: driversError } = await driversQuery;

      if (!driversError && driversData) {
        setAvailableDrivers(driversData);
      }

      // Load dispatchers - must filter by tenant
      let dispatchersQuery = supabase
        .from("dispatchers")
        .select("id, first_name, last_name, status")
        .in("status", ["Active", "active", "ACTIVE"]);
      
      if (shouldFilter && tenantId) {
        dispatchersQuery = dispatchersQuery.eq("tenant_id", tenantId);
      }

      const { data: dispatchersData, error: dispatchersError } = await dispatchersQuery;

      if (!dispatchersError && dispatchersData) {
        setAvailableDispatchers(dispatchersData);
      }
    } catch (error) {
      console.error("Error loading drivers/dispatchers:", error);
    }
  };

  const loadData = async () => {
    if (shouldFilter && !tenantId) {
      // Tenant context not ready yet - don't leave in loading state
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      let query = supabase.from("vehicles").select("*");
      
      // Apply tenant filter unless showAllTenants is enabled
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      // Apply status filter (if not "all")
      if (filter !== "all") {
        const statusFilter = filter === "active" ? "active" : filter === "inactive" ? "inactive" : filter === "pending" ? "pending" : "active";
        query = query.eq("status", statusFilter);
      }
      
      // Apply sorting
      query = query.order("vehicle_number", { ascending: sortOrder === "asc", nullsFirst: false });

      const { data, error } = await query;

      if (error) {
        toast.error("Error loading assets");
        setLoading(false);
        return;
      }

      const vehiclesData = data || [];
      setVehicles(vehiclesData);

      // Load driver names for any assigned drivers so they show in the list
      const driverIds = Array.from(
        new Set(
          vehiclesData.flatMap((v) => [v.driver_1_id, v.driver_2_id]).filter((id): id is string => !!id)
        )
      );

      if (driverIds.length > 0) {
        const { data: driversData, error: driversError } = await supabase
          .from("applications")
          .select("id, personal_info")
          .in("id", driverIds);

        if (!driversError && driversData) {
          const map: Record<string, string> = {};
          driversData.forEach((driver: any) => {
            const first = driver.personal_info?.firstName || "";
            const last = driver.personal_info?.lastName || "";
            const name = `${first} ${last}`.trim() || "Driver";
            map[driver.id] = name;
          });
          setDriversMap(map);
        } else {
          setDriversMap({});
        }
      } else {
        setDriversMap({});
      }

      // Load carrier names
      const carrierIds = Array.from(
        new Set(
          vehiclesData.map((v) => v.carrier).filter((id): id is string => !!id)
        )
      );

      if (carrierIds.length > 0) {
        const { data: carriersData, error: carriersError } = await supabase
          .from("carriers")
          .select("id, name")
          .in("id", carrierIds);

        if (!carriersError && carriersData) {
          const map: Record<string, string> = {};
          carriersData.forEach((carrier: any) => {
            map[carrier.id] = carrier.name;
          });
          setCarriersMap(map);
        } else {
          setCarriersMap({});
        }
      } else {
        setCarriersMap({});
      }

      // Load payee names
      const payeeIds = Array.from(
        new Set(
          vehiclesData.map((v) => v.payee_id).filter((id): id is string => !!id)
        )
      );

      if (payeeIds.length > 0) {
        const { data: payeesData, error: payeesError } = await supabase
          .from("payees")
          .select("id, name")
          .in("id", payeeIds);

        if (!payeesError && payeesData) {
          const map: Record<string, string> = {};
          payeesData.forEach((payee: any) => {
            map[payee.id] = payee.name;
          });
          setPayeesMap(map);
        } else {
          setPayeesMap({});
        }
      } else {
        setPayeesMap({});
      }

      // Load dispatcher names for any assigned dispatchers
      const dispatcherIds = Array.from(
        new Set(
          vehiclesData.map((v) => v.primary_dispatcher_id).filter((id): id is string => !!id)
        )
      );

      if (dispatcherIds.length > 0) {
        const { data: dispatchersData, error: dispatchersError } = await supabase
          .from("dispatchers")
          .select("id, first_name, last_name")
          .in("id", dispatcherIds);

        if (!dispatchersError && dispatchersData) {
          const map: Record<string, string> = {};
          dispatchersData.forEach((dispatcher: any) => {
            map[dispatcher.id] = `${dispatcher.first_name} ${dispatcher.last_name}`.trim();
          });
          setDispatchersMap(map);
        } else {
          setDispatchersMap({});
        }
      } else {
        setDispatchersMap({});
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    try {
      const { error } = await supabase
        .from("vehicles")
        .insert([{
          ...formData,
          status: "active",
          tenant_id: tenantId,
        }]);

      if (error) throw error;
      toast.success("Asset added successfully");
      setDialogOpen(false);
      setFormData({
        vehicle_number: "",
        carrier: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        vin: "",
        license_plate: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add asset: " + error.message);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Asset deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete asset: " + error.message);
    }
  };

  const handleOpenAssignDialog = (vehicleId: string, type: "driver1" | "driver2" | "dispatcher") => {
    setSelectedVehicleId(vehicleId);
    setAssignDialogType(type);
    setAssignDialogOpen(true);
  };

  const handleAssignment = async (assignedId: string | null) => {
    try {
      const updateData: any = {};
      
      if (assignDialogType === "driver1") {
        updateData.driver_1_id = assignedId;
      } else if (assignDialogType === "driver2") {
        updateData.driver_2_id = assignedId;
      } else if (assignDialogType === "dispatcher") {
        updateData.primary_dispatcher_id = assignedId;
      }

      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", selectedVehicleId);

      if (error) throw error;

      toast.success(
        assignDialogType === "dispatcher"
          ? "Dispatcher assigned successfully"
          : "Driver assigned successfully"
      );
      setAssignDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error("Failed to assign: " + error.message);
    }
  };

  const handleStatusChange = async (vehicleId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ status: newStatus })
        .eq("id", vehicleId);

      if (error) throw error;

      // Update local state
      setVehicles(prev => prev.map(v => 
        v.id === vehicleId ? { ...v, status: newStatus } : v
      ));
      
      toast.success(`Status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const viewVehicle = (id: string) => {
    navigate(`/dashboard/vehicle/${id}`);
  };

  const handleSyncSamsara = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-vehicles-samsara');

      if (error) {
        console.error('Sync error:', error);
        toast.error('Failed to sync with Samsara: ' + error.message);
        return;
      }

      if (data.success) {
        toast.success(data.message);
        loadData(); // Reload the vehicles list
      } else {
        toast.error('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error('Failed to sync with Samsara');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredVehicles.length === 0) {
      toast.error("No assets to export");
      return;
    }
    // Map carrier IDs to carrier names for export
    const exportData = filteredVehicles.map(vehicle => ({
      ...vehicle,
      carrier: vehicle.carrier ? carriersMap[vehicle.carrier] || vehicle.carrier : '',
    }));
    exportToExcel(exportData, 'assets');
    toast.success(`Exported ${filteredVehicles.length} assets to Excel`);
  };

  const handleImportAssets = async (data: any[]): Promise<{ success: number; errors: string[] }> => {
    if (!tenantId) {
      return { success: 0, errors: ["No tenant selected"] };
    }

    let success = 0;
    const errors: string[] = [];

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    const normalizeVin = (vin: any) => String(vin || "").trim().toUpperCase();
    const normalizeUnit = (unit: any) => String(unit || "").trim();
    const normalizeName = (name: any) => String(name || "").trim().toLowerCase();

    // Preload lookups so we can update existing assets instead of failing on duplicates
    const [{ data: existingVehicles, error: existingError }, { data: carriers, error: carriersError }] =
      await Promise.all([
        supabase
          .from("vehicles")
          .select("id, vin, vehicle_number")
          .eq("tenant_id", tenantId),
        supabase
          .from("carriers")
          .select("id, name")
          .eq("tenant_id", tenantId),
      ]);

    if (existingError) {
      errors.push(`Failed to load existing assets: ${existingError.message}`);
    }

    const existingByVin = new Map<string, string>();
    const existingByUnit = new Map<string, string>();
    (existingVehicles || []).forEach((v: any) => {
      const vin = normalizeVin(v.vin);
      const unit = normalizeUnit(v.vehicle_number);
      if (vin) existingByVin.set(vin, v.id);
      if (unit) existingByUnit.set(unit, v.id);
    });

    const carrierNameToId = new Map<string, string>();
    if (carriersError) {
      errors.push(`Failed to load carriers: ${carriersError.message}`);
    }
    (carriers || []).forEach((c: any) => {
      const key = normalizeName(c.name);
      if (key) carrierNameToId.set(key, c.id);
    });

    for (const item of data) {
      try {
        const unit = normalizeUnit(item.vehicle_number);
        if (!unit) {
          errors.push(`Missing Unit ID for row`);
          continue;
        }

        const vin = normalizeVin(item.vin);

        // Map carrier name (exported) back to carrier id (stored)
        const carrierRaw = String(item.carrier || "").trim();
        const carrierId = carrierRaw
          ? (isUuid(carrierRaw) ? carrierRaw : carrierNameToId.get(normalizeName(carrierRaw)) || null)
          : null;
        if (carrierRaw && !carrierId) {
          // Not blocking import, but surfaces the issue
          errors.push(`${unit}: Carrier "${carrierRaw}" not found (leaving blank)`);
        }

        const rowData: any = {
          vehicle_number: unit,
          status: item.status || "active",
          carrier: carrierId,
          make: item.make ? String(item.make).trim() : null,
          model: item.model ? String(item.model).trim() : null,
          year: item.year ? parseInt(String(item.year), 10) : null,
          vin: vin || null,
          license_plate: item.license_plate ? String(item.license_plate).trim() : null,
          asset_type: item.asset_type || null,
          asset_subtype: item.asset_subtype || null,
          vehicle_size: item.vehicle_size ? parseFloat(String(item.vehicle_size)) : null,
          payload: item.payload ? parseFloat(String(item.payload)) : null,
          dimensions_length: item.dimensions_length ? parseFloat(String(item.dimensions_length)) : null,
          dimensions_width: item.dimensions_width ? parseFloat(String(item.dimensions_width)) : null,
          dimensions_height: item.dimensions_height ? parseFloat(String(item.dimensions_height)) : null,
          fuel_type: item.fuel_type || null,
          odometer: item.odometer ? parseFloat(String(item.odometer)) : null,
          registration_exp_date: item.registration_exp_date || null,
          insurance_expiry: item.insurance_expiry || null,
          lift_gate: item.lift_gate === true || item.lift_gate === "Yes",
          air_ride: item.air_ride === true || item.air_ride === "Yes",
          notes: item.notes || null,
        };

        const existingId = (vin && existingByVin.get(vin)) || existingByUnit.get(unit);

        if (existingId) {
          const { error } = await supabase.from("vehicles").update(rowData).eq("id", existingId);
          if (error) {
            errors.push(`${unit}: ${error.message}`);
          } else {
            success++;
          }
        } else {
          const { error } = await supabase.from("vehicles").insert([{ ...rowData, tenant_id: tenantId }]);
          if (error) {
            errors.push(`${unit}: ${error.message}`);
          } else {
            success++;
            if (vin) existingByVin.set(vin, "__new__");
            existingByUnit.set(unit, "__new__");
          }
        }
      } catch (err: any) {
        errors.push(`${item.vehicle_number || "Unknown"}: ${err.message}`);
      }
    }

    if (success > 0) {
      loadData();
    }

    return { success, errors };
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (vehicle.vehicle_number || "").toLowerCase().includes(searchLower) ||
      (vehicle.carrier || "").toLowerCase().includes(searchLower) ||
      (vehicle.payee_id ? payeesMap[vehicle.payee_id] || "" : "").toLowerCase().includes(searchLower) ||
      (vehicle.make || "").toLowerCase().includes(searchLower) ||
      (vehicle.model || "").toLowerCase().includes(searchLower) ||
      (vehicle.vin || "").toLowerCase().includes(searchLower) ||
      (vehicle.license_plate || "").toLowerCase().includes(searchLower)
    );
  }).sort((a, b) => {
    // If showServiceDue is active, prioritize vehicles needing service
    if (showServiceDue) {
      const aDue = (a.oil_change_remaining !== null && a.oil_change_remaining <= 0) ||
                    (a.registration_exp_date && new Date(a.registration_exp_date) < new Date()) ||
                    (a.insurance_expiry && new Date(a.insurance_expiry) < new Date());
      const bDue = (b.oil_change_remaining !== null && b.oil_change_remaining <= 0) ||
                    (b.registration_exp_date && new Date(b.registration_exp_date) < new Date()) ||
                    (b.insurance_expiry && new Date(b.insurance_expiry) < new Date());
      
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
    }
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(filteredVehicles.length / ROWS_PER_PAGE);
  const paginatedVehicles = filteredVehicles.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, showServiceDue]);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg sm:text-xl font-bold">Asset Management</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="gap-1.5 h-8" 
            onClick={handleExportExcel}
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
            onClick={handleSyncSamsara}
            disabled={syncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Samsara'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" />
                Add Asset
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Asset</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <Label htmlFor="vehicle_number">Unit ID</Label>
                <Input
                  id="vehicle_number"
                  value={formData.vehicle_number}
                  onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="carrier">Carrier</Label>
                <Input
                  id="carrier"
                  value={formData.carrier}
                  onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={formData.vin}
                  onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="license_plate">License Plate</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate}
                  onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Add Asset</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters Row - Mobile Optimized */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search field - now on the left */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-sm"
          />
        </div>

        {/* Filter buttons - scrollable on mobile */}
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex items-center gap-0 w-max sm:w-auto">
            {(() => {
              const statusCounts = {
                all: vehicles.length,
                active: vehicles.filter(v => v.status === "active").length,
                inactive: vehicles.filter(v => v.status === "inactive").length,
                pending: vehicles.filter(v => v.status === "pending").length,
              };

              const statusFilters = [
                { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
                { key: "active", label: "Active", count: statusCounts.active, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
                { key: "inactive", label: "Inactive", count: statusCounts.inactive, activeClass: "btn-glossy", badgeClass: "badge-inset", softBadgeClass: "badge-inset" },
                { key: "pending", label: "Pending", count: statusCounts.pending, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
              ];

              return statusFilters.map((status, index) => (
                <Button
                  key={status.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchParams({ filter: status.key });
                    setSearchQuery("");
                  }}
                  className={`h-[28px] px-2 text-[12px] font-medium gap-1 border-0 ${
                    index === 0 ? 'rounded-l-full rounded-r-none' : 
                    index === statusFilters.length - 1 ? 'rounded-r-full rounded-l-none' : 
                    'rounded-none'
                  } ${
                    filter === status.key 
                      ? `${status.activeClass} text-white` 
                      : 'btn-glossy text-gray-700'
                  }`}
                >
                  {status.label}
                  <span className={`${filter === status.key ? status.badgeClass : status.softBadgeClass} text-[10px] h-5`}>{status.count}</span>
                </Button>
              ));
            })()}
            
            {/* Spacer */}
            <div className="w-3" />
            
            {/* Service Needed - Standalone button */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-[28px] px-3 text-[12px] font-medium rounded-full border-0 ${
                showServiceDue ? "btn-glossy-danger text-white" : "btn-glossy text-gray-700"
              }`}
              onClick={() => setShowServiceDue(!showServiceDue)}
            >
              Service Needed
            </Button>
          </div>
        </div>

        {/* Sort button */}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 gap-1 shrink-0"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          >
            <span className="hidden sm:inline">Unit #</span> {sortOrder === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredVehicles.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {searchQuery ? "No assets match your search" : "No assets found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="flex flex-col gap-3 md:hidden">
            {paginatedVehicles.map((vehicle) => {
              const isOilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined && vehicle.oil_change_remaining <= 0;
              return (
                <div
                  key={vehicle.id}
                  className={`p-4 rounded-xl border bg-card active:scale-[0.98] transition-transform cursor-pointer ${isOilChangeDue ? "border-destructive/50 bg-destructive/5" : ""}`}
                  onClick={() => viewVehicle(vehicle.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">{vehicle.vehicle_number || "N/A"}</span>
                        <Badge 
                          className={`text-[10px] px-1.5 py-0 ${
                            vehicle.status === "active"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : vehicle.status === "pending"
                              ? "bg-orange-100 text-orange-800 border-orange-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }`}
                        >
                          {vehicle.status}
                        </Badge>
                        {vehicle.requires_load_approval && (
                          <Badge 
                            variant="outline" 
                            className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-300"
                            title="Load Approval Required"
                          >
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                            LA
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {vehicle.carrier ? carriersMap[vehicle.carrier] || "No Carrier" : "No Carrier"}
                      </p>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => viewVehicle(vehicle.id)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Type</span>
                      <span className="text-xs font-medium">
                        {vehicle.vehicle_size && vehicle.asset_subtype
                          ? `${vehicle.vehicle_size}' ${vehicle.asset_subtype}`
                          : vehicle.asset_type || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Lift-Gate</span>
                      <span className="text-xs font-medium">{vehicle.lift_gate ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Driver 1</span>
                      <span className="text-xs font-medium text-primary">
                        {vehicle.driver_1_id ? driversMap[vehicle.driver_1_id] || "Assigned" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Dispatcher</span>
                      <span className="text-xs font-medium text-primary">
                        {vehicle.primary_dispatcher_id ? dispatchersMap[vehicle.primary_dispatcher_id] || "Assigned" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Oil Change</span>
                      <span className={`text-xs font-medium ${isOilChangeDue ? "text-destructive font-bold" : ""}`}>
                        {vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined
                          ? `${vehicle.oil_change_remaining} mi`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Insurance</span>
                      <span className="text-xs font-medium">
                        {vehicle.insurance_expiry ? format(new Date(vehicle.insurance_expiry), "MM/dd/yy") : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:flex md:flex-col" style={{ height: 'calc(100vh - 220px)' }}>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto overflow-x-auto">
                <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Unit ID</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Carrier/Payee</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Drivers</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Dispatcher</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Type/Susp</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Dimensions</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Payload</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Lift-Gate</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Oil Change</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Registration</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Insurance</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {paginatedVehicles.map((vehicle) => {
                    const isOilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined && vehicle.oil_change_remaining <= 0;
                    return (
                    <TableRow 
                      key={vehicle.id} 
                      className={`cursor-pointer hover:bg-muted/50 h-10 ${isOilChangeDue ? "bg-red-50 dark:bg-red-950/30" : ""}`} 
                      onClick={() => viewVehicle(vehicle.id)}
                    >
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <div 
                            className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs text-white ${
                              vehicle.status === "active" 
                                ? "bg-green-600" 
                                : vehicle.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}
                          >
                            0
                          </div>
                          <Select
                            value={vehicle.status}
                            onValueChange={(value) => handleStatusChange(vehicle.id, value)}
                          >
                            <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                              vehicle.status === "active"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : vehicle.status === "pending"
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
                      <TableCell className="py-1 px-2 font-medium text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{vehicle.vehicle_number || "N/A"}</span>
                          {vehicle.requires_load_approval && (
                            <Badge 
                              variant="outline" 
                              className="text-[9px] px-1 py-0 h-4 bg-amber-50 text-amber-700 border-amber-300"
                              title="Load Approval Required"
                            >
                              <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                              LA
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">0</div>
                      </TableCell>
                      <TableCell className="py-1 px-2 text-sm">
                        <div className="truncate max-w-[140px]">{vehicle.carrier ? carriersMap[vehicle.carrier] || "N/A" : "N/A"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{vehicle.payee_id ? payeesMap[vehicle.payee_id] || "N/A" : "N/A"}</div>
                      </TableCell>
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-0">
                          <div
                            className="text-primary underline cursor-pointer hover:text-primary/80 text-sm"
                            onClick={() => handleOpenAssignDialog(vehicle.id, "driver1")}
                          >
                            {vehicle.driver_1_id
                              ? driversMap[vehicle.driver_1_id] || "Driver 1"
                              : "Assign"}
                          </div>
                          <div
                            className="text-primary underline cursor-pointer hover:text-primary/80 text-sm"
                            onClick={() => handleOpenAssignDialog(vehicle.id, "driver2")}
                          >
                            {vehicle.driver_2_id
                              ? driversMap[vehicle.driver_2_id] || "Driver 2"
                              : "Assign"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="text-primary underline cursor-pointer hover:text-primary/80 text-sm"
                          onClick={() => handleOpenAssignDialog(vehicle.id, "dispatcher")}
                        >
                          {vehicle.primary_dispatcher_id
                            ? dispatchersMap[vehicle.primary_dispatcher_id] || "Assigned"
                            : "Assign"}
                        </div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div className="text-sm">
                          {vehicle.vehicle_size && vehicle.asset_subtype
                            ? `${vehicle.vehicle_size}' ${vehicle.asset_subtype}`
                            : vehicle.asset_type || "N/A"}
                        </div>
                        <div className="text-xs text-muted-foreground">Air Ride</div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div className="text-sm">
                          {vehicle.dimensions_length && vehicle.dimensions_width && vehicle.dimensions_height
                            ? `${vehicle.dimensions_length}x${vehicle.dimensions_width}x${vehicle.dimensions_height}`
                            : "N/A"}
                        </div>
                        <div className="text-xs text-muted-foreground">96x94</div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div className="text-sm">{vehicle.payload ? `${vehicle.payload}` : "N/A"}</div>
                        <div className="text-xs text-muted-foreground">13"</div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div className="text-sm">{vehicle.lift_gate ? "Yes" : "No"}</div>
                        <div className="text-xs text-muted-foreground">Dock</div>
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        {vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined ? (
                          <div className={`text-sm font-semibold ${
                            vehicle.oil_change_remaining < 0 
                              ? "text-destructive" 
                              : ""
                          }`}>
                            {vehicle.oil_change_remaining} mi
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">N/A</div>
                        )}
                      </TableCell>
                      <TableCell className="py-1 px-2 text-sm">
                        {vehicle.registration_exp_date 
                          ? format(new Date(vehicle.registration_exp_date), "MM/dd/yy") 
                          : "N/A"}
                      </TableCell>
                      <TableCell className="py-1 px-2 text-sm">
                        {vehicle.insurance_expiry 
                          ? format(new Date(vehicle.insurance_expiry), "MM/dd/yy") 
                          : "N/A"}
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={() => viewVehicle(vehicle.id)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Always visible pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                Showing {filteredVehicles.length === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredVehicles.length)} of {filteredVehicles.length}
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
        </>
      )}

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignDialogType === "dispatcher"
                ? "Assign Primary Dispatcher"
                : assignDialogType === "driver1"
                ? "Assign Driver 1"
                : "Assign Driver 2"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {assignDialogType === "dispatcher" ? (
              <div className="space-y-2">
                <Label>Select Dispatcher</Label>
                {availableDispatchers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active dispatchers available</p>
                ) : (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleAssignment(null)}
                    >
                      Unassign Dispatcher
                    </Button>
                    {availableDispatchers.map((dispatcher) => (
                      <Button
                        key={dispatcher.id}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleAssignment(dispatcher.id)}
                      >
                        {dispatcher.first_name} {dispatcher.last_name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Select Driver</Label>
                {availableDrivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active drivers available</p>
                ) : (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleAssignment(null)}
                    >
                      Unassign Driver
                    </Button>
                    {availableDrivers.map((driver) => {
                      const firstName = driver.personal_info?.firstName || "";
                      const lastName = driver.personal_info?.lastName || "";
                      const fullName = `${firstName} ${lastName}`.trim() || "Unnamed Driver";
                      return (
                        <Button
                          key={driver.id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleAssignment(driver.id)}
                        >
                          {fullName}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entityType="assets"
        entityLabel="Assets"
        onImport={handleImportAssets}
      />
    </div>
  );
}
