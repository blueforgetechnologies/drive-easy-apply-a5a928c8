import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddVehicleDialogProps {
  onVehicleAdded?: (vehicleId: string) => void;
}

export function AddVehicleDialog({ onVehicleAdded }: AddVehicleDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_number: "",
    vin: "",
    make: "",
    model: "",
    year: "",
    license_plate: "",
    asset_type: "truck",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.vehicle_number) {
      toast.error("Vehicle number is required");
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
          status: "active",
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Vehicle added successfully");
      setOpen(false);
      setFormData({
        vehicle_number: "",
        vin: "",
        make: "",
        model: "",
        year: "",
        license_plate: "",
        asset_type: "truck",
      });
      
      if (onVehicleAdded && data) {
        onVehicleAdded(data.id);
      }
    } catch (error: any) {
      toast.error("Error adding vehicle");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vehicle_number">Vehicle Number *</Label>
              <Input
                id="vehicle_number"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="e.g., TRUCK-001"
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
                  <SelectItem value="truck">Truck</SelectItem>
                  <SelectItem value="trailer">Trailer</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
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
              <Label htmlFor="license_plate">License Plate</Label>
              <Input
                id="license_plate"
                value={formData.license_plate}
                onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="vin">VIN</Label>
            <Input
              id="vin"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
              placeholder="17-character VIN"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Vehicle"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
