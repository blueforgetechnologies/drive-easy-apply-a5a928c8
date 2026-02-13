import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  X, Plus, Truck, MapPin, DollarSign, FileText, Package, ArrowDown,
  Calculator, Loader2, CheckCircle2, GripVertical, Trash2, CircleDot
} from "lucide-react";
import { RateConfirmationUploader, ExtractedLoadData } from "@/components/RateConfirmationUploader";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
import { NewCustomerPrompt } from "@/components/NewCustomerPrompt";
import LoadRouteMap from "@/components/LoadRouteMap";

interface Stop {
  id: string;
  type: "pickup" | "delivery";
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  notes: string;
}

interface CreateLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  vehicles: any[];
  drivers: any[];
  carriers: any[];
  customers: any[];
  defaultCarrierId: string | null;
  currentUserDispatcherId: string | null;
  onLoadCreated: () => void;
  onCustomersRefresh: () => void;
}

const generateId = () => Math.random().toString(36).slice(2, 10);

const emptyStop = (type: "pickup" | "delivery"): Stop => ({
  id: generateId(),
  type,
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  contact: "",
  phone: "",
  email: "",
  date: "",
  time: "",
  notes: "",
});

const generateManualLoadNumber = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `ME-${year}${month}${day}-${random}`;
};

export function CreateLoadDialog({
  open,
  onOpenChange,
  tenantId,
  vehicles,
  drivers,
  carriers,
  customers,
  defaultCarrierId,
  currentUserDispatcherId,
  onLoadCreated,
  onCustomersRefresh,
}: CreateLoadDialogProps) {
  // Form state
  const [loadNumber, setLoadNumber] = useState(generateManualLoadNumber());
  const [loadType, setLoadType] = useState("internal");
  const [shipperLoadId, setShipperLoadId] = useState("");
  const [carrierId, setCarrierId] = useState(defaultCarrierId || "");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [rate, setRate] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [vehicleSize, setVehicleSize] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [cargoWeight, setCargoWeight] = useState("");
  const [cargoPieces, setCargoPieces] = useState("");
  const [estimatedMiles, setEstimatedMiles] = useState("");
  const [calculatingMiles, setCalculatingMiles] = useState(false);

  // Broker fields
  const [brokerName, setBrokerName] = useState("");
  const [brokerAddress, setBrokerAddress] = useState("");
  const [brokerCity, setBrokerCity] = useState("");
  const [brokerState, setBrokerState] = useState("");
  const [brokerZip, setBrokerZip] = useState("");
  const [brokerContact, setBrokerContact] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [brokerMcNumber, setBrokerMcNumber] = useState("");

  // Billing party
  const [billingName, setBillingName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [billingContact, setBillingContact] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  // Multi-stop
  const [stops, setStops] = useState<Stop[]>([
    emptyStop("pickup"),
    emptyStop("delivery"),
  ]);

  // RC upload
  const [rateConfirmationFile, setRateConfirmationFile] = useState<File | null>(null);
  const [pendingCustomerData, setPendingCustomerData] = useState<any>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setLoadNumber(generateManualLoadNumber());
      setCarrierId(defaultCarrierId || "");
    }
  }, [open, defaultCarrierId]);

  const findMatchingCustomer = useCallback(
    (customerName?: string, mcNumber?: string, email?: string) => {
      if (!customerName && !mcNumber && !email) return null;
      const normName = customerName?.toLowerCase().trim();
      const normMc = mcNumber?.replace(/[^0-9]/g, "");
      const normEmail = email?.toLowerCase().trim();

      if (normMc) {
        for (const c of customers) {
          if (c.mc_number?.replace(/[^0-9]/g, "") === normMc) return c;
        }
      }
      if (normName) {
        for (const c of customers) {
          if (c.name?.toLowerCase().trim() === normName) return c;
        }
        for (const c of customers) {
          const cn = c.name?.toLowerCase().trim();
          if (cn?.includes(normName) || normName.includes(cn)) return c;
        }
      }
      if (normEmail) {
        for (const c of customers) {
          if (c.email?.toLowerCase().trim() === normEmail) return c;
        }
      }
      return null;
    },
    [customers]
  );

  const handleRCExtracted = (data: ExtractedLoadData) => {
    const extractTime = (ts?: string) => {
      if (!ts) return "";
      const m = ts.match(/^(\d{1,2}:\d{2})/);
      return m ? m[1].padStart(5, "0") : "";
    };

    // Fill broker/customer
    if (data.customer_name) setBrokerName(data.customer_name);
    if (data.customer_address) setBrokerAddress(data.customer_address);
    if (data.customer_city) setBrokerCity(data.customer_city);
    if (data.customer_state) setBrokerState(data.customer_state);
    if (data.customer_zip) setBrokerZip(data.customer_zip);
    if (data.customer_contact) setBrokerContact(data.customer_contact);
    if (data.customer_phone) setBrokerPhone(data.customer_phone);
    if (data.customer_email) setBrokerEmail(data.customer_email);
    if (data.customer_mc_number) setBrokerMcNumber(data.customer_mc_number);

    // Billing
    if (data.billing_party_name) setBillingName(data.billing_party_name);
    if (data.billing_party_address) setBillingAddress(data.billing_party_address);
    if (data.billing_party_city) setBillingCity(data.billing_party_city);
    if (data.billing_party_state) setBillingState(data.billing_party_state);
    if (data.billing_party_zip) setBillingZip(data.billing_party_zip);
    if (data.billing_party_contact) setBillingContact(data.billing_party_contact);
    if (data.billing_party_phone) setBillingPhone(data.billing_party_phone);
    if (data.billing_party_email) setBillingEmail(data.billing_party_email);

    // Reference
    if (data.customer_load_id) setShipperLoadId(data.customer_load_id);
    if (data.rate) setRate(String(data.rate));
    if (data.cargo_description) setCargoDescription(data.cargo_description);
    if (data.cargo_weight) setCargoWeight(String(data.cargo_weight));
    if (data.cargo_pieces) setCargoPieces(String(data.cargo_pieces));
    if (data.estimated_miles) setEstimatedMiles(String(data.estimated_miles));
    if (data.equipment_type) setEquipmentType(data.equipment_type);
    if (data.vehicle_size) setVehicleSize(data.vehicle_size);

    // Build stops from extracted data
    if (data.stops && data.stops.length > 0) {
      const newStops = data.stops.map((s) => ({
        id: generateId(),
        type: s.stop_type as "pickup" | "delivery",
        name: s.location_name || "",
        address: s.location_address || "",
        city: s.location_city || "",
        state: s.location_state || "",
        zip: s.location_zip || "",
        contact: s.contact_name || "",
        phone: s.contact_phone || "",
        email: s.contact_email || "",
        date: s.scheduled_date || "",
        time: s.scheduled_time || "",
        notes: s.notes || "",
      }));
      setStops(newStops);
    } else {
      // Legacy single-stop
      setStops([
        {
          id: generateId(),
          type: "pickup",
          name: data.shipper_name || "",
          address: data.shipper_address || "",
          city: data.shipper_city || "",
          state: data.shipper_state || "",
          zip: data.shipper_zip || "",
          contact: data.shipper_contact || "",
          phone: data.shipper_phone || "",
          email: data.shipper_email || "",
          date: data.pickup_date || "",
          time: extractTime(data.pickup_time),
          notes: "",
        },
        {
          id: generateId(),
          type: "delivery",
          name: data.receiver_name || "",
          address: data.receiver_address || "",
          city: data.receiver_city || "",
          state: data.receiver_state || "",
          zip: data.receiver_zip || "",
          contact: data.receiver_contact || "",
          phone: data.receiver_phone || "",
          email: data.receiver_email || "",
          date: data.delivery_date || "",
          time: extractTime(data.delivery_time),
          notes: "",
        },
      ]);
    }

    // Customer matching
    if (data.customer_name) {
      const matched = findMatchingCustomer(data.customer_name, data.customer_mc_number, data.customer_email);
      if (matched) {
        setCustomerId(matched.id);
        setMatchedCustomerId(matched.id);
        setBrokerName(matched.name || data.customer_name);
        toast.success(`Matched existing customer: ${matched.name}`);
      } else {
        setMatchedCustomerId(null);
        setPendingCustomerData({
          customer_name: data.customer_name,
          customer_address: data.customer_address,
          customer_city: data.customer_city,
          customer_state: data.customer_state,
          customer_zip: data.customer_zip,
          customer_mc_number: data.customer_mc_number,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone,
          customer_contact: data.customer_contact,
        });
      }
    }
  };

  const updateStop = (id: string, field: keyof Stop, value: string) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const addStop = (type: "pickup" | "delivery") => {
    const newStop = emptyStop(type);
    // Insert pickups before first delivery, deliveries at end
    if (type === "pickup") {
      const firstDeliveryIdx = stops.findIndex((s) => s.type === "delivery");
      if (firstDeliveryIdx === -1) {
        setStops([...stops, newStop]);
      } else {
        const updated = [...stops];
        updated.splice(firstDeliveryIdx, 0, newStop);
        setStops(updated);
      }
    } else {
      setStops([...stops, newStop]);
    }
  };

  const removeStop = (id: string) => {
    if (stops.length <= 2) {
      toast.error("A load requires at least one pickup and one delivery");
      return;
    }
    setStops((prev) => prev.filter((s) => s.id !== id));
  };

  const pickups = stops.filter((s) => s.type === "pickup");
  const deliveries = stops.filter((s) => s.type === "delivery");
  const firstPickup = pickups[0];
  const lastDelivery = deliveries[deliveries.length - 1];

  const calculateMiles = async () => {
    if (!firstPickup?.city || !firstPickup?.state || !lastDelivery?.city || !lastDelivery?.state) {
      toast.error("Enter pickup and delivery city/state to calculate miles");
      return;
    }
    setCalculatingMiles(true);
    try {
      const { data: tokenData } = await supabase.functions.invoke("get-mapbox-token");
      const token = tokenData?.token;
      if (!token) throw new Error("No map token available");

      const geocode = async (q: string) => {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&country=US&limit=1`
        );
        const d = await res.json();
        return d.features?.[0]?.center as [number, number] | undefined;
      };

      // Build waypoints from all stops
      const allStopQueries = stops
        .filter((s) => s.city && s.state)
        .map((s) => [s.address, s.city, s.state, s.zip].filter(Boolean).join(", "));

      if (allStopQueries.length < 2) throw new Error("Need at least 2 stop locations");

      const coords = await Promise.all(allStopQueries.map(geocode));
      const validCoords = coords.filter(Boolean) as [number, number][];
      if (validCoords.length < 2) throw new Error("Could not geocode locations");

      const coordsStr = validCoords.map((c) => `${c[0]},${c[1]}`).join(";");
      const dirRes = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?access_token=${token}&overview=false`
      );
      const dirData = await dirRes.json();
      const meters = dirData.routes?.[0]?.distance;
      if (!meters) throw new Error("No route found");

      const miles = Math.round(meters * 0.000621371);
      setEstimatedMiles(String(miles));
      toast.success(`Total route: ${miles} mi`);
    } catch (err: any) {
      toast.error(err.message || "Failed to calculate miles");
    } finally {
      setCalculatingMiles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      toast.error("No tenant selected. Please select an organization first.");
      return;
    }
    if (!firstPickup?.city || !firstPickup?.state) {
      toast.error("At least one pickup with city/state is required");
      return;
    }
    if (!lastDelivery?.city || !lastDelivery?.state) {
      toast.error("At least one delivery with city/state is required");
      return;
    }

    try {
      const { data: insertedLoad, error } = await (supabase.from("loads") as any)
        .insert({
          load_number: loadNumber,
          load_type: loadType,
          shipper_load_id: shipperLoadId || null,
          tenant_id: tenantId,
          status: "available",
          // Broker fields
          broker_name: brokerName || null,
          broker_address: brokerAddress || null,
          broker_city: brokerCity || null,
          broker_state: brokerState || null,
          broker_zip: brokerZip || null,
          broker_contact: brokerContact || null,
          broker_phone: brokerPhone || null,
          broker_email: brokerEmail || null,
          // Billing
          billing_party_name: billingName || null,
          billing_party_address: billingAddress || null,
          billing_party_city: billingCity || null,
          billing_party_state: billingState || null,
          billing_party_zip: billingZip || null,
          billing_party_contact: billingContact || null,
          billing_party_phone: billingPhone || null,
          billing_party_email: billingEmail || null,
          // First pickup → pickup fields
          shipper_name: firstPickup.name || null,
          shipper_address: firstPickup.address || null,
          shipper_city: firstPickup.city || null,
          shipper_state: firstPickup.state || null,
          shipper_zip: firstPickup.zip || null,
          shipper_contact: firstPickup.contact || null,
          shipper_phone: firstPickup.phone || null,
          shipper_email: firstPickup.email || null,
          pickup_city: firstPickup.city || null,
          pickup_state: firstPickup.state || null,
          pickup_location: firstPickup.address || null,
          pickup_zip: firstPickup.zip || null,
          pickup_date: firstPickup.date
            ? firstPickup.time
              ? `${firstPickup.date}T${firstPickup.time}`
              : `${firstPickup.date}T08:00`
            : null,
          // Last delivery → delivery fields
          receiver_name: lastDelivery.name || null,
          receiver_address: lastDelivery.address || null,
          receiver_city: lastDelivery.city || null,
          receiver_state: lastDelivery.state || null,
          receiver_zip: lastDelivery.zip || null,
          receiver_contact: lastDelivery.contact || null,
          receiver_phone: lastDelivery.phone || null,
          receiver_email: lastDelivery.email || null,
          delivery_city: lastDelivery.city || null,
          delivery_state: lastDelivery.state || null,
          delivery_location: lastDelivery.address || null,
          delivery_zip: lastDelivery.zip || null,
          delivery_date: lastDelivery.date
            ? lastDelivery.time
              ? `${lastDelivery.date}T${lastDelivery.time}`
              : `${lastDelivery.date}T08:00`
            : null,
          // Cargo
          cargo_description: cargoDescription || null,
          cargo_weight: cargoWeight ? parseFloat(cargoWeight) : null,
          cargo_pieces: cargoPieces ? parseInt(cargoPieces, 10) : null,
          estimated_miles: estimatedMiles ? parseFloat(estimatedMiles) : null,
          rate: rate ? parseFloat(rate) : null,
          equipment_type: equipmentType || null,
          vehicle_size: vehicleSize || null,
          // Assignments
          customer_id: customerId || null,
          carrier_id: carrierId || null,
          assigned_vehicle_id: vehicleId || null,
          assigned_driver_id: driverId || null,
          assigned_dispatcher_id: currentUserDispatcherId || null,
          load_owner_id: currentUserDispatcherId || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      const loadId = (insertedLoad as any)?.id;

      // Insert load_stops for multi-stop
      if (loadId && stops.length > 0) {
        const stopsToInsert = stops.map((s, idx) => ({
          load_id: loadId,
          tenant_id: tenantId,
          stop_sequence: idx + 1,
          stop_type: s.type,
          location_name: s.name || null,
          location_address: s.address || null,
          location_city: s.city || null,
          location_state: s.state || null,
          location_zip: s.zip || null,
          contact_name: s.contact || null,
          contact_phone: s.phone || null,
          scheduled_date: s.date || null,
          scheduled_time_start: s.time || null,
          notes: s.notes || null,
          status: "pending",
        }));

        await supabase.from("load_stops").insert(stopsToInsert);
      }

      // Upload rate confirmation
      if (rateConfirmationFile && loadId) {
        try {
          const fileExt = rateConfirmationFile.name.split(".").pop();
          const fileName = `${loadId}/rate_confirmation/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from("load-documents").upload(fileName, rateConfirmationFile);
          if (!uploadError) {
            await supabase.from("load_documents").insert({
              load_id: loadId,
              tenant_id: tenantId,
              document_type: "rate_confirmation",
              file_name: rateConfirmationFile.name,
              file_url: fileName,
              file_size: rateConfirmationFile.size,
            });
          }
        } catch (e) {
          console.error("RC upload failed:", e);
        }
      }

      // Auto-calculate miles if not provided
      if (!estimatedMiles && loadId && firstPickup.city && firstPickup.state && lastDelivery.city && lastDelivery.state) {
        try {
          const { data: geoPickup } = await supabase.functions.invoke("geocode", {
            body: { query: `${firstPickup.city}, ${firstPickup.state}` },
          });
          const { data: geoDel } = await supabase.functions.invoke("geocode", {
            body: { query: `${lastDelivery.city}, ${lastDelivery.state}` },
          });
          if (geoPickup?.lat && geoDel?.lat) {
            const R = 3959;
            const dLat = ((geoDel.lat - geoPickup.lat) * Math.PI) / 180;
            const dLon = ((geoDel.lng - geoPickup.lng) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.sin(dLon / 2) ** 2 * Math.cos((geoPickup.lat * Math.PI) / 180) * Math.cos((geoDel.lat * Math.PI) / 180);
            const miles = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25);
            await supabase.from("loads" as any).update({ estimated_miles: miles }).eq("id", loadId);
          }
        } catch {}
      }

      toast.success("Load created successfully");
      onLoadCreated();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error("Failed to create load: " + err.message);
    }
  };

  const resetForm = () => {
    setLoadNumber(generateManualLoadNumber());
    setLoadType("internal");
    setShipperLoadId("");
    setCarrierId(defaultCarrierId || "");
    setVehicleId("");
    setDriverId("");
    setCustomerId("");
    setRate("");
    setEquipmentType("");
    setVehicleSize("");
    setCargoDescription("");
    setCargoWeight("");
    setCargoPieces("");
    setEstimatedMiles("");
    setBrokerName("");
    setBrokerAddress("");
    setBrokerCity("");
    setBrokerState("");
    setBrokerZip("");
    setBrokerContact("");
    setBrokerPhone("");
    setBrokerEmail("");
    setBrokerMcNumber("");
    setBillingName("");
    setBillingAddress("");
    setBillingCity("");
    setBillingState("");
    setBillingZip("");
    setBillingContact("");
    setBillingPhone("");
    setBillingEmail("");
    setStops([emptyStop("pickup"), emptyStop("delivery")]);
    setRateConfirmationFile(null);
    setPendingCustomerData(null);
    setMatchedCustomerId(null);
  };

  const ratePerMile = rate && estimatedMiles ? (parseFloat(rate) / parseFloat(estimatedMiles)).toFixed(2) : null;

  // Convert stops to LoadRouteMap format
  const mapStops = useMemo(() => 
    stops
      .filter(s => s.city && s.state)
      .map((s, idx) => ({
        location_city: s.city,
        location_state: s.state,
        location_address: s.address,
        location_zip: s.zip,
        location_name: s.name,
        stop_type: s.type,
        stop_sequence: idx + 1,
        scheduled_date: s.date,
      })),
    [stops]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Create New Load</h2>
              <p className="text-xs text-muted-foreground">Fill in details or upload a rate confirmation to auto-populate</p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-2 hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

         <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Form */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {/* Rate Confirmation Upload */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10">
                  <FileText className="h-4 w-4 text-blue-500" />
                </div>
                <h3 className="font-semibold text-sm text-blue-600 dark:text-blue-400">Quick Fill from Rate Confirmation</h3>
              </div>
              <RateConfirmationUploader
                onDataExtracted={handleRCExtracted}
                onFileSelected={(file) => setRateConfirmationFile(file)}
              />
              {matchedCustomerId && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">
                    Customer matched: {customers.find((c) => c.id === matchedCustomerId)?.name}
                  </span>
                </div>
              )}
              {pendingCustomerData && (
                <NewCustomerPrompt
                  extractedData={pendingCustomerData}
                  onCustomerAdded={async (cid) => {
                    await onCustomersRefresh();
                    setCustomerId(cid);
                    setMatchedCustomerId(cid);
                    setPendingCustomerData(null);
                  }}
                  onDismiss={() => setPendingCustomerData(null)}
                />
              )}
            </div>

            {/* Carrier / Truck / Driver */}
            <SectionCard icon={<Truck className="h-3.5 w-3.5" />} title="Carrier / Truck / Driver" color="blue">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Carrier">
                  <Select value={carrierId} onValueChange={(v) => { setCarrierId(v); setVehicleId(""); setDriverId(""); }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select carrier" /></SelectTrigger>
                    <SelectContent>
                      {carriers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Truck ID">
                  <Select
                    value={vehicleId}
                    onValueChange={(v) => {
                      const vehicle = vehicles.find((vh: any) => vh.id === v);
                      setVehicleId(v);
                      setDriverId(vehicle?.assigned_driver_id || vehicle?.driver_1_id || "");
                      if (vehicle?.carrier_id) setCarrierId(vehicle.carrier_id);
                    }}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select truck" /></SelectTrigger>
                    <SelectContent>
                      {vehicles
                        .filter((v: any) => !carrierId || !v.carrier_id || v.carrier_id === carrierId)
                        .map((v: any) => (
                          <SelectItem key={v.id} value={v.id}>{v.vehicle_number || v.id.slice(0, 8)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Driver">
                  <Select value={driverId} onValueChange={setDriverId}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Auto from truck" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.personal_info?.firstName} {d.personal_info?.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>

            {/* Load Identification */}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Our Load Number">
                <Input value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} className="h-8" required />
              </Field>
              <Field label="Customer Load ID">
                <Input value={shipperLoadId} onChange={(e) => setShipperLoadId(e.target.value)} placeholder="Pro#, Order#..." className="h-8" />
              </Field>
              <Field label="Load Type">
                <Select value={loadType} onValueChange={setLoadType}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="load_board">Load Board</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Customer/Broker */}
            <SectionCard icon={<DollarSign className="h-3.5 w-3.5" />} title="Customer/Broker Information" color="amber">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <Field label="Company Name">
                    <SearchableEntitySelect
                      entities={customers.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                      value={brokerName}
                      placeholder="Search customers..."
                      onSelect={(entity) => {
                        const customer = customers.find((c) => c.id === entity.id);
                        setBrokerName(entity.name);
                        setCustomerId(entity.id);
                        if (customer) {
                          setBrokerContact(customer.contact_name || "");
                          setBrokerPhone(customer.phone || "");
                          setBrokerEmail(customer.email || "");
                          setBrokerAddress(customer.address || "");
                          setBrokerCity(customer.city || "");
                          setBrokerState(customer.state || "");
                          setBrokerZip(customer.zip || "");
                          setBrokerMcNumber(customer.mc_number || "");
                        }
                      }}
                      onAddNew={async () => {
                        toast.error("Please add customers from the Customers tab");
                        return;
                      }}
                      entityType="customer"
                      className="h-8"
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Address">
                    <Input value={brokerAddress} onChange={(e) => setBrokerAddress(e.target.value)} className="h-8" />
                  </Field>
                </div>
                <Field label="City"><Input value={brokerCity} onChange={(e) => setBrokerCity(e.target.value)} className="h-8" /></Field>
                <Field label="State"><Input value={brokerState} onChange={(e) => setBrokerState(e.target.value)} className="h-8" placeholder="CA" /></Field>
                <Field label="ZIP"><Input value={brokerZip} onChange={(e) => setBrokerZip(e.target.value)} className="h-8" /></Field>
                <Field label="MC#"><Input value={brokerMcNumber} onChange={(e) => setBrokerMcNumber(e.target.value)} className="h-8" /></Field>
                <Field label="Contact"><Input value={brokerContact} onChange={(e) => setBrokerContact(e.target.value)} className="h-8" /></Field>
                <Field label="Phone"><Input value={brokerPhone} onChange={(e) => setBrokerPhone(e.target.value)} className="h-8" /></Field>
                <div className="col-span-2"><Field label="Email"><Input value={brokerEmail} onChange={(e) => setBrokerEmail(e.target.value)} className="h-8" /></Field></div>
              </div>
            </SectionCard>

            {/* Billing Party section removed - merged into Financial below */}

            {/* === STOPS SECTION === */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                  <h3 className="font-semibold text-xs">Route Stops</h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stops.length} stops</Badge>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addStop("pickup")}>
                    <Plus className="h-3 w-3" /> Pickup
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addStop("delivery")}>
                    <Plus className="h-3 w-3" /> Drop
                  </Button>
                </div>
              </div>

              {stops.map((stop, idx) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  index={idx}
                  total={stops.length}
                  typeIndex={stop.type === "pickup" ? pickups.indexOf(stop) + 1 : deliveries.indexOf(stop) + 1}
                  onUpdate={(field, val) => updateStop(stop.id, field, val)}
                  onRemove={() => removeStop(stop.id)}
                  canRemove={stops.length > 2}
                />
              ))}
            </div>

            {/* Equipment & Cargo */}
            <SectionCard icon={<Package className="h-3.5 w-3.5" />} title="Equipment & Cargo" color="slate">
              <div className="grid grid-cols-4 gap-2">
                <Field label="Equipment">
                  <Select value={equipmentType} onValueChange={setEquipmentType}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dry_van">Dry Van</SelectItem>
                      <SelectItem value="reefer">Reefer</SelectItem>
                      <SelectItem value="flatbed">Flatbed</SelectItem>
                      <SelectItem value="step_deck">Step Deck</SelectItem>
                      <SelectItem value="box_truck">Box Truck</SelectItem>
                      <SelectItem value="sprinter">Sprinter</SelectItem>
                      <SelectItem value="conestoga">Conestoga</SelectItem>
                      <SelectItem value="lowboy">Lowboy</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Size"><Input value={vehicleSize} onChange={(e) => setVehicleSize(e.target.value)} placeholder="53ft" className="h-8" /></Field>
                <Field label="Weight (lbs)"><Input type="number" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} className="h-8" /></Field>
                <Field label="Pieces"><Input type="number" value={cargoPieces} onChange={(e) => setCargoPieces(e.target.value)} className="h-8" /></Field>
                <div className="col-span-3"><Field label="Cargo Description"><Textarea value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} rows={1} className="min-h-[32px] resize-none" /></Field></div>
                <Field label="Loaded Miles">
                  <div className="flex gap-1">
                    <Input type="number" value={estimatedMiles} onChange={(e) => setEstimatedMiles(e.target.value)} className="h-8" />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={calculatingMiles} onClick={calculateMiles}>
                      {calculatingMiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </Field>
              </div>
            </SectionCard>

            {/* Financial & Billing */}
            <SectionCard icon={<DollarSign className="h-3.5 w-3.5" />} title="Financial & Billing" color="green">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-3">
                  <Field label="Customer (Who Pays)">
                    <SearchableEntitySelect
                      entities={customers.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                      value={customers.find((c) => c.id === customerId)?.name || ""}
                      placeholder="Search customers..."
                      onSelect={(entity) => setCustomerId(entity.id)}
                      onAddNew={async () => { toast.error("Please add customers from the Customers tab"); return; }}
                      entityType="customer"
                      className="h-8"
                    />
                  </Field>
                </div>
                <Field label="Rate ($)">
                  <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8" />
                </Field>
              </div>
              <div className="border-t mt-2 pt-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Invoice To (Billing Party)</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2"><Field label="Company"><Input value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="Defaults to Customer/Broker" className="h-7 text-xs" /></Field></div>
                  <Field label="Contact"><Input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} className="h-7 text-xs" /></Field>
                  <Field label="Phone"><Input value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} className="h-7 text-xs" /></Field>
                  <div className="col-span-2"><Field label="Address"><Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className="h-7 text-xs" /></Field></div>
                  <Field label="City"><Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className="h-7 text-xs" /></Field>
                  <Field label="St / ZIP">
                    <div className="flex gap-1">
                      <Input value={billingState} onChange={(e) => setBillingState(e.target.value)} placeholder="ST" className="h-7 text-xs w-14" />
                      <Input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder="ZIP" className="h-7 text-xs" />
                    </div>
                  </Field>
                  <div className="col-span-2"><Field label="Email"><Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="h-7 text-xs" /></Field></div>
                </div>
              </div>
            </SectionCard>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-1 pb-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-10">
                Cancel
              </Button>
              <Button onClick={handleSubmit} className="flex-1 h-10 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                Create Load
              </Button>
            </div>
          </div>

          {/* Right Panel - Route Summary */}
          <div className="w-[420px] border-l bg-muted/30 overflow-y-auto hidden lg:flex lg:flex-col">
            <div className="p-3 space-y-3 flex flex-col flex-1">
              {/* Route Timeline */}
              <div className="space-y-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Route Overview</h3>
                <div className="space-y-0">
                  {stops.map((stop, idx) => (
                    <div key={stop.id} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full border-2 ${
                          stop.type === "pickup" ? "border-emerald-500 bg-emerald-500/20" : "border-rose-500 bg-rose-500/20"
                        }`} />
                        {idx < stops.length - 1 && <div className="w-0.5 flex-1 bg-border" />}
                      </div>
                      <div className="pb-2 -mt-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                            stop.type === "pickup"
                              ? "border-emerald-500/50 text-emerald-600"
                              : "border-rose-500/50 text-rose-600"
                          }`}>
                            {stop.type === "pickup" ? "PU" : "DEL"} {
                              stop.type === "pickup"
                                ? pickups.indexOf(stop) + 1
                                : deliveries.indexOf(stop) + 1
                            }
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mt-0.5">
                          {stop.city && stop.state
                            ? `${stop.city}, ${stop.state}`
                            : <span className="text-muted-foreground italic">No location set</span>}
                        </p>
                        {stop.name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{stop.name}</p>
                        )}
                        {stop.date && (
                          <p className="text-xs text-muted-foreground">
                            {stop.date}{stop.time ? ` @ ${stop.time}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Map - large, between route overview and summary */}
              <div className="rounded-lg border overflow-hidden flex-1 min-h-[280px]">
                {mapStops.length >= 2 ? (
                  <LoadRouteMap stops={mapStops} />
                ) : (
                  <div className="h-full flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                    Add pickup & delivery to see route
                  </div>
                )}
              </div>

              {/* Load Summary */}
              <div className="rounded-lg border bg-background p-2.5 space-y-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Load Summary</h3>
                <SummaryRow label="Load #" value={loadNumber} />
                <SummaryRow label="Customer" value={brokerName || "—"} />
                <SummaryRow label="Equipment" value={equipmentType?.replace("_", " ") || "—"} />
                {rate && <SummaryRow label="Rate" value={`$${parseFloat(rate).toLocaleString()}`} highlight />}
                {estimatedMiles && <SummaryRow label="Miles" value={`${parseInt(estimatedMiles).toLocaleString()} mi`} />}
                {ratePerMile && <SummaryRow label="Rate/Mile" value={`$${ratePerMile}`} />}
                {cargoWeight && <SummaryRow label="Weight" value={`${parseInt(cargoWeight).toLocaleString()} lbs`} />}
                {cargoPieces && <SummaryRow label="Pieces" value={cargoPieces} />}
                <SummaryRow label="Stops" value={`${pickups.length} PU → ${deliveries.length} DEL`} />
              </div>

              {/* Assigned Resources */}
              {(carrierId || vehicleId || driverId) && (
                <div className="rounded-lg border bg-background p-2.5 space-y-1">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Assigned</h3>
                  {carrierId && <SummaryRow label="Carrier" value={carriers.find((c: any) => c.id === carrierId)?.name || "—"} />}
                  {vehicleId && <SummaryRow label="Truck" value={vehicles.find((v: any) => v.id === vehicleId)?.vehicle_number || "—"} />}
                  {driverId && (
                    <SummaryRow
                      label="Driver"
                      value={(() => {
                        const d = drivers.find((dr: any) => dr.id === driverId);
                        return d ? `${d.personal_info?.firstName || ""} ${d.personal_info?.lastName || ""}` : "—";
                      })()}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// === Sub-components ===

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[11px] font-medium text-muted-foreground leading-none">{label}</Label>
      {children}
    </div>
  );
}

const sectionColors: Record<string, { border: string; bg: string; icon: string; text: string }> = {
  blue: {
    border: "border-blue-200 dark:border-blue-800/60",
    bg: "bg-gradient-to-br from-blue-100/80 to-blue-50/40 dark:from-blue-950/40 dark:to-blue-900/20",
    icon: "bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-400",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-800/60",
    bg: "bg-gradient-to-br from-amber-100/80 to-amber-50/40 dark:from-amber-950/40 dark:to-amber-900/20",
    icon: "bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-400",
  },
  violet: {
    border: "border-violet-200 dark:border-violet-800/60",
    bg: "bg-gradient-to-br from-violet-100/80 to-violet-50/40 dark:from-violet-950/40 dark:to-violet-900/20",
    icon: "bg-violet-500/20",
    text: "text-violet-700 dark:text-violet-400",
  },
  slate: {
    border: "border-slate-200 dark:border-slate-700/60",
    bg: "bg-gradient-to-br from-slate-100/80 to-slate-50/40 dark:from-slate-900/50 dark:to-slate-800/30",
    icon: "bg-slate-500/20",
    text: "text-slate-700 dark:text-slate-400",
  },
  green: {
    border: "border-green-200 dark:border-green-800/60",
    bg: "bg-gradient-to-br from-green-100/80 to-green-50/40 dark:from-green-950/40 dark:to-green-900/20",
    icon: "bg-green-500/20",
    text: "text-green-700 dark:text-green-400",
  },
};

function SectionCard({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  const c = sectionColors[color] || sectionColors.slate;
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-2.5 space-y-1.5`}>
      <div className={`flex items-center gap-1.5 pb-1 border-b ${c.border}`}>
        <div className={`p-0.5 rounded ${c.icon}`}>{icon}</div>
        <h3 className={`font-semibold text-xs ${c.text}`}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StopCard({
  stop,
  index,
  total,
  typeIndex,
  onUpdate,
  onRemove,
  canRemove,
}: {
  stop: Stop;
  index: number;
  total: number;
  typeIndex: number;
  onUpdate: (field: keyof Stop, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const isPickup = stop.type === "pickup";
  const borderColor = isPickup
    ? "border-emerald-200 dark:border-emerald-800/60"
    : "border-rose-200 dark:border-rose-800/60";
  const bgColor = isPickup
    ? "bg-gradient-to-br from-emerald-100/80 to-emerald-50/40 dark:from-emerald-950/40 dark:to-emerald-900/20"
    : "bg-gradient-to-br from-rose-100/80 to-rose-50/40 dark:from-rose-950/40 dark:to-rose-900/20";
  const iconBg = isPickup ? "bg-emerald-500/20" : "bg-rose-500/20";
  const textColor = isPickup
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-rose-700 dark:text-rose-400";
  const iconColor = isPickup
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-2 space-y-1`}>
      <div className={`flex items-center justify-between pb-1 border-b ${borderColor}`}>
        <div className="flex items-center gap-1.5">
          <MapPin className={`h-3 w-3 ${iconColor}`} />
          <span className={`font-semibold text-xs ${textColor}`}>
            {isPickup ? "PU" : "DEL"} #{typeIndex}
          </span>
          <span className="text-[10px] text-muted-foreground">Stop {index + 1}/{total}</span>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-x-2 gap-y-1">
        <Field label="Facility"><Input value={stop.name} onChange={(e) => onUpdate("name", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Address"><Input value={stop.address} onChange={(e) => onUpdate("address", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="City"><Input value={stop.city} onChange={(e) => onUpdate("city", e.target.value)} className="h-7 text-xs" required /></Field>
        <Field label="State"><Input value={stop.state} onChange={(e) => onUpdate("state", e.target.value)} className="h-7 text-xs" required /></Field>
        <Field label="ZIP"><Input value={stop.zip} onChange={(e) => onUpdate("zip", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Contact"><Input value={stop.contact} onChange={(e) => onUpdate("contact", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Phone"><Input value={stop.phone} onChange={(e) => onUpdate("phone", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Date"><Input type="date" value={stop.date} onChange={(e) => onUpdate("date", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Time"><Input type="time" value={stop.time} onChange={(e) => onUpdate("time", e.target.value)} className="h-7 text-xs" /></Field>
        <Field label="Notes"><Input value={stop.notes} onChange={(e) => onUpdate("notes", e.target.value)} className="h-7 text-xs" /></Field>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-bold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}
