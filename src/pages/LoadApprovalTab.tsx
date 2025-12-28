import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, DollarSign, Search, Check, ArrowLeft, Calendar, Building2, Eye, MapPin } from "lucide-react";
import { LoadApprovalMap } from "@/components/LoadApprovalMap";
import { format, subDays, addDays, eachDayOfInterval, isWeekend, startOfWeek, endOfWeek, startOfDay, startOfMonth, endOfMonth, isAfter } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { usePaymentFormulas } from "@/hooks/usePaymentFormulas";
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
  requires_load_approval: boolean | null;
  insurance_cost_per_month?: number | null;
  monthly_payment?: number | null;
  weekly_payment?: number | null;
  driver_1_id?: string | null;
  asset_ownership?: string | null;
  cents_per_mile?: number | null;
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
  personal_info: { firstName?: string; lastName?: string } | null;
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
  reference_number: string | null;
  shipper_load_id: string | null;
  customer?: { name: string | null };
  carrier?: { name: string | null };
  vehicle?: { vehicle_number: string | null; driver_1_id?: string | null };
  driver?: { personal_info: any };
  dispatcher?: { first_name: string | null; last_name: string | null; pay_percentage?: number | null };
  assigned_dispatcher_id?: string | null;
}

interface ApprovalLoad extends Load {
  carrier_pay?: number;
  carrier_rate_per_mile?: number;
  carrier_approved?: boolean | null;
  carrier_rate?: number | null;
  approved_payload?: number | null;
}

interface DispatcherPayInfo {
  id: string;
  pay_percentage: number | null;
}

