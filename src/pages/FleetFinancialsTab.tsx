import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay } from "date-fns";
import { cn } from "@/lib/utils";

interface Vehicle {
  id: string;
  vehicle_number: string;
  carrier: string | null; // This is actually carrier_id (UUID)
  insurance_cost_per_month: number | null;
}

interface VehicleWithCarrierName extends Vehicle {
  carrierName: string | null;
}

interface Carrier {
  id: string;
  name: string;
}

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  pay_percentage: number | null;
}

interface Customer {
  id: string;
  name: string;
}

interface Load {
  id: string;
  load_number: string;
  pickup_date: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  rate: number | null;
  estimated_miles: number | null;
  empty_miles: number | null;
  assigned_vehicle_id: string | null;
  assigned_dispatcher_id: string | null;
  customer_id: string | null;
  status: string | null;
  fuel_surcharge: number | null;
  accessorial_charges: number | null;
  detention_charges: number | null;
  other_charges: number | null;
}

interface DailyData {
  date: Date;
  dayOfWeek: number;
  loads: Load[];
  isWeekEnd: boolean;
}

// Constants for cost calculations (these could come from settings later)
const DAILY_INSURANCE_RATE = 78.46;
const DAILY_OTHER_COST = 119.91;
const FACTORING_RATE = 0.03; // 3%
const WORKMAN_COMP_RATE = 0; // can be configured
const DRIVER_PAY_RATE = 0; // per load or percentage

