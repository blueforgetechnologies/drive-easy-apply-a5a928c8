import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VehicleAssignmentViewProps {
  vehicles: any[];
  drivers: any[];
  onBack: () => void;
}

export function VehicleAssignmentView({ vehicles, drivers, onBack }: VehicleAssignmentViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "unassigned" | "active" | "inactive">("all");
  const [selectedCarrier, setSelectedCarrier] = useState<string>("all");
  const [carriers, setCarriers] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);

  useEffect(() => {
    loadCarriers();
    loadDispatchers();
  }, []);

  const loadCarriers = async () => {
    try {
      const { data, error } = await supabase
        .from("carriers")
        .select("id, name")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      setCarriers(data || []);
    } catch (error) {
      console.error("Failed to load carriers", error);
    }
  };

  const loadDispatchers = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatchers")
        .select("*")
        .eq("status", "active")
        .order("first_name");

      if (error) throw error;
      setDispatchers(data || []);
    } catch (error) {
      console.error("Failed to load dispatchers", error);
    }
  };

  // Filter vehicles based on search and filters
  const filteredVehicles = vehicles.filter((vehicle) => {
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
  const allCount = vehicles.length;
  const unassignedCount = vehicles.filter(v => !v.assigned_driver_id && !v.primary_dispatcher_id).length;
  const activeCount = vehicles.filter(v => v.status === "active").length;
  const inactiveCount = vehicles.filter(v => v.status === "inactive").length;

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

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <Card className="flex-1 flex flex-col m-4">
        <CardContent className="p-4 flex-1 flex flex-col">
          {/* Search and Filters */}
          <div className="flex items-center gap-4 mb-4 pb-4 border-b">
            <Input
              placeholder="Search by Truck or Rental/Unit number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />

            <div className="flex gap-2">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("all")}
              >
                View All <span className="ml-1 font-bold">{allCount}</span>
              </Button>

              <Button
                variant={filterType === "unassigned" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("unassigned")}
              >
                View Unassigned <span className="ml-1 font-bold">{unassignedCount}</span>
              </Button>

              <Button
                variant={filterType === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("active")}
                className={filterType === "active" ? "bg-green-600 hover:bg-green-700" : ""}
              >
                Active units <span className="ml-1 font-bold">{activeCount}</span>
              </Button>

              <Button
                variant={filterType === "inactive" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("inactive")}
                className={filterType === "inactive" ? "bg-gray-600 hover:bg-gray-700" : ""}
              >
                Inactive <span className="ml-1 font-bold">{inactiveCount}</span>
              </Button>
            </div>

            <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
              <SelectTrigger className="w-64">
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
                <TableRow>
                  <TableHead className="font-bold">Unit ID</TableHead>
                  <TableHead className="font-bold">Drivers</TableHead>
                  <TableHead className="font-bold">Carrier</TableHead>
                  <TableHead className="font-bold">Primary Dispatcher</TableHead>
                  <TableHead className="font-bold">Dispatchers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-semibold">
                      {vehicle.vehicle_number || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
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
                    <TableCell>
                      {vehicle.carrier || "—"}
                    </TableCell>
                    <TableCell>
                      {getDispatcherName(vehicle.primary_dispatcher_id) || "—"}
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold"
                        onClick={() => {
                          toast.info("Dispatcher assignment feature coming soon");
                        }}
                      >
                        ADD NEW
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center mt-4 pt-4 border-t">
            <Button variant="outline" size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
              1
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
