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
      // Generate load number (format: LD-YYMMDD-XXX)
      const today = new Date();
      const datePrefix = `LD-${today.getFullYear().toString().slice(2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
      
      // Get the next sequence number for today
      const { count } = await supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .ilike('load_number', `${datePrefix}%`);
      
      const seqNumber = ((count || 0) + 1).toString().padStart(3, '0');
      const loadNumber = `${datePrefix}-${seqNumber}`;

      // Get vehicle info
      const vehicle = vehicles.find(v => v.id === vehicleId);

      // Create the load in the loads table
      const { data: newLoad, error: loadError } = await supabase
        .from('loads')
        .insert({
          load_number: loadNumber,
          status: 'Pending Dispatch',
          rate: parseFloat(rate),
          assigned_vehicle_id: vehicleId,
          assigned_dispatcher_id: dispatcherId || null,
          pickup_date: pickupDate || null,
          pickup_time: pickupTime || null,
          pickup_city: parsedData.origin_city || null,
          pickup_state: parsedData.origin_state || null,
          pickup_zip: parsedData.origin_zip || null,
          pickup_address: parsedData.origin_address || null,
          delivery_city: parsedData.destination_city || null,
          delivery_state: parsedData.destination_state || null,
          delivery_zip: parsedData.destination_zip || null,
          delivery_address: parsedData.destination_address || null,
          delivery_date: parsedData.delivery_date || null,
          delivery_time: parsedData.delivery_time || null,
          broker_name: parsedData.broker_company || parsedData.broker || email?.from_name || null,
          broker_email: parsedData.broker_email || null,
          broker_phone: parsedData.broker_phone || null,
          cargo_weight: parsedData.weight ? parseFloat(parsedData.weight) : null,
          cargo_pieces: parsedData.pieces || null,
          equipment_type: parsedData.vehicle_type || null,
          estimated_miles: parsedData.loaded_miles ? parseFloat(parsedData.loaded_miles) : null,
          reference_number: parsedData.order_number || parsedData.load_id || null,
          special_instructions: parsedData.notes || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (loadError) throw loadError;

      // Update the match to 'booked' status and link to the new load
      const { error: matchError } = await supabase
        .from('load_hunt_matches')
        .update({
          match_status: 'booked',
          is_active: false,
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
