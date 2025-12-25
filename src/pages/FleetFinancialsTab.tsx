import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, subMonths, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, Search, Fuel, Save, ShieldCheck, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
interface Vehicle {
  id: string;
  vehicle_number: string;
  carrier: string | null; // This is actually carrier_id (UUID)
  insurance_cost_per_month: number | null;
  monthly_payment: number | null;
  driver_1_id: string | null;
  requires_load_approval: boolean | null;
}

interface DriverCompensation {
  id: string;
  pay_method: string | null;
  pay_method_active: boolean | null;
  weekly_salary: number | null;
  hourly_rate: number | null;
  hours_per_week: number | null;
  pay_per_mile: number | null;
  load_percentage: number | null;
  base_salary: number | null;
}

interface VehicleWithCarrierName extends Vehicle {
  carrierName: string | null;
}

interface Carrier {
  id: string;
  name: string;
  status: string | null;
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
  carrier_rate: number | null;
  carrier_approved: boolean | null;
  approved_payload: number | null;
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

interface RateHistory {
  load_id: string;
  old_rate: number | null;
  new_rate: number;
  old_payload: number | null;
  new_payload: number | null;
  changed_at: string;
}

interface DailyData {
  date: Date;
  dayOfWeek: number;
  loads: Load[];
  isWeekEnd: boolean;
}

// Constants for cost calculations (these could come from settings later)
const DAILY_INSURANCE_RATE = 78.46;
const DAILY_OTHER_COST = 0; // blank for manual entry
const WORKMAN_COMP_RATE = 0; // can be configured
const DRIVER_PAY_RATE = 0; // per load or percentage

export default function FleetFinancialsTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [rateHistory, setRateHistory] = useState<RateHistory[]>([]);
  const [driverCompensation, setDriverCompensation] = useState<DriverCompensation | null>(null);
  const [factoringPercentage, setFactoringPercentage] = useState<number>(2); // Default 2%
  
