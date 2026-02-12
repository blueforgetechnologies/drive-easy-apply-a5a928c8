import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "@/hooks/useTenantQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, Package, MapPin, DollarSign, Search, RefreshCw, Building2, Eye, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type DashboardType = "carrier" | "dispatcher";

interface Carrier {
  id: string;
  name: string;
  status: string | null;
}

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  status: string | null;
  pay_percentage: number | null;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  asset_type: string;
  carrier: string;
  requires_load_approval: boolean | null;
  truck_type: string | null;
  contractor_percentage: number | null;
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
  assigned_dispatcher_id: string | null;
  carrier_id: string | null;
  broker_name: string | null;
  customer_id: string | null;
  customers?: { name: string } | null;
  carrier_approved: boolean | null;
  carrier_rate: number | null;
}

export default function CarrierDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const carrierFromUrl = searchParams.get("carrier");
  const dispatcherFromUrl = searchParams.get("dispatcher");
  const dashboardFromUrl = searchParams.get("dashboard") as DashboardType | null;
  
  const { query, tenantId, isReady } = useTenantQuery();
  const [dashboardType, setDashboardType] = useState<DashboardType>(dashboardFromUrl || (dispatcherFromUrl ? "dispatcher" : "carrier"));
  const [loading, setLoading] = useState(true);
  
  // Carrier state
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState<string>(carrierFromUrl || "all");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierStatusFilter, setCarrierStatusFilter] = useState<string[]>(["active"]);
  
  // Dispatcher state
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [selectedDispatcher, setSelectedDispatcher] = useState<string>(dispatcherFromUrl || "all");
  const [dispatcherSearch, setDispatcherSearch] = useState("");
  const [dispatcherStatusFilter, setDispatcherStatusFilter] = useState<string[]>(["active"]);
  
  // Common state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!isReady) return;
    loadCarriers();
    loadDispatchers();
  }, [isReady, tenantId]);

  useEffect(() => {
    if (!isReady) return;
    if (dashboardType === "carrier" && carriers.length > 0) {
      loadCarrierData();
    } else if (dashboardType === "dispatcher" && dispatchers.length > 0) {
      loadDispatcherData();
    }
  }, [selectedCarrier, selectedDispatcher, carriers, dispatchers, dashboardType, isReady, tenantId]);

  const handleDashboardSwitch = (type: DashboardType) => {
    setDashboardType(type);
    setLoads([]);
    setVehicles([]);
    const next = new URLSearchParams(searchParams);
    next.set("dashboard", type);
    next.delete("carrier");
    next.delete("dispatcher");
    if (type === "carrier" && selectedCarrier !== "all") {
      next.set("carrier", selectedCarrier);
    } else if (type === "dispatcher" && selectedDispatcher !== "all") {
      next.set("dispatcher", selectedDispatcher);
    }
    setSearchParams(next);
  };

  const handleCarrierSelect = (carrierId: string) => {
    setSelectedCarrier(carrierId);
    setCarrierSearch("");
    const next = new URLSearchParams(searchParams);
    next.set("dashboard", "carrier");
    if (carrierId === "all") {
      next.delete("carrier");
    } else {
      next.set("carrier", carrierId);
    }
    setSearchParams(next);
  };

  const handleDispatcherSelect = (dispatcherId: string) => {
    setSelectedDispatcher(dispatcherId);
    setDispatcherSearch("");
    const next = new URLSearchParams(searchParams);
    next.set("dashboard", "dispatcher");
    if (dispatcherId === "all") {
      next.delete("dispatcher");
    } else {
      next.set("dispatcher", dispatcherId);
    }
    setSearchParams(next);
  };

  const loadCarriers = async () => {
    if (!isReady) return;
    try {
      const { data, error } = await query("carriers")
        .select("id, name, status")
        .order("name");

      if (error) throw error;
      setCarriers((data as unknown as Carrier[]) || []);
    } catch (error) {
      console.error("Error loading carriers:", error);
    }
  };

  const loadDispatchers = async () => {
    if (!isReady) return;
    try {
      const { data, error } = await query("dispatchers")
        .select("id, first_name, last_name, status, pay_percentage")
        .order("first_name");

      if (error) throw error;
      setDispatchers((data as unknown as Dispatcher[]) || []);
    } catch (error) {
      console.error("Error loading dispatchers:", error);
    }
  };

  const loadCarrierData = async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      // Load vehicles for selected carrier(s) - tenant scoped
      let vehicleQuery = query("vehicles")
        .select("id, vehicle_number, asset_type, carrier, requires_load_approval, truck_type, contractor_percentage")
        .eq("status", "active");

      if (selectedCarrier !== "all") {
        vehicleQuery = vehicleQuery.eq("carrier", selectedCarrier);
      }

      const { data: vehicleData, error: vehicleError } = await vehicleQuery;
      if (vehicleError) throw vehicleError;

      const typedVehicleData = (vehicleData as unknown as Vehicle[]) || [];
      setVehicles(typedVehicleData);

      // Get vehicle IDs
      const vehicleIds = typedVehicleData.map(v => v.id);

      if (vehicleIds.length === 0) {
        setLoads([]);
        setLoading(false);
        return;
      }

      // Load loads assigned to these vehicles - tenant scoped
      const { data: loadData, error: loadError } = await query("loads")
        .select("id, load_number, status, rate, pickup_city, pickup_state, pickup_date, delivery_city, delivery_state, delivery_date, assigned_vehicle_id, assigned_dispatcher_id, carrier_id, broker_name, customer_id, carrier_approved, carrier_rate, customers(name)")
        .in("assigned_vehicle_id", vehicleIds)
        .order("pickup_date", { ascending: false });

      if (loadError) throw loadError;
      
      const typedLoadData = (loadData as unknown as Load[]) || [];
      
      // Filter out loads that require approval but haven't been approved yet
      const vehiclesRequiringApproval = typedVehicleData
        .filter(v => v.requires_load_approval)
        .map(v => v.id);
      
      const filteredLoadData = typedLoadData.filter(load => {
        // If vehicle requires approval, only show if carrier_approved is true
        if (vehiclesRequiringApproval.includes(load.assigned_vehicle_id || '')) {
          return load.carrier_approved === true;
        }
        return true;
      });
      
      setLoads(filteredLoadData);
    } catch (error) {
      console.error("Error loading carrier data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDispatcherData = async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      // Load loads for selected dispatcher(s) - tenant scoped
      let loadQuery = query("loads")
        .select("id, load_number, status, rate, pickup_city, pickup_state, pickup_date, delivery_city, delivery_state, delivery_date, assigned_vehicle_id, assigned_dispatcher_id, carrier_id, broker_name, customer_id, carrier_approved, carrier_rate, customers(name)")
        .order("pickup_date", { ascending: false });

      if (selectedDispatcher !== "all") {
        loadQuery = loadQuery.eq("assigned_dispatcher_id", selectedDispatcher);
      } else {
        // Get all dispatcher IDs that match the filter
        const dispatcherIds = dispatchers.map(d => d.id);
        if (dispatcherIds.length > 0) {
          loadQuery = loadQuery.in("assigned_dispatcher_id", dispatcherIds);
        }
      }

      const { data: loadData, error: loadError } = await loadQuery;
      if (loadError) throw loadError;

      setLoads((loadData as unknown as Load[]) || []);

      // Get unique vehicle IDs from loads
      const vehicleIds = [...new Set((loadData as unknown as Load[] || []).map(l => l.assigned_vehicle_id).filter(Boolean))] as string[];
      
      if (vehicleIds.length > 0) {
        const { data: vehicleData, error: vehicleError } = await query("vehicles")
          .select("id, vehicle_number, asset_type, carrier, requires_load_approval, truck_type, contractor_percentage")
          .in("id", vehicleIds);

        if (vehicleError) throw vehicleError;
        setVehicles((vehicleData as unknown as Vehicle[]) || []);
      } else {
        setVehicles([]);
      }
    } catch (error) {
      console.error("Error loading dispatcher data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleNumber = (vehicleId: string | null) => {
    if (!vehicleId) return "Unassigned";
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? vehicle.vehicle_number : "Unknown";
  };

  // Calculate carrier pay based on truck type
  // "My Truck" gets 100% of rate, "Contractor Truck" uses carrier_rate or percentage
  const getCarrierPay = (load: Load): number | null => {
    const rate = load.rate;
    if (!rate) return null;
    
    const vehicle = vehicles.find(v => v.id === load.assigned_vehicle_id);
    const truckType = vehicle?.truck_type;
    const isMyTruck = truckType === 'my_truck' || !truckType;
    
    // "My Truck" always gets 100% of the rate
    if (isMyTruck) {
      return rate;
    }
    
    // "Contractor Truck" uses stored carrier_rate or calculates from percentage
    if (load.carrier_rate) {
      return load.carrier_rate;
    }
    
    const contractorPercentage = vehicle?.contractor_percentage || 0;
    return contractorPercentage > 0 ? rate * (contractorPercentage / 100) : rate;
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

  // Filter dispatchers for sidebar
  const filteredDispatchers = dispatchers
    .filter(dispatcher => {
      const fullName = `${dispatcher.first_name} ${dispatcher.last_name}`.toLowerCase();
      return dispatcherStatusFilter.length > 0 && 
        dispatcherStatusFilter.includes(dispatcher.status || "") &&
        (dispatcherSearch === "" || fullName.startsWith(dispatcherSearch.toLowerCase()));
    })
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  // Calculate stats
  const totalLoads = filteredLoads.length;
  const activeLoads = filteredLoads.filter(l => ['in_transit', 'in transit', 'dispatched', 'assigned'].includes(l.status?.toLowerCase() || '')).length;
  const totalRevenue = filteredLoads.reduce((sum, load) => sum + (getCarrierPay(load) ?? 0), 0);

  const selectedCarrierName = carriers.find(c => c.id === selectedCarrier)?.name || "All Carriers";
  const selectedDispatcherObj = dispatchers.find(d => d.id === selectedDispatcher);
  const selectedDispatcherName = selectedDispatcherObj 
    ? `${selectedDispatcherObj.first_name} ${selectedDispatcherObj.last_name}` 
    : "All Dispatchers";

  // Calculate dispatcher pay for a load
  const getDispatcherPay = (load: Load) => {
    if (!load.rate) return null;
    // If viewing a specific dispatcher, use their pay percentage
    if (selectedDispatcherObj?.pay_percentage) {
      return load.rate * (selectedDispatcherObj.pay_percentage / 100);
    }
    // If viewing all dispatchers, try to find the dispatcher for this load
    const dispatcher = dispatchers.find(d => d.id === load.assigned_dispatcher_id);
    if (dispatcher?.pay_percentage) {
      return load.rate * (dispatcher.pay_percentage / 100);
    }
    return null;
  };

  // Calculate total dispatcher pay net
  const totalDispatcherPayNet = dashboardType === "dispatcher" 
    ? filteredLoads.reduce((sum, load) => sum + (getDispatcherPay(load) || 0), 0)
    : 0;

  const handleRefresh = () => {
    if (dashboardType === "carrier") {
      loadCarrierData();
    } else {
      loadDispatcherData();
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Dashboard Toggle Tabs */}
      <div className="border-b bg-card px-4 py-2 flex-shrink-0">
        <div className="flex gap-1">
          <Button
            variant={dashboardType === "carrier" ? "default" : "outline"}
            size="sm"
            onClick={() => handleDashboardSwitch("carrier")}
            className={cn(
              "gap-2 rounded-r-none",
              dashboardType === "carrier" ? "btn-glossy-primary text-white" : "btn-glossy"
            )}
          >
            <Building2 className="h-4 w-4" />
            Carrier's Dashboard
          </Button>
          <Button
            variant={dashboardType === "dispatcher" ? "default" : "outline"}
            size="sm"
            onClick={() => handleDashboardSwitch("dispatcher")}
            className={cn(
              "gap-2 rounded-l-none",
              dashboardType === "dispatcher" ? "btn-glossy-primary text-white" : "btn-glossy"
            )}
          >
            <Users className="h-4 w-4" />
            Dispatcher's Dashboard
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Carrier/Dispatcher Navigation */}
        <div className="w-[190px] border-r bg-card flex-shrink-0 flex flex-col">
          {dashboardType === "carrier" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="pl-3 pr-4 py-3 border-b space-y-2">
                <button
                  onClick={() => handleDispatcherSelect("all")}
                  className={cn(
                    "w-full h-9 text-sm font-bold rounded-md transition-all duration-200",
                    selectedDispatcher === "all"
                      ? "btn-glossy-primary text-white"
                      : "btn-glossy text-muted-foreground"
                  )}
                >
                  All Dispatchers
                </button>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Type to search..."
                    value={dispatcherSearch}
                    onChange={(e) => setDispatcherSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <div className="flex w-full mt-2">
                  <button
                    onClick={() => setDispatcherStatusFilter(prev => 
                      prev.includes("active") 
                        ? prev.filter(s => s !== "active")
                        : [...prev, "active"]
                    )}
                    className={cn(
                      "flex-1 h-8 text-sm font-medium rounded-l-md transition-all duration-200",
                      dispatcherStatusFilter.includes("active") 
                        ? "btn-glossy-primary text-white" 
                        : "btn-glossy text-muted-foreground"
                    )}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setDispatcherStatusFilter(prev => 
                      prev.includes("inactive") 
                        ? prev.filter(s => s !== "inactive")
                        : [...prev, "inactive"]
                    )}
                    className={cn(
                      "flex-1 h-8 text-sm font-medium rounded-r-md transition-all duration-200",
                      dispatcherStatusFilter.includes("inactive") 
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
                    {filteredDispatchers.map((dispatcher, idx, arr) => {
                      const isFirst = idx === 0;
                      const isLast = idx === arr.length - 1;
                      const fullName = `${dispatcher.first_name} ${dispatcher.last_name}`;
                      return (
                        <button
                          key={dispatcher.id}
                          onClick={() => handleDispatcherSelect(dispatcher.id)}
                          className={cn(
                            "w-[150px] h-7 text-left px-3 text-xs font-medium transition-all border-x border-t",
                            isLast && "border-b",
                            isFirst && "rounded-t-md",
                            isLast && "rounded-b-md",
                            selectedDispatcher === dispatcher.id
                              ? "btn-glossy-primary text-white border-primary/30"
                              : "btn-glossy text-gray-700 border-gray-300/50"
                          )}
                        >
                          <div className="truncate">{fullName}</div>
                        </button>
                      );
                    })}
                    {filteredDispatchers.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No dispatchers found</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          {/* Header */}
          <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-4 flex-shrink-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center text-white",
                  dashboardType === "carrier" 
                    ? "bg-gradient-to-br from-indigo-500 to-purple-600" 
                    : "bg-gradient-to-br from-teal-500 to-cyan-600"
                )}>
                  {dashboardType === "carrier" ? <Building2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </div>
                <div>
                  <h1 className="font-bold text-xl">
                    {dashboardType === "carrier" ? "Carrier's Dashboard" : "Dispatcher's Dashboard"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {dashboardType === "carrier" 
                      ? (selectedCarrier === "all" ? "All Carriers" : selectedCarrierName)
                      : (selectedDispatcher === "all" ? "All Dispatchers" : selectedDispatcherName)
                    }
                  </p>
                </div>
              </div>

              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
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
                      <p className="text-sm text-muted-foreground">
                        {dashboardType === "dispatcher" ? "Dispatcher Pay Net" : "Total Revenue"}
                      </p>
                      <p className="text-2xl font-bold">
                        ${dashboardType === "dispatcher" 
                          ? totalDispatcherPayNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : totalRevenue.toLocaleString()
                        }
                      </p>
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
                    <p>No loads found for the selected {dashboardType}</p>
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
                          <TableHead className="text-right">
                            {dashboardType === "dispatcher" ? "Dispatch Pay" : "Rate"}
                          </TableHead>
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
                            <TableCell className="text-sm">{load.broker_name || load.customers?.name || '-'}</TableCell>
                            <TableCell className="text-right font-medium">
                              {dashboardType === "dispatcher" 
                                ? (getDispatcherPay(load) ? `$${getDispatcherPay(load)!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-')
                                : (getCarrierPay(load) ? `$${getCarrierPay(load)!.toLocaleString()}` : '-')
                              }
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
    </div>
  );
}