export default function LoadApprovalTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const { timezone } = useUserTimezone();
  const { calculateFormula } = usePaymentFormulas();

  const todayKey = useMemo(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"), [timezone]);

  // Carrier state
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierPendingCounts, setCarrierPendingCounts] = useState<Map<string, number>>(new Map());
  const [selectedCarrier, setSelectedCarrier] = useState<string>(() => searchParams.get("carrierId") ?? "all");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierStatusFilter, setCarrierStatusFilter] = useState<string[]>(["active"]);

  // Vehicle state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>(() => searchParams.get("vehicleId") ?? "all");

  // Load state
  const [loads, setLoads] = useState<ApprovalLoad[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);
  const ROWS_PER_PAGE = 3;

  // Selected load for 30 Days View filtering - initialize from URL param
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(() => searchParams.get("loadId"));

  // Approval rates - editable per load
  const [carrierRates, setCarrierRates] = useState<Record<string, number>>({});
  const [payloadRates, setPayloadRates] = useState<Record<string, number>>({});
  const [carrierPayApproved, setCarrierPayApproved] = useState<Record<string, boolean>>({});
  const [vehicleDriverInfoById, setVehicleDriverInfoById] = useState<Record<string, any>>({});
  const [factoringPercentage, setFactoringPercentage] = useState<number>(0);
  const [dispatcherPayInfo, setDispatcherPayInfo] = useState<Record<string, number>>({});
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Carrier Net calculation state
  const [driverCompensation, setDriverCompensation] = useState<DriverCompensation | null>(null);
  const [driverCompensationLoaded, setDriverCompensationLoaded] = useState<boolean>(false);
  const [milesPerGallon, setMilesPerGallon] = useState<number>(6.5);
  const [dollarPerGallon, setDollarPerGallon] = useState<number>(3.50);
  const DAILY_OTHER_COST = 0;

  // Scroll to selected load when it changes
  useEffect(() => {
    if (selectedLoadId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedLoadId]);

  // When loads are loaded and we have a loadId from URL, navigate to the correct page
  useEffect(() => {
    if (!loading && selectedLoadId && loads.length > 0) {
      // Sort loads the same way as paginatedLoads
      const sortedLoads = [...loads].sort((a, b) => {
        const dateA = a.pickup_date ? new Date(a.pickup_date).getTime() : 0;
        const dateB = b.pickup_date ? new Date(b.pickup_date).getTime() : 0;
        return dateA - dateB;
      });
      const loadIndex = sortedLoads.findIndex((l) => l.id === selectedLoadId);
      if (loadIndex >= 0) {
        const targetPage = Math.floor(loadIndex / ROWS_PER_PAGE) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [loading, selectedLoadId, loads]);

  useEffect(() => {
    loadCarriers();
  }, []);

  useEffect(() => {
    if (carriers.length > 0) {
      loadData();
    }
  }, [selectedCarrier, selectedVehicle, carriers]);

  const loadCarriers = async () => {
    // Load all carriers
    const { data: carrierData } = await supabase
      .from("carriers")
      .select("id, name, status")
      .order("name");
    setCarriers(carrierData || []);

    // Load company profile for factoring percentage
    const { data: companyProfile } = await supabase
      .from("company_profile")
      .select("factoring_percentage")
      .limit(1)
      .single();
    setFactoringPercentage(companyProfile?.factoring_percentage || 0);

    // Load all dispatchers with pay_percentage
    const { data: dispatchersData } = await supabase
      .from("dispatchers")
      .select("id, pay_percentage");
    const dispPayMap: Record<string, number> = {};
    (dispatchersData || []).forEach((d: any) => {
      dispPayMap[d.id] = d.pay_percentage || 0;
    });
    setDispatcherPayInfo(dispPayMap);

    // Load all vehicles that require approval
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("id, carrier, requires_load_approval")
      .eq("status", "active")
      .eq("requires_load_approval", true);

    const vehicleIds = (vehicleData || []).map((v: any) => v.id);
    
    // Build a map of vehicle ID -> carrier ID for counting
    const vehicleCarrierMap = new Map<string, string>();
    (vehicleData || []).forEach((v: any) => {
      if (v.carrier) {
        vehicleCarrierMap.set(v.id, v.carrier);
      }
    });

    if (vehicleIds.length === 0) {
      setCarrierPendingCounts(new Map());
      return;
    }

    // Load loads needing rate approval
    // A load needs rate approval if it's from an approval-required vehicle AND:
    // 1. carrier_approved is null or false, OR
    // 2. carrier_approved is true but payload (rate) differs from approved_payload
    const thirtyDaysAgo = subDays(new Date(), 30);
    const { data: loadsData } = await supabase
      .from("loads")
      .select("id, carrier_id, assigned_vehicle_id, carrier_approved, rate, approved_payload")
      .gte("pickup_date", format(thirtyDaysAgo, "yyyy-MM-dd"))
      .in("assigned_vehicle_id", vehicleIds);

    // Count pending loads per carrier using VEHICLE's carrier (owner), not load's carrier_id
    // This ensures loads appear under the carrier that owns the vehicle
    const countsByCarrier = new Map<string, number>();
    (loadsData || []).forEach((load: any) => {
      // Get the carrier from the vehicle assignment, not the load's carrier_id
      const vehicleCarrierId = vehicleCarrierMap.get(load.assigned_vehicle_id);
      if (vehicleCarrierId) {
        const needsApproval = load.carrier_approved !== true;
        const payloadChanged = load.carrier_approved === true && 
                               load.approved_payload !== null && 
                               Number(load.rate) !== Number(load.approved_payload);
        if (needsApproval || payloadChanged) {
          countsByCarrier.set(vehicleCarrierId, (countsByCarrier.get(vehicleCarrierId) || 0) + 1);
        }
      }
    });
    setCarrierPendingCounts(countsByCarrier);
  };

  const loadData = async () => {
    setLoading(true);
    setDriverCompensationLoaded(false);
    try {
      // Load vehicles for selected carrier - include requires_load_approval
      // Note: vehicle.carrier field stores the carrier ID, not the name
      let vehicleQuery = supabase
        .from("vehicles")
        .select("id, vehicle_number, carrier, requires_load_approval, insurance_cost_per_month, monthly_payment, weekly_payment, driver_1_id, asset_ownership, cents_per_mile")
        .eq("status", "active");
      
      if (selectedCarrier !== "all") {
        vehicleQuery = vehicleQuery.eq("carrier", selectedCarrier);
      }
      
      const { data: vehicleData } = await vehicleQuery.order("vehicle_number");
      let allVehicles = (vehicleData as Vehicle[]) || [];
      
      // If we have a selectedLoadId, we need to ensure its vehicle is in the list for financial calculations
      // First, find the load to get its vehicle ID
      let selectedLoadVehicleId: string | null = null;
      if (selectedLoadId) {
        const { data: selectedLoadData } = await supabase
          .from("loads")
          .select("assigned_vehicle_id")
          .eq("id", selectedLoadId)
          .maybeSingle();
        selectedLoadVehicleId = selectedLoadData?.assigned_vehicle_id || null;
        
        // If the vehicle isn't in our list, fetch it separately
        if (selectedLoadVehicleId && !allVehicles.find(v => v.id === selectedLoadVehicleId)) {
          const { data: extraVehicle } = await supabase
            .from("vehicles")
            .select("id, vehicle_number, carrier, requires_load_approval, insurance_cost_per_month, monthly_payment, weekly_payment, driver_1_id, asset_ownership, cents_per_mile")
            .eq("id", selectedLoadVehicleId)
            .maybeSingle();
          if (extraVehicle) {
            allVehicles = [...allVehicles, extraVehicle as Vehicle];
          }
        }
      }
      
      setVehicles(allVehicles);
      
      // Get vehicle IDs that require load approval
      const vehiclesRequiringApproval = (vehicleData || [])
        .filter((v: any) => v.requires_load_approval)
        .map((v: any) => v.id);
      
      // Get ALL vehicle IDs for the selected carrier (for filtering loads)
      const carrierVehicleIds = (vehicleData || []).map((v: any) => v.id);
      
      // Load loads for the past 3 weeks
      // Show those that are ready for approval (delivered/completed/closed)
      // OR those from vehicles requiring approval that haven't been approved yet
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      let loadQuery = supabase
        .from("loads")
        .select(`
          *,
          customer:customers!customer_id(name),
          carrier:carriers!carrier_id(name),
          vehicle:vehicles!assigned_vehicle_id(vehicle_number, driver_1_id),
          driver:applications!assigned_driver_id(personal_info),
          dispatcher:dispatchers!assigned_dispatcher_id(first_name, last_name)
        `)
        .gte("pickup_date", format(thirtyDaysAgo, "yyyy-MM-dd"));
      
      // Filter by vehicle ownership (carrier) rather than load's carrier_id
      // This ensures loads assigned to a carrier's vehicles show up for that carrier
      if (selectedCarrier !== "all" && carrierVehicleIds.length > 0) {
        loadQuery = loadQuery.in("assigned_vehicle_id", carrierVehicleIds);
      } else if (selectedCarrier !== "all" && carrierVehicleIds.length === 0) {
        // No vehicles for this carrier, so no loads to show
        setLoads([]);
        setVehicleDriverInfoById({});
        setLoading(false);
        return;
      }
      
      if (selectedVehicle !== "all") {
        loadQuery = loadQuery.eq("assigned_vehicle_id", selectedVehicle);
      }
      
      const { data: loadData, error: loadError } = await loadQuery.order("pickup_date", { ascending: false });

      if (loadError) {
        console.error("LoadApprovalTab load query error", loadError);
        toast.error("Couldn't load approval loads.");
        setLoads([]);
        setVehicleDriverInfoById({});
        return;
      }

      // Fetch vehicle driver info (fallback) for loads missing an assigned driver
      const vehicleDriverIds = Array.from(
        new Set(
          (loadData || [])
            .map((l: any) => l?.vehicle?.driver_1_id)
            .filter(Boolean)
        )
      ) as string[];

      if (vehicleDriverIds.length > 0) {
        const { data: driverApps, error: driverAppsError } = await supabase
          .from("applications")
          .select("id, personal_info")
          .in("id", vehicleDriverIds);

        if (driverAppsError) {
          console.error("LoadApprovalTab driver lookup error", driverAppsError);
          setVehicleDriverInfoById({});
        } else {
          const map: Record<string, any> = {};
          (driverApps || []).forEach((d: any) => {
            map[d.id] = d.personal_info;
          });
          setVehicleDriverInfoById(map);
        }
      } else {
        setVehicleDriverInfoById({});
      }

      // Filter loads: ONLY show loads from vehicles that have requires_load_approval enabled
      // and that either:
      // 1. Haven't been approved yet (carrier_approved !== true)
      // 2. OR have been approved but payload changed (rate !== approved_payload)
      const filteredLoads = (loadData || []).filter((load: any) => {
        const isFromApprovalRequiredVehicle = vehiclesRequiringApproval.includes(load.assigned_vehicle_id);
        const needsCarrierApproval = load.carrier_approved !== true;
        const payloadChanged = load.carrier_approved === true && 
                               load.approved_payload !== null && 
                               Number(load.rate) !== Number(load.approved_payload);

        return isFromApprovalRequiredVehicle && (needsCarrierApproval || payloadChanged);
      });

      setLoads(filteredLoads as unknown as ApprovalLoad[]);

      // Load driver compensation for the financial vehicle (selected load truck wins)
      const financialVehicleId = selectedLoadId
        ? (loadData || []).find((l: any) => l.id === selectedLoadId)?.assigned_vehicle_id ?? null
        : (selectedVehicle !== "all" ? selectedVehicle : null);

      if (financialVehicleId) {
        const financialVehicle = (vehicleData || []).find((v: any) => v.id === financialVehicleId);
        if (financialVehicle?.driver_1_id) {
          const { data: driverData } = await supabase
            .from("applications")
            .select(
              "id, pay_method, pay_method_active, weekly_salary, hourly_rate, hours_per_week, pay_per_mile, load_percentage, base_salary, personal_info"
            )
            .eq("id", financialVehicle.driver_1_id)
            .single();

          if (driverData) {
            const personalInfo =
              typeof driverData.personal_info === "string"
                ? JSON.parse(driverData.personal_info)
                : driverData.personal_info;
            setDriverCompensation({ ...driverData, personal_info: personalInfo });
          } else {
            setDriverCompensation(null);
          }
          setDriverCompensationLoaded(true);
        } else {
          setDriverCompensation(null);
          setDriverCompensationLoaded(true);
        }
      } else {
        setDriverCompensation(null);
        setDriverCompensationLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter carriers by search, status, and whether they have pending loads
  const filteredCarriers = useMemo(() => {
    return carriers.filter(carrier => {
      const matchesSearch = carrier.name.toLowerCase().includes(carrierSearch.toLowerCase());
      const matchesStatus = carrierStatusFilter.length === 0 || 
        carrierStatusFilter.includes(carrier.status || "active");
      const hasPendingLoads = carrierPendingCounts.has(carrier.id);
      return matchesSearch && matchesStatus && hasPendingLoads;
    });
  }, [carriers, carrierSearch, carrierStatusFilter, carrierPendingCounts]);

  // Calculate total pending loads count - use actual loads.length for accuracy
  // since carrierPendingCounts only includes loads with carrier_id assigned
  const totalPendingLoads = useMemo(() => {
    return loads.length;
  }, [loads]);

  // Get 30 days calendar data - recalculate when loads change to stay fresh
  const thirtyDaysRange = useMemo(() => {
    const today = startOfDay(toZonedTime(new Date(), timezone));
    const start = subDays(today, 30);
    const end = addDays(today, 3);
    return eachDayOfInterval({ start, end });
  }, [loads, timezone]);

  // Get the selected load object
  const selectedLoad = useMemo(() => {
    return selectedLoadId ? loads.find(l => l.id === selectedLoadId) : null;
  }, [selectedLoadId, loads]);

  // Get the vehicle ID to filter by (from selected load)
  const filterVehicleId = selectedLoad?.assigned_vehicle_id || null;

  // Vehicle used for financial calculations in 30 Days View (selected load's truck wins)
  const financialVehicleId = filterVehicleId ?? (selectedVehicle !== "all" ? selectedVehicle : null);
  // Group loads by date - filtered by selected vehicle if a load is selected
  const loadsByDate = useMemo(() => {
    const grouped: Record<string, ApprovalLoad[]> = {};
    const filteredLoads = filterVehicleId 
      ? loads.filter(load => load.assigned_vehicle_id === filterVehicleId)
      : loads;
    
    filteredLoads.forEach(load => {
      if (load.pickup_date) {
        const raw = String(load.pickup_date);
        const dateKey = raw.length >= 10 ? raw.slice(0, 10) : format(new Date(raw), "yyyy-MM-dd");
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(load);
      }
    });
    return grouped;
  }, [loads, filterVehicleId]);

  // Paginated loads for top table - sorted by pickup_date ascending (oldest first)
  const paginatedLoads = useMemo(() => {
    let filteredLoads = [...loads];
    
    // Filter to only show modified loads if toggle is active
    if (showModifiedOnly) {
      filteredLoads = filteredLoads.filter(load => {
        const isApproved = load.carrier_approved === true;
        const hasPayloadChange = isApproved && 
          load.approved_payload !== null && 
          load.approved_payload !== load.rate;
        return hasPayloadChange;
      });
    }
    
    const sortedLoads = filteredLoads.sort((a, b) => {
      const dateA = a.pickup_date ? new Date(a.pickup_date).getTime() : 0;
      const dateB = b.pickup_date ? new Date(b.pickup_date).getTime() : 0;
      return dateA - dateB; // Ascending: older dates first
    });
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedLoads.slice(start, start + ROWS_PER_PAGE);
  }, [loads, currentPage, showModifiedOnly]);

  // Count of modified loads (always calculated for badge display)
  const modifiedLoadsCount = useMemo(() => {
    return loads.filter(load => {
      const isApproved = load.carrier_approved === true;
      return isApproved && load.approved_payload !== null && load.approved_payload !== load.rate;
    }).length;
  }, [loads]);

  // Calculate total pages based on filtered loads
  const filteredLoadsCount = showModifiedOnly ? modifiedLoadsCount : loads.length;
  
  const totalPages = Math.ceil(filteredLoadsCount / ROWS_PER_PAGE);

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

  // Get vehicle for financial calculations (selected load truck or selected vehicle filter)
  const selectedVehicleData = useMemo(() => {
    if (!financialVehicleId) {
      console.log('[30DaysView] No financialVehicleId');
      return null;
    }
    const found = vehicles.find((v) => v.id === financialVehicleId);
    console.log('[30DaysView] financialVehicleId:', financialVehicleId, 'found:', !!found, 'vehicles count:', vehicles.length);
    if (found) {
      console.log('[30DaysView] Vehicle data:', {
        id: found.id,
        vehicle_number: found.vehicle_number,
        asset_ownership: found.asset_ownership,
        cents_per_mile: found.cents_per_mile,
        insurance_cost_per_month: found.insurance_cost_per_month,
        weekly_payment: found.weekly_payment,
        monthly_payment: found.monthly_payment,
      });
    }
    return found || null;
  }, [vehicles, financialVehicleId]);

  // Calculate daily rates for rental and insurance
  const dailyCostRates = useMemo(() => {
    if (!selectedVehicleData) {
      console.log('[30DaysView] dailyCostRates: selectedVehicleData is null');
      return { dailyRentalRate: 0, dailyInsuranceRate: 0 };
    }
    
    const today = new Date();
    const startDate = startOfMonth(today);
    const endDate = endOfMonth(today);
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const businessDaysInMonth = allDays.filter(day => !isWeekend(day)).length;
    
    // Calculate daily rental rate based on asset_ownership type
    // Each selection uses ONLY its designated fields:
    // - Owned: monthly_payment ÷ business_days (RCPM = $0)
    // - Financed: monthly_payment ÷ business_days (RCPM = $0)
    // - Leased: weekly_payment ÷ 5 (RCPM = cents_per_mile × miles)
    const assetOwnership = selectedVehicleData.asset_ownership?.toLowerCase() || 'owned';
    
    let dailyRentalRate = 0;
    if (assetOwnership === 'leased') {
      const vehicleWeeklyPayment = selectedVehicleData.weekly_payment || 0;
      dailyRentalRate = vehicleWeeklyPayment / 5;
    } else {
      const vehicleMonthlyPayment = selectedVehicleData.monthly_payment || 0;
      dailyRentalRate = businessDaysInMonth > 0 ? vehicleMonthlyPayment / businessDaysInMonth : 0;
    }
    
    const vehicleInsuranceCost = selectedVehicleData.insurance_cost_per_month || 0;
    const dailyInsuranceRate = businessDaysInMonth > 0 ? vehicleInsuranceCost / businessDaysInMonth : 0;
    
    console.log('[30DaysView] dailyCostRates:', { dailyRentalRate, dailyInsuranceRate, businessDaysInMonth });
    
    return { dailyRentalRate, dailyInsuranceRate };
  }, [selectedVehicleData]);

  // Check if all data required for Carr Net calculation is loaded
  const isCarrNetDataReady = useMemo(() => {
    return !loading && driverCompensationLoaded && selectedVehicleData !== null;
  }, [loading, driverCompensationLoaded, selectedVehicleData]);

  // Calculate driver pay for a load
  const getDriverPay = (load: ApprovalLoad) => {
    if (!driverCompensation?.pay_method_active || !driverCompensation?.pay_method) return 0;
    
    const rate = load.rate || 0;
    const totalMiles = (load.empty_miles || 0) + (load.estimated_miles || 0);
    
    switch (driverCompensation.pay_method) {
      case 'percentage':
        return rate * ((driverCompensation.load_percentage || 0) / 100);
      case 'mileage':
        return totalMiles * (driverCompensation.pay_per_mile || 0);
      case 'salary':
      case 'hourly':
        return 0;
      case 'hybrid':
        return rate * ((driverCompensation.load_percentage || 0) / 100);
      default:
        return 0;
    }
  };

  // Calculate Carrier Net for a load (identical to FleetFinancialsTable)
  const calculateCarrierNet = (load: ApprovalLoad, loadIndex: number, date: Date) => {
    const rate = load.rate || 0;
    const carrierPayAmount = carrierRates[load.id] ?? load.carrier_rate ?? rate;
    const totalMiles = (load.empty_miles || 0) + (load.estimated_miles || 0);
    const drvPay = getDriverPay(load);
    const fuelCost = totalMiles > 0 ? (totalMiles / milesPerGallon) * dollarPerGallon : 0;
    const isBusinessDay = !isWeekend(date);
    const dailyRental = isBusinessDay && loadIndex === 0 ? dailyCostRates.dailyRentalRate : 0;
    const dailyInsurance = isBusinessDay && loadIndex === 0 ? dailyCostRates.dailyInsuranceRate : 0;
    const tolls = 0;
    const wcomp = 0;
    
    // Calculate factoring exactly like FleetFinancialsTable (rate * factoringPercentage / 100)
    const factoring = rate * (factoringPercentage / 100);
    
    // Calculate dispatcher pay exactly like FleetFinancialsTable
    const dispatcherId = load.assigned_dispatcher_id;
    const dispPercentage = dispatcherId ? (dispatcherPayInfo[dispatcherId] || 0) : 0;
    const dispPay = rate * (dispPercentage / 100);
    
    // Rental per mile calculation: ONLY applies to leased vehicles
    const assetOwnership = selectedVehicleData?.asset_ownership?.toLowerCase() || 'owned';
    const rentalPerMile = assetOwnership === 'leased' && selectedVehicleData?.cents_per_mile
      ? selectedVehicleData.cents_per_mile * totalMiles
      : 0;
    
    // Build values for formula calculation - EXACTLY like FleetFinancialsTable
    const formulaValues: Record<string, number> = {
      payload: rate,
      carr_pay: carrierPayAmount,
      disp_pay: dispPay,
      drv_pay: drvPay,
      factor: factoring,
      fuel: fuelCost,
      rental: dailyRental,
      insur: dailyInsurance,
      tolls: tolls,
      wcomp: wcomp,
      other: DAILY_OTHER_COST,
      rental_per_mile: rentalPerMile,
    };
    
    // Use formula if configured, otherwise use default calculation
    const calculatedNet = calculateFormula("carr_net", formulaValues);
    if (calculatedNet !== null) {
      return calculatedNet;
    }
    
    // Default fallback matches FleetFinancialsTable exactly:
    // Carrier Pay - Driver Pay - WComp - Fuel - Tolls - Daily Rental - Rental Per Mile - Daily Insurance - Other
    return carrierPayAmount - drvPay - wcomp - fuelCost - tolls - dailyRental - rentalPerMile - dailyInsurance - DAILY_OTHER_COST;
  };

  const handleRateChange = (loadId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setCarrierRates(prev => ({ ...prev, [loadId]: numValue }));
  };

  const handlePayloadChange = async (loadId: string, value: string) => {
    const parsed = parseFloat(value);
    const numValue = Number.isFinite(parsed) ? parsed : 0;

    const loadRow = loads.find(l => l.id === loadId);
    const previousPayload = payloadRates[loadId] ?? loadRow?.rate ?? 0;
    const shouldBackfillApprovedPayload = !!(
      loadRow?.carrier_approved === true &&
      (loadRow?.approved_payload === null || loadRow?.approved_payload === undefined)
    );

    setPayloadRates(prev => ({ ...prev, [loadId]: numValue }));

    // Keep UI in sync immediately
    setLoads(prev =>
      prev.map(l =>
        l.id === loadId
          ? {
              ...l,
              rate: numValue,
              approved_payload: shouldBackfillApprovedPayload ? previousPayload : l.approved_payload,
            }
          : l
      )
    );

    const update: Record<string, any> = { rate: numValue };
    if (shouldBackfillApprovedPayload) update.approved_payload = previousPayload;

    const { error } = await supabase.from("loads").update(update).eq("id", loadId);
    if (error) {
      console.error("Failed to update payload:", error);
      toast.error("Failed to update payload");
    }
  };

  const handleCarrierPayApproval = async (load: ApprovalLoad) => {
    const currentPayloadValue = payloadRates[load.id] ?? load.rate ?? 0;
    const baselinePayload = load.approved_payload ?? load.rate ?? 0;
    const newCarrierPay = carrierRates[load.id] ?? load.carrier_rate ?? load.rate ?? 0;
    const isCurrentlyApproved = (carrierPayApproved[load.id] ?? load.carrier_approved) === true;
    
    // Check if payload changed (strikethrough scenario)
    const payloadChanged = isCurrentlyApproved &&
      Number(currentPayloadValue) !== Number(baselinePayload);
    
    // Get old rate for history tracking
    const oldRate = load.carrier_rate ?? null;
    
    // Determine behavior:
    // - If payload changed: ALWAYS update to new rate (re-approve)
    // - If not payload changed and currently approved: toggle OFF
    // - If not approved: approve
    const shouldApprove = payloadChanged ? true : !isCurrentlyApproved;
    
    // For payload changed scenario, user MUST enter a new rate
    if (payloadChanged && (carrierRates[load.id] === undefined || carrierRates[load.id] === null)) {
      toast.error("Please enter a new carrier rate before approving");
      return;
    }
    
    try {
      // Get current user for history tracking
      const { data: { user } } = await supabase.auth.getUser();
      let changedByName = "Unknown";
      
      if (user) {
        // Try to get user's name from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .single();
        
        changedByName = profile?.full_name || profile?.email || user.email || "Unknown";
      }
      
      const { error } = await supabase
        .from("loads")
        .update({
          carrier_rate: shouldApprove ? newCarrierPay : null,
          carrier_approved: shouldApprove,
          approved_payload: shouldApprove ? currentPayloadValue : null
        })
        .eq("id", load.id);

      if (error) throw error;
      
      // Save rate change to history when approving with a new/changed rate
      if (shouldApprove && (oldRate !== newCarrierPay || payloadChanged)) {
        // Get old payload for history tracking
        const oldPayload = load.approved_payload ?? load.rate ?? null;
        
        const { error: historyError } = await supabase
          .from("carrier_rate_history")
          .insert({
            load_id: load.id,
            old_rate: oldRate,
            new_rate: newCarrierPay,
            old_payload: oldPayload,
            new_payload: currentPayloadValue,
            changed_by: user?.id,
            changed_by_name: changedByName,
            notes: oldRate !== null ? `Rate changed from $${oldRate.toLocaleString()} to $${newCarrierPay.toLocaleString()}` : "Initial rate approval"
          });
        
        if (historyError) {
          console.error("Error saving rate history:", historyError);
        }
      }
      
      setCarrierPayApproved(prev => ({
        ...prev,
        [load.id]: shouldApprove
      }));
      
      // Clear the entered rate after successful approval
      if (shouldApprove && payloadChanged) {
        setCarrierRates(prev => {
          const updated = { ...prev };
          delete updated[load.id];
          return updated;
        });
      }
      
      if (shouldApprove) {
        toast.success(`Carrier pay of $${newCarrierPay.toLocaleString()} approved`);
      } else {
        toast.info("Carrier pay approval removed");
      }
      
      // Refresh data to get updated values
      loadData();
    } catch (error) {
      console.error("Error updating carrier pay approval:", error);
      toast.error("Failed to update carrier pay approval");
    }
  };

  const handleApprove = async (load: ApprovalLoad) => {
    const carrierPay = carrierRates[load.id] || load.rate || 0;
    const currentPayload = load.rate ?? 0;
    
    try {
      // Update the load with approved carrier pay and mark as carrier approved
      const { error } = await supabase
        .from("loads")
        .update({
          carrier_rate: carrierPay,
          carrier_approved: true,
          settlement_status: "approved",
          approved_payload: currentPayload
        })
        .eq("id", load.id);

      if (error) throw error;
      
      toast.success(`Load ${load.load_number} approved for carrier with rate $${carrierPay.toLocaleString()}`);
      loadData();
      loadCarriers(); // Refresh carrier pending counts
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

  // Calculate empty day net (cost on days without loads - identical to Fleet$)
  const calculateEmptyDayNet = (date: Date) => {
    const isBusinessDay = !isWeekend(date);
    const isFutureDate = isAfter(startOfDay(date), startOfDay(new Date()));
    if (!isBusinessDay || isFutureDate) return 0;
    
    const dailyRental = dailyCostRates.dailyRentalRate;
    const dailyInsurance = dailyCostRates.dailyInsuranceRate;
    return -(dailyRental + dailyInsurance + DAILY_OTHER_COST);
  };

  // Calculate weekly totals using Carrier Net formula (includes empty day costs)
  const calculateWeeklyTotal = (weekStart: Date) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    let total = 0;
    
    thirtyDaysRange.forEach(date => {
      if (date >= weekStart && date <= weekEnd) {
        const dateKey = formatInTimeZone(date, timezone, "yyyy-MM-dd");
        const dayLoads = loadsByDate[dateKey] || [];
        
        if (dayLoads.length === 0) {
          // Empty day - still incur daily costs (rental/insurance)
          total += calculateEmptyDayNet(date);
        } else {
          dayLoads.forEach((load, loadIndex) => {
            total += calculateCarrierNet(load, loadIndex, date);
          });
        }
      }
    });
    
    return total;
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Carrier Navigation */}
        <div className="w-[190px] border-r bg-card flex-shrink-0 flex flex-col">
          <div className="pl-3 pr-4 py-2 border-b space-y-1.5">
            <Button 
              variant="ghost" 
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground h-8"
              onClick={() => navigate("/dashboard/loads")}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Loads
            </Button>
          </div>

          <div className="pl-3 pr-4 py-2 border-b space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type to search..."
                value={carrierSearch}
                onChange={(e) => setCarrierSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            
            <div className="flex items-stretch rounded-md overflow-hidden shadow-md">
              <button
                onClick={() => {
                  setShowModifiedOnly(!showModifiedOnly);
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex-1 h-7 text-xs font-medium transition-all duration-200 rounded-l-md border-l border-t border-b",
                  showModifiedOnly 
                    ? "bg-gradient-to-b from-red-500 via-red-600 to-red-700 border-red-400/50 hover:from-red-600 hover:via-red-700 hover:to-red-800 text-white"
                    : "bg-gradient-to-b from-yellow-50 via-yellow-100 to-yellow-200 hover:from-yellow-100 hover:via-yellow-150 hover:to-yellow-250 text-yellow-800 border-yellow-300"
                )}
                style={!showModifiedOnly ? {
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05)"
                } : undefined}
              >
                {showModifiedOnly ? "Show All" : "Modified Loads"}
              </button>
              <span 
                className={cn(
                  "w-6 flex items-center justify-center text-[14px] font-bold rounded-r-md transition-all border-t border-r border-b",
                  showModifiedOnly
                    ? "bg-gradient-to-b from-red-500 via-red-600 to-red-700 border-red-800/30 text-white"
                    : "bg-gradient-to-b from-yellow-50 via-yellow-100 to-yellow-200 border-yellow-300 text-red-600"
                )}
                style={!showModifiedOnly ? {
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05)"
                } : undefined}
              >
                {showModifiedOnly ? loads.length : modifiedLoadsCount}
              </span>
            </div>
          </div>
          
          <div className="pl-3 pr-4 py-2 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col w-[85%]">
                {filteredCarriers.map((carrier, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  const pendingCount = carrierPendingCounts.get(carrier.id) || 0;
                  return (
                    <div key={carrier.id} className="flex items-stretch">
                      <button
                        onClick={() => handleCarrierSelect(carrier.id)}
                        className={cn(
                          "flex-1 h-7 text-left px-3 text-xs font-medium transition-all border-l border-t",
                          isLast && "border-b",
                          isFirst && "rounded-tl-md",
                          isLast && "rounded-bl-md",
                          pendingCount === 0 && "border-r",
                          pendingCount === 0 && isFirst && "rounded-tr-md",
                          pendingCount === 0 && isLast && "rounded-br-md",
                          selectedCarrier === carrier.id
                            ? "btn-glossy-primary text-white border-primary/30"
                            : "btn-glossy text-gray-700 border-gray-300/50"
                        )}
                      >
                        <div className="truncate">{carrier.name}</div>
                      </button>
                      {pendingCount > 0 && (
                        <span 
                          className={cn(
                            "w-6 flex items-center justify-center text-[14px] font-bold border-t border-r transition-all",
                            isFirst && "rounded-tr-md",
                            isLast && "rounded-br-md border-b",
                            selectedCarrier === carrier.id
                              ? "btn-glossy-primary border-primary/30 !text-red-600"
                              : "btn-glossy border-gray-300/50 !text-red-600"
                          )}
                        >
                          {pendingCount}
                        </span>
                      )}
                    </div>
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
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Load Approval</h2>
            {/* Truck filter buttons */}
            {selectedCarrier !== "all" && vehicles.length > 0 && (
              <div className="flex items-center">
                {vehicles.map((v, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicle(v.id === selectedVehicle ? "all" : v.id)}
                      className={cn(
                        "h-7 px-2.5 text-sm font-medium transition-all border-y border-l",
                        isFirst && "rounded-l-md",
                        isLast && "rounded-r-md border-r",
                        selectedVehicle === v.id
                          ? "btn-glossy-primary text-white border-primary/30"
                          : "btn-glossy text-gray-700 border-gray-300/50"
                      )}
                    >
                      {v.vehicle_number}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Badge variant="outline" className="text-xs">
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
                    <TableHead className="text-xs">
                      <div className="leading-tight">
                        <div className="whitespace-nowrap">Truck ID /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Driver</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs">
                      <div className="leading-tight">
                        <div className="whitespace-nowrap">Carrier /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Customer</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs">
                      <div className="leading-tight">
                        <div className="whitespace-nowrap">Our Load ID /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Customer Load</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs">
                      <div className="leading-tight">
                        <div className="whitespace-nowrap">Origin /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Destination</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs">
                      <div className="leading-tight">
                        <div className="whitespace-nowrap">Pickup /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Delivery</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <div className="flex flex-col items-end leading-tight">
                        <div className="whitespace-nowrap">Empty Miles /</div>
                        <div className="text-muted-foreground whitespace-nowrap">Loaded Miles</div>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs text-right">$/Mile</TableHead>
                    <TableHead className="text-xs text-right">Payload</TableHead>
                    <TableHead className="text-xs text-right">Carrier Pay</TableHead>
                    <TableHead className="text-xs text-right">Brokering Net</TableHead>
                    <TableHead className="text-xs text-right">$/Mile</TableHead>
                    <TableHead className="text-xs">Dispatcher</TableHead>
                    <TableHead className="text-xs">View Load</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : paginatedLoads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                        No loads ready for approval
                      </TableCell>
                    </TableRow>
                  ) : paginatedLoads.map(load => {
                    const loadedMiles = load.estimated_miles || 0;
                    const emptyMiles = load.empty_miles || 0;

                    // Use local payload state if edited, otherwise use DB value
                    const currentPayloadValue = payloadRates[load.id] ?? load.rate ?? 0;
                    const baselinePayload = load.approved_payload ?? load.rate ?? 0;
                    const isApproved = (carrierPayApproved[load.id] ?? load.carrier_approved) === true;

                    const customerRate = (load as any).customer_rate ?? currentPayloadValue ?? 0;
                    const customerRatePerMile = loadedMiles > 0 ? customerRate / loadedMiles : 0;

                    const carrierPay = carrierRates[load.id] ?? load.carrier_rate ?? currentPayloadValue ?? 0;
                    const carrierRatePerMile = loadedMiles > 0 ? carrierPay / loadedMiles : 0;

                    // Calculate Brokering Net = Payload - Carrier Pay - Dispatch Pay - Factoring
                    const dispatcherPayPct = load.assigned_dispatcher_id ? (dispatcherPayInfo[load.assigned_dispatcher_id] || 0) : 0;
                    const dispatcherPay = currentPayloadValue * (dispatcherPayPct / 100);
                    const factoring = currentPayloadValue * (factoringPercentage / 100);
                    const brokeringNet = currentPayloadValue - carrierPay - dispatcherPay - factoring;

                    // Payload changed after approval => require new carrier pay
                    const payloadChanged = isApproved &&
                      Number(currentPayloadValue) !== Number(baselinePayload);

                    const previousApprovedRate = payloadChanged
                      ? (load.carrier_rate ?? 0)
                      : null;
                    
                    // Try to get driver name from load's assigned driver first, then fall back to the vehicle's driver
                    let driverName = "-";
                    const loadDriverInfo = load.driver?.personal_info;
                    const vehicleDriverId = (load.vehicle as any)?.driver_1_id as string | undefined;
                    const vehicleDriverInfo = vehicleDriverId ? vehicleDriverInfoById[vehicleDriverId] : undefined;
                    const driverInfo = loadDriverInfo || vehicleDriverInfo;

                    if (driverInfo) {
                      const firstName = driverInfo.first_name || driverInfo.firstName || "";
                      const lastName = driverInfo.last_name || driverInfo.lastName || "";
                      driverName = `${firstName} ${lastName}`.trim() || "-";
                    }

                    // Get status badge styling based on actual load status
                    const getStatusBadge = (status: string) => {
                      const statusLower = status?.toLowerCase() || "";
                      if (statusLower.includes("completed") || statusLower.includes("delivered")) {
                        return { bg: "bg-green-500/10", text: "text-green-600", border: "border-green-500/30" };
                      }
                      if (statusLower.includes("transit") || statusLower.includes("dispatched")) {
                        return { bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/30" };
                      }
                      if (statusLower.includes("cancelled")) {
                        return { bg: "bg-red-500/10", text: "text-red-600", border: "border-red-500/30" };
                      }
                      return { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30" };
                    };

                    const statusStyle = getStatusBadge(load.status);
                    const displayStatus = load.status?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) || "Pending";

                    return (
                      <TableRow 
                        key={load.id} 
                        className={cn(
                          "hover:bg-muted/30 cursor-pointer",
                          selectedLoadId === load.id && "!bg-none !bg-green-200 dark:!bg-green-800/40 ring-2 ring-green-500/50 ring-inset"
                        )}
                        onClick={() => setSelectedLoadId(selectedLoadId === load.id ? null : load.id)}
                      >
                        <TableCell className="min-w-[100px]">
                          <Badge 
                            variant="outline" 
                            className={cn(statusStyle.bg, statusStyle.text, statusStyle.border, "text-xs whitespace-nowrap")}
                          >
                            {displayStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs min-w-[90px]">
                          <div className="font-medium">{load.vehicle?.vehicle_number || "-"}</div>
                          <div className="text-muted-foreground truncate max-w-[90px]" title={driverName}>{driverName}</div>
                        </TableCell>
                        <TableCell className="text-xs min-w-[140px]">
                          <div className="font-medium truncate max-w-[140px]" title={load.carrier?.name || "-"}>{load.carrier?.name || "-"}</div>
                          <div className="text-muted-foreground truncate max-w-[140px]" title={load.customer?.name || load.broker_name || "-"}>{load.customer?.name || load.broker_name || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{load.load_number}</div>
                          <div className="text-muted-foreground">{(load as any).reference_number || (load as any).shipper_load_id || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs min-w-[120px]">
                          <div className="whitespace-nowrap">{load.pickup_city}{load.pickup_state ? `, ${load.pickup_state}` : ""}</div>
                          <div className="text-muted-foreground whitespace-nowrap">{load.delivery_city}{load.delivery_state ? `, ${load.delivery_state}` : ""}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yy") : "-"}</div>
                          <div className="text-muted-foreground">{load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yy") : "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <div>{Math.round(emptyMiles)}</div>
                          <div className="text-muted-foreground">{Math.round(loadedMiles)}</div>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          ${customerRatePerMile.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm">
                          ${(load.rate ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Input column with strikethrough above */}
                            <div className="flex flex-col items-end gap-0.5">
                              {/* Show old approved rate with strikethrough if payload changed */}
                              {payloadChanged && previousApprovedRate !== null && (
                                <span className="text-xs font-bold text-red-600 line-through pr-1">
                                  ${previousApprovedRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {/* Input for new rate */}
                              <div className="relative w-24">
                                <span className={cn(
                                  "absolute left-2 top-1/2 -translate-y-1/2 font-bold text-sm",
                                  (carrierPayApproved[load.id] && !payloadChanged) ? "text-green-600" : "text-red-600"
                                )}>$</span>
                                <Input
                                  type="number"
                                  value={carrierRates[load.id] ?? (payloadChanged ? "" : (load.carrier_rate ?? load.rate ?? ""))}
                                  onChange={(e) => handleRateChange(load.id, e.target.value)}
                                  className={cn(
                                    "w-24 h-7 text-sm text-right font-bold pl-5 !shadow-none !bg-none",
                                    payloadChanged
                                      ? "!bg-orange-50 text-red-600"
                                      : (carrierPayApproved[load.id] ?? load.carrier_approved)
                                        ? "!bg-green-50 text-green-600" 
                                        : "!bg-orange-50 text-red-600"
                                  )}
                                  placeholder={payloadChanged ? "New rate" : "0.00"}
                                />
                              </div>
                            </div>
                            {/* Approval button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCarrierPayApproval(load);
                              }}
                              className={cn(
                                "h-6 w-6 rounded-md flex items-center justify-center transition-all duration-200 shadow-md self-end",
                                (carrierPayApproved[load.id] && !payloadChanged)
                                  ? "bg-green-500 hover:bg-green-600"
                                  : "bg-gray-100 hover:bg-gray-200 border border-gray-300"
                              )}
                            >
                              <Check className={cn(
                                "h-4 w-4",
                                (carrierPayApproved[load.id] && !payloadChanged) ? "text-white" : "text-black"
                              )} />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-xs text-right font-bold", brokeringNet >= 0 ? "text-green-600" : "text-destructive")}>
                          ${brokeringNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/load/${load.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
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
              <div className="flex items-center justify-between px-3 py-1 border-t">
                <span className="text-xs text-muted-foreground">
                  Items per page: {ROWS_PER_PAGE}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(currentPage - 1) * ROWS_PER_PAGE + 1} – {Math.min(currentPage * ROWS_PER_PAGE, loads.length)} of {loads.length}
                  </span>
                  <Pagination className="w-auto mx-0 flex-none">
                    <PaginationContent className="gap-0.5">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={cn(
                            "h-7 px-2 py-0 text-xs",
                            currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={cn(
                            "h-7 px-2 py-0 text-xs",
                            currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 30 Days View + Map Layout */}
        <div className="flex-1 min-h-0 flex gap-2">
          {/* Calendar View - 30 Days of Loads */}
          <Card className="w-auto min-w-0 flex-shrink-0">
            <CardContent className="p-2 h-full flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-base">30 Days View</h3>
              </div>
              {selectedLoadId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLoadId(null)}
                  className="text-xs h-6 px-2"
                >
                  Show All
                </Button>
              )}
            </div>
            
            <div className="flex-1 min-h-0 overflow-auto">
              <Table className="table-glossy w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-30 shadow-sm [&_th]:sticky [&_th]:top-0 [&_th]:z-30 bg-muted [&_th]:bg-muted">
                  <TableRow className="border-b">
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide w-10"></TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-left w-20">P/U Date</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-left w-[130px]">Customer</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-left w-16">Location</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-16">Pay Load</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-14">Empty</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-14">Loaded</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-14">Total</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-14">$/Mi</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right text-green-600 w-20">Carr Pay</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right w-14">$/Mi</TableHead>
                    <TableHead className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide text-right font-bold w-20">Carr Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thirtyDaysRange.map((date, index) => {
                    const dateKey = formatInTimeZone(date, timezone, "yyyy-MM-dd");
                    const dayLoads = loadsByDate[dateKey] || [];
                    const dayName = formatInTimeZone(date, timezone, "EEE");
                    const dateStr = formatInTimeZone(date, timezone, "MM/dd");
                    const isWeekendDay = isWeekend(date);
                    const isWeekEnd = date.getDay() === 0; // Sunday
                    const isToday = dateKey === todayKey;
                    
                    // Calculate running total for the week
                    let weeklyTotal = 0;
                    if (isWeekEnd) {
                      weeklyTotal = calculateWeeklyTotal(startOfWeek(date, { weekStartsOn: 1 }));
                    }

                    if (dayLoads.length === 0) {
                      const emptyDayNet = calculateEmptyDayNet(date);
                      const isFutureDate = isAfter(startOfDay(date), startOfDay(new Date()));
                      
                      return (
                        <Fragment key={dateKey}>
                          <TableRow 
                            className={cn(
                              "text-muted-foreground h-[25px]",
                              isToday && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20",
                              isWeekendDay && !isToday && "bg-none bg-red-50/50 dark:bg-red-950/20"
                            )}
                          >
                            <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday ? "text-green-600 font-bold" : isWeekendDay && "text-red-600")}>
                              {isToday ? "Today" : dayName}
                            </TableCell>
                            <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday ? "text-green-600 font-bold" : isWeekendDay && "text-red-600")}>
                              {dateStr}
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
                            <TableCell className={cn("text-right font-bold !px-2 !py-0.5", emptyDayNet < 0 ? "text-destructive" : "")}> 
                              {/* Show daily cost as negative CARR NET on business days up to today */}
                              {!isCarrNetDataReady 
                                ? "..."
                                : (!isFutureDate && !isWeekendDay && emptyDayNet !== 0
                                  ? (emptyDayNet < 0
                                      ? `-$${Math.abs(emptyDayNet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : `$${emptyDayNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                                  : "")}
                            </TableCell>
                          </TableRow>
                          {/* Weekly Summary Row */}
                          {isWeekEnd && (
                            <TableRow className="bg-muted/50 border-t-2">
                              <TableCell colSpan={11} className="text-right font-semibold pr-3 !px-2 !py-1">
                                Weekly Total:
                              </TableCell>
                              <TableCell className="text-right !px-2 !py-1">
                                {isCarrNetDataReady ? (
                                  <span className={cn("font-bold", weeklyTotal >= 0 ? "text-green-600" : "text-destructive")}>
                                    ${weeklyTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : "..."}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    }

                    return (
                      <Fragment key={dateKey}>
                        {dayLoads.map((load, loadIndex) => {
                          const totalMiles = (load.estimated_miles || 0) + (load.empty_miles || 0);
                          const ratePerMile = totalMiles > 0 ? (load.rate || 0) / totalMiles : 0;
                          const carrierPay = carrierRates[load.id] ?? load.carrier_rate ?? load.rate ?? 0;
                          const carrierRatePerMile = (load.estimated_miles || 0) > 0 ? carrierPay / (load.estimated_miles || 1) : 0;
                          const carrierNet = calculateCarrierNet(load, loadIndex, date);

                          const isSelectedLoad = load.id === selectedLoadId;

                          return (
                            <TableRow 
                              key={`${dateKey}-${load.id}`}
                              ref={isSelectedLoad ? selectedRowRef : null}
                              className={cn(
                                "hover:bg-muted/30 h-[25px]",
                                isToday && !isSelectedLoad && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20",
                                isWeekendDay && !isToday && !isSelectedLoad && "bg-none bg-red-50/50 dark:bg-red-950/20",
                                isSelectedLoad && "!bg-none !bg-green-200 dark:!bg-green-800/40 ring-2 ring-green-500/50 ring-inset"
                              )}
                            >
                              <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday ? "text-green-600 font-bold" : isWeekendDay && "text-red-600")}>
                                {loadIndex === 0 ? (isToday ? "Today" : dayName) : ""}
                              </TableCell>
                              <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday ? "text-green-600 font-bold" : isWeekendDay && "text-red-600")}>
                                {loadIndex === 0 ? dateStr : ""}
                              </TableCell>
                              <TableCell className="truncate max-w-[130px] !px-2 !py-0.5" title={load.customer?.name || load.broker_name || "-"}>
                                {((load.customer?.name || load.broker_name || "-").length > 18 
                                  ? (load.customer?.name || load.broker_name || "-").slice(0, 18) + "..." 
                                  : (load.customer?.name || load.broker_name || "-"))}
                              </TableCell>
                              <TableCell className="text-xs !px-2 !py-0.5">
                                {load.pickup_state}→{load.delivery_state}
                              </TableCell>
                              <TableCell className="text-right font-semibold !px-2 !py-0.5">${(load.rate || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right !px-2 !py-0.5">{Math.round(load.empty_miles || 0)}</TableCell>
                              <TableCell className="text-right !px-2 !py-0.5">{Math.round(load.estimated_miles || 0)}</TableCell>
                              <TableCell className="text-right font-medium !px-2 !py-0.5">{Math.round(totalMiles)}</TableCell>
                              <TableCell className="text-right !px-2 !py-0.5">${ratePerMile.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-green-600 font-medium !px-2 !py-0.5">
                                ${carrierPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right !px-2 !py-0.5">${carrierRatePerMile.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-bold !px-2 !py-0.5">
                                {isCarrNetDataReady 
                                  ? `$${carrierNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "..."}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Weekly Summary Row */}
                        {isWeekEnd && (
                          <TableRow className="bg-muted/50 border-t-2">
                            <TableCell colSpan={11} className="text-right font-semibold pr-3 !px-2 !py-1">
                              Weekly Total:
                            </TableCell>
                            <TableCell className="text-right !px-2 !py-1">
                              {isCarrNetDataReady ? (
                                <span className={cn("font-bold", weeklyTotal >= 0 ? "text-green-600" : "text-destructive")}>
                                  ${weeklyTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : "..."}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Route Map */}
        <Card className="flex-1 min-h-0">
          <CardContent className="p-2 h-full flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-base">Route Map</h3>
            </div>
            <div className="flex-1 min-h-0">
              <LoadApprovalMap 
                selectedLoad={selectedLoadId ? loads.find(l => l.id === selectedLoadId) || null : null} 
              />
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
      </div>
    </div>
  );
}
