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
import { Search, Plus, Edit, Trash2, RefreshCw, ArrowLeft } from "lucide-react";

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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">Asset Management</h2>
        </div>
        <div className="flex gap-2">
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
          <Button
            variant={showServiceDue ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 ${showServiceDue ? "bg-red-600 text-white hover:bg-red-700" : ""}`}
            onClick={() => setShowServiceDue(!showServiceDue)}
          >
            Service Due
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 gap-1"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          >
            Unit # {sortOrder === "asc" ? "↑" : "↓"}
          </Button>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-7 text-sm"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredVehicles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No assets match your search" : "No assets found"}
            </p>
          ) : (
            <div className="overflow-x-auto">
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
                {filteredVehicles.map((vehicle) => {
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
                        <div>{vehicle.vehicle_number || "N/A"}</div>
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
                          {vehicle.dimensions_length && vehicle.asset_subtype
                            ? `${vehicle.dimensions_length}' ${vehicle.asset_subtype}`
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
          )}
        </CardContent>
      </Card>

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
