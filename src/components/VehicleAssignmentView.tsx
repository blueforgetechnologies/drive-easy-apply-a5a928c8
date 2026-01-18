import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { X } from "lucide-react";

interface VehicleAssignmentViewProps {
  vehicles: any[];
  drivers: any[];
  onBack: () => void;
  onRefresh?: () => void;
}

export function VehicleAssignmentView({ vehicles, drivers, onBack, onRefresh }: VehicleAssignmentViewProps) {
  const { tenantId, shouldFilter } = useTenantFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "unassigned" | "active" | "inactive">("all");
  const [selectedCarrier, setSelectedCarrier] = useState<string>("all");
  const [carriers, setCarriers] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  // Sync local vehicles when prop changes
  useEffect(() => {
    setLocalVehicles(vehicles);
  }, [vehicles]);

  useEffect(() => {
    loadCarriers();
    loadDispatchers();
  }, [tenantId, shouldFilter]);

  const loadCarriers = async () => {
    try {
      let query = supabase
        .from("carriers")
        .select("id, name")
        .eq("status", "active")
        .order("name");

      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCarriers(data || []);
    } catch (error) {
      console.error("Failed to load carriers", error);
    }
  };

  const loadDispatchers = async () => {
    try {
      let query = supabase
        .from("dispatchers")
        .select("*")
        .eq("status", "active")
        .order("first_name");

      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDispatchers(data || []);
    } catch (error) {
      console.error("Failed to load dispatchers", error);
    }
  };

  // Filter vehicles based on search and filters
  const filteredVehicles = localVehicles.filter((vehicle) => {
    // Search filter
    const matchesSearch = 
      vehicle.vehicle_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.vin?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    if (filterType === "active" && vehicle.status !== "active") return false;
    if (filterType === "inactive" && vehicle.status !== "inactive") return false;
    if (filterType === "unassigned" && (vehicle.assigned_driver_id || vehicle.primary_dispatcher_id)) return false;

    // Carrier filter
    if (selectedCarrier !== "all") {
      const carrierName = carriers.find(c => c.id === selectedCarrier)?.name;
      if (vehicle.carrier !== carrierName) return false;
    }

    return true;
  });

  // Get counts for filter buttons
  const allCount = localVehicles.length;
  const unassignedCount = localVehicles.filter(v => !v.assigned_driver_id && !v.primary_dispatcher_id).length;
  const activeCount = localVehicles.filter(v => v.status === "active").length;
  const inactiveCount = localVehicles.filter(v => v.status === "inactive").length;

  // Get driver name
  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "";
    const driver = drivers.find(d => d.id === driverId);
    if (!driver?.personal_info) return "";
    const info = driver.personal_info;
    return `${info.firstName || ""} ${info.lastName || ""}`.trim();
  };

  // Get dispatcher name
  const getDispatcherName = (dispatcherId: string | null) => {
    if (!dispatcherId) return "";
    const dispatcher = dispatchers.find(d => d.id === dispatcherId);
    if (!dispatcher) return "";
    return `${dispatcher.first_name} ${dispatcher.last_name}`;
  };

  // Get carrier name - carrier field might be an ID or a name
  const getCarrierName = (carrier: string | null) => {
    if (!carrier) return "";
    // Check if it's a UUID (carrier ID)
    const carrierById = carriers.find(c => c.id === carrier);
    if (carrierById) return carrierById.name;
    // Otherwise it's already a name
    return carrier;
  };

  const handleDispatcherChange = async (vehicleId: string, newDispatcherId: string) => {
    const newValue = newDispatcherId === "unassigned" ? null : newDispatcherId;
    
    // Optimistic update - immediately update local state
    setLocalVehicles(prev => prev.map(v => 
      v.id === vehicleId ? { ...v, primary_dispatcher_id: newValue } : v
    ));
    
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ primary_dispatcher_id: newValue })
        .eq("id", vehicleId);

      if (error) throw error;
      toast.success("Dispatcher assigned successfully");
      
      // Notify parent to refresh if callback provided
      onRefresh?.();
    } catch (error) {
      console.error("Failed to update dispatcher", error);
      toast.error("Failed to assign dispatcher");
      
      // Revert optimistic update on error
      setLocalVehicles(vehicles);
    }
  };

  const handleAddSecondaryDispatcher = async (vehicleId: string, dispatcherId: string) => {
    const vehicle = localVehicles.find(v => v.id === vehicleId);
    const currentSecondary = vehicle?.secondary_dispatcher_ids || [];
    
    // Don't add if already in list
    if (currentSecondary.includes(dispatcherId)) {
      toast.error("Dispatcher already assigned");
      return;
    }
    
    const newSecondary = [...currentSecondary, dispatcherId];
    
    // Optimistic update
    setLocalVehicles(prev => prev.map(v => 
      v.id === vehicleId ? { ...v, secondary_dispatcher_ids: newSecondary } : v
    ));
    setOpenPopoverId(null);
    
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ secondary_dispatcher_ids: newSecondary })
        .eq("id", vehicleId);

      if (error) throw error;
      toast.success("Secondary dispatcher added");
      onRefresh?.();
    } catch (error) {
      console.error("Failed to add secondary dispatcher", error);
      toast.error("Failed to add secondary dispatcher");
      setLocalVehicles(vehicles);
    }
  };

  const handleRemoveSecondaryDispatcher = async (vehicleId: string, dispatcherId: string) => {
    const vehicle = localVehicles.find(v => v.id === vehicleId);
    const currentSecondary = vehicle?.secondary_dispatcher_ids || [];
    const newSecondary = currentSecondary.filter((id: string) => id !== dispatcherId);
    
    // Optimistic update
    setLocalVehicles(prev => prev.map(v => 
      v.id === vehicleId ? { ...v, secondary_dispatcher_ids: newSecondary } : v
    ));
    
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ secondary_dispatcher_ids: newSecondary })
        .eq("id", vehicleId);

      if (error) throw error;
      toast.success("Secondary dispatcher removed");
      onRefresh?.();
    } catch (error) {
      console.error("Failed to remove secondary dispatcher", error);
      toast.error("Failed to remove secondary dispatcher");
      setLocalVehicles(vehicles);
    }
  };

  // Get dispatchers available to add as secondary (not already assigned)
  const getAvailableSecondaryDispatchers = (vehicle: any) => {
    const primaryId = vehicle.primary_dispatcher_id;
    const secondaryIds = vehicle.secondary_dispatcher_ids || [];
    return dispatchers.filter(d => d.id !== primaryId && !secondaryIds.includes(d.id));
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <Card className="flex-1 flex flex-col m-2">
        <CardContent className="p-3 flex-1 flex flex-col">
          {/* Search and Filters */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b">
            <Input
              placeholder="Search by Truck or Rental/Unit number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />

            <div className="flex gap-1.5">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("all")}
                className="h-8 text-xs px-2"
              >
                All <span className="ml-1 font-bold">{allCount}</span>
              </Button>

              <Button
                variant={filterType === "unassigned" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("unassigned")}
                className="h-8 text-xs px-2"
              >
                Unassigned <span className="ml-1 font-bold">{unassignedCount}</span>
              </Button>

              <Button
                variant={filterType === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("active")}
                className={`h-8 text-xs px-2 ${filterType === "active" ? "bg-green-600 hover:bg-green-700" : ""}`}
              >
                Active <span className="ml-1 font-bold">{activeCount}</span>
              </Button>

              <Button
                variant={filterType === "inactive" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("inactive")}
                className={`h-8 text-xs px-2 ${filterType === "inactive" ? "bg-gray-600 hover:bg-gray-700" : ""}`}
              >
                Inactive <span className="ml-1 font-bold">{inactiveCount}</span>
              </Button>
            </div>

            <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Filter by Carrier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {carriers.map((carrier) => (
                  <SelectItem key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle Assignment Table */}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-9">
                  <TableHead className="font-bold text-xs py-2">Unit ID</TableHead>
                  <TableHead className="font-bold text-xs py-2">Drivers</TableHead>
                  <TableHead className="font-bold text-xs py-2">Carrier</TableHead>
                  <TableHead className="font-bold text-xs py-2">Primary Dispatcher</TableHead>
                  <TableHead className="font-bold text-xs py-2">Dispatchers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id} className="h-10">
                    <TableCell className="font-semibold text-sm py-2">
                      {vehicle.vehicle_number || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="space-y-0.5 text-sm">
                        {vehicle.driver_1_id && (
                          <div>{getDriverName(vehicle.driver_1_id)}</div>
                        )}
                        {vehicle.driver_2_id && (
                          <div>{getDriverName(vehicle.driver_2_id)}</div>
                        )}
                        {!vehicle.driver_1_id && !vehicle.driver_2_id && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {getCarrierName(vehicle.carrier) || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <Select
                        value={vehicle.primary_dispatcher_id || "unassigned"}
                        onValueChange={(value) => handleDispatcherChange(vehicle.id, value)}
                      >
                        <SelectTrigger className="h-8 text-sm w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {dispatchers.map((dispatcher) => (
                            <SelectItem key={dispatcher.id} value={dispatcher.id}>
                              {dispatcher.first_name} {dispatcher.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {(vehicle.secondary_dispatcher_ids || []).map((dispatcherId: string) => (
                          <Badge 
                            key={dispatcherId} 
                            className="bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 text-xs px-2 py-0.5"
                          >
                            {getDispatcherName(dispatcherId)}
                            <button
                              onClick={() => handleRemoveSecondaryDispatcher(vehicle.id, dispatcherId)}
                              className="ml-1 hover:bg-blue-800 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <Popover 
                          open={openPopoverId === vehicle.id} 
                          onOpenChange={(open) => setOpenPopoverId(open ? vehicle.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button 
                              size="sm" 
                              className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                            >
                              ADD NEW
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {getAvailableSecondaryDispatchers(vehicle).length === 0 ? (
                                <p className="text-sm text-muted-foreground p-2">No dispatchers available</p>
                              ) : (
                                getAvailableSecondaryDispatchers(vehicle).map((dispatcher) => (
                                  <Button
                                    key={dispatcher.id}
                                    variant="ghost"
                                    className="w-full justify-start text-sm h-8"
                                    onClick={() => handleAddSecondaryDispatcher(vehicle.id, dispatcher.id)}
                                  >
                                    {dispatcher.first_name} {dispatcher.last_name}
                                  </Button>
                                ))
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center mt-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="h-7 text-xs bg-blue-600 text-white hover:bg-blue-700">
              1
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
