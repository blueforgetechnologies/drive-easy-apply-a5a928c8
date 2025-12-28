import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BookLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: any;
  email: any;
  parsedData: any;
  vehicles: any[];
  dispatchers: { id: string; first_name: string; last_name: string }[];
  currentDispatcherId?: string | null;
  onBookingComplete: (matchId: string, loadId: string) => void;
}

export function BookLoadDialog({
  open,
  onOpenChange,
  match,
  email,
  parsedData,
  vehicles,
  dispatchers,
  currentDispatcherId,
  onBookingComplete,
}: BookLoadDialogProps) {
  const [rate, setRate] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [dispatcherId, setDispatcherId] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  // Pre-fill values when dialog opens
  useEffect(() => {
    if (open && match && parsedData) {
      // Rate: use bid_rate if available, otherwise parsed rate
      setRate(match.bid_rate?.toString() || parsedData.rate?.toString() || "");
      
      // Vehicle: use the vehicle from the match
      setVehicleId(match.vehicle_id || "");
      
      // Dispatcher: use bid_by or current dispatcher
      setDispatcherId(match.bid_by || currentDispatcherId || "");
      
      // Pickup date/time from parsed data
      setPickupDate(parsedData.pickup_date || "");
      setPickupTime(parsedData.pickup_time || "");
    }
  }, [open, match, parsedData, currentDispatcherId]);

  const handleBookLoad = async () => {
    if (!rate || !vehicleId) {
      toast.error("Please fill in the required fields");
      return;
    }

    setIsBooking(true);
    try {
      // Generate load number (format: LH-YYMMDD-XXX for Load Hunter/email sourced loads)
      const today = new Date();
      const datePrefix = `LH-${today.getFullYear().toString().slice(2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
      
      // Get the next sequence number for today
      const { count } = await supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .ilike('load_number', `${datePrefix}%`);
      
      const seqNumber = ((count || 0) + 1).toString().padStart(3, '0');
      const loadNumber = `${datePrefix}-${seqNumber}`;

      // Get vehicle info (including carrier + driver)
      const vehicle = vehicles.find(v => v.id === vehicleId);
      const driverFromVehicle = vehicle?.assigned_driver_id || vehicle?.driver_1_id || vehicle?.driver_2_id || null;

      // Resolve customer from parsed broker/customer info (match against existing customers)
      const customerName = parsedData.broker_company || parsedData.customer || parsedData.broker || email?.from_name || null;
      const customerEmail = parsedData.broker_email || email?.from_email || null;
      let customerId: string | null = null;

      try {
        if (customerName) {
          const { data } = await supabase
            .from('customers')
            .select('id')
            .ilike('name', customerName)
            .limit(1);

          customerId = (data?.[0] as any)?.id || null;
        }

        if (!customerId && customerEmail) {
          const { data } = await supabase
            .from('customers')
            .select('id')
            .ilike('email', customerEmail)
            .limit(1);

          customerId = (data?.[0] as any)?.id || null;
        }
      } catch (e) {
        console.warn('Could not resolve customer for booked load', e);
      }

      // Create the load in the loads table with ALL data from the match and parsed email
      // Include truck_type_at_booking to snapshot the vehicle's ownership type at booking time
      // Check if vehicle requires load approval - if so, set status to 'available' instead of 'pending_dispatch'
      const vehicleRequiresApproval = vehicle?.requires_load_approval === true;
      const isContractorTruck = vehicle?.truck_type === 'contractor_truck';
      const contractorPercentage = vehicle?.contractor_percentage || 0;
      
      // Auto-approve if contractor truck with no approval required
      const shouldAutoApprove = isContractorTruck && !vehicleRequiresApproval;
      const loadRate = parseFloat(rate);
      const autoCarrierRate = shouldAutoApprove ? loadRate * (contractorPercentage / 100) : null;
      
      const initialStatus = vehicleRequiresApproval ? 'available' : 'pending_dispatch';
      
      const { data: newLoad, error: loadError } = await supabase
        .from('loads')
        .insert({
          load_number: loadNumber,
          status: initialStatus,
          carrier_approved: vehicleRequiresApproval ? false : true,
          carrier_rate: autoCarrierRate,
          approved_payload: shouldAutoApprove ? loadRate : null,
          rate: loadRate,
          assigned_vehicle_id: vehicleId,
          assigned_driver_id: driverFromVehicle,
          assigned_dispatcher_id: dispatcherId || null,
          load_owner_id: dispatcherId || null, // Default load owner to dispatcher
          carrier_id: (vehicle?.carrier as any) || null,
          customer_id: customerId,
          truck_type_at_booking: vehicle?.truck_type || 'my_truck', // Snapshot truck type at booking
          
          // Pickup info
          pickup_date: pickupDate || null,
          pickup_time: pickupTime || null,
          pickup_city: parsedData.origin_city || null,
          pickup_state: parsedData.origin_state || null,
          pickup_zip: parsedData.origin_zip || null,
          pickup_address: parsedData.origin_address || null,
          pickup_location: parsedData.origin_facility || parsedData.origin_name || null,
          
          // Delivery info
          delivery_city: parsedData.destination_city || null,
          delivery_state: parsedData.destination_state || null,
          delivery_zip: parsedData.destination_zip || null,
          delivery_address: parsedData.destination_address || null,
          delivery_date: parsedData.delivery_date || null,
          delivery_time: parsedData.delivery_time || null,
          delivery_location: parsedData.destination_facility || parsedData.destination_name || null,
          
          // Broker info
          broker_name: parsedData.broker_company || parsedData.broker || parsedData.customer || email?.from_name || null,
          broker_email: parsedData.broker_email || email?.from_email || null,
          broker_phone: parsedData.broker_phone || null,
          broker_contact: parsedData.broker_contact || null,
          
          // Cargo info
          cargo_weight: parsedData.weight ? parseFloat(String(parsedData.weight).replace(/[^0-9.]/g, '')) : null,
          cargo_pieces: parsedData.pieces || null,
          cargo_description: parsedData.commodity || parsedData.description || null,
          commodity_type: parsedData.commodity_type || parsedData.commodity || null,
          cargo_dimensions: parsedData.dimensions || null,
          cargo_length: parsedData.length || null,
          cargo_width: parsedData.width || null,
          cargo_height: parsedData.height || null,
          
          // Equipment info
          equipment_type: parsedData.vehicle_type || parsedData.equipment || null,
          available_feet: parsedData.available_feet || null,
          
          // Miles
          estimated_miles: parsedData.loaded_miles ? parseFloat(String(parsedData.loaded_miles).replace(/[^0-9.]/g, '')) : null,
          empty_miles: match.distance_miles || null,
          
          // Reference numbers
          reference_number: parsedData.order_number || parsedData.load_id || parsedData.reference || null,
          shipper_load_id: parsedData.load_id || parsedData.shipper_load_id || null,
          po_number: parsedData.po_number || null,
          
          // Special instructions and notes
          special_instructions: parsedData.notes || parsedData.special_instructions || null,
          route_notes: parsedData.route_notes || null,
          
          // Source tracking
          email_source: email?.email_source || null,
          load_email_id: email?.id || null,
          match_id: match.id || null,
          
          // Bid tracking
          bid_placed_at: match.bid_at || null,
          bid_placed_by: match.bid_by || null,
          
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (loadError) throw loadError;

      // Update the match with the booked load ID and confirmed rate
      // Set match_status to 'booked' so it shows in the Booked tab while retaining all data
      const { error: matchError } = await supabase
        .from('load_hunt_matches')
        .update({
          booked_load_id: newLoad.id,
          bid_rate: parseFloat(rate), // Store the confirmed rate
          match_status: 'booked', // Mark as booked so it appears in Booked tab
          is_active: true, // Keep active so it remains visible
        })
        .eq('id', match.id);

      if (matchError) throw matchError;

      // Update the load_email to link to the new load
      if (email?.id) {
        await supabase
          .from('load_emails')
          .update({ assigned_load_id: newLoad.id })
          .eq('id', email.id);
      }

      toast.success(`Load ${loadNumber} booked successfully!`);
      onBookingComplete(match.id, newLoad.id);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error booking load:', error);
      toast.error(`Failed to book load: ${error.message}`);
    } finally {
      setIsBooking(false);
    }
  };

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Book Load</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Rate */}
          <div className="space-y-2">
            <Label htmlFor="rate" className="text-sm font-medium">
              Confirmed Rate <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="pl-7"
                placeholder="Enter confirmed rate"
              />
            </div>
          </div>

          {/* Vehicle/Truck */}
          <div className="space-y-2">
            <Label htmlFor="vehicle" className="text-sm font-medium">
              Truck ID <span className="text-destructive">*</span>
            </Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select truck">
                  {selectedVehicle?.vehicle_number || "Select truck"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vehicle_number || v.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dispatcher */}
          <div className="space-y-2">
            <Label htmlFor="dispatcher" className="text-sm font-medium">
              Dispatcher
            </Label>
            <Select value={dispatcherId} onValueChange={setDispatcherId}>
              <SelectTrigger>
                <SelectValue placeholder="Select dispatcher" />
              </SelectTrigger>
              <SelectContent>
                {dispatchers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pickup Date */}
          <div className="space-y-2">
            <Label htmlFor="pickupDate" className="text-sm font-medium">
              Pickup Date
            </Label>
            <Input
              id="pickupDate"
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
            />
          </div>

          {/* Pickup Time */}
          <div className="space-y-2">
            <Label htmlFor="pickupTime" className="text-sm font-medium">
              Pickup Time
            </Label>
            <Input
              id="pickupTime"
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
            />
          </div>

          {/* Summary Card */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Origin:</span>
              <span className="font-medium">{parsedData?.origin_city}, {parsedData?.origin_state}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Destination:</span>
              <span className="font-medium">{parsedData?.destination_city}, {parsedData?.destination_state}</span>
            </div>
            {parsedData?.loaded_miles && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Miles:</span>
                <span className="font-medium">{parsedData.loaded_miles} mi</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBooking}>
            Cancel
          </Button>
          <Button 
            onClick={handleBookLoad} 
            disabled={isBooking || !rate || !vehicleId}
            className="btn-glossy-success text-white"
          >
            {isBooking ? "Booking..." : "BOOK LOAD"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