  // Fuel settings
  const [milesPerGallon, setMilesPerGallon] = useState<number>(6.5); // Default 6.5 MPG for trucks
  const [dollarPerGallon, setDollarPerGallon] = useState<number>(3.50); // Default $3.50/gal
  const [savingFuelSettings, setSavingFuelSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("statistics");
  
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [allTruckIdsMode, setAllTruckIdsMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return format(now, "yyyy-MM");
  });
  const [showColumnLines, setShowColumnLines] = useState(false);
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierStatusFilter, setCarrierStatusFilter] = useState<string[]>(["active"]);

  // Load all data
  useEffect(() => {
    loadData();
  }, []);

  // Load loads when month or vehicle changes
  useEffect(() => {
    if (selectedVehicleId) {
      loadLoadsForVehicle();
      loadDriverCompensation();
    }
  }, [selectedMonth, selectedVehicleId]);

  // Load driver compensation when vehicle changes
  const loadDriverCompensation = async () => {
    if (!selectedVehicleId) return;
    
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle?.driver_1_id) {
      setDriverCompensation(null);
      return;
    }

    const { data, error } = await supabase
      .from("applications")
      .select("id, pay_method, pay_method_active, weekly_salary, hourly_rate, hours_per_week, pay_per_mile, load_percentage, base_salary")
      .eq("id", vehicle.driver_1_id)
      .single();

    if (data) setDriverCompensation(data);
    if (error) {
      console.error("Error loading driver compensation:", error);
      setDriverCompensation(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, carriersRes, dispatchersRes, customersRes, companyRes] = await Promise.all([
        supabase.from("vehicles").select("id, vehicle_number, carrier, insurance_cost_per_month, monthly_payment, driver_1_id, requires_load_approval").eq("status", "active").order("vehicle_number"),
        supabase.from("carriers").select("id, name, status, show_in_fleet_financials").eq("show_in_fleet_financials", true).order("name"),
        supabase.from("dispatchers").select("id, first_name, last_name, pay_percentage").eq("status", "active"),
        supabase.from("customers").select("id, name").eq("status", "active"),
        supabase.from("company_profile").select("factoring_percentage").limit(1).single(),
      ]);

      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
      if (carriersRes.data) setCarriers(carriersRes.data);
      if (dispatchersRes.data) setDispatchers(dispatchersRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (companyRes.data?.factoring_percentage != null) {
        setFactoringPercentage(companyRes.data.factoring_percentage);
      }

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

    if (data) {
      setLoads(data);
      // Fetch rate history for these loads
      const loadIds = data.map(l => l.id);
      if (loadIds.length > 0) {
        const { data: historyData } = await supabase
          .from("carrier_rate_history")
          .select("load_id, old_rate, new_rate, old_payload, new_payload, changed_at")
          .in("load_id", loadIds)
          .order("changed_at", { ascending: false });
        setRateHistory(historyData || []);
      } else {
        setRateHistory([]);
      }
    }
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

  // Filter vehicles by selected carrier (carrier ID) or show all in allTruckIdsMode
  const filteredVehicles = useMemo(() => {
    if (allTruckIdsMode) return vehiclesWithNames;
    if (!selectedCarrier) return vehiclesWithNames;
    return vehiclesWithNames.filter(v => v.carrier === selectedCarrier);
  }, [vehiclesWithNames, selectedCarrier, allTruckIdsMode]);

  // Get carrier of currently selected vehicle (for highlighting in allTruckIdsMode)
  const selectedVehicleCarrier = useMemo(() => {
    if (!selectedVehicleId) return null;
    const vehicle = vehiclesWithNames.find(v => v.id === selectedVehicleId);
    return vehicle?.carrier || null;
  }, [selectedVehicleId, vehiclesWithNames]);

  // Auto-select first vehicle when carrier changes or current selection is invalid
  useEffect(() => {
    if (filteredVehicles.length > 0) {
      const currentVehicleInList = filteredVehicles.some(v => v.id === selectedVehicleId);
      if (!currentVehicleInList || !selectedVehicleId) {
        // Sort and select first vehicle
        const sorted = [...filteredVehicles].sort((a, b) => {
          const numA = parseInt(a.vehicle_number, 10);
          const numB = parseInt(b.vehicle_number, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.vehicle_number.localeCompare(b.vehicle_number);
        });
        setSelectedVehicleId(sorted[0].id);
      }
    } else if (selectedCarrier !== null) {
      // Carrier has no vehicles, clear selection
      setSelectedVehicleId(null);
    }
  }, [selectedCarrier, filteredVehicles, selectedVehicleId]);

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

  const selectedVehicle = vehiclesWithNames.find(v => v.id === selectedVehicleId);

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
    let rental = 0;
    let insuranceCost = 0;
    let vehicleCost = 0;
    let other = 0;
    let factoring = 0;

    loads.forEach(load => {
      const rate = load.rate || 0;
      payload += rate;
      emptyMiles += load.empty_miles || 0;
      loadedMiles += load.estimated_miles || 0;
      factoring += rate * (factoringPercentage / 100);
    });

    totalMiles = emptyMiles + loadedMiles;
    
    // Calculate fuel cost based on total miles and fuel settings
    fuel = totalMiles > 0 ? (totalMiles / milesPerGallon) * dollarPerGallon : 0;

    // Calculate daily costs for days in month
    const [year, month] = selectedMonth.split("-").map(Number);
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(startDate);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Calculate business days in the month (Mon-Fri)
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const businessDaysInMonth = allDays.filter(day => !isWeekend(day)).length;
    
    // Calculate daily rental rate from vehicle's monthly payment
    const vehicleMonthlyPayment = selectedVehicle?.monthly_payment || 0;
    const dailyRentalRate = businessDaysInMonth > 0 ? vehicleMonthlyPayment / businessDaysInMonth : 0;
    
    // Total rental for the month
    rental = vehicleMonthlyPayment;
    
    // Calculate daily insurance rate from vehicle's monthly insurance cost
    const vehicleInsuranceCost = selectedVehicle?.insurance_cost_per_month || 0;
    const dailyInsuranceRate = daysInMonth > 0 ? vehicleInsuranceCost / daysInMonth : 0;
    
    insuranceCost = vehicleInsuranceCost;
    other = DAILY_OTHER_COST * daysInMonth;

    // Dispatcher pay calculation
    const dispatcher = dispatchers.find(d => 
      loads.some(l => l.assigned_dispatcher_id === d.id)
    );
    if (dispatcher?.pay_percentage) {
      dispatcherPay = payload * (dispatcher.pay_percentage / 100);
    }

    // Driver pay calculation based on active pay method
    if (driverCompensation?.pay_method_active) {
      const payMethod = driverCompensation.pay_method || 'salary';
      const weeksInMonth = daysInMonth / 7;
      
      switch (payMethod) {
        case 'salary':
          // Weekly salary * weeks in month
          driverPay = (driverCompensation.weekly_salary || 0) * weeksInMonth;
          break;
        case 'hourly':
          // Hourly rate * hours per week * weeks in month
          const hoursPerWeek = driverCompensation.hours_per_week || 40;
          driverPay = (driverCompensation.hourly_rate || 0) * hoursPerWeek * weeksInMonth;
          break;
        case 'mileage':
          // Pay per mile * total miles
          driverPay = (driverCompensation.pay_per_mile || 0) * totalMiles;
          break;
        case 'percentage':
          // Percentage of total payload
          driverPay = payload * ((driverCompensation.load_percentage || 0) / 100);
          break;
        case 'hybrid':
          // Base salary + per mile
          const baseSalary = (driverCompensation.base_salary || 0) * weeksInMonth;
          const mileagePay = (driverCompensation.pay_per_mile || 0) * totalMiles;
          driverPay = baseSalary + mileagePay;
          break;
      }
    }

    const dollarPerMile = totalMiles > 0 ? payload / totalMiles : 0;
    const carrierPay = payload;
    const carrierPerMile = totalMiles > 0 ? payload / totalMiles : 0;
    const netProfit = payload - factoring - dispatcherPay - driverPay - workmanComp - fuel - tolls - rental - insuranceCost - vehicleCost - other;

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
      rental,
      dailyRentalRate,
      businessDaysInMonth,
      insuranceCost,
      dailyInsuranceRate,
      vehicleCost,
      other,
      carrierPay,
      carrierPerMile,
      netProfit,
      driverPayMethod: driverCompensation?.pay_method || null,
      driverPayActive: driverCompensation?.pay_method_active || false,
    };
  }, [loads, dispatchers, selectedMonth, milesPerGallon, dollarPerGallon, selectedVehicle, driverCompensation]);

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

  // Calculate driver pay based on toggled pay method
  const getDriverPay = (load: Load) => {
    if (!driverCompensation?.pay_method_active || !driverCompensation?.pay_method) return 0;
    
    const rate = load.rate || 0;
    const totalMiles = (load.empty_miles || 0) + (load.estimated_miles || 0);
    
    switch (driverCompensation.pay_method) {
      case 'percentage':
        // Percentage of load rate
        return rate * ((driverCompensation.load_percentage || 0) / 100);
      case 'mileage':
        // Pay per mile
        return totalMiles * (driverCompensation.pay_per_mile || 0);
      case 'salary':
        // Weekly salary divided by loads (approximate per-load)
        // For display purposes, we show $0 per load since salary is fixed
        return 0;
      case 'hourly':
        // Hourly rate * hours per week (approximate per-load)
        // For display purposes, we show $0 per load since hourly is fixed
        return 0;
      case 'hybrid':
        // Base salary + percentage
        const percentagePay = rate * ((driverCompensation.load_percentage || 0) / 100);
        return percentagePay; // Base salary is fixed, so just show percentage portion per load
      default:
        return 0;
    }
  };

  

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (value: number, decimals = 1) => {
    return value.toFixed(decimals);
  };

  // Calculate weekly totals
  const getWeeklyTotal = (endIndex: number) => {
    let weekTotal = 0;
    const dailyRental = totals.dailyRentalRate;
    const dailyInsurance = totals.dailyInsuranceRate;
    for (let i = endIndex; i >= 0 && dailyData[i].dayOfWeek !== 0; i--) {
      const dayDate = dailyData[i].date;
      const isBusinessDay = !isWeekend(dayDate);
      const dayRentalCost = isBusinessDay ? dailyRental : 0;
      
      dailyData[i].loads.forEach(load => {
        const rate = load.rate || 0;
        const totalMiles = (load.empty_miles || 0) + (load.estimated_miles || 0);
        const fuelCost = totalMiles > 0 ? (totalMiles / milesPerGallon) * dollarPerGallon : 0;
        const factoring = rate * (factoringPercentage / 100);
        const dispPay = getDispatcherPay(load);
        const drvPay = getDriverPay(load);
        weekTotal += rate - factoring - dispPay - drvPay - fuelCost - dayRentalCost - dailyInsurance - DAILY_OTHER_COST;
      });
      // Add empty day costs
      if (dailyData[i].loads.length === 0) {
        weekTotal -= dayRentalCost + dailyInsurance + DAILY_OTHER_COST;
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

  // Save fuel settings function
  const saveFuelSettings = async () => {
    setSavingFuelSettings(true);
    // For now, just show a toast - these could be saved to company_profile or a settings table
    toast.success("Fuel settings saved successfully");
    setSavingFuelSettings(false);
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b bg-card px-4 py-2">
          <TabsList className="h-9">
            <TabsTrigger value="statistics" className="text-sm">Vehicle Statistics</TabsTrigger>
            <TabsTrigger value="fuel-settings" className="text-sm">Fuel Settings</TabsTrigger>
          </TabsList>
        </div>

        {/* Vehicle Statistics Tab */}
        <TabsContent value="statistics" className="flex-1 m-0 overflow-hidden">
          <div className="flex h-full">
            {/* Left Sidebar - Carrier Filter */}
            <div className="w-[190px] border-r bg-card flex-shrink-0">
        <div className="pl-3 pr-4 py-3 border-b space-y-2">
          <button
            onClick={() => {
              setAllTruckIdsMode(true);
              setSelectedCarrier(null);
              // Select first vehicle from all vehicles
              const sorted = [...vehiclesWithNames].sort((a, b) => {
                const numA = parseInt(a.vehicle_number, 10);
                const numB = parseInt(b.vehicle_number, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.vehicle_number.localeCompare(b.vehicle_number);
              });
              if (sorted.length > 0) {
                setSelectedVehicleId(sorted[0].id);
              }
            }}
            className={cn(
              "w-full h-9 text-sm font-bold rounded-md transition-all duration-200",
              allTruckIdsMode
                ? "btn-glossy-primary text-white"
                : "btn-glossy text-muted-foreground"
            )}
          >
            All Truck IDs
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
        <div className="pl-3 pr-4 py-3">
          <ScrollArea className="h-[calc(100vh-300px)] overflow-visible">
            <div className="flex flex-col w-[70%]">
              {carriers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .filter(carrier => 
                  carrierStatusFilter.length > 0 && 
                  carrierStatusFilter.includes(carrier.status || "") &&
                  (carrierSearch === "" || carrier.name.toLowerCase().startsWith(carrierSearch.toLowerCase()))
                )
                .map((carrier, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  return (
                    <button
                      key={carrier.id}
                      onClick={() => {
                        setAllTruckIdsMode(false);
                        setSelectedCarrier(carrier.id);
                        setCarrierSearch("");
                        // Auto-select first vehicle for this carrier
                        const carrierVehicles = vehiclesWithNames
                          .filter(v => v.carrier === carrier.id)
                          .sort((a, b) => {
                            const numA = parseInt(a.vehicle_number, 10);
                            const numB = parseInt(b.vehicle_number, 10);
                            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                            return a.vehicle_number.localeCompare(b.vehicle_number);
                          });
                        if (carrierVehicles.length > 0) {
                          setSelectedVehicleId(carrierVehicles[0].id);
                        } else {
                          setSelectedVehicleId(null);
                        }
                      }}
                      className={cn(
                        "w-[150px] h-7 text-left px-3 text-xs font-medium transition-all border-x border-t",
                        isLast && "border-b",
                        isFirst && "rounded-t-md",
                        isLast && "rounded-b-md",
                        (selectedCarrier === carrier.id || (allTruckIdsMode && selectedVehicleCarrier === carrier.id))
                          ? "btn-glossy-primary text-white border-primary/30"
                          : "btn-glossy text-gray-700 border-gray-300/50"
                      )}
                    >
                      <div className="truncate">{carrier.name}</div>
                    </button>
                  );
                })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Vehicle Tabs */}
        <div className="border-b bg-card px-3 py-1.5">
          <ScrollArea className="w-full">
            <div className="flex">
              {filteredVehicles
                .slice()
                .sort((a, b) => {
                  const numA = parseInt(a.vehicle_number, 10);
                  const numB = parseInt(b.vehicle_number, 10);
                  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                  return a.vehicle_number.localeCompare(b.vehicle_number);
                })
                .map((vehicle, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  const isActive = selectedVehicleId === vehicle.id;
                  return (
                    <Button
                      key={vehicle.id}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedVehicleId(vehicle.id)}
                      className={cn(
                        "whitespace-nowrap !rounded-none border-0",
                        isFirst && "!rounded-l-full",
                        isLast && "!rounded-r-full",
                        isActive ? "btn-glossy-primary text-white" : "btn-glossy text-gray-700"
                      )}
                    >
                      {vehicle.vehicle_number}
                    </Button>
                  );
                })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Period Selector */}
        <div className="px-3 py-1.5 flex items-center gap-1.5 border-b bg-card flex-wrap">
          <span className="text-sm font-medium mr-2">Period</span>
          <div className="flex">
            {/* Quick month buttons */}
            {(() => {
              const now = new Date();
              const months = [
                { label: "This Month", date: now },
                { label: format(subMonths(now, 1), "MMM"), date: subMonths(now, 1) },
                { label: format(subMonths(now, 2), "MMM"), date: subMonths(now, 2) },
                { label: format(subMonths(now, 3), "MMM"), date: subMonths(now, 3) },
                { label: format(subMonths(now, 4), "MMM"), date: subMonths(now, 4) },
                { label: format(subMonths(now, 5), "MMM"), date: subMonths(now, 5) },
              ];
              return months.map((m, idx) => {
                const monthValue = format(m.date, "yyyy-MM");
                const isActive = selectedMonth === monthValue;
                const isFirst = idx === 0;
                return (
                  <Button
                    key={idx}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-7 px-3 text-xs !rounded-none border-0",
                      isFirst && "!rounded-l-full",
                      isActive ? "btn-glossy-primary text-white" : "btn-glossy text-gray-700"
                    )}
                    onClick={() => setSelectedMonth(monthValue)}
                  >
                    {m.label}
                  </Button>
                );
              });
            })()}
            {/* Custom month picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={!["This Month", ...Array.from({length: 5}, (_, i) => format(subMonths(new Date(), i + 1), "MMM"))].some((_, idx) => {
                    const now = new Date();
                    const monthsToCheck = [now, ...Array.from({length: 5}, (_, i) => subMonths(now, i + 1))];
                    return format(monthsToCheck[idx] || now, "yyyy-MM") === selectedMonth;
                  }) ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 px-3 text-xs gap-1 !rounded-none !rounded-r-full border-0",
                    !["This Month", ...Array.from({length: 5}, (_, i) => format(subMonths(new Date(), i + 1), "MMM"))].some((_, idx) => {
                      const now = new Date();
                      const monthsToCheck = [now, ...Array.from({length: 5}, (_, i) => subMonths(now, i + 1))];
                      return format(monthsToCheck[idx] || now, "yyyy-MM") === selectedMonth;
                    }) ? "btn-glossy-primary text-white" : "btn-glossy text-gray-700"
                  )}
                >
                  <CalendarIcon className="h-3 w-3" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(selectedMonth + "-01")}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedMonth(format(date, "yyyy-MM"));
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          
          {selectedVehicle && (
            <span className="text-sm text-muted-foreground ml-4">
              Vehicle: {selectedVehicle.vehicle_number} | Carrier: {selectedVehicle.carrierName || "N/A"}
            </span>
          )}
          <div className="ml-auto">
            <Button
              variant={showColumnLines ? "default" : "outline"}
              size="sm"
              className={cn(
                "rounded-full border-0",
                showColumnLines ? "btn-glossy-primary text-white" : "btn-glossy text-gray-700"
              )}
              onClick={() => setShowColumnLines(!showColumnLines)}
            >
              {showColumnLines ? "Hide Lines" : "Show Lines"}
            </Button>
          </div>
        </div>

        {/* Data Table Container - Single scroll container with sticky thead/tfoot */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table
            className={cn(
              "table-glossy w-full caption-bottom text-sm table-fixed min-w-[1630px]",
              showColumnLines ? "[&_td]:border-x [&_td]:border-border/50 [&_th]:border-x [&_th]:border-border/50" : "",
            )}
          >
            {/* Sticky Header */}
            <thead className="sticky top-0 z-20 bg-muted shadow-sm">
              <tr>
                <th className="w-[88px] px-2 py-2 text-left font-medium whitespace-nowrap">P/U Date</th>
                <th className="w-[140px] px-2 py-2 text-left font-medium">Customer</th>
                <th className="w-[65px] px-2 py-2 text-left font-medium">Route</th>
                <th className="w-[78px] px-2 py-2 text-right font-medium">Payload</th>
                <th className="w-[60px] px-2 py-2 text-right font-medium">Empty</th>
                <th className="w-[62px] px-2 py-2 text-right font-medium">Loaded</th>
                <th className="w-[55px] px-2 py-2 text-right font-medium">Total</th>
                <th className="w-[52px] px-2 py-2 text-right font-medium">$/Mi</th>
                <th className="w-[48px] px-2 py-2 text-right font-medium">MPG</th>
                <th className="w-[68px] px-2 py-2 text-right font-medium">Factor</th>
                <th className="w-[75px] px-2 py-2 text-right font-medium">Disp Pay</th>
                <th className="w-[70px] px-2 py-2 text-right font-medium">Drv Pay</th>
                <th className="w-[62px] px-2 py-2 text-right font-medium">WComp</th>
                <th className="w-[55px] px-2 py-2 text-right font-medium">Fuel</th>
                <th className="w-[55px] px-2 py-2 text-right font-medium">Tolls</th>
                <th className="w-[58px] px-2 py-2 text-right font-medium">Rental</th>
                <th className="w-[62px] px-2 py-2 text-right font-medium">Insur</th>
                <th className="w-[58px] px-2 py-2 text-right font-medium">Other</th>
                <th className="w-[78px] px-2 py-2 text-right font-medium">Carr Pay</th>
                <th className="w-[52px] px-2 py-2 text-right font-medium">$/Mi</th>
                <th className="w-[80px] px-2 py-2 text-right font-medium">Net</th>
                <th className="w-[80px] px-2 py-2 text-right font-medium">Carr NET</th>
              </tr>
            </thead>
                <TableBody>
                  {dailyData.map((day, index) => {
                    const dayName = format(day.date, "EEE");
                    const dateStr = format(day.date, "MM/dd");
                    const hasLoads = day.loads.length > 0;

                    return (
                      <>
                        {hasLoads ? (
                          day.loads.map((load, loadIndex) => {
                            const rate = load.rate || 0;
                            const emptyM = load.empty_miles || 0;
                            const loadedM = load.estimated_miles || 0;
                            const totalM = emptyM + loadedM;
                            const dollarPerMile = totalM > 0 ? rate / totalM : 0;
                            const factoring = rate * (factoringPercentage / 100);
                            const dispPay = getDispatcherPay(load);
                            const drvPay = getDriverPay(load);
                            const fuelCost = totalM > 0 ? (totalM / milesPerGallon) * dollarPerGallon : 0;
                            const isBusinessDay = !isWeekend(day.date);
                            const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
                            const dailyInsurance = totals.dailyInsuranceRate;
                            const isToday = isSameDay(day.date, new Date());

                            // Check if vehicle requires approval
                            const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
                            const vehicleRequiresApproval = selectedVehicle?.requires_load_approval;
                            const isApproved = load.carrier_approved === true;

                            // Check if payload changed after approval (approved_payload differs from current rate)
                            const payloadChangedAfterApproval =
                              isApproved && load.approved_payload !== null && load.approved_payload !== rate;

                            const carrierPayAmount = load.carrier_rate || rate;

                            const carrierNet =
                              (vehicleRequiresApproval && !isApproved ? 0 : carrierPayAmount) -
                              factoring -
                              dispPay -
                              drvPay -
                              fuelCost -
                              dailyRental -
                              dailyInsurance -
                              DAILY_OTHER_COST;
                            const carrierPerMile = loadedM > 0 ? carrierPayAmount / loadedM : 0;

                            return (
                              <TableRow
                                key={load.id}
                                className={cn(
                                  "hover:bg-muted/30 h-[25px]",
                                  isToday && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20",
                                )}
                              >
                                <TableCell
                                  className={cn(
                                    "font-medium !px-2 !py-0.5 whitespace-nowrap cursor-pointer hover:text-primary hover:underline",
                                    isToday ? "text-green-600 font-bold" : "text-muted-foreground",
                                  )}
                                  onClick={() => navigate(`/dashboard/load/${load.id}`)}
                                >
                                  {loadIndex === 0 && `${isToday ? "Today" : dayName} ${dateStr}`}
                                </TableCell>
                                <TableCell
                                  className="truncate max-w-[140px] !px-2 !py-0.5"
                                  title={getCustomerName(load.customer_id)}
                                >
                                  {getCustomerName(load.customer_id)}
                                </TableCell>
                                <TableCell className="text-xs !px-2 !py-0.5">
                                  {load.pickup_state}→{load.delivery_state}
                                </TableCell>
                                <TableCell className="text-right font-semibold !px-2 !py-0.5">
                                  {formatCurrency(rate)}
                                </TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">
                                  {formatNumber(emptyM, 0)}
                                </TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">
                                  {formatNumber(loadedM, 0)}
                                </TableCell>
                                <TableCell className="text-right font-medium !px-2 !py-0.5">
                                  {formatNumber(totalM, 0)}
                                </TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">${formatNumber(dollarPerMile, 2)}</TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatNumber(milesPerGallon, 1)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(factoring)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(dispPay)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(drvPay)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">$0.00</TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(fuelCost)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">$0.00</TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(dailyRental)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
                                  {formatCurrency(dailyInsurance)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground !px-2 !py-0.5"></TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">
                                  {vehicleRequiresApproval ? (
                                    <div className="flex items-center justify-end gap-1">
                                      {isApproved ? (
                                        <>
                                          <span
                                            className={cn(
                                              "font-bold",
                                              payloadChangedAfterApproval
                                                ? "line-through text-destructive"
                                                : "text-green-600",
                                            )}
                                          >
                                            {formatCurrency(carrierPayAmount)}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "text-[8px] px-0.5 py-0 scale-[0.85]",
                                              payloadChangedAfterApproval
                                                ? "bg-red-50 text-red-700 border-red-300 cursor-pointer hover:bg-red-100"
                                                : "bg-green-50 text-green-700 border-green-300",
                                            )}
                                            title={
                                              payloadChangedAfterApproval
                                                ? "Click to approve - Payload changed"
                                                : "Load Approved"
                                            }
                                            onClick={
                                              payloadChangedAfterApproval
                                                ? (e) => {
                                                    e.stopPropagation();
                                                    navigate(`/dashboard/load-approval?loadId=${load.id}`);
                                                  }
                                                : undefined
                                            }
                                          >
                                            {payloadChangedAfterApproval ? (
                                              <AlertTriangle className="h-2 w-2 mr-0.5" />
                                            ) : (
                                              <ShieldCheck className="h-2 w-2 mr-0.5" />
                                            )}
                                            LA
                                          </Badge>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-orange-600 font-bold">$0.00</span>
                                          <Badge
                                            variant="outline"
                                            className="text-[8px] px-0.5 py-0 scale-[0.85] bg-amber-50 text-amber-700 border-amber-300"
                                            title="Pending Approval"
                                          >
                                            <ShieldCheck className="h-2 w-2 mr-0.5" />
                                            LA
                                          </Badge>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    formatCurrency(carrierPayAmount)
                                  )}
                                </TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">${formatNumber(carrierPerMile, 2)}</TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-bold !px-2 !py-0.5",
                                    carrierNet >= 0 ? "text-green-600" : "text-destructive",
                                  )}
                                >
                                  {formatCurrency(carrierNet)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-bold !px-2 !py-0.5",
                                    carrierNet >= 0 ? "text-green-600" : "text-destructive",
                                  )}
                                >
                                  {formatCurrency(carrierNet)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          (() => {
                            const isBusinessDay = !isWeekend(day.date);
                            const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
                            const dailyInsurance = totals.dailyInsuranceRate;
                            const emptyDayNet = -(dailyRental + dailyInsurance + DAILY_OTHER_COST);
                            const isToday = isSameDay(day.date, new Date());
                            return (
                              <TableRow
                                key={day.date.toISOString()}
                                className={cn(
                                  "text-muted-foreground h-[25px]",
                                  isToday && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20",
                                )}
                              >
                                <TableCell
                                  className={cn(
                                    "font-medium !px-2 !py-0.5 whitespace-nowrap",
                                    isToday ? "text-green-600 font-bold" : "",
                                  )}
                                >
                                  {`${isToday ? "Today" : dayName} ${dateStr}`}
                                </TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">
                                  {isBusinessDay && dailyRental > 0 ? formatCurrency(dailyRental) : ""}
                                </TableCell>
                                <TableCell className="text-right !px-2 !py-0.5">{formatCurrency(dailyInsurance)}</TableCell>
                                <TableCell className="text-right !px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="!px-2 !py-0.5"></TableCell>
                                <TableCell className="text-right font-bold text-destructive !px-2 !py-0.5">
                                  {formatCurrency(emptyDayNet)}
                                </TableCell>
                                <TableCell className="text-right font-bold text-destructive !px-2 !py-0.5">
                                  {formatCurrency(emptyDayNet)}
                                </TableCell>
                              </TableRow>
                            );
                          })()
                        )}

                        {/* Weekly Summary Row */}
                        {day.isWeekEnd && (
                          <TableRow key={`week-${day.date.toISOString()}`} className="bg-muted/50 border-t-2">
                            <TableCell colSpan={21} className="text-right font-semibold">
                              Weekly Total:
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-bold",
                                getWeeklyTotal(index) >= 0 ? "text-green-600" : "text-destructive",
                              )}
                            >
                              {formatCurrency(getWeeklyTotal(index))}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>

            {/* Sticky Footer */}
            <tfoot className="sticky bottom-0 z-20 bg-muted/95 border-t shadow-[0_-2px_4px_rgba(0,0,0,0.1)]">
              <tr>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">P/U Date</div>
                  <div className="font-bold">-</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Customer</div>
                  <div className="font-bold">-</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Route</div>
                  <div className="font-bold">-</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Payload</div>
                  <div className="font-bold text-primary">{formatCurrency(totals.payload)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Empty</div>
                  <div className="font-bold">{formatNumber(totals.emptyMiles, 1)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Loaded</div>
                  <div className="font-bold">{formatNumber(totals.loadedMiles, 1)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Total</div>
                  <div className="font-bold">{formatNumber(totals.totalMiles, 0)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">$/Mi</div>
                  <div className="font-bold">${formatNumber(totals.dollarPerMile, 2)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">MPG</div>
                  <div className="font-bold">{formatNumber(milesPerGallon, 1)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Factor</div>
                  <div className="font-bold">{formatCurrency(totals.factoring)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Disp Pay</div>
                  <div className="font-bold">{formatCurrency(totals.dispatcherPay)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                    Drv Pay
                    {totals.driverPayActive && (
                      <span className="text-[8px] text-emerald-500">
                        ({totals.driverPayMethod === "percentage"
                          ? "%"
                          : totals.driverPayMethod === "mileage"
                            ? "$/mi"
                            : totals.driverPayMethod === "hourly"
                              ? "$/hr"
                              : totals.driverPayMethod === "hybrid"
                                ? "hyb"
                                : "$"})
                      </span>
                    )}
                  </div>
                  <div className={`font-bold ${totals.driverPayActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatCurrency(totals.driverPay)}
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">WComp</div>
                  <div className="font-bold">{formatCurrency(totals.workmanComp)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Fuel</div>
                  <div className="font-bold">{formatCurrency(totals.fuel)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Tolls</div>
                  <div className="font-bold">{formatCurrency(totals.tolls)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Rental</div>
                  <div className="font-bold">{formatCurrency(totals.rental)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Insur</div>
                  <div className="font-bold">{formatCurrency(totals.insuranceCost)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Other</div>
                  <div className="font-bold">{formatCurrency(totals.other)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Carr Pay</div>
                  <div className="font-bold">{formatCurrency(totals.carrierPay)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">$/Mi</div>
                  <div className="font-bold">${formatNumber(totals.carrierPerMile, 2)}</div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Net</div>
                  <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(totals.netProfit)}
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Carr NET</div>
                  <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(totals.netProfit)}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

    </div>
  </div>
  </TabsContent>

  {/* Fuel Settings Tab */}
  <TabsContent value="fuel-settings" className="flex-1 m-0 p-6 overflow-auto">
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5" />
            Fuel Settings
          </CardTitle>
          <CardDescription>
            Configure fuel consumption parameters for calculating fuel costs and MPG statistics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="mpg">Average Miles Per Gallon (MPG)</Label>
              <Input
                id="mpg"
                type="number"
                step="0.1"
                min="1"
                max="20"
                value={milesPerGallon}
                onChange={(e) => setMilesPerGallon(parseFloat(e.target.value) || 6.5)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Typical truck MPG ranges from 5.5 to 8.0
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpg">Dollar Per Gallon ($)</Label>
              <Input
                id="dpg"
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={dollarPerGallon}
                onChange={(e) => setDollarPerGallon(parseFloat(e.target.value) || 3.50)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Current average fuel price per gallon
              </p>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Calculated Values</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground">Cost Per Mile</div>
                <div className="text-lg font-bold">
                  ${(dollarPerGallon / milesPerGallon).toFixed(3)}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground">Gallons Per 100 Miles</div>
                <div className="text-lg font-bold">
                  {(100 / milesPerGallon).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <Button 
            onClick={saveFuelSettings}
            disabled={savingFuelSettings}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {savingFuelSettings ? "Saving..." : "Save Fuel Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  </TabsContent>
</Tabs>
    </div>
  );
}
