import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddVehicleDialogProps {
  onVehicleAdded?: (vehicleId: string) => void;
}

export function AddVehicleDialog({ onVehicleAdded }: AddVehicleDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vinLookupLoading, setVinLookupLoading] = useState(false);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [payees, setPayees] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    vehicle_number: "",
    vin: "",
    make: "",
    model: "",
    year: "",
    license_plate: "",
    asset_type: "24' Large Straight",
    body_class: "",
    fuel_type: "",
    carrier: "",
    payee: "",
    primary_dispatcher_id: "",
    suspension: "Air Ride",
    dimensions_length: "",
    dimensions_width: "",
    dimensions_height: "",
    door_dims_height: "",
    door_dims_width: "",
    payload: "",
    clearance: "",
    lift_gate: false,
    lift_gate_capacity: "",
    dock_high: false,
  });

  useEffect(() => {
    if (open) {
      loadDropdownData();
    }
  }, [open]);

  const loadDropdownData = async () => {
    const [carriersRes, payeesRes, dispatchersRes] = await Promise.all([
      supabase.from("carriers").select("id, name").eq("status", "active"),
      supabase.from("payees").select("id, name").eq("status", "active"),
      supabase.from("dispatchers").select("id, first_name, last_name").eq("status", "active"),
    ]);
    if (carriersRes.data) setCarriers(carriersRes.data);
    if (payeesRes.data) setPayees(payeesRes.data);
    if (dispatchersRes.data) setDispatchers(dispatchersRes.data);
  };

  const handleVinLookup = async () => {
    if (!formData.vin || formData.vin.length !== 17) {
      toast.error("Please enter a valid 17-character VIN");
      return;
    }

    setVinLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/decode-vin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vin: formData.vin }),
        }
      );

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (!data.found) {
        toast.error("No vehicle information found for this VIN");
        return;
      }

      const vehicleInfo = data.data;
      setFormData({
        ...formData,
        make: vehicleInfo.make || formData.make,
        model: vehicleInfo.model || formData.model,
        year: vehicleInfo.year || formData.year,
        body_class: vehicleInfo.body_class || formData.body_class,
        fuel_type: vehicleInfo.fuel_type || formData.fuel_type,
        asset_type: mapBodyClassToAssetType(vehicleInfo.body_class) || formData.asset_type,
      });

      toast.success("Vehicle information loaded from VIN");
    } catch (error: any) {
      console.error('VIN lookup error:', error);
      toast.error("Failed to decode VIN");
    } finally {
      setVinLookupLoading(false);
    }
  };

  const mapBodyClassToAssetType = (bodyClass: string | null): string => {
    if (!bodyClass) return "24' Large Straight";
    const lowerBody = bodyClass.toLowerCase();
    if (lowerBody.includes('cargo van')) return "Cargo Van";
    if (lowerBody.includes('van')) return "Sprinter Van";
    if (lowerBody.includes('flatbed')) return "Flatbed";
    return "24' Large Straight";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.vehicle_number) {
      toast.error("Unit ID is required");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .insert([{
          vehicle_number: formData.vehicle_number,
          vin: formData.vin || null,
          make: formData.make || null,
          model: formData.model || null,
          year: formData.year ? parseInt(formData.year) : null,
          license_plate: formData.license_plate || null,
          asset_type: formData.asset_type,
          fuel_type: formData.fuel_type || null,
          carrier: formData.carrier || null,
          payee: formData.payee || null,
          primary_dispatcher_id: formData.primary_dispatcher_id || null,
          suspension: formData.suspension || null,
          dimensions_length: formData.dimensions_length ? parseInt(formData.dimensions_length) : null,
          dimensions_width: formData.dimensions_width ? parseInt(formData.dimensions_width) : null,
          dimensions_height: formData.dimensions_height ? parseInt(formData.dimensions_height) : null,
          door_dims_height: formData.door_dims_height ? parseInt(formData.door_dims_height) : null,
          door_dims_width: formData.door_dims_width ? parseInt(formData.door_dims_width) : null,
          payload: formData.payload ? parseInt(formData.payload) : null,
          clearance: formData.clearance ? parseInt(formData.clearance) : null,
          lift_gate: formData.lift_gate,
          lift_gate_capacity: formData.lift_gate_capacity ? parseInt(formData.lift_gate_capacity) : null,
          dock_high: formData.dock_high,
          status: "active",
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Asset added successfully");
      setOpen(false);
      resetForm();
      
      if (onVehicleAdded && data) {
        onVehicleAdded(data.id);
      }
    } catch (error: any) {
      toast.error("Error adding asset");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_number: "",
      vin: "",
      make: "",
      model: "",
      year: "",
      license_plate: "",
      asset_type: "24' Large Straight",
      body_class: "",
      fuel_type: "",
      carrier: "",
      payee: "",
      primary_dispatcher_id: "",
      suspension: "Air Ride",
      dimensions_length: "",
      dimensions_width: "",
      dimensions_height: "",
      door_dims_height: "",
      door_dims_width: "",
      payload: "",
      clearance: "",
      lift_gate: false,
      lift_gate_capacity: "",
      dock_high: false,
    });
  };

  const assetTypes = [
    "24' Large Straight",
    "26' Large Straight",
    "16' Small Straight",
    "18' Small Straight",
    "Cargo Van",
    "Sprinter Van",
    "Box Truck",
    "Flatbed",
    "Trailer",
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Asset</DialogTitle>
        </DialogHeader>

        {/* VIN Lookup Section */}
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <Label className="text-sm font-medium">VIN Lookup (Free NHTSA Database)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter 17-character VIN"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              maxLength={17}
              className="flex-1 font-mono"
            />
            <Button 
              type="button" 
              onClick={handleVinLookup} 
              disabled={vinLookupLoading || formData.vin.length !== 17}
              variant="secondary"
            >
              <Search className="h-4 w-4 mr-2" />
              {vinLookupLoading ? "Looking up..." : "Lookup"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter VIN and click Lookup to auto-fill make, model, year, and fuel type
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="vehicle_number">Unit ID *</Label>
              <Input
                id="vehicle_number"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="e.g., TAL-3, NATL-6"
                required
              />
            </div>
            <div>
              <Label htmlFor="asset_type">Asset Type</Label>
              <Select value={formData.asset_type} onValueChange={(value) => setFormData({ ...formData, asset_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {assetTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="suspension">Suspension</Label>
              <Select value={formData.suspension} onValueChange={(value) => setFormData({ ...formData, suspension: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="Air Ride">Air Ride</SelectItem>
                  <SelectItem value="Spring">Spring</SelectItem>
                  <SelectItem value="N/A">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Carrier, Payee, Dispatcher */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="carrier">Carrier</Label>
              <Select value={formData.carrier} onValueChange={(value) => setFormData({ ...formData, carrier: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payee">Payee</Label>
              <Select value={formData.payee} onValueChange={(value) => setFormData({ ...formData, payee: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payee" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {payees.map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="primary_dispatcher_id">Primary Dispatcher</Label>
              <Select value={formData.primary_dispatcher_id} onValueChange={(value) => setFormData({ ...formData, primary_dispatcher_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select dispatcher" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {dispatchers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                placeholder="e.g., Freightliner"
              />
            </div>
            <div>
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="e.g., M2"
              />
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                placeholder="e.g., 2020"
              />
            </div>
            <div>
              <Label htmlFor="fuel_type">Fuel Type</Label>
              <Select value={formData.fuel_type} onValueChange={(value) => setFormData({ ...formData, fuel_type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dimensions */}
          <div className="border rounded-lg p-4 space-y-3">
            <Label className="text-sm font-medium">Dimensions (inches)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="dimensions_length" className="text-xs text-muted-foreground">Length (L)</Label>
                <Input
                  id="dimensions_length"
                  type="number"
                  value={formData.dimensions_length}
                  onChange={(e) => setFormData({ ...formData, dimensions_length: e.target.value })}
                  placeholder="e.g., 288"
                />
              </div>
              <div>
                <Label htmlFor="dimensions_width" className="text-xs text-muted-foreground">Width (W)</Label>
                <Input
                  id="dimensions_width"
                  type="number"
                  value={formData.dimensions_width}
                  onChange={(e) => setFormData({ ...formData, dimensions_width: e.target.value })}
                  placeholder="e.g., 97"
                />
              </div>
              <div>
                <Label htmlFor="dimensions_height" className="text-xs text-muted-foreground">Height (H)</Label>
                <Input
                  id="dimensions_height"
                  type="number"
                  value={formData.dimensions_height}
                  onChange={(e) => setFormData({ ...formData, dimensions_height: e.target.value })}
                  placeholder="e.g., 102"
                />
              </div>
            </div>
          </div>

          {/* Door Dimensions */}
          <div className="border rounded-lg p-4 space-y-3">
            <Label className="text-sm font-medium">Door Dimensions (inches)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="door_dims_height" className="text-xs text-muted-foreground">Height</Label>
                <Input
                  id="door_dims_height"
                  type="number"
                  value={formData.door_dims_height}
                  onChange={(e) => setFormData({ ...formData, door_dims_height: e.target.value })}
                  placeholder="e.g., 96"
                />
              </div>
              <div>
                <Label htmlFor="door_dims_width" className="text-xs text-muted-foreground">Width</Label>
                <Input
                  id="door_dims_width"
                  type="number"
                  value={formData.door_dims_width}
                  onChange={(e) => setFormData({ ...formData, door_dims_width: e.target.value })}
                  placeholder="e.g., 94"
                />
              </div>
            </div>
          </div>

          {/* Payload, Clearance, Lift Gate */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="payload">Payload (lbs)</Label>
              <Input
                id="payload"
                type="number"
                value={formData.payload}
                onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                placeholder="e.g., 9000"
              />
            </div>
            <div>
              <Label htmlFor="clearance">Clearance (in)</Label>
              <Input
                id="clearance"
                type="number"
                value={formData.clearance}
                onChange={(e) => setFormData({ ...formData, clearance: e.target.value })}
                placeholder="e.g., 130"
              />
            </div>
            <div>
              <Label htmlFor="lift_gate_capacity">Lift Gate Cap (lbs)</Label>
              <Input
                id="lift_gate_capacity"
                type="number"
                value={formData.lift_gate_capacity}
                onChange={(e) => setFormData({ ...formData, lift_gate_capacity: e.target.value })}
                placeholder="e.g., 5000"
                disabled={!formData.lift_gate}
              />
            </div>
            <div>
              <Label htmlFor="license_plate">License Plate</Label>
              <Input
                id="license_plate"
                value={formData.license_plate}
                onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <Switch
                id="lift_gate"
                checked={formData.lift_gate}
                onCheckedChange={(checked) => setFormData({ ...formData, lift_gate: checked })}
              />
              <Label htmlFor="lift_gate">Lift Gate</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="dock_high"
                checked={formData.dock_high}
                onCheckedChange={(checked) => setFormData({ ...formData, dock_high: checked })}
              />
              <Label htmlFor="dock_high">Dock High</Label>
            </div>
          </div>

          {formData.body_class && (
            <div className="text-sm text-muted-foreground">
              <Label className="text-xs">Body Class (from VIN)</Label>
              <p>{formData.body_class}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
