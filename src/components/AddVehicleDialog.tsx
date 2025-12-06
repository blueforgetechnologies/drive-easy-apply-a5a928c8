import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [formData, setFormData] = useState({
    vehicle_number: "",
    vin: "",
    make: "",
    model: "",
    year: "",
    license_plate: "",
    asset_type: "Truck",
    body_class: "",
    fuel_type: "",
  });

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
    if (!bodyClass) return "Truck";
    const lowerBody = bodyClass.toLowerCase();
    if (lowerBody.includes('van')) return "Van";
    if (lowerBody.includes('trailer')) return "Trailer";
    return "Truck";
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
          status: "active",
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Asset added successfully");
      setOpen(false);
      setFormData({
        vehicle_number: "",
        vin: "",
        make: "",
        model: "",
        year: "",
        license_plate: "",
        asset_type: "Truck",
        body_class: "",
        fuel_type: "",
      });
      
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vehicle_number">Unit ID *</Label>
              <Input
                id="vehicle_number"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="e.g., 1, 2, 3..."
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
                  <SelectItem value="Truck">Truck</SelectItem>
                  <SelectItem value="Trailer">Trailer</SelectItem>
                  <SelectItem value="Van">Van</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                placeholder="e.g., Cascadia"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="natural_gas">Natural Gas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="license_plate">License Plate</Label>
            <Input
              id="license_plate"
              value={formData.license_plate}
              onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
            />
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
