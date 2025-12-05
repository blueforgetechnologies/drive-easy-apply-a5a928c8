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
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold">Asset Management</h2>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={handleSyncSamsara}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Samsara'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
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

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
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
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
            className={filter === "pending" ? "bg-accent text-accent-foreground" : ""}
          >
            Pending
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
            variant={showServiceDue ? "default" : "outline"}
            onClick={() => setShowServiceDue(!showServiceDue)}
            className={showServiceDue ? "bg-red-600 text-white hover:bg-red-700" : ""}
          >
            Service Due
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="gap-2"
          >
            Unit # {sortOrder === "asc" ? "↑" : "↓"}
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
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
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[80px]">Asset Status</TableHead>
                    <TableHead>Unit ID<br/>Leased ID</TableHead>
                    <TableHead>Carrier<br/>Payee</TableHead>
                    <TableHead>Drivers</TableHead>
                    <TableHead>Primary<br/>Dispatcher</TableHead>
                    <TableHead>Asset Type<br/>Susp</TableHead>
                    <TableHead>Dimensions<br/>Door Dims</TableHead>
                    <TableHead>Payload<br/>Clearance</TableHead>
                    <TableHead>Lift-Gate<br/>Dock High</TableHead>
                    <TableHead>Oil Change</TableHead>
                    <TableHead>Registration<br/>Renewal</TableHead>
                    <TableHead>Insurance<br/>Renewal</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredVehicles.map((vehicle) => {
                    const isOilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined && vehicle.oil_change_remaining <= 0;
                    return (
                    <TableRow 
                      key={vehicle.id} 
                      className={`cursor-pointer hover:bg-muted/50 ${isOilChangeDue ? "bg-red-50 dark:bg-red-950/30" : ""}`} 
                      onClick={() => viewVehicle(vehicle.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div 
                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs text-white ${
                              vehicle.status === "active" 
                                ? "bg-green-600" 
                                : vehicle.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}
                          >
                            0
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={`${
                              vehicle.status === "active"
                                ? "bg-green-100 text-green-800 hover:bg-green-100"
                                : vehicle.status === "pending"
                                ? "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                            }`}
                          >
                            {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{vehicle.vehicle_number || "N/A"}</div>
                        <div className="text-sm text-muted-foreground">0</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.carrier ? carriersMap[vehicle.carrier] || "N/A" : "N/A"}</div>
                        <div className="text-sm text-muted-foreground">{vehicle.payee ? payeesMap[vehicle.payee] || "N/A" : "N/A"}</div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="text-sm space-y-1">
                          <div
                            className="text-primary underline cursor-pointer hover:text-primary/80"
                            onClick={() => handleOpenAssignDialog(vehicle.id, "driver1")}
                          >
                            {vehicle.driver_1_id
                              ? driversMap[vehicle.driver_1_id] || "Driver 1"
                              : "Assign Driver"}
                          </div>
                          <div
                            className="text-primary underline cursor-pointer hover:text-primary/80"
                            onClick={() => handleOpenAssignDialog(vehicle.id, "driver2")}
                          >
                            {vehicle.driver_2_id
                              ? driversMap[vehicle.driver_2_id] || "Driver 2"
                              : "Assign Driver"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div
                          className="text-primary underline cursor-pointer hover:text-primary/80"
                          onClick={() => handleOpenAssignDialog(vehicle.id, "dispatcher")}
                        >
                          {vehicle.primary_dispatcher_id
                            ? dispatchersMap[vehicle.primary_dispatcher_id] || "Assigned Dispatcher"
                            : "Assign Dispatcher"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {vehicle.dimensions_length && vehicle.asset_subtype
                            ? `${vehicle.dimensions_length}' ${vehicle.asset_subtype}`
                            : vehicle.asset_type || "N/A"}
                        </div>
                        <div className="text-sm text-muted-foreground">Air Ride</div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {vehicle.dimensions_length && vehicle.dimensions_width && vehicle.dimensions_height
                            ? `${vehicle.dimensions_length}L x ${vehicle.dimensions_width}W x ${vehicle.dimensions_height}H`
                            : "N/A"}
                        </div>
                        <div className="text-sm text-muted-foreground">96H x 94W</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.payload ? `${vehicle.payload}` : "N/A"}</div>
                        <div className="text-sm text-muted-foreground">13"</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.lift_gate ? "Yes" : "No"}</div>
                        <div className="text-sm text-muted-foreground">Dock High</div>
                      </TableCell>
                      <TableCell>
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
                      <TableCell>
                        {vehicle.registration_exp_date 
                          ? format(new Date(vehicle.registration_exp_date), "yyyy-MM-dd") 
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {vehicle.insurance_expiry 
                          ? format(new Date(vehicle.insurance_expiry), "yyyy-MM-dd") 
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={() => viewVehicle(vehicle.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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
