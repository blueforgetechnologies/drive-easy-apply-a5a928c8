import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  Calculator, Loader2, CheckCircle2, GripVertical, Trash2, CircleDot, AlertTriangle
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

  // Duplicate load ID detection
  const [duplicateLoad, setDuplicateLoad] = useState<any>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const duplicateCheckRef = useRef<string>("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setLoadNumber(generateManualLoadNumber());
      setCarrierId(defaultCarrierId || "");
      setDuplicateLoad(null);
      setDuplicateConfirmed(false);
      duplicateCheckRef.current = "";
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

  const checkDuplicateLoadId = useCallback(async (value: string) => {
    if (!value.trim() || !tenantId) return;
    // Avoid re-checking same value
    if (duplicateCheckRef.current === value.trim()) return;
    duplicateCheckRef.current = value.trim();

    const { data } = await (supabase.from("loads") as any)
      .select("id, load_number, status, broker_name, pickup_city, pickup_state, delivery_city, delivery_state, pickup_date, delivery_date, rate, assigned_vehicle_id, shipper_load_id, reference_number")
      .eq("tenant_id", tenantId)
      .or(`shipper_load_id.eq.${value.trim()},reference_number.eq.${value.trim()}`)
      .limit(1)
      .maybeSingle();

    if (data) {
      setDuplicateLoad(data);
      setDuplicateConfirmed(false);
      setShowDuplicateDialog(true);
    } else {
      setDuplicateLoad(null);
    }
  }, [tenantId]);


  const sanitizeTime = (t?: string | null): string => {
    if (!t) return "";
    const m = t.match(/(\d{1,2}:\d{2})/);
    return m ? m[1].padStart(5, "0") : "";
  };

  const handleRCExtracted = (data: ExtractedLoadData) => {
    const extractTime = (ts?: string) => sanitizeTime(ts);

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

    // Block if duplicate found but not yet confirmed
    if (duplicateLoad && !duplicateConfirmed) {
      setShowDuplicateDialog(true);
      return;
    }

    try {
      const { data: insertedLoad, error } = await (supabase.from("loads") as any)
        .insert({
          load_number: loadNumber,
          load_type: loadType,
          shipper_load_id: shipperLoadId || null,
          reference_number: shipperLoadId || null,
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
            ? sanitizeTime(firstPickup.time)
              ? `${firstPickup.date}T${sanitizeTime(firstPickup.time)}`
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
            ? sanitizeTime(lastDelivery.time)
              ? `${lastDelivery.date}T${sanitizeTime(lastDelivery.time)}`
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
    setDuplicateLoad(null);
    setDuplicateConfirmed(false);
    duplicateCheckRef.current = "";
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
    <>
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
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {/* Rate Confirmation Upload */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/15 shadow-sm border border-blue-200/50 dark:border-blue-700/40">
                  <FileText className="h-4 w-4 text-blue-500" />
                </div>
                <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400">Quick Fill from Rate Confirmation</h3>
              </div>
              <RateConfirmationUploader
                onDataExtracted={handleRCExtracted}
                onFileSelected={(file) => setRateConfirmationFile(file)}
              />
              {matchedCustomerId && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-500/10 border-2 border-green-500/30 shadow-sm shadow-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 font-semibold">
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
            <GlossySection icon={<Truck className="h-3.5 w-3.5" />} title="Carrier / Truck / Driver" color="blue">
              <div className="grid grid-cols-3 gap-3">
                <GlossyField label="Carrier">
                  <Select value={carrierId} onValueChange={(v) => { setCarrierId(v); setVehicleId(""); setDriverId(""); }}>
                    <SelectTrigger className="h-9 rounded-lg shadow-sm border-2"><SelectValue placeholder="Select carrier" /></SelectTrigger>
                    <SelectContent>
                      {carriers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </GlossyField>
                <GlossyField label="Truck ID">
                  <Select
                    value={vehicleId}
                    onValueChange={(v) => {
                      const vehicle = vehicles.find((vh: any) => vh.id === v);
                      setVehicleId(v);
                      setDriverId(vehicle?.assigned_driver_id || vehicle?.driver_1_id || "");
                      if (vehicle?.carrier_id) setCarrierId(vehicle.carrier_id);
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-lg shadow-sm border-2"><SelectValue placeholder="Select truck" /></SelectTrigger>
                    <SelectContent>
                      {vehicles
                        .filter((v: any) => !carrierId || !v.carrier_id || v.carrier_id === carrierId)
                        .map((v: any) => (
                          <SelectItem key={v.id} value={v.id}>{v.vehicle_number || v.id.slice(0, 8)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </GlossyField>
                <GlossyField label="Driver">
                  <Select value={driverId} onValueChange={setDriverId}>
                    <SelectTrigger className="h-9 rounded-lg shadow-sm border-2"><SelectValue placeholder="Auto from truck" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.personal_info?.firstName} {d.personal_info?.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </GlossyField>
              </div>
            </GlossySection>

            {/* Load Identification */}
            <div className="grid grid-cols-3 gap-3">
              <GlossyField label="Our Load Number">
                <Input value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} className="h-9 rounded-lg shadow-sm border-2 font-semibold" required />
              </GlossyField>
              <GlossyField label="Customer Load ID">
                <Input
                  value={shipperLoadId}
                  onChange={(e) => {
                    setShipperLoadId(e.target.value);
                    // Reset duplicate state when user changes the value
                    if (e.target.value !== duplicateCheckRef.current) {
                      setDuplicateLoad(null);
                      setDuplicateConfirmed(false);
                    }
                  }}
                  onBlur={(e) => { if (e.target.value.trim()) checkDuplicateLoadId(e.target.value.trim()); }}
                  placeholder="Pro#, Order#..."
                  className={`h-9 rounded-lg shadow-sm border-2 ${duplicateLoad && !duplicateConfirmed ? "border-destructive" : ""}`}
                />
                {duplicateLoad && !duplicateConfirmed && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" /> Duplicate ID found in Load {duplicateLoad.load_number}
                  </p>
                )}
              </GlossyField>
              <GlossyField label="Load Type">
                <Select value={loadType} onValueChange={setLoadType}>
                  <SelectTrigger className="h-9 rounded-lg shadow-sm border-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="load_board">Load Board</SelectItem>
                  </SelectContent>
                </Select>
              </GlossyField>
            </div>

            {/* Customer/Broker */}
            <GlossySection icon={<DollarSign className="h-3.5 w-3.5" />} title="Customer/Broker Information" color="amber">
              <div className="grid grid-cols-4 gap-2.5">
                <div className="col-span-2">
                  <GlossyField label="Company Name">
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
                      className="h-9 rounded-lg shadow-sm border-2"
                    />
                  </GlossyField>
                </div>
                <div className="col-span-2">
                  <GlossyField label="Address">
                    <Input value={brokerAddress} onChange={(e) => setBrokerAddress(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" />
                  </GlossyField>
                </div>
                <GlossyField label="City"><Input value={brokerCity} onChange={(e) => setBrokerCity(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="State"><Input value={brokerState} onChange={(e) => setBrokerState(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" placeholder="CA" /></GlossyField>
                <GlossyField label="ZIP"><Input value={brokerZip} onChange={(e) => setBrokerZip(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="MC#"><Input value={brokerMcNumber} onChange={(e) => setBrokerMcNumber(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="Contact"><Input value={brokerContact} onChange={(e) => setBrokerContact(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="Phone"><Input value={brokerPhone} onChange={(e) => setBrokerPhone(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <div className="col-span-2"><GlossyField label="Email"><Input value={brokerEmail} onChange={(e) => setBrokerEmail(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField></div>
              </div>
            </GlossySection>

            {/* === ROUTE STOPS === */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-emerald-500/15 shadow-sm border border-emerald-200/50 dark:border-emerald-700/40">
                    <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-sm">Route Stops</h3>
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">{stops.length} stops</Badge>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg shadow-sm border-2 font-semibold hover:-translate-y-px active:translate-y-px transition-all" onClick={() => addStop("pickup")}>
                    <Plus className="h-3 w-3" /> Pickup
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg shadow-sm border-2 font-semibold hover:-translate-y-px active:translate-y-px transition-all" onClick={() => addStop("delivery")}>
                    <Plus className="h-3 w-3" /> Drop
                  </Button>
                </div>
              </div>

              <div className="space-y-2.5">
                {stops.map((stop, idx) => (
                  <GlossyStopCard
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
            </div>

            {/* Equipment & Cargo */}
            <GlossySection icon={<Package className="h-3.5 w-3.5" />} title="Equipment & Cargo" color="slate">
              <div className="grid grid-cols-4 gap-2.5">
                <GlossyField label="Equipment">
                  <Select value={equipmentType} onValueChange={setEquipmentType}>
                    <SelectTrigger className="h-9 rounded-lg shadow-sm border-2"><SelectValue placeholder="Select" /></SelectTrigger>
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
                </GlossyField>
                <GlossyField label="Size"><Input value={vehicleSize} onChange={(e) => setVehicleSize(e.target.value)} placeholder="53ft" className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="Weight (lbs)"><Input type="number" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <GlossyField label="Pieces"><Input type="number" value={cargoPieces} onChange={(e) => setCargoPieces(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" /></GlossyField>
                <div className="col-span-3"><GlossyField label="Cargo Description"><Textarea value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} rows={1} className="min-h-[36px] resize-none rounded-lg shadow-sm border-2" /></GlossyField></div>
                <GlossyField label="Loaded Miles">
                  <div className="flex gap-1.5">
                    <Input type="number" value={estimatedMiles} onChange={(e) => setEstimatedMiles(e.target.value)} className="h-9 rounded-lg shadow-sm border-2" />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-lg shadow-sm border-2 hover:-translate-y-px active:translate-y-px transition-all" disabled={calculatingMiles} onClick={calculateMiles}>
                      {calculatingMiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </GlossyField>
              </div>
            </GlossySection>

            {/* Financial & Billing */}
            <GlossySection icon={<DollarSign className="h-3.5 w-3.5" />} title="Financial & Billing" color="green">
              <div className="grid grid-cols-4 gap-2.5">
                <div className="col-span-3">
                  <GlossyField label="Customer (Who Pays)">
                    <SearchableEntitySelect
                      entities={customers.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                      value={customers.find((c) => c.id === customerId)?.name || ""}
                      placeholder="Search customers..."
                      onSelect={(entity) => setCustomerId(entity.id)}
                      onAddNew={async () => { toast.error("Please add customers from the Customers tab"); return; }}
                      entityType="customer"
                      className="h-9 rounded-lg shadow-sm border-2"
                    />
                  </GlossyField>
                </div>
                <GlossyField label="Rate ($)">
                  <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 rounded-lg shadow-sm border-2 font-bold text-primary" />
                </GlossyField>
              </div>
              <div className="border-t-2 border-dashed border-border/60 mt-3 pt-3">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Invoice To (Billing Party)</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2"><GlossyField label="Company"><Input value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="Defaults to Customer/Broker" className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField></div>
                  <GlossyField label="Contact"><Input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField>
                  <GlossyField label="Phone"><Input value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField>
                  <div className="col-span-2"><GlossyField label="Address"><Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField></div>
                  <GlossyField label="City"><Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField>
                  <GlossyField label="St / ZIP">
                    <div className="flex gap-1.5">
                      <Input value={billingState} onChange={(e) => setBillingState(e.target.value)} placeholder="ST" className="h-8 text-xs w-14 rounded-lg shadow-sm border-2" />
                      <Input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder="ZIP" className="h-8 text-xs rounded-lg shadow-sm border-2" />
                    </div>
                  </GlossyField>
                  <div className="col-span-2"><GlossyField label="Email"><Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="h-8 text-xs rounded-lg shadow-sm border-2" /></GlossyField></div>
                </div>
              </div>
            </GlossySection>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2 pb-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11 rounded-xl border-2 shadow-md font-semibold text-sm hover:-translate-y-px active:translate-y-px transition-all">
                Cancel
              </Button>
              <Button onClick={handleSubmit} className="flex-1 h-11 rounded-xl shadow-lg shadow-primary/25 font-bold text-sm bg-gradient-to-b from-primary to-primary/85 border-b-[3px] border-b-primary/60 hover:-translate-y-px active:translate-y-px transition-all">
                Create Load
              </Button>
            </div>
          </div>

          {/* Right Panel - Route Summary */}
          <div className="w-72 border-l bg-muted/30 overflow-y-auto hidden lg:flex lg:flex-col">
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

          {/* Far Right Panel - Map */}
          <div className="w-[480px] border-l overflow-hidden hidden lg:block">
            {mapStops.length >= 2 ? (
              <div className="h-full">
                <LoadRouteMap stops={mapStops} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-muted/30 text-xs text-muted-foreground p-4 text-center">
                Add pickup & delivery to see route
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Duplicate Load ID Warning Dialog */}
    <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Duplicate Customer Load ID
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-foreground">A load with this Customer Load ID already exists in your system:</p>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Load #</span>
                  <span className="font-semibold text-foreground">{duplicateLoad?.load_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium capitalize text-foreground">{duplicateLoad?.status?.replace(/_/g, " ")}</span>
                </div>
                {duplicateLoad?.broker_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium text-foreground">{duplicateLoad.broker_name}</span>
                  </div>
                )}
                {(duplicateLoad?.pickup_city || duplicateLoad?.pickup_state) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pickup</span>
                    <span className="font-medium text-foreground">{[duplicateLoad?.pickup_city, duplicateLoad?.pickup_state].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {(duplicateLoad?.delivery_city || duplicateLoad?.delivery_state) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery</span>
                    <span className="font-medium text-foreground">{[duplicateLoad?.delivery_city, duplicateLoad?.delivery_state].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {duplicateLoad?.rate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium text-foreground">${duplicateLoad.rate.toLocaleString()}</span>
                  </div>
                )}
                {duplicateLoad?.pickup_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pickup Date</span>
                    <span className="font-medium text-foreground">{new Date(duplicateLoad.pickup_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              <p className="text-muted-foreground">Do you want to proceed and create a new load with this same Customer Load ID?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setShowDuplicateDialog(false); }}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setDuplicateConfirmed(true);
              setShowDuplicateDialog(false);
            }}
          >
            Proceed Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// === Sub-components ===

function GlossyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-muted-foreground leading-none uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

const glossySectionColors: Record<string, { border: string; bg: string; icon: string; text: string; shadow: string }> = {
  blue: {
    border: "border-blue-200/80 dark:border-blue-700/50",
    bg: "bg-gradient-to-br from-blue-50/90 via-background to-blue-50/30 dark:from-blue-950/50 dark:via-background dark:to-blue-950/20",
    icon: "bg-blue-500/15 border border-blue-200/60 dark:border-blue-700/40",
    text: "text-blue-700 dark:text-blue-400",
    shadow: "shadow-md shadow-blue-500/8",
  },
  amber: {
    border: "border-amber-200/80 dark:border-amber-700/50",
    bg: "bg-gradient-to-br from-amber-50/90 via-background to-amber-50/30 dark:from-amber-950/50 dark:via-background dark:to-amber-950/20",
    icon: "bg-amber-500/15 border border-amber-200/60 dark:border-amber-700/40",
    text: "text-amber-700 dark:text-amber-400",
    shadow: "shadow-md shadow-amber-500/8",
  },
  slate: {
    border: "border-slate-200/80 dark:border-slate-600/50",
    bg: "bg-gradient-to-br from-slate-50/90 via-background to-slate-50/30 dark:from-slate-900/60 dark:via-background dark:to-slate-900/20",
    icon: "bg-slate-500/15 border border-slate-200/60 dark:border-slate-600/40",
    text: "text-slate-700 dark:text-slate-400",
    shadow: "shadow-md shadow-slate-500/8",
  },
  green: {
    border: "border-green-200/80 dark:border-green-700/50",
    bg: "bg-gradient-to-br from-green-50/90 via-background to-green-50/30 dark:from-green-950/50 dark:via-background dark:to-green-950/20",
    icon: "bg-green-500/15 border border-green-200/60 dark:border-green-700/40",
    text: "text-green-700 dark:text-green-400",
    shadow: "shadow-md shadow-green-500/8",
  },
};

function GlossySection({
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
  const c = glossySectionColors[color] || glossySectionColors.slate;
  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} ${c.shadow} p-3.5 space-y-2.5`}>
      <div className={`flex items-center gap-2 pb-2 border-b-2 ${c.border}`}>
        <div className={`p-1 rounded-lg ${c.icon} shadow-sm`}>{icon}</div>
        <h3 className={`font-bold text-xs ${c.text} tracking-wide`}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function GlossyStopCard({
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
  const accentBorder = isPickup
    ? "border-emerald-300/80 dark:border-emerald-700/50"
    : "border-rose-300/80 dark:border-rose-700/50";
  const accentBg = isPickup
    ? "bg-gradient-to-r from-emerald-50/80 via-background to-background dark:from-emerald-950/30 dark:via-background dark:to-background"
    : "bg-gradient-to-r from-rose-50/80 via-background to-background dark:from-rose-950/30 dark:via-background dark:to-background";
  const accentShadow = isPickup ? "shadow-md shadow-emerald-500/8" : "shadow-md shadow-rose-500/8";
  const dotColor = isPickup ? "bg-emerald-500" : "bg-rose-500";
  const accentText = isPickup ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
  const labelBg = isPickup ? "bg-emerald-500/10" : "bg-rose-500/10";

  const styledInput = (field: keyof Stop, placeholder: string, opts?: { type?: string; className?: string }) => (
    <Input
      type={opts?.type || "text"}
      value={stop[field]}
      onChange={(e) => onUpdate(field, e.target.value)}
      placeholder={placeholder}
      className={`h-8 text-xs rounded-lg shadow-sm border-2 ${opts?.className || ""}`}
    />
  );

  return (
    <div className={`rounded-xl border-2 ${accentBorder} ${accentBg} ${accentShadow} p-3 group transition-all hover:shadow-lg`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor} shadow-sm shadow-current`} />
          <span className={`font-bold text-xs ${accentText} ${labelBg} px-2 py-0.5 rounded-md`}>
            {isPickup ? "PU" : "DEL"} #{typeIndex}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-1.5 py-0.5 rounded">{index + 1}/{total}</span>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shadow-sm border border-transparent hover:border-destructive/20">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Content */}
      <div className="flex gap-4">
        {/* Left: Location & Contact */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <GlossyField label="Facility">{styledInput("name", "Facility name", { className: "font-semibold" })}</GlossyField>
            <GlossyField label="Contact">{styledInput("contact", "—")}</GlossyField>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <GlossyField label="Address">{styledInput("address", "Street address")}</GlossyField>
            <GlossyField label="Phone">{styledInput("phone", "—")}</GlossyField>
          </div>
          <div className="grid grid-cols-[1fr_60px_80px] gap-2">
            <GlossyField label="City">{styledInput("city", "City")}</GlossyField>
            <GlossyField label="State">{styledInput("state", "ST", { className: "text-center uppercase" })}</GlossyField>
            <GlossyField label="ZIP">{styledInput("zip", "ZIP")}</GlossyField>
          </div>
        </div>
        {/* Right: Date/Time/Notes */}
        <div className="w-44 shrink-0 border-l-2 border-dashed border-border/50 pl-3 space-y-1.5">
          <GlossyField label="Date">{styledInput("date", "MM/DD/YYYY", { type: "date" })}</GlossyField>
          <GlossyField label="Time">{styledInput("time", "HH:MM", { type: "time" })}</GlossyField>
          <GlossyField label="Notes">{styledInput("notes", "—")}</GlossyField>
        </div>
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