export default function FleetFinancialsTab() {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return format(now, "yyyy-MM");
  });

  // Load all data
  useEffect(() => {
    loadData();
  }, []);

  // Load loads when month or vehicle changes
  useEffect(() => {
    if (selectedVehicleId) {
      loadLoadsForVehicle();
    }
  }, [selectedMonth, selectedVehicleId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, carriersRes, dispatchersRes, customersRes] = await Promise.all([
        supabase.from("vehicles").select("id, vehicle_number, carrier, insurance_cost_per_month").eq("status", "active").order("vehicle_number"),
        supabase.from("carriers").select("id, name").eq("status", "active").order("name"),
        supabase.from("dispatchers").select("id, first_name, last_name, pay_percentage").eq("status", "active"),
        supabase.from("customers").select("id, name").eq("status", "active"),
      ]);

      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
      if (carriersRes.data) setCarriers(carriersRes.data);
      if (dispatchersRes.data) setDispatchers(dispatchersRes.data);
      if (customersRes.data) setCustomers(customersRes.data);

      // Select first vehicle by default
      if (vehiclesRes.data && vehiclesRes.data.length > 0) {
        setSelectedVehicleId(vehiclesRes.data[0].id);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLoadsForVehicle = async () => {
    if (!selectedVehicleId) return;

    const [year, month] = selectedMonth.split("-").map(Number);
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(startDate);

    const { data, error } = await supabase
      .from("loads")
      .select("*")
      .eq("assigned_vehicle_id", selectedVehicleId)
      .gte("pickup_date", format(startDate, "yyyy-MM-dd"))
      .lte("pickup_date", format(endDate, "yyyy-MM-dd"))
      .order("pickup_date");

    if (data) setLoads(data);
    if (error) console.error("Error loading loads:", error);
  };

  // Helper to get carrier name by ID
  const getCarrierName = (carrierId: string | null): string | null => {
    if (!carrierId) return null;
    const carrier = carriers.find(c => c.id === carrierId);
    return carrier?.name || null;
  };

  // Helper to get carrier abbreviation (first 3 letters of name)
  const getCarrierAbbr = (carrierId: string | null): string => {
    const name = getCarrierName(carrierId);
    if (!name) return "";
    // Take first word and get first 3 chars, or first 3 chars of whole name
    const firstWord = name.split(' ')[0];
    return firstWord.substring(0, 3).toUpperCase();
  };

  // Vehicles with carrier names for display
  const vehiclesWithNames = useMemo((): VehicleWithCarrierName[] => {
    return vehicles.map(v => ({
      ...v,
      carrierName: getCarrierName(v.carrier)
    }));
  }, [vehicles, carriers]);

  // Filter vehicles by selected carrier (carrier ID)
  const filteredVehicles = useMemo(() => {
    if (!selectedCarrier) return vehiclesWithNames;
    return vehiclesWithNames.filter(v => v.carrier === selectedCarrier);
  }, [vehiclesWithNames, selectedCarrier]);

  // Get unique carrier IDs from vehicles that have carriers
  const vehicleCarrierIds = useMemo(() => {
    const carrierSet = new Set(vehicles.map(v => v.carrier).filter(Boolean));
    return Array.from(carrierSet) as string[];
  }, [vehicles]);

  // Generate daily data for the month
  const dailyData = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(startDate);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return days.map((date, index) => {
      const dayOfWeek = getDay(date);
      const dayLoads = loads.filter(load => {
        if (!load.pickup_date) return false;
        return isSameDay(new Date(load.pickup_date), date);
      });

      // Check if it's the end of a week (Sunday)
      const isWeekEnd = dayOfWeek === 0;

      return {
        date,
        dayOfWeek,
        loads: dayLoads,
        isWeekEnd,
      };
    });
  }, [selectedMonth, loads]);

  // Calculate totals
  const totals = useMemo(() => {
    let payload = 0;
    let emptyMiles = 0;
    let loadedMiles = 0;
    let totalMiles = 0;
    let dispatcherPay = 0;
    let driverPay = 0;
    let workmanComp = 0;
    let fuel = 0;
    let tolls = 0;
    let rentalMiles = 0;
    let insuranceCost = 0;
    let vehicleCost = 0;
    let other = 0;
    let factoring = 0;

    loads.forEach(load => {
      const rate = load.rate || 0;
      payload += rate;
      emptyMiles += load.empty_miles || 0;
      loadedMiles += load.estimated_miles || 0;
      factoring += rate * FACTORING_RATE;
    });

    totalMiles = emptyMiles + loadedMiles;

    // Calculate daily costs for days in month
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    insuranceCost = DAILY_INSURANCE_RATE * daysInMonth;
    other = DAILY_OTHER_COST * daysInMonth;

    // Dispatcher pay calculation
    const dispatcher = dispatchers.find(d => 
      loads.some(l => l.assigned_dispatcher_id === d.id)
    );
    if (dispatcher?.pay_percentage) {
      dispatcherPay = payload * (dispatcher.pay_percentage / 100);
    }

    const dollarPerMile = totalMiles > 0 ? payload / totalMiles : 0;
    const carrierPay = payload;
    const carrierPerMile = totalMiles > 0 ? payload / totalMiles : 0;
    const netProfit = payload - factoring - dispatcherPay - driverPay - workmanComp - fuel - tolls - insuranceCost - vehicleCost - other;

    return {
      payload,
      emptyMiles,
      loadedMiles,
      totalMiles,
      dollarPerMile,
      factoring,
      dispatcherPay,
      driverPay,
      workmanComp,
      fuel,
      tolls,
      rentalMiles,
      insuranceCost,
      vehicleCost,
      other,
      carrierPay,
      carrierPerMile,
      netProfit,
    };
  }, [loads, dispatchers, selectedMonth]);

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return "-";
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || "-";
  };

  const getDispatcherPay = (load: Load) => {
    const dispatcher = dispatchers.find(d => d.id === load.assigned_dispatcher_id);
    if (!dispatcher?.pay_percentage || !load.rate) return 0;
    return load.rate * (dispatcher.pay_percentage / 100);
  };

  const selectedVehicle = vehiclesWithNames.find(v => v.id === selectedVehicleId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (value: number, decimals = 1) => {
    return value.toFixed(decimals);
  };

  // Calculate weekly totals
  const getWeeklyTotal = (endIndex: number) => {
    let weekTotal = 0;
    for (let i = endIndex; i >= 0 && dailyData[i].dayOfWeek !== 0; i--) {
      dailyData[i].loads.forEach(load => {
        const rate = load.rate || 0;
        const factoring = rate * FACTORING_RATE;
        const dispPay = getDispatcherPay(load);
        weekTotal += rate - factoring - dispPay - DAILY_INSURANCE_RATE - DAILY_OTHER_COST;
      });
      // Add empty day costs
      if (dailyData[i].loads.length === 0) {
        weekTotal -= DAILY_INSURANCE_RATE + DAILY_OTHER_COST;
      }
    }
    return weekTotal;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)]">
      {/* Left Sidebar - Carrier Filter */}
      <div className="w-64 border-r bg-card flex-shrink-0">
        <div className="p-4 border-b">
          <p className="text-sm text-muted-foreground mb-2">Selected Carrier</p>
          <Select 
            value={selectedCarrier || "all"} 
            onValueChange={(v) => setSelectedCarrier(v === "all" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Carriers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Carriers</SelectItem>
              {vehicleCarrierIds.map(carrierId => (
                <SelectItem key={carrierId} value={carrierId}>
                  {getCarrierName(carrierId) || carrierId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-4">
          <Button 
            variant={!selectedCarrier ? "default" : "outline"} 
            className="w-full mb-4"
            onClick={() => setSelectedCarrier(null)}
          >
            All Carriers
          </Button>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-2">
              {carriers.map(carrier => (
                <button
                  key={carrier.id}
                  onClick={() => setSelectedCarrier(carrier.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedCarrier === carrier.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="font-medium">{carrier.name}</div>
                  <div className="text-xs opacity-70">Carrier Symbol:</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Vehicle Tabs */}
        <div className="border-b bg-card p-4">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {filteredVehicles.map(vehicle => (
                <Button
                  key={vehicle.id}
                  variant={selectedVehicleId === vehicle.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedVehicleId(vehicle.id)}
                  className="whitespace-nowrap"
                >
                  {vehicle.vehicle_number}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Period Selector */}
        <div className="p-4 flex items-center gap-4 border-b bg-card">
          <span className="text-sm font-medium">Period</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          />
          {selectedVehicle && (
            <span className="text-sm text-muted-foreground">
              Vehicle: {selectedVehicle.vehicle_number} | Carrier: {selectedVehicle.carrierName || "N/A"}
            </span>
          )}
        </div>

        {/* Data Table */}
        <ScrollArea className="flex-1">
          <div className="min-w-[2000px]">
            {/* Table Header */}
            <div className="grid grid-cols-[100px_180px_70px_80px_70px_80px_70px_70px_80px_90px_70px_70px_60px_60px_70px_80px_80px_80px_90px_80px_90px] gap-1 px-4 py-3 bg-muted/50 border-b text-xs font-medium sticky top-0 z-10">
              <div>P/U Date</div>
              <div>Customer</div>
              <div>Location</div>
              <div className="text-right">Pay load</div>
              <div className="text-right">Empty Miles</div>
              <div className="text-right">Loaded Miles</div>
              <div className="text-right">Total Miles</div>
              <div className="text-right">$/Mile</div>
              <div className="text-right">Factoring</div>
              <div className="text-right">Dispatcher Pay</div>
              <div className="text-right">Driver Pay</div>
              <div className="text-right">Workman Comp</div>
              <div className="text-right">Fuel</div>
              <div className="text-right">Tolls</div>
              <div className="text-right">Rental Miles</div>
              <div className="text-right">Daily Insurance</div>
              <div className="text-right">Other Cost</div>
              <div className="text-right">Carrier Pay</div>
              <div className="text-right">Carrier $/Mile</div>
              <div className="text-right">Carrier Net</div>
            </div>

            {/* Daily Rows */}
            {dailyData.map((day, index) => {
              const dayName = format(day.date, "EEE");
              const dateStr = format(day.date, "MM/dd/yyyy");
              const hasLoads = day.loads.length > 0;

              return (
                <div key={day.date.toISOString()}>
                  {hasLoads ? (
                    day.loads.map((load, loadIndex) => {
                      const rate = load.rate || 0;
                      const emptyM = load.empty_miles || 0;
                      const loadedM = load.estimated_miles || 0;
                      const totalM = emptyM + loadedM;
                      const dollarPerMile = totalM > 0 ? rate / totalM : 0;
                      const factoring = rate * FACTORING_RATE;
                      const dispPay = getDispatcherPay(load);
                      const carrierNet = rate - factoring - dispPay - DAILY_INSURANCE_RATE - DAILY_OTHER_COST;
                      const carrierPerMile = totalM > 0 ? rate / totalM : 0;

                      return (
                        <div
                          key={load.id}
                          className="grid grid-cols-[100px_180px_70px_80px_70px_80px_70px_70px_80px_90px_70px_70px_60px_60px_70px_80px_80px_80px_90px_80px_90px] gap-1 px-4 py-2 border-b hover:bg-muted/30 text-sm"
                        >
                          <div className="text-muted-foreground">
                            {loadIndex === 0 && `${dayName} ${dateStr}`}
                          </div>
                          <div className="truncate">{getCustomerName(load.customer_id)}</div>
                          <div className="text-xs">
                            {load.pickup_state} to {load.delivery_state}
                          </div>
                          <div className="text-right font-medium">{formatCurrency(rate)}</div>
                          <div className="text-right">{formatNumber(emptyM, 1)}</div>
                          <div className="text-right">{formatNumber(loadedM, 1)}</div>
                          <div className="text-right">{formatNumber(totalM, 0)}</div>
                          <div className="text-right">${formatNumber(dollarPerMile, 2)}</div>
                          <div className="text-right">{formatCurrency(factoring)}</div>
                          <div className="text-right">{formatCurrency(dispPay)}</div>
                          <div className="text-right">$0.00</div>
                          <div className="text-right">$0.00</div>
                          <div className="text-right">$0.00</div>
                          <div className="text-right">$0.00</div>
                          <div className="text-right">$0.00</div>
                          <div className="text-right">${DAILY_INSURANCE_RATE.toFixed(2)}</div>
                          <div className="text-right">${DAILY_OTHER_COST.toFixed(2)}</div>
                          <div className="text-right">{formatCurrency(rate)}</div>
                          <div className="text-right">${formatNumber(carrierPerMile, 2)}</div>
                          <div className={cn("text-right font-medium", carrierNet >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(carrierNet)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Empty day row
                    <div className="grid grid-cols-[100px_180px_70px_80px_70px_80px_70px_70px_80px_90px_70px_70px_60px_60px_70px_80px_80px_80px_90px_80px_90px] gap-1 px-4 py-2 border-b text-sm text-muted-foreground">
                      <div>{`${dayName} ${dateStr}`}</div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div></div>
                      <div className="text-right">${DAILY_INSURANCE_RATE.toFixed(2)}</div>
                      <div className="text-right">${DAILY_OTHER_COST.toFixed(2)}</div>
                      <div></div>
                      <div></div>
                      <div className="text-right text-red-600">
                        {formatCurrency(-(DAILY_INSURANCE_RATE + DAILY_OTHER_COST))}
                      </div>
                    </div>
                  )}

                  {/* Weekly Summary Row */}
                  {day.isWeekEnd && (
                    <div className="grid grid-cols-[100px_180px_70px_80px_70px_80px_70px_70px_80px_90px_70px_70px_60px_60px_70px_80px_80px_80px_90px_80px_90px] gap-1 px-4 py-2 bg-muted/30 border-b text-sm font-medium">
                      <div className="col-span-19"></div>
                      <div className={cn("text-right", getWeeklyTotal(index) >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(getWeeklyTotal(index))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Monthly Totals Footer */}
        <div className="border-t bg-muted/50 p-4">
          <div className="grid grid-cols-[repeat(15,1fr)] gap-4 text-sm">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Payload</div>
              <div className="font-bold">{formatCurrency(totals.payload)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Empty Miles</div>
              <div className="font-bold">{formatNumber(totals.emptyMiles, 1)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Loaded Miles</div>
              <div className="font-bold">{formatNumber(totals.loadedMiles, 1)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Total Miles</div>
              <div className="font-bold">{formatNumber(totals.totalMiles, 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">$/Mile</div>
              <div className="font-bold">${formatNumber(totals.dollarPerMile, 2)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Factoring</div>
              <div className="font-bold">{formatCurrency(totals.factoring)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Dispatcher Pay</div>
              <div className="font-bold">{formatCurrency(totals.dispatcherPay)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Driver Pay</div>
              <div className="font-bold">{formatCurrency(totals.driverPay)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Workman Comp</div>
              <div className="font-bold">{formatCurrency(totals.workmanComp)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Fuel</div>
              <div className="font-bold">{formatCurrency(totals.fuel)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Insurance Cost</div>
              <div className="font-bold">{formatCurrency(totals.insuranceCost)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Vehicle Cost</div>
              <div className="font-bold">{formatCurrency(totals.vehicleCost)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Other</div>
              <div className="font-bold">{formatCurrency(totals.other)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Carrier Pay</div>
              <div className="font-bold">{formatCurrency(totals.carrierPay)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Net Profit</div>
              <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(totals.netProfit)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
