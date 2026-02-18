import { useEffect, useState, useRef } from "react";
import DOMPurify from 'dompurify';
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Truck, Plus, Trash2, FileText, DollarSign, AlertCircle, CheckCircle, Mail, ChevronDown, ChevronRight, Package, Users, Building, MapPinned, ClipboardCheck, FileDown, Pencil, Eye } from "lucide-react";
import { generateRateConfirmation, generateBOL } from "@/lib/generateLoadPdf";
import { Separator } from "@/components/ui/separator";
import LoadRouteMap from "@/components/LoadRouteMap";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { AddDispatcherDialog } from "@/components/AddDispatcherDialog";
import { AddVehicleDialog } from "@/components/AddVehicleDialog";
import { EditEntityDialog } from "@/components/EditEntityDialog";
import { LoadDocuments } from "@/components/LoadDocuments";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
import { cleanLoadNotes } from "@/lib/companyName";

export default function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId, shouldFilter, isPlatformAdmin } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [load, setLoad] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const originalAssignedVehicleIdRef = useRef<string | null>(null);
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierLookupLoading, setCarrierLookupLoading] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
   const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState(false);
  const [newStop, setNewStop] = useState({
    stop_type: "pickup",
    location_name: "",
    location_address: "",
    location_city: "",
    location_state: "",
    location_zip: "",
    contact_name: "",
    contact_phone: "",
    scheduled_date: "",
    scheduled_time_start: "",
    scheduled_time_end: "",
    notes: "",
  });
  const [newExpense, setNewExpense] = useState({
    expense_type: "fuel",
    amount: "",
    description: "",
    incurred_date: "",
    paid_by: "driver",
    notes: "",
  });
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [originalEmail, setOriginalEmail] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id, tenantId, shouldFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // ALWAYS apply tenant filter (no more bypass)
      const shouldApplyFilter = shouldFilter && tenantId;
      
      // Base queries
      let driversQuery = supabase.from("applications").select("id, personal_info").eq("driver_status", "active");
      let vehiclesQuery = supabase.from("vehicles").select("id, vehicle_number, make, model, driver_1_id, asset_type, vehicle_size, asset_subtype, requires_load_approval, carrier, truck_type, contractor_percentage").eq("status", "active");
      let dispatchersQuery = supabase.from("dispatchers").select("id, first_name, last_name").eq("status", "active");
      let locationsQuery = supabase.from("locations").select("*").eq("status", "active");
      let carriersQuery = supabase.from("carriers").select("id, name, dot_number, mc_number, safer_status, safety_rating").eq("status", "active");
      let customersQuery = supabase.from("customers").select("id, name, contact_name, phone, email, address, city, state, zip").eq("status", "active");
      
      // Apply tenant filter to all tenant-owned tables
      if (shouldApplyFilter) {
        driversQuery = driversQuery.eq("tenant_id", tenantId);
        vehiclesQuery = vehiclesQuery.eq("tenant_id", tenantId);
        dispatchersQuery = dispatchersQuery.eq("tenant_id", tenantId);
        locationsQuery = locationsQuery.eq("tenant_id", tenantId);
        carriersQuery = carriersQuery.eq("tenant_id", tenantId);
        customersQuery = customersQuery.eq("tenant_id", tenantId);
      }
      
      const [loadRes, stopsRes, expensesRes, docsRes, driversRes, vehiclesRes, dispatchersRes, locationsRes, carriersRes, customersRes, companyProfileRes] = await Promise.all([
        supabase.from("loads").select("*").eq("id", id).single(),
        supabase.from("load_stops").select("*").eq("load_id", id).order("stop_sequence"),
        supabase.from("load_expenses").select("*").eq("load_id", id).order("incurred_date", { ascending: false }),
        supabase.from("load_documents").select("*").eq("load_id", id).order("uploaded_at", { ascending: false }),
        driversQuery,
        vehiclesQuery,
        dispatchersQuery,
        locationsQuery,
        carriersQuery,
        customersQuery,
        supabase.from("company_profile").select("company_name, legal_name, address, city, state, zip, phone, email, mc_number, dot_number, logo_url, factoring_company_name, factoring_company_address, factoring_company_city, factoring_company_state, factoring_company_zip, factoring_contact_name, factoring_contact_email").limit(1).single(),
      ]);

      if (loadRes.error) throw loadRes.error;
      setLoad(loadRes.data);
      originalAssignedVehicleIdRef.current = (loadRes.data as any)?.assigned_vehicle_id ?? null;
      setStops(stopsRes.data || []);
      setExpenses(expensesRes.data || []);
      setDocuments(docsRes.data || []);
      setDrivers(driversRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setDispatchers(dispatchersRes.data || []);
      setLocations(locationsRes.data || []);
      setCarriers(carriersRes.data || []);
      setCustomers(customersRes.data || []);
      setCompanyProfile(companyProfileRes.data);

      // Fetch original email if load came from Load Hunter
      if (loadRes.data?.load_email_id) {
        const { data: emailData } = await supabase
          .from("load_emails")
          .select("*")
          .eq("id", loadRes.data.load_email_id)
          .single();
        setOriginalEmail(emailData);
      }
    } catch (error: any) {
      toast.error("Error loading load details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate distance between pickup and delivery when miles are blank
  const calculateDistance = async (loadData: any) => {
    if (!loadData.pickup_city || !loadData.pickup_state || !loadData.delivery_city || !loadData.delivery_state) {
      return null;
    }

    try {
      // Geocode pickup location
      const pickupQuery = `${loadData.pickup_city}, ${loadData.pickup_state}`;
      const { data: pickupData, error: pickupError } = await supabase.functions.invoke('geocode', {
        body: { query: pickupQuery }
      });
      
      if (pickupError || !pickupData?.lat || !pickupData?.lng) {
        console.error('Failed to geocode pickup:', pickupError);
        return null;
      }

      // Geocode delivery location
      const deliveryQuery = `${loadData.delivery_city}, ${loadData.delivery_state}`;
      const { data: deliveryData, error: deliveryError } = await supabase.functions.invoke('geocode', {
        body: { query: deliveryQuery }
      });

      if (deliveryError || !deliveryData?.lat || !deliveryData?.lng) {
        console.error('Failed to geocode delivery:', deliveryError);
        return null;
      }

      // Calculate distance using Haversine formula
      const R = 3959; // Earth's radius in miles
      const dLat = (deliveryData.lat - pickupData.lat) * Math.PI / 180;
      const dLon = (deliveryData.lng - pickupData.lng) * Math.PI / 180;
      const lat1 = pickupData.lat * Math.PI / 180;
      const lat2 = deliveryData.lat * Math.PI / 180;

      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const directDistance = R * c;

      // Apply road distance multiplier (typically 1.2-1.4 for driving vs straight line)
      return Math.round(directDistance * 1.25);
    } catch (error) {
      console.error('Error calculating distance:', error);
      return null;
    }
  };

  // Auto-calculate miles when load is loaded and miles field is blank
  useEffect(() => {
    const autoCalculateMiles = async () => {
      if (load && !load.estimated_miles && load.pickup_city && load.pickup_state && load.delivery_city && load.delivery_state) {
        const calculatedMiles = await calculateDistance(load);
        if (calculatedMiles && calculatedMiles > 0) {
          // Update local state
          setLoad((prev: any) => ({ ...prev, estimated_miles: calculatedMiles }));
          
          // Save to database
          await supabase
            .from("loads")
            .update({ estimated_miles: calculatedMiles })
            .eq("id", id);
            
          toast.success(`Distance calculated: ${calculatedMiles} miles`);
        }
      }
    };

    autoCalculateMiles();
  }, [load?.id, load?.pickup_city, load?.pickup_state, load?.delivery_city, load?.delivery_state]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const assignedVehicleId = (load?.assigned_vehicle_id as string | null) ?? null;
      const assignedVehicle = vehicles.find((v: any) => v.id === assignedVehicleId);
      const requiresApproval = assignedVehicle?.requires_load_approval === true;
      const assignedChanged = originalAssignedVehicleIdRef.current !== assignedVehicleId;
      
      // Check truck type and auto-approval settings
      const isContractorTruck = assignedVehicle?.truck_type === 'contractor_truck';
      const isMyTruck = assignedVehicle?.truck_type === 'my_truck' || !assignedVehicle?.truck_type;
      const contractorPercentage = assignedVehicle?.contractor_percentage || 0;
      const shouldAutoApproveContractor = isContractorTruck && !requiresApproval && assignedChanged;
      const shouldAutoApproveMyTruck = isMyTruck && assignedChanged;
      
      // Calculate carrier_rate based on truck type
      let carrierRateToSave = load.carrier_rate;
      let carrierApprovedToSave = load.carrier_approved;
      let approvedPayloadToSave = load.approved_payload;
      
      if (assignedChanged) {
        const loadRate = parseFloat(load.rate) || 0;
        
        if (shouldAutoApproveMyTruck) {
          // "My Truck" gets 100% of the rate automatically
          carrierRateToSave = loadRate;
          carrierApprovedToSave = true;
          approvedPayloadToSave = loadRate;
        } else if (shouldAutoApproveContractor) {
          // Auto-approve using contractor percentage
          carrierRateToSave = loadRate * (contractorPercentage / 100);
          carrierApprovedToSave = true;
          approvedPayloadToSave = loadRate; // Track the rate at time of approval
        } else if (requiresApproval) {
          // Reset approval status when reassigning to a vehicle requiring approval
          carrierApprovedToSave = false;
          approvedPayloadToSave = null;
        }
      }

      const { error } = await supabase
        .from("loads")
        .update({
          load_number: load.load_number,
          customer_id: load.customer_id,
          status: load.status,
          financial_status: load.financial_status,
          settlement_status: load.settlement_status,
          assigned_driver_id: load.assigned_driver_id,
          assigned_vehicle_id: load.assigned_vehicle_id,
          external_truck_reference: load.external_truck_reference,
          assigned_dispatcher_id: load.assigned_dispatcher_id,
          load_owner_id: load.load_owner_id,
          carrier_id: load.carrier_id,
          equipment_type: load.equipment_type,
          temperature_required: load.temperature_required,
          hazmat: load.hazmat,
          team_required: load.team_required,
          commodity_type: load.commodity_type,
          cargo_description: load.cargo_description,
          cargo_weight: load.cargo_weight,
          cargo_pieces: load.cargo_pieces,
          rate: load.rate,
          customer_rate: load.customer_rate,
          carrier_rate: carrierRateToSave,
          carrier_approved: carrierApprovedToSave,
          approved_payload: approvedPayloadToSave,
          broker_fee: load.broker_fee,
          fuel_surcharge: load.fuel_surcharge,
          accessorial_charges: load.accessorial_charges,
          detention_charges: load.detention_charges,
          layover_charges: load.layover_charges,
          other_charges: load.other_charges,
          estimated_miles: load.estimated_miles,
          actual_miles: load.actual_miles,
          empty_miles: load.empty_miles,
          special_instructions: load.special_instructions,
          dispatch_notes: load.dispatch_notes,
          billing_notes: load.billing_notes,
          notes: load.notes,
          reference_number: load.reference_number,
          // Pickup/Delivery info
          pickup_city: load.pickup_city,
          pickup_state: load.pickup_state,
          pickup_address: load.pickup_address,
          pickup_zip: load.pickup_zip,
          pickup_date: load.pickup_date,
          pickup_time: load.pickup_time,
          pickup_notes: load.pickup_notes,
          delivery_city: load.delivery_city,
          delivery_state: load.delivery_state,
          delivery_address: load.delivery_address,
          delivery_zip: load.delivery_zip,
          delivery_date: load.delivery_date,
          delivery_time: load.delivery_time,
          delivery_notes: load.delivery_notes,
          // Billing party / broker info
          broker_name: load.broker_name,
          broker_contact: load.broker_contact,
          broker_phone: load.broker_phone,
          broker_email: load.broker_email,
          broker_address: load.broker_address,
          broker_city: load.broker_city,
          broker_state: load.broker_state,
          broker_zip: load.broker_zip,
          // Shipper info
          shipper_name: load.shipper_name,
          shipper_address: load.shipper_address,
          shipper_phone: load.shipper_phone,
          shipper_email: load.shipper_email,
          // Receiver info
          receiver_name: load.receiver_name,
          receiver_address: load.receiver_address,
          receiver_phone: load.receiver_phone,
          receiver_email: load.receiver_email,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Load updated successfully");
    } catch (error: any) {
      toast.error("Failed to update load");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCarrierLookup = async () => {
    const rawSearch = carrierSearch.trim();
    if (!rawSearch) {
      toast.error("Please enter a DOT or MC number");
      return;
    }

    // Normalize to digits so it works whether user types "MC 827893" or "827893"
    const searchDigits = rawSearch.replace(/\D/g, "");
    if (!searchDigits) {
      toast.error("Please enter a valid DOT or MC number");
      return;
    }

    setCarrierLookupLoading(true);
    try {
      // 1) Prefer existing carriers in your list (DOT or MC match) and just assign them
      const { data: matchingCarriers, error: existingError } = await supabase
        .from("carriers")
        .select("id, name, mc_number, dot_number, status")
        .or(`dot_number.ilike.%${searchDigits}%,mc_number.ilike.%${searchDigits}%`);

      if (existingError) throw existingError;

      if (matchingCarriers && matchingCarriers.length > 0) {
        const carrierToUse = matchingCarriers[0];
        updateField("carrier_id", carrierToUse.id);
        toast.success(`Assigned existing carrier "${carrierToUse.name}" to this load`);
        setCarrierDialogOpen(false);
        setCarrierSearch("");
        return;
      }

      // 2) If not found locally, look up via edge function (supports USDOT)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ usdot: searchDigits }),
        }
      );

      const data = await response.json();

      // Handle "not found" response from edge function
      if (data?.found === false || data?.error === "Carrier not found with this USDOT number") {
        toast.error(
          `Carrier not found with DOT/MC: ${rawSearch}. Please verify the number or add the carrier manually from the Carriers section.`,
        );
        return;
      }

      const carrierName = data.dba_name || data.name || "Unknown carrier";
      const summary = `${carrierName} (USDOT: ${data.usdot || searchDigits}${
        data.mc_number ? `, MC: ${data.mc_number}` : ""
      })`;

      const confirmed = window.confirm(
        `We found ${summary}.\n\nDo you want to add this carrier to your list and assign it to this load?`,
      );

      if (!confirmed) {
        toast("Carrier not added. You can always add it later from the Carriers section.");
        return;
      }

      // 3) Add carrier to database only after user confirms
      const { data: newCarrier, error } = await supabase
        .from("carriers")
        .insert({
          name: carrierName,
          mc_number: data.mc_number || "",
          dot_number: data.usdot || searchDigits,
          phone: data.phone || "",
          address: data.physical_address || "",
          safer_status: data.safer_status || null,
          safety_rating: data.safety_rating || null,
          status: "active",
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-assign the newly added carrier to this load
      updateField("carrier_id", newCarrier.id);
      toast.success("Carrier added and assigned successfully");
      setCarrierDialogOpen(false);
      setCarrierSearch("");
      loadData();
    } catch (error: any) {
      console.error("Carrier lookup error:", error);
      toast.error("Failed to lookup or add carrier. Please try again or add it manually from Carriers.");
    } finally {
      setCarrierLookupLoading(false);
    }
  };

  const handleAddStop = async () => {
    try {
      const maxSequence = stops.length > 0 ? Math.max(...stops.map(s => s.stop_sequence)) : 0;
      const { error } = await supabase.from("load_stops").insert([{
        load_id: id,
        stop_sequence: maxSequence + 1,
        ...newStop,
      }]);
      
      if (error) throw error;
      toast.success("Stop added successfully");
      setStopDialogOpen(false);
      setNewStop({
        stop_type: "pickup",
        location_name: "",
        location_address: "",
        location_city: "",
        location_state: "",
        location_zip: "",
        contact_name: "",
        contact_phone: "",
        scheduled_date: "",
        scheduled_time_start: "",
        scheduled_time_end: "",
        notes: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add stop");
      console.error(error);
    }
  };

  const handleDeleteStop = async (stopId: string) => {
    if (!confirm("Are you sure you want to delete this stop?")) return;
    
    try {
      const { error } = await supabase.from("load_stops").delete().eq("id", stopId);
      if (error) throw error;
      toast.success("Stop deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete stop");
      console.error(error);
    }
  };

  const handleUpdateStopStatus = async (stopId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      
      if (newStatus === "arrived") {
        updateData.actual_arrival = new Date().toISOString();
      } else if (newStatus === "departed") {
        updateData.actual_departure = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from("load_stops")
        .update(updateData)
        .eq("id", stopId);
      
      if (error) throw error;
      toast.success("Stop status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update stop status");
      console.error(error);
    }
  };

  const handleAddExpense = async () => {
    try {
      if (!tenantId) {
        toast.error("No tenant selected");
        return;
      }
      
      const { error } = await supabase.from("load_expenses").insert([{
        load_id: id,
        ...newExpense,
        amount: parseFloat(newExpense.amount),
        tenant_id: tenantId,
      }]);
      
      if (error) throw error;
      toast.success("Expense added successfully");
      setExpenseDialogOpen(false);
      setNewExpense({
        expense_type: "fuel",
        amount: "",
        description: "",
        incurred_date: "",
        paid_by: "driver",
        notes: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add expense");
      console.error(error);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    
    try {
      const { error } = await supabase.from("load_expenses").delete().eq("id", expenseId);
      if (error) throw error;
      toast.success("Expense deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete expense");
      console.error(error);
    }
  };

  const handleOptimizeRoute = async () => {
    if (stops.length < 2) {
      toast.error("At least 2 stops required for optimization");
      return;
    }

    setOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: { 
          stops,
          isTeam: load.team_required || false,
          vehicleId: load.assigned_vehicle_id || null
        }
      });

      if (error) throw error;
      
      setOptimizationResult(data);
      
      if (data.hosCompliant) {
        toast.success("Route optimized and HOS compliant!");
      } else {
        toast.warning("Route optimized but requires attention for HOS compliance");
      }
    } catch (error: any) {
      toast.error("Failed to optimize route");
      console.error(error);
    } finally {
      setOptimizing(false);
    }
  };

  const handleApplyOptimization = async () => {
    if (!optimizationResult) return;

    try {
      // Update all stop sequences
      const updates = optimizationResult.optimizedSequence.map((stop: any) => 
        supabase
          .from("load_stops")
          .update({ stop_sequence: stop.stop_sequence })
          .eq("id", stop.id)
      );

      await Promise.all(updates);
      
      toast.success("Optimized route applied successfully!");
      setOptimizationResult(null);
      loadData();
    } catch (error: any) {
      toast.error("Failed to apply optimization");
      console.error(error);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleGenerateRC = () => {
    const carrierInfo = carriers.find(c => c.id === load.carrier_id);
    const driverInfo = drivers.find(d => d.id === load.assigned_driver_id);
    const vehicleInfo = vehicles.find(v => v.id === load.assigned_vehicle_id);
    generateRateConfirmation(
      load,
      companyProfile || { company_name: "Company" },
      carrierInfo ? { name: carrierInfo.name, mc_number: carrierInfo.mc_number, dot_number: carrierInfo.dot_number } : null,
      driverInfo?.personal_info ? { firstName: driverInfo.personal_info.firstName, lastName: driverInfo.personal_info.lastName } : null,
      vehicleInfo ? { vehicle_number: vehicleInfo.vehicle_number, make: vehicleInfo.make } : null,
    );
    toast.success("Rate Confirmation downloaded");
  };

  const handleGenerateBOL = () => {
    const carrierInfo = carriers.find(c => c.id === load.carrier_id);
    const driverInfo = drivers.find(d => d.id === load.assigned_driver_id);
    const vehicleInfo = vehicles.find(v => v.id === load.assigned_vehicle_id);
    generateBOL(
      load,
      companyProfile || { company_name: "Company" },
      carrierInfo ? { name: carrierInfo.name, mc_number: carrierInfo.mc_number, dot_number: carrierInfo.dot_number } : null,
      driverInfo?.personal_info ? { firstName: driverInfo.personal_info.firstName, lastName: driverInfo.personal_info.lastName } : null,
      vehicleInfo ? { vehicle_number: vehicleInfo.vehicle_number, make: vehicleInfo.make } : null,
    );
    toast.success("Bill of Lading downloaded");
  };

  const updateField = (field: string, value: any) => {
    setLoad((prev: any) => {
      const updates: any = { [field]: value };
      
      // When dispatcher is assigned/changed, also set load_owner_id if not already set
      if (field === "assigned_dispatcher_id" && value) {
        if (!prev.load_owner_id || prev.load_owner_id === prev.assigned_dispatcher_id) {
          updates.load_owner_id = value;
        }
      }
      
      return { ...prev, ...updates };
    });
  };

  const updateCustomerField = async (customerId: string, field: string, value: string) => {
    try {
      const { error } = await supabase
        .from("customers")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", customerId);
      
      if (error) throw error;
      
      // Update local customers state
      setCustomers((prev: any[]) => 
        prev.map((c) => c.id === customerId ? { ...c, [field]: value } : c)
      );
    } catch (error: any) {
      console.error("Failed to update customer:", error);
      toast.error("Failed to update customer");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-gray-500";
      case "pending_dispatch": return "bg-blue-400";
      case "booked": return "bg-blue-500";
      case "dispatched": return "bg-purple-500";
      case "at_pickup": return "bg-yellow-500";
      case "in_transit": return "bg-orange-500";
      case "at_delivery": return "bg-green-500";
      case "delivered": return "bg-green-600";
      case "completed": return "bg-green-700";
      case "tonu": return "bg-red-400";
      case "cancelled": return "bg-red-500";
      case "closed": return "bg-black dark:bg-white";
      default: return "bg-gray-500";
    }
  };

  const getStopStatusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-blue-500";
      case "arrived": return "bg-yellow-500";
      case "loading": case "unloading": return "bg-orange-500";
      case "departed": return "bg-purple-500";
      case "completed": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!load) {
    return <div className="flex items-center justify-center h-full">Load not found</div>;
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
  // Use customer_rate if set, otherwise fall back to rate
  const payloadAmount = parseFloat(load.customer_rate) || parseFloat(load.rate) || 0;
  const totalRevenue = payloadAmount + 
                       (parseFloat(load.fuel_surcharge) || 0) + 
                       (parseFloat(load.accessorial_charges) || 0) +
                       (parseFloat(load.detention_charges) || 0) +
                       (parseFloat(load.layover_charges) || 0) +
                       (parseFloat(load.other_charges) || 0);
  const carrierPayAmount = parseFloat(load.carrier_rate) || 0;
  const netProfit = totalRevenue - totalExpenses - carrierPayAmount;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/loads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Load #{load.load_number}</h1>
              <Badge className={getStatusColor(load.status)}>{load.status}</Badge>
            </div>
            <p className="text-muted-foreground">Load Details & Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerateRC}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Rate Confirmation
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateBOL}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            BOL
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/load-approval?loadId=${id}`)}>
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
            Rate Approval
          </Button>
          {originalEmail && (
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Email
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Original Load Email
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">From: </span>
                      <span className="font-medium">{originalEmail.from_name || originalEmail.from_email}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Source: </span>
                      <Badge variant="outline">{originalEmail.email_source}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Received: </span>
                      <span>{format(new Date(originalEmail.received_at), "MM/dd/yyyy h:mm a")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Load ID: </span>
                      <span className="font-mono">{originalEmail.load_id}</span>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Subject:</p>
                    <p className="font-medium">{originalEmail.subject}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Email Content:</p>
                    {originalEmail.body_html ? (
                      <div 
                        className="bg-white rounded-lg p-4 border max-h-[500px] overflow-y-auto"
                        dangerouslySetInnerHTML={{ 
                          __html: DOMPurify.sanitize(originalEmail.body_html, {
                            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'ul', 'ol', 'li', 'img', 'hr', 'pre', 'code', 'blockquote'],
                            ALLOWED_ATTR: ['href', 'style', 'class', 'src', 'alt', 'width', 'height', 'target', 'rel'],
                            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
                            FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur']
                          })
                        }}
                      />
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                        {originalEmail.body_text || "No content available"}
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-1.5">
        <TabsList className="grid w-full grid-cols-6 h-8">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="stops" className="text-xs">Stops ({stops.length})</TabsTrigger>
          <TabsTrigger value="route" className="text-xs">Route Map</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="financials" className="text-xs">Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-1">
          {/* Email Notes Alert */}
          {cleanLoadNotes(originalEmail?.parsed_data?.notes) && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200 whitespace-pre-wrap">{cleanLoadNotes(originalEmail?.parsed_data?.notes)}</div>
            </div>
          )}

          {/* Edit Mode Toggle */}
          <div className="flex items-center justify-end">
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? <><Eye className="h-3 w-3" /> View Mode</> : <><Pencil className="h-3 w-3" /> Edit Mode</>}
            </Button>
          </div>

          {/* === DENSE 3-COLUMN LAYOUT === */}
          <div className="grid grid-cols-12 gap-3">

            {/* LEFT COL: Customer + Billing + Route (col-span-4) */}
            <div className="col-span-12 md:col-span-4 space-y-3">

              {/* Customer */}
              <div className="border rounded-lg p-3 space-y-1.5 bg-card">
                <div className="flex items-center gap-1.5 mb-1">
                  <Building className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</span>
                </div>
                {editMode ? (
                  <div className="space-y-1.5">
                    <SearchableEntitySelect
                      value={(() => { const customer = customers.find(c => c.id === load.customer_id); return customer?.name || ""; })()}
                      onSelect={(entity) => updateField("customer_id", entity.id)}
                      entities={customers.map(c => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                      placeholder="Search or add customer..."
                      onAddNew={async (name, data) => {
                        const { data: newCustomer, error } = await supabase.from("customers").insert([{ name, contact_name: data.contact_name || null, phone: data.phone || null, email: data.email || null, address: data.address || null, city: data.city || null, state: data.state || null, zip: data.zip || null, status: "active", tenant_id: tenantId }]).select().single();
                        if (error) { toast.error("Failed to add customer"); throw error; }
                        updateField("customer_id", newCustomer.id);
                        loadData();
                        toast.success("Customer added and selected");
                      }}
                      entityType="customer"
                    />
                    <div className="flex gap-1">
                      {load.customer_id && <EditEntityDialog entityId={load.customer_id} entityType="customer" onEntityUpdated={loadData} />}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Ref #</Label>
                      <Input className="h-6 text-xs" value={load.reference_number || ""} onChange={(e) => updateField("reference_number", e.target.value)} placeholder="Customer ref #" />
                    </div>
                    {load.customer_id && (() => {
                      const customer = customers.find(c => c.id === load.customer_id);
                      return customer ? (
                        <div className="space-y-1 border-t pt-1.5">
                          <div className="grid grid-cols-2 gap-1">
                            <Input className="h-6 text-xs" value={customer.contact_name || ""} onChange={(e) => updateCustomerField(customer.id, "contact_name", e.target.value)} placeholder="Contact" />
                            <Input className="h-6 text-xs" value={customer.phone || ""} onChange={(e) => updateCustomerField(customer.id, "phone", e.target.value)} placeholder="Phone" />
                          </div>
                          <Input className="h-6 text-xs" value={customer.email || ""} onChange={(e) => updateCustomerField(customer.id, "email", e.target.value)} placeholder="Email" />
                          <div className="grid grid-cols-4 gap-1">
                            <Input className="h-6 text-xs col-span-2" value={customer.address || ""} onChange={(e) => updateCustomerField(customer.id, "address", e.target.value)} placeholder="Address" />
                            <Input className="h-6 text-xs" value={customer.city || ""} onChange={(e) => updateCustomerField(customer.id, "city", e.target.value)} placeholder="City" />
                            <div className="flex gap-1">
                              <Input className="h-6 text-xs uppercase w-10" value={customer.state || ""} onChange={(e) => updateCustomerField(customer.id, "state", e.target.value.toUpperCase())} maxLength={2} />
                              <Input className="h-6 text-xs w-14" value={customer.zip || ""} onChange={(e) => updateCustomerField(customer.id, "zip", e.target.value)} />
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {(() => {
                      const customer = customers.find(c => c.id === load.customer_id);
                      return customer ? (
                        <>
                          <div className="text-sm font-semibold">{customer.name}</div>
                          {customer.contact_name && <div className="text-xs text-muted-foreground">{customer.contact_name}</div>}
                          {customer.phone && <div className="text-xs text-muted-foreground">{customer.phone}</div>}
                          {customer.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
                          {(customer.city || customer.state) && <div className="text-xs text-muted-foreground">{[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")}</div>}
                          {load.reference_number && <div className="text-xs mt-1"><span className="text-muted-foreground">Ref: </span><span className="font-medium">{load.reference_number}</span></div>}
                        </>
                      ) : <div className="text-xs text-muted-foreground italic">No customer assigned</div>;
                    })()}
                  </div>
                )}
              </div>

              {/* Billing Party */}
              <div className="border rounded-lg p-3 space-y-1.5 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Billing Party</span>
                  </div>
                  {editMode && (
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => {
                      if (load.customer_id) {
                        const customer = customers.find(c => c.id === load.customer_id);
                        if (customer) {
                          updateField("broker_name", customer.name); updateField("broker_contact", customer.contact_name || "");
                          updateField("broker_phone", customer.phone || ""); updateField("broker_email", customer.email || "");
                          updateField("broker_address", customer.address || ""); updateField("broker_city", customer.city || "");
                          updateField("broker_state", customer.state || ""); updateField("broker_zip", customer.zip || "");
                          toast.success("Copied from customer");
                        }
                      }
                    }}>Same as Customer</Button>
                  )}
                </div>
                {editMode ? (
                  <div className="space-y-1.5">
                    <SearchableEntitySelect
                      entities={[
                        ...(companyProfile?.factoring_company_name ? [{ id: "otr_solutions", name: companyProfile.factoring_company_name, contact_name: companyProfile.factoring_contact_name, email: companyProfile.factoring_contact_email, address: companyProfile.factoring_company_address, city: companyProfile.factoring_company_city, state: companyProfile.factoring_company_state, zip: companyProfile.factoring_company_zip }] : []),
                        ...customers,
                      ]}
                      value={load.broker_name || ""}
                      placeholder="Search billing party..."
                      entityType="customer"
                      onSelect={(entity) => {
                        updateField("broker_name", entity.name); updateField("broker_contact", entity.contact_name || "");
                        updateField("broker_phone", entity.phone || ""); updateField("broker_email", entity.email || "");
                        updateField("broker_address", entity.address || ""); updateField("broker_city", entity.city || "");
                        updateField("broker_state", entity.state || ""); updateField("broker_zip", entity.zip || "");
                        toast.success("Filled billing party info");
                      }}
                      onAddNew={async (name, data) => {
                        const { data: newCustomer, error } = await supabase.from("customers").insert([{ name, contact_name: data.contact_name || null, phone: data.phone || null, email: data.email || null, address: data.address || null, city: data.city || null, state: data.state || null, zip: data.zip || null, status: "active", tenant_id: tenantId }]).select().single();
                        if (error) { toast.error("Failed to add customer"); throw error; }
                        updateField("broker_name", name); updateField("broker_contact", data.contact_name || "");
                        updateField("broker_phone", data.phone || ""); updateField("broker_email", data.email || "");
                        updateField("broker_address", data.address || ""); updateField("broker_city", data.city || "");
                        updateField("broker_state", data.state || ""); updateField("broker_zip", data.zip || "");
                        loadData(); toast.success("Customer added and selected");
                      }}
                    />
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-6 text-xs" value={load.broker_phone || ""} onChange={(e) => updateField("broker_phone", e.target.value)} placeholder="Phone" />
                      <Input className="h-6 text-xs" value={load.broker_email || ""} onChange={(e) => updateField("broker_email", e.target.value)} placeholder="Email" />
                    </div>
                    <Input className="h-6 text-xs" value={load.broker_contact || ""} onChange={(e) => updateField("broker_contact", e.target.value)} placeholder="Contact Person" />
                    <div className="grid grid-cols-4 gap-1">
                      <Input className="h-6 text-xs col-span-2" value={(load as any).broker_address || ""} onChange={(e) => updateField("broker_address", e.target.value)} placeholder="Address" />
                      <Input className="h-6 text-xs" value={(load as any).broker_city || ""} onChange={(e) => updateField("broker_city", e.target.value)} placeholder="City" />
                      <div className="flex gap-1">
                        <Input className="h-6 text-xs uppercase w-10" value={(load as any).broker_state || ""} onChange={(e) => updateField("broker_state", e.target.value.toUpperCase())} maxLength={2} />
                        <Input className="h-6 text-xs w-14" value={(load as any).broker_zip || ""} onChange={(e) => updateField("broker_zip", e.target.value)} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {load.broker_name ? (
                      <>
                        <div className="text-sm font-semibold">{load.broker_name}</div>
                        {load.broker_contact && <div className="text-xs text-muted-foreground">{load.broker_contact}</div>}
                        {load.broker_phone && <div className="text-xs text-muted-foreground">{load.broker_phone}</div>}
                        {load.broker_email && <div className="text-xs text-muted-foreground">{load.broker_email}</div>}
                        {((load as any).broker_city || (load as any).broker_state) && <div className="text-xs text-muted-foreground">{[(load as any).broker_address, (load as any).broker_city, (load as any).broker_state, (load as any).broker_zip].filter(Boolean).join(", ")}</div>}
                      </>
                    ) : <div className="text-xs text-muted-foreground italic">No billing party set</div>}
                  </div>
                )}
              </div>

              {/* Load Details (Route + Cargo merged) */}
              <div className="border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-2">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Load Details</span>
                </div>

                {/* Route Timeline */}
                <div className="relative mb-3">
                  <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />

                  {/* Pickup */}
                  <div className="relative pl-6 pb-3">
                    <div className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-green-500 bg-background" />
                    {editMode ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">PU 1</Badge>
                        <SearchableEntitySelect
                          entities={locations}
                          value={load.shipper_name || ""}
                          placeholder="Search shipper..."
                          entityType="location"
                          onSelect={(entity) => {
                            updateField("shipper_name", entity.name);
                            updateField("pickup_address", entity.address || ""); updateField("pickup_city", entity.city || "");
                            updateField("pickup_state", entity.state || ""); updateField("pickup_zip", entity.zip || "");
                            toast.success("Filled shipper info");
                          }}
                          onAddNew={async (name, data) => {
                            const { data: newLocation, error } = await supabase.from("locations").insert([{ name, address: data.address || null, city: data.city || null, state: data.state || null, zip: data.zip || null, status: "active", tenant_id: tenantId }]).select().single();
                            if (error) { toast.error("Failed to add location"); throw error; }
                            updateField("shipper_name", name); updateField("pickup_address", data.address || "");
                            updateField("pickup_city", data.city || ""); updateField("pickup_state", data.state || "");
                            updateField("pickup_zip", data.zip || ""); loadData(); toast.success("Location added");
                          }}
                        />
                        <div className="grid grid-cols-4 gap-1">
                          <Input className="h-6 text-xs col-span-2" value={load.pickup_address || ""} onChange={(e) => updateField("pickup_address", e.target.value)} placeholder="Address" />
                          <Input className="h-6 text-xs" value={load.pickup_city || ""} onChange={(e) => updateField("pickup_city", e.target.value)} placeholder="City" />
                          <div className="flex gap-1">
                            <Input className="h-6 text-xs uppercase w-10" value={load.pickup_state || ""} onChange={(e) => updateField("pickup_state", e.target.value.toUpperCase())} maxLength={2} />
                            <Input className="h-6 text-xs w-14" value={load.pickup_zip || ""} onChange={(e) => updateField("pickup_zip", e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <Input className="h-6 text-xs" type="date" value={load.pickup_date ? load.pickup_date.split('T')[0] : ""} onChange={(e) => updateField("pickup_date", e.target.value)} />
                          <Input className="h-6 text-xs" value={load.pickup_time || ""} onChange={(e) => updateField("pickup_time", e.target.value)} placeholder="Time" />
                          <Input className="h-6 text-xs" value={load.shipper_phone || ""} onChange={(e) => updateField("shipper_phone", e.target.value)} placeholder="Phone" />
                        </div>
                        <Textarea className="text-xs min-h-[24px]" value={load.pickup_notes || ""} onChange={(e) => updateField("pickup_notes", e.target.value)} rows={1} placeholder="Pickup notes..." />
                      </div>
                    ) : (
                      <div>
                        <Badge variant="outline" className="text-[9px] h-4 mb-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">PU 1</Badge>
                        <div className="text-sm font-bold uppercase">{load.pickup_city && load.pickup_state ? `${load.pickup_city}, ${load.pickup_state}` : "Not set"}</div>
                        {load.shipper_name && <div className="text-xs text-muted-foreground">{load.shipper_name}</div>}
                        {load.pickup_address && <div className="text-xs text-muted-foreground">{load.pickup_address}{load.pickup_zip ? `, ${load.pickup_zip}` : ""}</div>}
                        <div className="text-xs text-muted-foreground">
                          {load.pickup_date ? format(new Date(load.pickup_date), 'yyyy-MM-dd') : "—"} @ {load.pickup_time || "—"}
                        </div>
                        {load.pickup_notes && <div className="text-[10px] text-muted-foreground mt-0.5 italic">{load.pickup_notes}</div>}
                      </div>
                    )}
                  </div>

                  {/* Delivery */}
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-destructive bg-background" />
                    {editMode ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[9px] h-4 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">DEL 1</Badge>
                        <SearchableEntitySelect
                          entities={locations}
                          value={load.receiver_name || ""}
                          placeholder="Search receiver..."
                          entityType="location"
                          onSelect={(entity) => {
                            updateField("receiver_name", entity.name);
                            updateField("delivery_address", entity.address || ""); updateField("delivery_city", entity.city || "");
                            updateField("delivery_state", entity.state || ""); updateField("delivery_zip", entity.zip || "");
                            toast.success("Filled receiver info");
                          }}
                          onAddNew={async (name, data) => {
                            const { data: newLocation, error } = await supabase.from("locations").insert([{ name, address: data.address || null, city: data.city || null, state: data.state || null, zip: data.zip || null, status: "active", tenant_id: tenantId }]).select().single();
                            if (error) { toast.error("Failed to add location"); throw error; }
                            updateField("receiver_name", name); updateField("delivery_address", data.address || "");
                            updateField("delivery_city", data.city || ""); updateField("delivery_state", data.state || "");
                            updateField("delivery_zip", data.zip || ""); loadData(); toast.success("Location added");
                          }}
                        />
                        <div className="grid grid-cols-4 gap-1">
                          <Input className="h-6 text-xs col-span-2" value={load.delivery_address || ""} onChange={(e) => updateField("delivery_address", e.target.value)} placeholder="Address" />
                          <Input className="h-6 text-xs" value={load.delivery_city || ""} onChange={(e) => updateField("delivery_city", e.target.value)} placeholder="City" />
                          <div className="flex gap-1">
                            <Input className="h-6 text-xs uppercase w-10" value={load.delivery_state || ""} onChange={(e) => updateField("delivery_state", e.target.value.toUpperCase())} maxLength={2} />
                            <Input className="h-6 text-xs w-14" value={load.delivery_zip || ""} onChange={(e) => updateField("delivery_zip", e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <Input className="h-6 text-xs" type="date" value={load.delivery_date ? load.delivery_date.split('T')[0] : ""} onChange={(e) => updateField("delivery_date", e.target.value)} />
                          <Input className="h-6 text-xs" value={load.delivery_time || ""} onChange={(e) => updateField("delivery_time", e.target.value)} placeholder="Time" />
                          <Input className="h-6 text-xs" value={load.receiver_phone || ""} onChange={(e) => updateField("receiver_phone", e.target.value)} placeholder="Phone" />
                        </div>
                        <Textarea className="text-xs min-h-[24px]" value={load.delivery_notes || ""} onChange={(e) => updateField("delivery_notes", e.target.value)} rows={1} placeholder="Delivery notes..." />
                      </div>
                    ) : (
                      <div>
                        <Badge variant="outline" className="text-[9px] h-4 mb-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">DEL 1</Badge>
                        <div className="text-sm font-bold uppercase">{load.delivery_city && load.delivery_state ? `${load.delivery_city}, ${load.delivery_state}` : "Not set"}</div>
                        {load.receiver_name && <div className="text-xs text-muted-foreground">{load.receiver_name}</div>}
                        {load.delivery_address && <div className="text-xs text-muted-foreground">{load.delivery_address}{load.delivery_zip ? `, ${load.delivery_zip}` : ""}</div>}
                        <div className="text-xs text-muted-foreground">
                          {load.delivery_date ? format(new Date(load.delivery_date), 'yyyy-MM-dd') : "—"} @ {load.delivery_time || "—"}
                        </div>
                        {load.delivery_notes && <div className="text-[10px] text-muted-foreground mt-0.5 italic">{load.delivery_notes}</div>}
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="my-2" />

                {/* Cargo & Miles */}
                {editMode ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Truck Type</Label>
                        <Select value={load.equipment_type || ""} onValueChange={(value) => updateField("equipment_type", value)}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="bg-background">
                            <SelectItem value="dry_van">Dry Van</SelectItem><SelectItem value="reefer">Reefer</SelectItem>
                            <SelectItem value="flatbed">Flatbed</SelectItem><SelectItem value="step_deck">Step Deck</SelectItem>
                            <SelectItem value="box_truck">Box Truck</SelectItem><SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Commodity</Label><Input className="h-6 text-xs" value={load.commodity_type || ""} onChange={(e) => updateField("commodity_type", e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Pieces</Label><Input className="h-6 text-xs" type="number" value={load.cargo_pieces || ""} onChange={(e) => updateField("cargo_pieces", e.target.value)} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Weight (lbs)</Label><Input className="h-6 text-xs" type="number" value={load.cargo_weight || ""} onChange={(e) => updateField("cargo_weight", e.target.value)} /></div>
                    </div>
                    <div><Label className="text-[10px] text-muted-foreground">Description</Label><Input className="h-6 text-xs" value={load.cargo_description || ""} onChange={(e) => updateField("cargo_description", e.target.value)} /></div>
                    <div><Label className="text-[10px] text-muted-foreground">Temp</Label><Input className="h-6 text-xs" value={load.temperature_required || ""} onChange={(e) => updateField("temperature_required", e.target.value)} placeholder="e.g., 35°F" /></div>
                    <div className="grid grid-cols-3 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Est. Miles</Label><Input className="h-6 text-xs" type="number" value={load.estimated_miles || ""} onChange={(e) => updateField("estimated_miles", e.target.value)} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Actual Miles</Label><Input className="h-6 text-xs" type="number" value={load.actual_miles || ""} onChange={(e) => updateField("actual_miles", e.target.value)} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Empty Miles</Label><Input className="h-6 text-xs" type="number" value={load.empty_miles ?? ""} onChange={(e) => updateField("empty_miles", e.target.value ? Number(e.target.value) : null)} /></div>
                    </div>
                    <div className="flex gap-3 pt-1">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={load.hazmat || false} onChange={(e) => updateField("hazmat", e.target.checked)} className="rounded h-3.5 w-3.5" />Hazmat</label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={load.team_required || false} onChange={(e) => updateField("team_required", e.target.checked)} className="rounded h-3.5 w-3.5" />Team</label>
                    </div>
                    <div><Label className="text-[10px] text-muted-foreground">Special Instructions</Label><Textarea className="text-xs min-h-[32px]" value={load.special_instructions || ""} onChange={(e) => updateField("special_instructions", e.target.value)} rows={1} /></div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Equipment</span><span className="font-medium">{load.equipment_type?.replace('_', ' ') || "—"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Pieces / Weight</span><span className="font-medium">{load.cargo_pieces || "—"} pcs · {load.cargo_weight || "—"} lbs</span></div>
                    {load.cargo_description && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Desc</span><span className="font-medium truncate max-w-[180px]">{load.cargo_description}</span></div>}
                    {load.commodity_type && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Commodity</span><span className="font-medium">{load.commodity_type}</span></div>}
                    {load.temperature_required && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Temp</span><span className="font-medium">{load.temperature_required}</span></div>}
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Miles (Est / Act)</span><span className="font-medium">{load.estimated_miles || "—"} / {load.actual_miles || "—"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Empty Miles</span><span className={`font-medium ${!load.empty_miles ? 'text-muted-foreground' : ''}`}>{load.empty_miles ?? "—"}</span></div>
                    <div className="flex gap-2 text-xs">
                      {load.hazmat && <Badge variant="destructive" className="text-[9px] h-4">HAZMAT</Badge>}
                      {load.team_required && <Badge variant="secondary" className="text-[9px] h-4">TEAM</Badge>}
                    </div>
                    {load.special_instructions && <div className="text-[10px] text-muted-foreground italic border-t pt-1 mt-1">{load.special_instructions}</div>}
                  </div>
                )}
              </div>
            </div>

            {/* CENTER COL: Carrier & Assignments (col-span-4) */}
            <div className="col-span-12 md:col-span-4 space-y-3">

              {/* Carrier & Assignments */}
              <div className="border rounded-lg p-3 space-y-1.5 bg-card">
                <div className="flex items-center gap-1.5 mb-1">
                  <Truck className="h-3.5 w-3.5 text-violet-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Carrier & Assignments</span>
                </div>
                {editMode ? (
                  <div className="space-y-1.5">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Carrier</Label>
                      <div className="flex gap-1">
                        <Select value={load.carrier_id || ""} onValueChange={(value) => {
                          updateField("carrier_id", value);
                          if (load.assigned_vehicle_id) {
                            const currentVehicle = vehicles.find(v => v.id === load.assigned_vehicle_id);
                            if (currentVehicle?.carrier !== value) { updateField("assigned_vehicle_id", null); updateField("assigned_driver_id", null); }
                          }
                        }}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.dot_number ? `(${c.dot_number})` : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCarrierDialogOpen(true)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Vehicle</Label>
                      {(() => {
                        const carrierVehicles = load.carrier_id ? vehicles.filter(v => v.carrier === load.carrier_id) : vehicles;
                        const hasCarrierVehicles = carrierVehicles.length > 0;
                        if (load.carrier_id && !hasCarrierVehicles) {
                          return <Input value={load.external_truck_reference || ""} onChange={(e) => updateField("external_truck_reference", e.target.value)} placeholder="Enter truck reference" className="h-6 text-xs" />;
                        }
                        return (
                          <div className="flex gap-1">
                            <Select value={load.assigned_vehicle_id || ""} onValueChange={(value) => {
                              updateField("assigned_vehicle_id", value);
                              updateField("external_truck_reference", null);
                              const selectedVehicle = vehicles.find((v) => v.id === value);
                              if (selectedVehicle?.driver_1_id) { updateField("assigned_driver_id", selectedVehicle.driver_1_id); } else { updateField("assigned_driver_id", null); }
                              if (!load.equipment_type && selectedVehicle) {
                                const sizePrefix = selectedVehicle.vehicle_size ? `${selectedVehicle.vehicle_size}' ` : "";
                                const vehicleType = selectedVehicle.asset_subtype || selectedVehicle.asset_type || "Truck";
                                updateField("equipment_type", `${sizePrefix}${vehicleType}`);
                              }
                              if (selectedVehicle?.carrier) { updateField("carrier_id", selectedVehicle.carrier); }
                            }}>
                              <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent className="bg-background">
                                {carrierVehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicle_number} - {v.make}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {load.assigned_vehicle_id && <EditEntityDialog entityId={load.assigned_vehicle_id} entityType="vehicle" onEntityUpdated={loadData} />}
                            <AddVehicleDialog onVehicleAdded={async (vehicleId) => { await loadData(); updateField("assigned_vehicle_id", vehicleId); }} />
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Driver</Label>
                      <div className="flex gap-1">
                        <Select value={load.assigned_driver_id || "n/a"} onValueChange={(value) => updateField("assigned_driver_id", value === "n/a" ? null : value)}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="bg-background">
                            <SelectItem value="n/a">N/A</SelectItem>
                            {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.personal_info?.firstName} {d.personal_info?.lastName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {load.assigned_driver_id && <EditEntityDialog entityId={load.assigned_driver_id} entityType="driver" onEntityUpdated={loadData} />}
                        <AddDriverDialog onDriverAdded={async (driverId) => { await loadData(); updateField("assigned_driver_id", driverId); }} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Dispatcher</Label>
                      <div className="flex gap-1">
                        <Select value={load.assigned_dispatcher_id || ""} onValueChange={(value) => updateField("assigned_dispatcher_id", value)}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {dispatchers.map((d) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Load Owner</Label>
                      <Select value={load.load_owner_id || ""} onValueChange={(value) => updateField("load_owner_id", value)}>
                        <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {dispatchers.map((d) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(() => {
                      const carrier = carriers.find(c => c.id === load.carrier_id);
                      const vehicle = vehicles.find(v => v.id === load.assigned_vehicle_id);
                      const driver = drivers.find(d => d.id === load.assigned_driver_id);
                      const dispatcher = dispatchers.find(d => d.id === load.assigned_dispatcher_id);
                      const loadOwner = dispatchers.find(d => d.id === load.load_owner_id);
                      return (
                        <>
                          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Carrier</span><span className="font-medium text-right">{carrier?.name || "—"}</span></div>
                          {carrier && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Safety</span><span className={`font-medium ${carrier.safer_status?.includes('NOT') ? 'text-destructive' : 'text-green-600'}`}>{carrier.safer_status || "Auth"} · {carrier.safety_rating || "No Rating"}</span></div>}
                          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Vehicle</span><span className="font-medium">{vehicle ? `${vehicle.vehicle_number} - ${vehicle.make}` : load.external_truck_reference || "—"}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Driver</span><span className="font-medium">{driver?.personal_info ? `${driver.personal_info.firstName} ${driver.personal_info.lastName}` : "—"}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Dispatcher</span><span className="font-medium">{dispatcher ? `${dispatcher.first_name} ${dispatcher.last_name}` : "—"}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Load Owner</span><span className="font-medium">{loadOwner ? `${loadOwner.first_name} ${loadOwner.last_name}` : "—"}</span></div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COL: Status + Financial Summary + Notes (col-span-4) */}
            <div className="col-span-12 md:col-span-4 space-y-3">

              {/* Status */}
              <div className="border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
                </div>
                {editMode ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Load #</Label><Input className="h-6 text-xs" value={load.load_number || ""} onChange={(e) => updateField("load_number", e.target.value)} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Ref #</Label><Input className="h-6 text-xs" value={load.reference_number || ""} onChange={(e) => updateField("reference_number", e.target.value)} /></div>
                    </div>
                    <div><Label className="text-[10px] text-muted-foreground">Status</Label>
                      <Select value={load.status || "available"} onValueChange={(value) => updateField("status", value)}>
                        <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-background">
                          <SelectItem value="action_needed">Action Needed</SelectItem><SelectItem value="pending_dispatch">Pending Dispatch</SelectItem>
                          <SelectItem value="available">Available</SelectItem><SelectItem value="booked">Booked</SelectItem>
                          <SelectItem value="dispatched">Dispatched</SelectItem><SelectItem value="at_pickup">At Pickup</SelectItem>
                          <SelectItem value="in_transit">In Transit</SelectItem><SelectItem value="at_delivery">At Delivery</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem><SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="ready_for_audit">Ready for Audit</SelectItem><SelectItem value="tonu">TONU</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="closed">CLOSED</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Financial</Label>
                        <Select value={load.financial_status || "pending"} onValueChange={(value) => updateField("financial_status", value)}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-background"><SelectItem value="pending">Pending</SelectItem><SelectItem value="billed">Billed</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Settlement</Label>
                        <Select value={load.settlement_status || "unsettled"} onValueChange={(value) => updateField("settlement_status", value)}>
                          <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-background"><SelectItem value="unsettled">Unsettled</SelectItem><SelectItem value="included">Included</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Status</span><Badge className={`text-[9px] ${getStatusColor(load.status)}`}>{load.status}</Badge></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Financial</span><span className="font-medium capitalize">{load.financial_status || "pending"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Settlement</span><span className="font-medium capitalize">{load.settlement_status || "unsettled"}</span></div>
                  </div>
                )}
              </div>

              {/* Financial Quick Summary */}
              <div className="border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Financial Summary</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Revenue</span><span className="font-bold text-green-600">${totalRevenue.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Carrier Pay</span><span className="font-medium">${carrierPayAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Expenses</span><span className="font-medium">${totalExpenses.toFixed(2)}</span></div>
                  <Separator className="my-1" />
                  <div className="flex justify-between text-xs"><span className="font-semibold">Net Profit</span><span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>${netProfit.toFixed(2)}</span></div>
                </div>
              </div>

              {/* Notes */}
              <div className="border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</span>
                </div>
                {editMode ? (
                  <div className="space-y-1.5">
                    <div><Label className="text-[10px] text-muted-foreground">Dispatch Notes</Label><Textarea className="text-xs min-h-[32px]" value={load.dispatch_notes || ""} onChange={(e) => updateField("dispatch_notes", e.target.value)} rows={2} /></div>
                    <div><Label className="text-[10px] text-muted-foreground">Billing Notes</Label><Textarea className="text-xs min-h-[32px]" value={load.billing_notes || ""} onChange={(e) => updateField("billing_notes", e.target.value)} rows={2} /></div>
                    <div><Label className="text-[10px] text-muted-foreground">General Notes</Label><Textarea className="text-xs min-h-[32px]" value={load.notes || ""} onChange={(e) => updateField("notes", e.target.value)} rows={2} /></div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {load.dispatch_notes && <div><div className="text-[10px] font-medium text-muted-foreground">Dispatch</div><div className="text-xs whitespace-pre-wrap">{load.dispatch_notes}</div></div>}
                    {load.billing_notes && <div><div className="text-[10px] font-medium text-muted-foreground">Billing</div><div className="text-xs whitespace-pre-wrap">{load.billing_notes}</div></div>}
                    {load.notes && <div><div className="text-[10px] font-medium text-muted-foreground">General</div><div className="text-xs whitespace-pre-wrap">{load.notes}</div></div>}
                    {!load.dispatch_notes && !load.billing_notes && !load.notes && <div className="text-xs text-muted-foreground italic">No notes</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

        </TabsContent>

        <TabsContent value="stops" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Load Stops</h3>
            <div className="flex gap-1.5">
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 text-xs"
                onClick={handleOptimizeRoute}
                disabled={optimizing || stops.length < 2}
              >
                {optimizing ? "Optimizing..." : "Optimize Route"}
              </Button>
              <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Add Stop</Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-base">Add Stop</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Stop Type</Label>
                      <Select value={newStop.stop_type} onValueChange={(value) => setNewStop({ ...newStop, stop_type: value })}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background">
                          <SelectItem value="pickup">Pickup</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Location Name</Label>
                      <Input className="h-8 text-sm" value={newStop.location_name} onChange={(e) => setNewStop({ ...newStop, location_name: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Address</Label>
                    <Input className="h-8 text-sm" value={newStop.location_address} onChange={(e) => setNewStop({ ...newStop, location_address: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input className="h-8 text-sm" value={newStop.location_city} onChange={(e) => setNewStop({ ...newStop, location_city: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">State</Label>
                      <Input className="h-8 text-sm" value={newStop.location_state} onChange={(e) => setNewStop({ ...newStop, location_state: e.target.value })} maxLength={2} />
                    </div>
                    <div>
                      <Label className="text-xs">ZIP</Label>
                      <Input className="h-8 text-sm" value={newStop.location_zip} onChange={(e) => setNewStop({ ...newStop, location_zip: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Contact</Label>
                      <Input className="h-8 text-sm" value={newStop.contact_name} onChange={(e) => setNewStop({ ...newStop, contact_name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input className="h-8 text-sm" value={newStop.contact_phone} onChange={(e) => setNewStop({ ...newStop, contact_phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Date</Label>
                      <Input className="h-8 text-sm" type="date" value={newStop.scheduled_date} onChange={(e) => setNewStop({ ...newStop, scheduled_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Start</Label>
                      <Input className="h-8 text-sm" type="time" value={newStop.scheduled_time_start} onChange={(e) => setNewStop({ ...newStop, scheduled_time_start: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">End</Label>
                      <Input className="h-8 text-sm" type="time" value={newStop.scheduled_time_end} onChange={(e) => setNewStop({ ...newStop, scheduled_time_end: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea className="text-sm min-h-[40px]" value={newStop.notes} onChange={(e) => setNewStop({ ...newStop, notes: e.target.value })} rows={1} />
                  </div>
                </div>
                <Button onClick={handleAddStop} size="sm" className="w-full">Add Stop</Button>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {optimizationResult && (
            <Card className={optimizationResult.hosCompliant ? "border-blue-500 bg-blue-50" : "border-orange-500 bg-orange-50"}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>Optimization Results</span>
                    {optimizationResult.isTeam ? (
                      <Badge variant="outline" className="bg-purple-100">Team Operation</Badge>
                    ) : (
                      <Badge variant="outline">Solo Driver</Badge>
                    )}
                    {optimizationResult.hosCompliant ? (
                      <Badge className="bg-gradient-to-b from-green-400 to-green-600 text-white !px-3 !py-1.5 shadow-md"><CheckCircle className="h-3 w-3 mr-1" /> HOS Compliant</Badge>
                    ) : (
                      <Badge className="bg-gradient-to-b from-orange-400 to-orange-600 text-white !px-3 !py-1.5 shadow-md"><AlertCircle className="h-3 w-3 mr-1" /> HOS Attention Required</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleApplyOptimization}>
                      Apply Optimization
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOptimizationResult(null)}>
                      Dismiss
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Distance</p>
                    <p className="text-lg font-bold">{optimizationResult.totalDistance.toFixed(1)} miles</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Drive Time</p>
                    <p className="text-lg font-bold">{(optimizationResult.totalDriveTime / 60).toFixed(1)} hours</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Required Breaks</p>
                    <p className="text-lg font-bold">{optimizationResult.requiredBreaks.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Time (w/ breaks)</p>
                    <p className="text-lg font-bold">
                      {((optimizationResult.totalDriveTime + optimizationResult.requiredBreaks.reduce((sum: number, b: any) => sum + b.duration, 0)) / 60).toFixed(1)} hours
                    </p>
                  </div>
                </div>

                {optimizationResult.fuelEmissions && (
                  <>
                    <Separator />
                    <div>
                      <p className="font-semibold mb-2 flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Fuel Cost & Environmental Impact:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="p-3 bg-white rounded border">
                          <p className="text-muted-foreground text-xs">Fuel Type</p>
                          <p className="font-bold capitalize">{optimizationResult.fuelEmissions.fuelType}</p>
                        </div>
                        <div className="p-3 bg-white rounded border">
                          <p className="text-muted-foreground text-xs">Fuel Needed</p>
                          <p className="font-bold">{optimizationResult.fuelEmissions.estimatedFuelGallons.toFixed(1)} gal</p>
                          <p className="text-xs text-muted-foreground">@ {optimizationResult.fuelEmissions.vehicleMpg} MPG</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <p className="text-muted-foreground text-xs">Estimated Cost</p>
                          <p className="font-bold text-green-700">${optimizationResult.fuelEmissions.estimatedFuelCost.toFixed(2)}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <p className="text-muted-foreground text-xs">CO₂ Emissions</p>
                          <p className="font-bold text-blue-700">{optimizationResult.fuelEmissions.carbonEmissionsLbs.toFixed(0)} lbs</p>
                          <p className="text-xs text-muted-foreground">{optimizationResult.fuelEmissions.carbonEmissionsKg.toFixed(1)} kg</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {optimizationResult.requiredBreaks.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="font-semibold mb-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Required Breaks for HOS Compliance:
                      </p>
                      <div className="space-y-2">
                        {optimizationResult.requiredBreaks.map((breakItem: any, index: number) => (
                          <div key={index} className="flex items-start gap-3 text-sm p-3 bg-white rounded border border-orange-200">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500 text-white text-xs font-bold flex-shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{breakItem.location}</p>
                              <p className="text-muted-foreground text-xs mt-1">{breakItem.reason}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span>Duration: {breakItem.duration} minutes</span>
                                <span>After {(breakItem.cumulativeDriveTime / 60).toFixed(1)} hours of driving</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Distance Saved</p>
                    <p className="text-lg font-bold text-green-600">
                      {optimizationResult.savings.distanceSaved.toFixed(1)} miles
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time Saved</p>
                    <p className="text-lg font-bold text-green-600">
                      {Math.round(optimizationResult.savings.timeSaved / 60)} hours
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="font-semibold mb-2">Optimized Stop Sequence:</p>
                  <div className="space-y-2">
                    {optimizationResult.optimizedSequence.map((stop: any, index: number) => (
                      <div key={stop.id} className="flex items-center gap-3 text-sm p-2 bg-white rounded">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                          <Badge variant={stop.stop_type === 'pickup' ? 'default' : 'secondary'}>
                            {stop.stop_type}
                          </Badge>
                          <span className="font-medium">{stop.location_name}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {stop.location_city}, {stop.location_state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Additional Stops */}
          {stops.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-md font-semibold text-muted-foreground">Additional Stops</h4>
              {stops.map((stop, index) => (
                <Card key={stop.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Stop {index + 1}</Badge>
                        <Badge className={stop.stop_type === "pickup" ? "bg-blue-500" : "bg-green-500"}>
                          {stop.stop_type}
                        </Badge>
                        <Badge className={getStopStatusColor(stop.status)}>
                          {stop.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={stop.status}
                          onValueChange={(value) => handleUpdateStopStatus(stop.id, value)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="arrived">Arrived</SelectItem>
                            <SelectItem value="loading">Loading</SelectItem>
                            <SelectItem value="unloading">Unloading</SelectItem>
                            <SelectItem value="departed">Departed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteStop(stop.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="font-semibold">{stop.location_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {stop.location_address}, {stop.location_city}, {stop.location_state} {stop.location_zip}
                      </p>
                    </div>

                    {stop.contact_name && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Contact: </span>
                        {stop.contact_name} {stop.contact_phone && `• ${stop.contact_phone}`}
                      </div>
                    )}

                    {stop.scheduled_date && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Scheduled: </span>
                        {format(new Date(stop.scheduled_date), "MM/dd/yyyy")}
                        {stop.scheduled_time_start && ` ${stop.scheduled_time_start}`}
                        {stop.scheduled_time_end && ` - ${stop.scheduled_time_end}`}
                      </div>
                    )}

                    {stop.actual_arrival && (
                      <div className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Arrived: </span>
                        {format(new Date(stop.actual_arrival), "MM/dd/yyyy h:mm a")}
                      </div>
                    )}

                    {stop.actual_departure && (
                      <div className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Departed: </span>
                        {format(new Date(stop.actual_departure), "MM/dd/yyyy h:mm a")}
                      </div>
                    )}

                    {stop.notes && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Notes: </span>
                        {stop.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {stops.length === 0 && !load.pickup_city && !load.delivery_city && (
            <div className="text-center py-12 text-muted-foreground">
              No stops added yet. Click "Add Stop" to create pickup and delivery stops.
            </div>
          )}
        </TabsContent>

        <TabsContent value="route" className="space-y-4">
          <LoadRouteMap 
            stops={stops} 
            vehicle={vehicles.find(v => v.id === load.assigned_vehicle_id)}
            optimizedStops={optimizationResult?.optimizedSequence}
            requiredBreaks={optimizationResult?.requiredBreaks || []}
            onOptimize={handleOptimizeRoute}
            optimizing={optimizing}
          />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Load Expenses</h3>
              <p className="text-sm text-muted-foreground">Total: ${totalExpenses.toFixed(2)}</p>
            </div>
            <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Add Expense</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Expense</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label>Expense Type</Label>
                    <Select value={newExpense.expense_type} onValueChange={(value) => setNewExpense({ ...newExpense, expense_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fuel">Fuel</SelectItem>
                        <SelectItem value="tolls">Tolls</SelectItem>
                        <SelectItem value="lumper">Lumper</SelectItem>
                        <SelectItem value="detention">Detention</SelectItem>
                        <SelectItem value="layover">Layover</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Input
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newExpense.incurred_date}
                      onChange={(e) => setNewExpense({ ...newExpense, incurred_date: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>Paid By</Label>
                    <Select value={newExpense.paid_by} onValueChange={(value) => setNewExpense({ ...newExpense, paid_by: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="driver">Driver</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="carrier">Carrier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleAddExpense} className="w-full">Add Expense</Button>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {expenses.map((expense) => (
              <Card key={expense.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{expense.expense_type}</Badge>
                        <span className="font-semibold">${parseFloat(expense.amount).toFixed(2)}</span>
                        <span className="text-sm text-muted-foreground">• Paid by {expense.paid_by}</span>
                      </div>
                      {expense.description && <p className="text-sm">{expense.description}</p>}
                      {expense.incurred_date && (
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(expense.incurred_date), "MM/dd/yyyy")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteExpense(expense.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {expenses.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No expenses recorded yet
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <LoadDocuments 
            loadId={id!} 
            documents={documents} 
            onDocumentsChange={async () => {
              // Only refresh documents, not the entire page
              const { data } = await supabase
                .from("load_documents")
                .select("*")
                .eq("load_id", id)
                .order("uploaded_at", { ascending: false });
              setDocuments(data || []);
            }}
          />
        </TabsContent>

        <TabsContent value="financials" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">${totalExpenses.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${netProfit.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payload (Broker Pays)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.customer_rate || load.rate || ""}
                    onChange={(e) => updateField("customer_rate", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Carrier Pay</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.carrier_rate || ""}
                    onChange={(e) => updateField("carrier_rate", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Broker Fee</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.broker_fee || ""}
                    onChange={(e) => updateField("broker_fee", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Fuel Surcharge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.fuel_surcharge || ""}
                    onChange={(e) => updateField("fuel_surcharge", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Accessorial Charges</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.accessorial_charges || ""}
                    onChange={(e) => updateField("accessorial_charges", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Detention Charges</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.detention_charges || ""}
                    onChange={(e) => updateField("detention_charges", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Layover Charges</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.layover_charges || ""}
                    onChange={(e) => updateField("layover_charges", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Other Charges</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.other_charges || ""}
                    onChange={(e) => updateField("other_charges", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Carrier Search Dialog */}
      <Dialog open={carrierDialogOpen} onOpenChange={setCarrierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Carrier by DOT/MC Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>DOT or MC Number</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter DOT or MC number"
                  value={carrierSearch}
                  onChange={(e) => setCarrierSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCarrierLookup();
                    }
                  }}
                />
                <Button 
                  onClick={handleCarrierLookup}
                  disabled={carrierLookupLoading}
                >
                  {carrierLookupLoading ? "Searching..." : "Search"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Search FMCSA database for carrier information and automatically add to your list
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
