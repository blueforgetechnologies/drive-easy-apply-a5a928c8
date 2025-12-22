import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, DollarSign, Search, Check, ArrowLeft, Calendar, Building2 } from "lucide-react";
import { format, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface Carrier {
  id: string;
  name: string;
  status: string | null;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  carrier: string | null;
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
  estimated_miles: number | null;
  empty_miles: number | null;
  broker_name: string | null;
  customer?: { name: string | null };
  vehicle?: { vehicle_number: string | null };
  driver?: { personal_info: any };
  dispatcher?: { first_name: string | null; last_name: string | null };
}

interface ApprovalLoad extends Load {
  carrier_pay?: number;
  carrier_rate_per_mile?: number;
  approved?: boolean;
}

export default function LoadApprovalTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Carrier state
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState<string>("all");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierStatusFilter, setCarrierStatusFilter] = useState<string[]>(["active"]);
  
  // Vehicle state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  
  // Load state
  const [loads, setLoads] = useState<ApprovalLoad[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 3;
  
  // Approval rates - editable per load
  const [carrierRates, setCarrierRates] = useState<Record<string, number>>({});

  useEffect(() => {
    loadCarriers();
  }, []);

  useEffect(() => {
    if (carriers.length > 0) {
      loadData();
    }
  }, [selectedCarrier, selectedVehicle, carriers]);

  const loadCarriers = async () => {
    const { data } = await supabase
      .from("carriers")
      .select("id, name, status")
      .order("name");
    setCarriers(data || []);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Get carrier name for filtering
      const selectedCarrierName = selectedCarrier !== "all" 
        ? carriers.find(c => c.id === selectedCarrier)?.name 
        : null;
      
      // Load vehicles for selected carrier
      let vehicleQuery = supabase
        .from("vehicles")
        .select("id, vehicle_number, carrier")
        .eq("status", "active");
      
      if (selectedCarrierName) {
        vehicleQuery = vehicleQuery.eq("carrier", selectedCarrierName);
      }
      
      const { data: vehicleData } = await vehicleQuery.order("vehicle_number");
      setVehicles((vehicleData as Vehicle[]) || []);
      // Load loads for the past 3 weeks with status ready for approval
      const threeWeeksAgo = subWeeks(new Date(), 3);
      
      let loadQuery = supabase
        .from("loads")
        .select(`
          *,
          customer:customers!customer_id(name),
          vehicle:vehicles!assigned_vehicle_id(vehicle_number),
          driver:applications!assigned_driver_id(personal_info),
          dispatcher:dispatchers!assigned_dispatcher_id(first_name, last_name)
        `)
        .in("status", ["delivered", "completed", "closed"])
        .gte("pickup_date", format(threeWeeksAgo, "yyyy-MM-dd"));
      
      if (selectedCarrier !== "all") {
        loadQuery = loadQuery.eq("carrier_id", selectedCarrier);
      }
      
      if (selectedVehicle !== "all") {
        loadQuery = loadQuery.eq("assigned_vehicle_id", selectedVehicle);
      }
      
      const { data: loadData } = await loadQuery.order("pickup_date", { ascending: false });
      setLoads((loadData as ApprovalLoad[]) || []);
    } finally {
      setLoading(false);
    }
  };

  // Filter carriers by search and status
  const filteredCarriers = useMemo(() => {
    return carriers.filter(carrier => {
      const matchesSearch = carrier.name.toLowerCase().includes(carrierSearch.toLowerCase());
      const matchesStatus = carrierStatusFilter.length === 0 || 
        carrierStatusFilter.includes(carrier.status || "active");
      return matchesSearch && matchesStatus;
    });
  }, [carriers, carrierSearch, carrierStatusFilter]);

  // Get 3 weeks calendar data
  const threeWeeksRange = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, []);

  // Group loads by date
  const loadsByDate = useMemo(() => {
    const grouped: Record<string, ApprovalLoad[]> = {};
    loads.forEach(load => {
      if (load.pickup_date) {
        const dateKey = format(new Date(load.pickup_date), "yyyy-MM-dd");
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(load);
      }
    });
    return grouped;
  }, [loads]);

  // Paginated loads for top table
  const paginatedLoads = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return loads.slice(start, start + ROWS_PER_PAGE);
  }, [loads, currentPage]);

  const totalPages = Math.ceil(loads.length / ROWS_PER_PAGE);

  // Calculate carrier pay based on entered rate
  const calculateCarrierPay = (load: ApprovalLoad) => {
    const rate = carrierRates[load.id] || load.rate || 0;
    const totalMiles = (load.estimated_miles || 0) + (load.empty_miles || 0);
    return rate > 0 ? rate : 0;
  };

  const calculateRatePerMile = (load: ApprovalLoad) => {
    const carrierPay = calculateCarrierPay(load);
    const loadedMiles = load.estimated_miles || 0;
    return loadedMiles > 0 ? carrierPay / loadedMiles : 0;
  };

  const handleRateChange = (loadId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setCarrierRates(prev => ({ ...prev, [loadId]: numValue }));
  };

  const handleApprove = async (load: ApprovalLoad) => {
    const carrierPay = carrierRates[load.id] || load.rate || 0;
    
    try {
      // Update the load with approved carrier pay
      const { error } = await supabase
        .from("loads")
        .update({
          rate: carrierPay,
          settlement_status: "approved"
        })
        .eq("id", load.id);

      if (error) throw error;
      
      toast.success(`Load ${load.load_number} approved with carrier pay $${carrierPay.toLocaleString()}`);
      loadData();
    } catch (error) {
      console.error("Error approving load:", error);
      toast.error("Failed to approve load");
    }
  };

  const handleCarrierSelect = (carrierId: string) => {
    setSelectedCarrier(carrierId);
    setSelectedVehicle("all");
  };

  const toggleCarrierStatus = (status: string) => {
    setCarrierStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
  };

  const selectedCarrierName = carriers.find(c => c.id === selectedCarrier)?.name || "All Carriers";

  // Calculate weekly totals
  const calculateWeeklyTotal = (weekStart: Date) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    let total = 0;
    
    threeWeeksRange.forEach(date => {
      if (date >= weekStart && date <= weekEnd) {
        const dateKey = format(date, "yyyy-MM-dd");
        const dayLoads = loadsByDate[dateKey] || [];
        dayLoads.forEach(load => {
          total += carrierRates[load.id] || load.rate || 0;
        });
      }
    });
    
    return total;
  };

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* Left Sidebar - Carrier Navigation */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3 border-r pr-4">
        <Button 
          variant="ghost" 
          className="justify-start gap-2 text-muted-foreground"
          onClick={() => navigate("/dashboard/loads")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Loads
        </Button>

        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Carriers</h3>
        </div>

        <Button
          variant={selectedCarrier === "all" ? "default" : "ghost"}
          className="justify-start w-full"
          onClick={() => handleCarrierSelect("all")}
        >
          All Carriers
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search carriers..."
            value={carrierSearch}
            onChange={(e) => setCarrierSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant={carrierStatusFilter.includes("active") ? "default" : "outline"}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => toggleCarrierStatus("active")}
          >
            Active
          </Button>
          <Button
            variant={carrierStatusFilter.includes("inactive") ? "default" : "outline"}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => toggleCarrierStatus("inactive")}
          >
            Inactive
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 pr-2">
            {filteredCarriers.map(carrier => (
              <Button
                key={carrier.id}
                variant={selectedCarrier === carrier.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-left h-auto py-2 px-3",
                  selectedCarrier === carrier.id && "bg-primary/10 border-l-2 border-primary"
                )}
                onClick={() => handleCarrierSelect(carrier.id)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium text-sm truncate w-full">{carrier.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{carrier.status}</span>
                </div>
              </Button>
            ))}
          </div>
        </ScrollArea>

        {/* Vehicle filter when carrier selected */}
        {selectedCarrier !== "all" && vehicles.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Trucks</span>
            </div>
            <Button
              variant={selectedVehicle === "all" ? "default" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() => setSelectedVehicle("all")}
            >
              All Trucks
            </Button>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {vehicles.map(v => (
                  <Button
                    key={v.id}
                    variant={selectedVehicle === v.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setSelectedVehicle(v.id)}
                  >
                    {v.vehicle_number}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Load Approval</h2>
          <Badge variant="outline" className="text-sm">
            {selectedCarrierName}
          </Badge>
        </div>

        {/* Top Table - Ready for Audit Loads */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Truck ID<br/><span className="text-muted-foreground">Driver</span></TableHead>
                    <TableHead className="text-xs">Carrier<br/><span className="text-muted-foreground">Customer</span></TableHead>
                    <TableHead className="text-xs">Our Load ID<br/><span className="text-muted-foreground">Customer Load</span></TableHead>
                    <TableHead className="text-xs">Origin<br/><span className="text-muted-foreground">Destination</span></TableHead>
                    <TableHead className="text-xs">Pickup<br/><span className="text-muted-foreground">Delivery</span></TableHead>
                    <TableHead className="text-xs text-right">Empty Miles<br/><span className="text-muted-foreground">Loaded Miles</span></TableHead>
                    <TableHead className="text-xs text-right">$/Mile</TableHead>
                    <TableHead className="text-xs text-right">Payload</TableHead>
                    <TableHead className="text-xs text-right">Carrier Pay</TableHead>
                    <TableHead className="text-xs text-right">$/Mile</TableHead>
                    <TableHead className="text-xs">Dispatcher</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : paginatedLoads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        No loads ready for approval
                      </TableCell>
                    </TableRow>
                  ) : paginatedLoads.map(load => {
                    const totalMiles = (load.estimated_miles || 0) + (load.empty_miles || 0);
                    const ratePerMile = totalMiles > 0 ? (load.rate || 0) / totalMiles : 0;
                    const carrierPay = carrierRates[load.id] ?? load.rate ?? 0;
                    const carrierRatePerMile = (load.estimated_miles || 0) > 0 ? carrierPay / (load.estimated_miles || 1) : 0;
                    const driverName = load.driver?.personal_info?.first_name 
                      ? `${load.driver.personal_info.first_name} ${load.driver.personal_info.last_name || ""}`
                      : "-";

                    return (
                      <TableRow key={load.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
                          >
                            Ready for audit
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{load.vehicle?.vehicle_number || "-"}</div>
                          <div className="text-muted-foreground">{driverName}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{load.broker_name || "-"}</div>
                          <div className="text-muted-foreground">{load.customer?.name || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{load.load_number}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{load.pickup_city}, {load.pickup_state}</div>
                          <div className="text-muted-foreground">{load.delivery_city}, {load.delivery_state}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yy") : "-"}</div>
                          <div className="text-muted-foreground">{load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yy") : "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <div>{load.empty_miles || 0}</div>
                          <div className="text-muted-foreground">{load.estimated_miles || 0}</div>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          ${ratePerMile.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          ${(load.rate || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={carrierRates[load.id] ?? load.rate ?? ""}
                            onChange={(e) => handleRateChange(load.id, e.target.value)}
                            className="w-24 h-7 text-xs text-right text-green-600 font-medium"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          ${carrierRatePerMile.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {load.dispatcher 
                            ? `${load.dispatcher.first_name || ""} ${load.dispatcher.last_name || ""}`
                            : "-"
                          }
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                            onClick={() => handleApprove(load)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t">
                <span className="text-sm text-muted-foreground">
                  Items per page: {ROWS_PER_PAGE}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {(currentPage - 1) * ROWS_PER_PAGE + 1} – {Math.min(currentPage * ROWS_PER_PAGE, loads.length)} of {loads.length}
                  </span>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calendar View - 3 Weeks of Loads */}
        <Card className="flex-1 min-h-0">
          <CardContent className="p-4 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{selectedCarrierName} - 3 Week View</h3>
            </div>
            
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs w-12"></TableHead>
                    <TableHead className="text-xs w-24">P/U Date</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                    <TableHead className="text-xs text-right">Pay Load</TableHead>
                    <TableHead className="text-xs text-right">Empty Miles</TableHead>
                    <TableHead className="text-xs text-right">Loaded Miles</TableHead>
                    <TableHead className="text-xs text-right">Total Miles</TableHead>
                    <TableHead className="text-xs text-right">$/Mile</TableHead>
                    <TableHead className="text-xs text-right">Other Cost</TableHead>
                    <TableHead className="text-xs text-right text-green-600">Carrier Pay</TableHead>
                    <TableHead className="text-xs text-right">Carrier $/Mile</TableHead>
                    <TableHead className="text-xs text-right">Carrier Net</TableHead>
                    <TableHead className="text-xs text-right font-bold">Carrier Total Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {threeWeeksRange.map((date, index) => {
                    const dateKey = format(date, "yyyy-MM-dd");
                    const dayLoads = loadsByDate[dateKey] || [];
                    const dayName = format(date, "EEE");
                    const isWeekendDay = isWeekend(date);
                    const isWeekEnd = date.getDay() === 0; // Sunday
                    
                    // Calculate running total for the week
                    let weeklyTotal = 0;
                    if (isWeekEnd) {
                      weeklyTotal = calculateWeeklyTotal(startOfWeek(date, { weekStartsOn: 1 }));
                    }

                    if (dayLoads.length === 0) {
                      return (
                        <TableRow 
                          key={dateKey} 
                          className={cn(
                            isWeekendDay && "bg-red-50/50 dark:bg-red-950/20",
                            isWeekEnd && "border-b-2"
                          )}
                        >
                          <TableCell className={cn("text-xs", isWeekendDay && "text-red-600")}>{dayName}</TableCell>
                          <TableCell className={cn("text-xs", isWeekendDay && "text-red-600")}>{format(date, "MM/dd/yyyy")}</TableCell>
                          <TableCell colSpan={11}></TableCell>
                          {isWeekEnd && (
                            <TableCell className="text-right font-bold text-sm">
                              ${weeklyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                          )}
                          {!isWeekEnd && <TableCell></TableCell>}
                        </TableRow>
                      );
                    }

                    return dayLoads.map((load, loadIndex) => {
                      const totalMiles = (load.estimated_miles || 0) + (load.empty_miles || 0);
                      const ratePerMile = totalMiles > 0 ? (load.rate || 0) / totalMiles : 0;
                      const carrierPay = carrierRates[load.id] ?? load.rate ?? 0;
                      const carrierRatePerMile = (load.estimated_miles || 0) > 0 ? carrierPay / (load.estimated_miles || 1) : 0;
                      const carrierNet = carrierPay; // Can subtract costs here

                      return (
                        <TableRow 
                          key={`${dateKey}-${load.id}`}
                          className={cn(
                            isWeekendDay && "bg-red-50/50 dark:bg-red-950/20",
                            isWeekEnd && loadIndex === dayLoads.length - 1 && "border-b-2"
                          )}
                        >
                          <TableCell className={cn("text-xs", isWeekendDay && "text-red-600")}>
                            {loadIndex === 0 ? dayName : ""}
                          </TableCell>
                          <TableCell className={cn("text-xs", isWeekendDay && "text-red-600")}>
                            {loadIndex === 0 ? format(date, "MM/dd/yyyy") : ""}
                          </TableCell>
                          <TableCell className="text-xs">{load.customer?.name || load.broker_name || "-"}</TableCell>
                          <TableCell className="text-xs">
                            {load.pickup_state} to {load.delivery_state}
                          </TableCell>
                          <TableCell className="text-xs text-right">${(load.rate || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-right">{load.empty_miles || 0}</TableCell>
                          <TableCell className="text-xs text-right">{load.estimated_miles || 0}</TableCell>
                          <TableCell className="text-xs text-right">{totalMiles}</TableCell>
                          <TableCell className="text-xs text-right">${ratePerMile.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">$0.00</TableCell>
                          <TableCell className="text-xs text-right text-green-600 font-medium">
                            ${carrierPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-xs text-right">${carrierRatePerMile.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">${carrierNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          {isWeekEnd && loadIndex === dayLoads.length - 1 ? (
                            <TableCell className="text-right font-bold text-sm">
                              ${weeklyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                          ) : (
                            <TableCell></TableCell>
                          )}
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
