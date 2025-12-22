import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, Package, MapPin, DollarSign, Search, RefreshCw, Building2, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Carrier {
  id: string;
  name: string;
  status: string | null;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  asset_type: string;
  carrier: string;
}

interface Load {
  id: string;
  load_number: string;
  status: string;
  rate: number | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_date: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_date: string | null;
  assigned_vehicle_id: string | null;
  carrier_id: string | null;
  broker_name: string | null;
}

export default function CarrierDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const carrierFromUrl = searchParams.get("carrier");
  const [loading, setLoading] = useState(true);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState<string>(carrierFromUrl || "all");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierStatusFilter, setCarrierStatusFilter] = useState<string[]>(["active"]);

  useEffect(() => {
    loadCarriers();
  }, []);

  useEffect(() => {
    if (carriers.length > 0) {
      loadVehiclesAndLoads();
    }
  }, [selectedCarrier, carriers]);

  const handleCarrierSelect = (carrierId: string) => {
    setSelectedCarrier(carrierId);
    setCarrierSearch("");
    if (carrierId === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ carrier: carrierId });
    }
  };

  const loadCarriers = async () => {
    try {
      const { data, error } = await supabase
        .from("carriers")
        .select("id, name, status")
        .order("name");

      if (error) throw error;
      setCarriers(data || []);
    } catch (error) {
      console.error("Error loading carriers:", error);
    }
  };

  const loadVehiclesAndLoads = async () => {
    setLoading(true);
    try {
      // Load vehicles for selected carrier(s)
      let vehicleQuery = supabase
        .from("vehicles")
        .select("id, vehicle_number, asset_type, carrier")
        .eq("status", "active");

      if (selectedCarrier !== "all") {
        vehicleQuery = vehicleQuery.eq("carrier", selectedCarrier);
      }

      const { data: vehicleData, error: vehicleError } = await vehicleQuery;
      if (vehicleError) throw vehicleError;

      setVehicles(vehicleData || []);

      // Get vehicle IDs
      const vehicleIds = (vehicleData || []).map(v => v.id);

      if (vehicleIds.length === 0) {
        setLoads([]);
        setLoading(false);
        return;
      }

      // Load loads assigned to these vehicles
      const { data: loadData, error: loadError } = await supabase
        .from("loads")
        .select("id, load_number, status, rate, pickup_city, pickup_state, pickup_date, delivery_city, delivery_state, delivery_date, assigned_vehicle_id, carrier_id, broker_name")
        .in("assigned_vehicle_id", vehicleIds)
        .order("pickup_date", { ascending: false });

      if (loadError) throw loadError;
      setLoads(loadData || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleNumber = (vehicleId: string | null) => {
    if (!vehicleId) return "Unassigned";
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.asset_type || 'TAL'}-${vehicle.vehicle_number}` : "Unknown";
  };

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'delivered':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'in_transit':
      case 'in transit':
        return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case 'dispatched':
      case 'assigned':
        return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'pending':
        return 'bg-slate-500/10 text-slate-600 border-slate-200';
      case 'cancelled':
        return 'bg-red-500/10 text-red-600 border-red-200';
      default:
        return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  const filteredLoads = loads.filter(load => {
    const matchesSearch = searchQuery === "" || 
      load.load_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      load.pickup_city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      load.delivery_city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      load.broker_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || load.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Filter carriers for sidebar
  const filteredCarriers = carriers
    .filter(carrier => 
      carrierStatusFilter.length > 0 && 
      carrierStatusFilter.includes(carrier.status || "") &&
      (carrierSearch === "" || carrier.name.toLowerCase().startsWith(carrierSearch.toLowerCase()))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Calculate stats
  const totalLoads = filteredLoads.length;
  const activeLoads = filteredLoads.filter(l => ['in_transit', 'in transit', 'dispatched', 'assigned'].includes(l.status?.toLowerCase() || '')).length;
  const totalRevenue = filteredLoads.reduce((sum, load) => sum + (load.rate || 0), 0);

  const selectedCarrierName = carriers.find(c => c.id === selectedCarrier)?.name || "All Carriers";

  return (
    <div className="h-[calc(100vh-80px)] flex">
      {/* Left Sidebar - Carrier Navigation */}
      <div className="w-[190px] border-r bg-card flex-shrink-0 flex flex-col">
        <div className="pl-3 pr-4 py-3 border-b space-y-2">
          <button
            onClick={() => handleCarrierSelect("all")}
            className={cn(
              "w-full h-9 text-sm font-bold rounded-md transition-all duration-200",
              selectedCarrier === "all"
                ? "btn-glossy-primary text-white"
                : "btn-glossy text-muted-foreground"
            )}
          >
            All Carriers
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type to search..."
              value={carrierSearch}
              onChange={(e) => setCarrierSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex w-full mt-2">
            <button
              onClick={() => setCarrierStatusFilter(prev => 
                prev.includes("active") 
                  ? prev.filter(s => s !== "active")
                  : [...prev, "active"]
              )}
              className={cn(
                "flex-1 h-8 text-sm font-medium rounded-l-md transition-all duration-200",
                carrierStatusFilter.includes("active") 
                  ? "btn-glossy-primary text-white" 
                  : "btn-glossy text-muted-foreground"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setCarrierStatusFilter(prev => 
                prev.includes("inactive") 
                  ? prev.filter(s => s !== "inactive")
                  : [...prev, "inactive"]
              )}
              className={cn(
                "flex-1 h-8 text-sm font-medium rounded-r-md transition-all duration-200",
                carrierStatusFilter.includes("inactive") 
                  ? "btn-glossy-primary text-white" 
                  : "btn-glossy text-muted-foreground"
              )}
            >
              Inactive
            </button>
          </div>
        </div>
        <div className="pl-3 pr-4 py-3 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col w-[70%]">
              {filteredCarriers.map((carrier, idx, arr) => {
                const isFirst = idx === 0;
                const isLast = idx === arr.length - 1;
                return (
                  <button
                    key={carrier.id}
                    onClick={() => handleCarrierSelect(carrier.id)}
                    className={cn(
                      "w-[150px] h-7 text-left px-3 text-xs font-medium transition-all border-x border-t",
                      isLast && "border-b",
                      isFirst && "rounded-t-md",
                      isLast && "rounded-b-md",
                      selectedCarrier === carrier.id
                        ? "btn-glossy-primary text-white border-primary/30"
                        : "btn-glossy text-gray-700 border-gray-300/50"
                    )}
                  >
                    <div className="truncate">{carrier.name}</div>
                  </button>
                );
              })}
              {filteredCarriers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No carriers found</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        {/* Header */}
        <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-bold text-xl">Carrier's Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  {selectedCarrier === "all" ? "All Carriers" : selectedCarrierName}
                </p>
              </div>
            </div>

            <Button variant="outline" size="icon" onClick={loadVehiclesAndLoads} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 py-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicles</p>
                    <p className="text-2xl font-bold">{vehicles.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Loads</p>
                    <p className="text-2xl font-bold">{totalLoads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active</p>
                    <p className="text-2xl font-bold">{activeLoads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by load #, city, or broker..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Loads Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Assigned Loads ({filteredLoads.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLoads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No loads found for the selected carrier</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load #</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pickup</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Broker</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLoads.map((load) => (
                        <TableRow key={load.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{load.load_number}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {getVehicleNumber(load.assigned_vehicle_id)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(load.status)}>
                              {load.status || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {load.pickup_city}{load.pickup_state ? `, ${load.pickup_state}` : ''}
                              </span>
                              {load.pickup_date && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(load.pickup_date), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {load.delivery_city}{load.delivery_state ? `, ${load.delivery_state}` : ''}
                              </span>
                              {load.delivery_date && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(load.delivery_date), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{load.broker_name || '-'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {load.rate ? `$${load.rate.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => navigate(`/dashboard/load/${load.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
