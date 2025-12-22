import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Search, Plus, Edit, Trash2, RefreshCw, ChevronLeft, ChevronRight, Download, ShieldCheck } from "lucide-react";
interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  payee: string | null;
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
  const [formData, setFormData] = useState({
    vehicle_number: "",
    carrier: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    license_plate: "",
  });

  useEffect(() => {
    loadData();
    loadAvailableDriversAndDispatchers();
  }, [filter, sortOrder]);

  const loadAvailableDriversAndDispatchers = async () => {
    try {
      // Load drivers
      const { data: driversData, error: driversError } = await supabase
        .from("applications")
        .select("id, personal_info, driver_status")
        .in("driver_status", ["Active", "active", "ACTIVE"]);

      if (!driversError && driversData) {
        setAvailableDrivers(driversData);
      }

      // Load dispatchers
      const { data: dispatchersData, error: dispatchersError } = await supabase
        .from("dispatchers")
        .select("id, first_name, last_name, status")
        .in("status", ["Active", "active", "ACTIVE"]);

      if (!dispatchersError && dispatchersData) {
        setAvailableDispatchers(dispatchersData);
      }
    } catch (error) {
      console.error("Error loading drivers/dispatchers:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from("vehicles").select("*");
      
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
          vehiclesData.map((v) => v.payee).filter((id): id is string => !!id)
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
    try {
      const { error } = await supabase
        .from("vehicles")
        .insert({
          ...formData,
          status: "active",
        });

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
    // Get all vehicles data for export (use filtered or all)
    const dataToExport = filteredVehicles;
    
    if (dataToExport.length === 0) {
      toast.error("No assets to export");
      return;
    }

    // Define all columns for export
    const headers = [
      "Status", "Unit ID", "Carrier", "Payee", "Driver 1", "Driver 2", "Dispatcher",
      "Asset Type", "Asset Subtype", "Make", "Model", "Year", "VIN", "License Plate",
      "Vehicle Size", "Dimensions (LxWxH)", "Payload", "Air Ride", "Suspension",
      "Lift Gate", "Lift Gate Capacity", "Lift Gate Dims", "Pallet Jack", "Pallet Jack Capacity",
      "Blankets", "Straps Count", "Load Bars (E-Track)", "Load Bars (Non E-Track)",
      "Horizontal E-Tracks", "Vertical E-Track Rows", "Door Type", "Door Dims (WxH)",
      "Has Side Door", "Door Sensors", "Temp Control", "Team", "Clearance", "Axles",
      "Fuel Type", "Fuel Tank Capacity", "Fuel Efficiency (MPG)", "Fuel Per Gallon",
      "Odometer", "Mileage", "Oil Change Due", "Oil Change Remaining",
      "Last Service Date", "Next Service Date", "Registration Exp", "Registration Status",
      "Insurance Expiry", "Cargo Coverage Exp", "Cargo Coverage Status",
      "Liability Coverage Exp", "Liability Coverage Status", "Physical Coverage Exp", "Physical Coverage Status",
      "Insurance Cost/Month", "Asset Ownership", "Bid As", "Provider", "Provider ID", "Provider Status",
      "Reg Plate", "Reg State", "Last Location", "Formatted Address", "Speed", "Stopped Status",
      "ELD Device SN", "Dash Cam SN", "Toll Device SN", "Tracking Device IMEI",
      "Trailer Tracking", "Panic Button", "Camera Image URL",
      "Pickup Date", "Pickup Odometer", "Return Date", "Return Odometer",
      "Notes", "Created At", "Updated At", "Last Updated"
    ];

    // Map data to rows
    const rows = dataToExport.map((v: any) => [
      v.status || "",
      v.vehicle_number || "",
      carriersMap[v.carrier] || v.carrier || "",
      payeesMap[v.payee] || v.payee || "",
      driversMap[v.driver_1_id] || "",
      driversMap[v.driver_2_id] || "",
      dispatchersMap[v.primary_dispatcher_id] || "",
      v.asset_type || "",
      v.asset_subtype || "",
      v.make || "",
      v.model || "",
      v.year || "",
      v.vin || "",
      v.license_plate || "",
      v.vehicle_size || "",
      v.dimensions_length && v.dimensions_width && v.dimensions_height 
        ? `${v.dimensions_length}x${v.dimensions_width}x${v.dimensions_height}` 
        : "",
      v.payload || "",
      v.air_ride ? "Yes" : "No",
      v.suspension || "",
      v.lift_gate ? "Yes" : "No",
      v.lift_gate_capacity || "",
      v.lift_gate_dims || "",
      v.pallet_jack ? "Yes" : "No",
      v.pallet_jack_capacity || "",
      v.blankets || "",
      v.straps_count || "",
      v.load_bars_etrack || "",
      v.load_bars_non_etrack || "",
      v.horizontal_etracks || "",
      v.vertical_etrack_rows || "",
      v.door_type || "",
      v.door_dims_width && v.door_dims_height ? `${v.door_dims_width}x${v.door_dims_height}` : "",
      v.has_side_door ? "Yes" : "No",
      v.door_sensors ? "Yes" : "No",
      v.temp_control ? "Yes" : "No",
      v.team ? "Yes" : "No",
      v.clearance || "",
      v.axles || "",
      v.fuel_type || "",
      v.fuel_tank_capacity || "",
      v.fuel_efficiency_mpg || "",
      v.fuel_per_gallon || "",
      v.odometer || "",
      v.mileage || "",
      v.oil_change_due || "",
      v.oil_change_remaining || "",
      v.last_service_date || "",
      v.next_service_date || "",
      v.registration_exp_date || "",
      v.registration_status || "",
      v.insurance_expiry || "",
      v.cargo_coverage_exp_date || "",
      v.cargo_coverage_status || "",
      v.liability_coverage_exp_date || "",
      v.liability_coverage_status || "",
      v.physical_coverage_exp_date || "",
      v.physical_coverage_status || "",
      v.insurance_cost_per_month || "",
      v.asset_ownership || "",
      v.bid_as || "",
      v.provider || "",
      v.provider_id || "",
      v.provider_status || "",
      v.reg_plate || "",
      v.reg_state || "",
      v.last_location || "",
      v.formatted_address || "",
      v.speed || "",
      v.stopped_status || "",
      v.eld_device_sn || "",
      v.dash_cam_sn || "",
      v.toll_device_sn || "",
      v.tracking_device_imei || "",
      v.trailer_tracking ? "Yes" : "No",
      v.panic_button ? "Yes" : "No",
      v.camera_image_url || "",
      v.pickup_date || "",
      v.pickup_odometer || "",
      v.return_date || "",
      v.return_odometer || "",
      v.notes || "",
      v.created_at || "",
      v.updated_at || "",
      v.last_updated || ""
    ]);

    // Create CSV content
    const escapeCSV = (value: any) => {
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `assets_export_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Exported ${dataToExport.length} assets to Excel`);
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (vehicle.vehicle_number || "").toLowerCase().includes(searchLower) ||
      (vehicle.carrier || "").toLowerCase().includes(searchLower) ||
      (vehicle.payee || "").toLowerCase().includes(searchLower) ||
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
          <div className="flex gap-1 w-max sm:w-auto">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              className={`h-7 px-2 text-xs sm:text-sm ${filter === "all" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}`}
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
              className={`h-7 px-2 text-xs sm:text-sm ${filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
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
              className={`h-7 px-2 text-xs sm:text-sm ${filter === "inactive" ? "bg-muted text-muted-foreground" : ""}`}
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
              className={`h-7 px-2 text-xs sm:text-sm ${filter === "pending" ? "bg-orange-500 text-white hover:bg-orange-600" : ""}`}
              onClick={() => {
                setSearchParams({ filter: "pending" });
                setSearchQuery("");
              }}
            >
              Pending
            </Button>
            <Button
              variant={showServiceDue ? "default" : "outline"}
              size="sm"
              className={`h-7 px-2 text-xs sm:text-sm ${showServiceDue ? "bg-red-600 text-white hover:bg-red-700" : ""}`}
              onClick={() => setShowServiceDue(!showServiceDue)}
            >
              Service
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
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{vehicle.payee ? payeesMap[vehicle.payee] || "N/A" : "N/A"}</div>
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
    </div>
  );
}
