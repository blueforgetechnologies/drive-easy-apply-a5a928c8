import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Truck, Plus, Trash2, FileText, DollarSign, AlertCircle, CheckCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import LoadRouteMap from "@/components/LoadRouteMap";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { AddDispatcherDialog } from "@/components/AddDispatcherDialog";
import { AddVehicleDialog } from "@/components/AddVehicleDialog";
import { EditEntityDialog } from "@/components/EditEntityDialog";

export default function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [load, setLoad] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierLookupLoading, setCarrierLookupLoading] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
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

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [loadRes, stopsRes, expensesRes, docsRes, driversRes, vehiclesRes, dispatchersRes, locationsRes, carriersRes, customersRes] = await Promise.all([
        supabase.from("loads").select("*").eq("id", id).single(),
        supabase.from("load_stops").select("*").eq("load_id", id).order("stop_sequence"),
        supabase.from("load_expenses").select("*").eq("load_id", id).order("incurred_date", { ascending: false }),
        supabase.from("load_documents").select("*").eq("load_id", id).order("uploaded_at", { ascending: false }),
        supabase.from("applications").select("id, personal_info").eq("driver_status", "active"),
        supabase.from("vehicles").select("id, vehicle_number, make, model").eq("status", "active"),
        supabase.from("dispatchers").select("id, first_name, last_name").eq("status", "active"),
        supabase.from("locations").select("*").eq("status", "active"),
        supabase.from("carriers").select("id, name, dot_number, mc_number, safer_status, safety_rating").eq("status", "active"),
        supabase.from("customers").select("id, name, contact_name, phone, email").eq("status", "active"),
      ]);

      if (loadRes.error) throw loadRes.error;
      setLoad(loadRes.data);
      setStops(stopsRes.data || []);
      setExpenses(expensesRes.data || []);
      setDocuments(docsRes.data || []);
      setDrivers(driversRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setDispatchers(dispatchersRes.data || []);
      setLocations(locationsRes.data || []);
      setCarriers(carriersRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error: any) {
      toast.error("Error loading load details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
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
          assigned_dispatcher_id: load.assigned_dispatcher_id,
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
          broker_fee: load.broker_fee,
          fuel_surcharge: load.fuel_surcharge,
          accessorial_charges: load.accessorial_charges,
          detention_charges: load.detention_charges,
          layover_charges: load.layover_charges,
          other_charges: load.other_charges,
          estimated_miles: load.estimated_miles,
          actual_miles: load.actual_miles,
          special_instructions: load.special_instructions,
          dispatch_notes: load.dispatch_notes,
          billing_notes: load.billing_notes,
          notes: load.notes,
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
      const { error } = await supabase.from("load_expenses").insert([{
        load_id: id,
        ...newExpense,
        amount: parseFloat(newExpense.amount),
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

  const updateField = (field: string, value: any) => {
    setLoad((prev: any) => ({ ...prev, [field]: value }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-500";
      case "booked": return "bg-blue-500";
      case "dispatched": return "bg-purple-500";
      case "loaded": return "bg-yellow-500";
      case "in_transit": return "bg-orange-500";
      case "delivered": return "bg-green-500";
      case "completed": return "bg-green-700";
      case "cancelled": return "bg-red-500";
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
  const totalRevenue = (parseFloat(load.customer_rate) || 0) + 
                       (parseFloat(load.fuel_surcharge) || 0) + 
                       (parseFloat(load.accessorial_charges) || 0) +
                       (parseFloat(load.detention_charges) || 0) +
                       (parseFloat(load.layover_charges) || 0) +
                       (parseFloat(load.other_charges) || 0);
  const netProfit = totalRevenue - totalExpenses - (parseFloat(load.rate) || 0);

  return (
    <div className="space-y-6 p-6">
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
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stops">Stops ({stops.length})</TabsTrigger>
          <TabsTrigger value="route">Route Map</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Load Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Load Number</Label>
                  <Input value={load.load_number || ""} onChange={(e) => updateField("load_number", e.target.value)} />
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={load.status || "draft"} onValueChange={(value) => updateField("status", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                      <SelectItem value="loaded">Loaded</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Financial Status</Label>
                    <Select value={load.financial_status || "pending"} onValueChange={(value) => updateField("financial_status", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="billed">Billed</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Settlement Status</Label>
                    <Select value={load.settlement_status || "unsettled"} onValueChange={(value) => updateField("settlement_status", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unsettled">Unsettled</SelectItem>
                        <SelectItem value="included">Included</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Equipment Type</Label>
                  <Select value={load.equipment_type || ""} onValueChange={(value) => updateField("equipment_type", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select equipment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dry_van">Dry Van</SelectItem>
                      <SelectItem value="reefer">Reefer</SelectItem>
                      <SelectItem value="flatbed">Flatbed</SelectItem>
                      <SelectItem value="step_deck">Step Deck</SelectItem>
                      <SelectItem value="box_truck">Box Truck</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={load.hazmat || false}
                      onChange={(e) => updateField("hazmat", e.target.checked)}
                      className="rounded"
                    />
                    <Label>Hazmat</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={load.team_required || false}
                      onChange={(e) => updateField("team_required", e.target.checked)}
                      className="rounded"
                    />
                    <Label>Team Required</Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Customer (Pays for Load)</Label>
                  <div className="flex gap-2">
                    <Select value={load.customer_id || ""} onValueChange={(value) => updateField("customer_id", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} {customer.contact_name ? `(${customer.contact_name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {load.customer_id && (
                      <EditEntityDialog 
                        entityId={load.customer_id} 
                        entityType="customer"
                        onEntityUpdated={loadData}
                      />
                    )}
                    <AddCustomerDialog onCustomerAdded={async (customerId) => {
                      await loadData();
                      updateField("customer_id", customerId);
                    }} />
                  </div>
                  {load.customer_id && (() => {
                    const selectedCustomer = customers.find(c => c.id === load.customer_id);
                    if (selectedCustomer) {
                      return (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedCustomer.phone && <div>Phone: {selectedCustomer.phone}</div>}
                          {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div>
                  <Label>Assigned Carrier</Label>
                  <div className="flex gap-2">
                    <Select value={load.carrier_id || ""} onValueChange={(value) => updateField("carrier_id", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select carrier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {carriers.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name} {carrier.dot_number ? `(DOT: ${carrier.dot_number})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => setCarrierDialogOpen(true)}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {load.carrier_id && (() => {
                    const selectedCarrier = carriers.find(c => c.id === load.carrier_id);
                    if (selectedCarrier) {
                      return (
                        <div className="flex gap-6 mt-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Operating Authority Status</span>
                            {selectedCarrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') ? (
                              <span className="text-destructive font-medium">{selectedCarrier.safer_status}</span>
                            ) : (
                              <span className="text-green-700 font-medium">{selectedCarrier.safer_status || "AUTHORIZED FOR Property"}</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Safer Rating Check</span>
                            {selectedCarrier.safety_rating?.toUpperCase() === 'CONDITIONAL' ? (
                              <span className="text-destructive">{selectedCarrier.safety_rating}</span>
                            ) : (
                              <span>{selectedCarrier.safety_rating || "None"}</span>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div>
                  <Label>Assigned Vehicle</Label>
                  <div className="flex gap-2">
                    <Select value={load.assigned_vehicle_id || ""} onValueChange={(value) => updateField("assigned_vehicle_id", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.vehicle_number} - {vehicle.make} {vehicle.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {load.assigned_vehicle_id && (
                      <EditEntityDialog 
                        entityId={load.assigned_vehicle_id} 
                        entityType="vehicle"
                        onEntityUpdated={loadData}
                      />
                    )}
                    <AddVehicleDialog onVehicleAdded={async (vehicleId) => {
                      await loadData();
                      updateField("assigned_vehicle_id", vehicleId);
                    }} />
                  </div>
                </div>

                <div>
                  <Label>Assigned Driver</Label>
                  <div className="flex gap-2">
                    <Select value={load.assigned_driver_id || ""} onValueChange={(value) => updateField("assigned_driver_id", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.personal_info?.firstName} {driver.personal_info?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {load.assigned_driver_id && (
                      <EditEntityDialog 
                        entityId={load.assigned_driver_id} 
                        entityType="driver"
                        onEntityUpdated={loadData}
                      />
                    )}
                    <AddDriverDialog onDriverAdded={async (driverId) => {
                      await loadData();
                      updateField("assigned_driver_id", driverId);
                    }} />
                  </div>
                </div>

                <div>
                  <Label>Assigned Dispatcher</Label>
                  <div className="flex gap-2">
                    <Select value={load.assigned_dispatcher_id || ""} onValueChange={(value) => updateField("assigned_dispatcher_id", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dispatcher" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {dispatchers.map((dispatcher) => (
                          <SelectItem key={dispatcher.id} value={dispatcher.id}>
                            {dispatcher.first_name} {dispatcher.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {load.assigned_dispatcher_id && (
                      <EditEntityDialog 
                        entityId={load.assigned_dispatcher_id} 
                        entityType="dispatcher"
                        onEntityUpdated={loadData}
                      />
                    )}
                    <AddDispatcherDialog onDispatcherAdded={async (dispatcherId) => {
                      await loadData();
                      updateField("assigned_dispatcher_id", dispatcherId);
                    }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cargo Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Commodity Type</Label>
                <Input value={load.commodity_type || ""} onChange={(e) => updateField("commodity_type", e.target.value)} />
              </div>

              <div>
                <Label>Description</Label>
                <Input value={load.cargo_description || ""} onChange={(e) => updateField("cargo_description", e.target.value)} />
              </div>

              <div>
                <Label>Weight (lbs)</Label>
                <Input type="number" value={load.cargo_weight || ""} onChange={(e) => updateField("cargo_weight", e.target.value)} />
              </div>

              <div>
                <Label>Pieces</Label>
                <Input type="number" value={load.cargo_pieces || ""} onChange={(e) => updateField("cargo_pieces", e.target.value)} />
              </div>

              <div>
                <Label>Temperature (if reefer)</Label>
                <Input value={load.temperature_required || ""} onChange={(e) => updateField("temperature_required", e.target.value)} placeholder="e.g., 34-38°F" />
              </div>

              <div>
                <Label>Estimated Miles</Label>
                <Input type="number" value={load.estimated_miles || ""} onChange={(e) => updateField("estimated_miles", e.target.value)} />
              </div>

              <div>
                <Label>Actual Miles</Label>
                <Input type="number" value={load.actual_miles || ""} onChange={(e) => updateField("actual_miles", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes & Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Special Instructions</Label>
                <Textarea
                  value={load.special_instructions || ""}
                  onChange={(e) => updateField("special_instructions", e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <Label>Dispatch Notes</Label>
                <Textarea
                  value={load.dispatch_notes || ""}
                  onChange={(e) => updateField("dispatch_notes", e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <Label>Billing Notes</Label>
                <Textarea
                  value={load.billing_notes || ""}
                  onChange={(e) => updateField("billing_notes", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stops" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Load Stops</h3>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleOptimizeRoute}
                disabled={optimizing || stops.length < 2}
              >
                {optimizing ? "Optimizing..." : "Optimize Route"}
              </Button>
              <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add Stop</Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Stop</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label>Stop Type</Label>
                    <Select value={newStop.stop_type} onValueChange={(value) => setNewStop({ ...newStop, stop_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Location Name</Label>
                    <Input
                      value={newStop.location_name}
                      onChange={(e) => setNewStop({ ...newStop, location_name: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>Address</Label>
                    <Input
                      value={newStop.location_address}
                      onChange={(e) => setNewStop({ ...newStop, location_address: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>City</Label>
                      <Input
                        value={newStop.location_city}
                        onChange={(e) => setNewStop({ ...newStop, location_city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input
                        value={newStop.location_state}
                        onChange={(e) => setNewStop({ ...newStop, location_state: e.target.value })}
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label>ZIP</Label>
                      <Input
                        value={newStop.location_zip}
                        onChange={(e) => setNewStop({ ...newStop, location_zip: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Contact Name</Label>
                      <Input
                        value={newStop.contact_name}
                        onChange={(e) => setNewStop({ ...newStop, contact_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contact Phone</Label>
                      <Input
                        value={newStop.contact_phone}
                        onChange={(e) => setNewStop({ ...newStop, contact_phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Scheduled Date</Label>
                      <Input
                        type="date"
                        value={newStop.scheduled_date}
                        onChange={(e) => setNewStop({ ...newStop, scheduled_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Time Start</Label>
                      <Input
                        type="time"
                        value={newStop.scheduled_time_start}
                        onChange={(e) => setNewStop({ ...newStop, scheduled_time_start: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Time End</Label>
                      <Input
                        type="time"
                        value={newStop.scheduled_time_end}
                        onChange={(e) => setNewStop({ ...newStop, scheduled_time_end: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={newStop.notes}
                      onChange={(e) => setNewStop({ ...newStop, notes: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleAddStop} className="w-full">Add Stop</Button>
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
                      <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> HOS Compliant</Badge>
                    ) : (
                      <Badge className="bg-orange-500"><AlertCircle className="h-3 w-3 mr-1" /> HOS Attention Required</Badge>
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

          <div className="space-y-3">
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
                      {format(new Date(stop.scheduled_date), "MMM d, yyyy")}
                      {stop.scheduled_time_start && ` ${stop.scheduled_time_start}`}
                      {stop.scheduled_time_end && ` - ${stop.scheduled_time_end}`}
                    </div>
                  )}

                  {stop.actual_arrival && (
                    <div className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-muted-foreground">Arrived: </span>
                      {format(new Date(stop.actual_arrival), "MMM d, yyyy h:mm a")}
                    </div>
                  )}

                  {stop.actual_departure && (
                    <div className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-muted-foreground">Departed: </span>
                      {format(new Date(stop.actual_departure), "MMM d, yyyy h:mm a")}
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

          {stops.length === 0 && (
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
                          {format(new Date(expense.incurred_date), "MMM d, yyyy")}
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
          <div className="text-center py-12 text-muted-foreground">
            Document upload feature coming soon
          </div>
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
                  <Label>Customer Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.customer_rate || ""}
                    onChange={(e) => updateField("customer_rate", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Driver/Carrier Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={load.rate || ""}
                    onChange={(e) => updateField("rate", e.target.value)}
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
