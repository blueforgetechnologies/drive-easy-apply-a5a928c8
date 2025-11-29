import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EditEntityDialogProps {
  entityId: string;
  entityType: "customer" | "driver" | "dispatcher" | "vehicle";
  onEntityUpdated?: () => void;
}

export function EditEntityDialog({ entityId, entityType, onEntityUpdated }: EditEntityDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (open && entityId) {
      loadEntityData();
    }
  }, [open, entityId]);

  const loadEntityData = async () => {
    try {
      let data;
      switch (entityType) {
        case "customer":
          const { data: customer } = await supabase
            .from("customers")
            .select("*")
            .eq("id", entityId)
            .single();
          data = customer;
          break;
        case "driver":
          const { data: driver } = await supabase
            .from("applications")
            .select("*")
            .eq("id", entityId)
            .single();
          const personalInfo = driver?.personal_info as any;
          data = {
            first_name: personalInfo?.firstName || "",
            last_name: personalInfo?.lastName || "",
            email: personalInfo?.email || "",
            phone: driver?.cell_phone || "",
            address: driver?.driver_address || "",
          };
          break;
        case "dispatcher":
          const { data: dispatcher } = await supabase
            .from("dispatchers")
            .select("*")
            .eq("id", entityId)
            .single();
          data = dispatcher;
          break;
        case "vehicle":
          const { data: vehicle } = await supabase
            .from("vehicles")
            .select("*")
            .eq("id", entityId)
            .single();
          data = vehicle;
          break;
      }
      setFormData(data || {});
    } catch (error) {
      console.error("Error loading entity:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let updateData: any = {};
      let table = "";

      switch (entityType) {
        case "customer":
          table = "customers";
          updateData = {
            name: formData.name,
            contact_name: formData.contact_name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
          };
          break;
        case "driver":
          table = "applications";
          updateData = {
            personal_info: {
              firstName: formData.first_name,
              lastName: formData.last_name,
              email: formData.email,
            } as any,
            cell_phone: formData.phone,
            driver_address: formData.address,
          };
          break;
        case "dispatcher":
          table = "dispatchers";
          updateData = {
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
          };
          break;
        case "vehicle":
          table = "vehicles";
          updateData = {
            vehicle_number: formData.vehicle_number,
            make: formData.make,
            model: formData.model,
            year: formData.year,
            vin: formData.vin,
            license_plate: formData.license_plate,
          };
          break;
      }

      const { error } = await supabase
        .from(table as any)
        .update(updateData)
        .eq("id", entityId);

      if (error) throw error;

      toast.success(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} updated successfully`);
      setOpen(false);
      if (onEntityUpdated) onEntityUpdated();
    } catch (error: any) {
      toast.error(`Error updating ${entityType}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {entityType.charAt(0).toUpperCase() + entityType.slice(1)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {entityType === "customer" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.contact_name || ""}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={formData.state || ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div>
                  <Label>ZIP</Label>
                  <Input
                    value={formData.zip || ""}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {(entityType === "driver" || entityType === "dispatcher") && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={formData.first_name || ""}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={formData.last_name || ""}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
            </>
          )}

          {entityType === "vehicle" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle Number</Label>
                  <Input
                    value={formData.vehicle_number || ""}
                    onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label>License Plate</Label>
                  <Input
                    value={formData.license_plate || ""}
                    onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Make</Label>
                  <Input
                    value={formData.make || ""}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={formData.model || ""}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input
                    type="number"
                    value={formData.year || ""}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>VIN</Label>
                <Input
                  value={formData.vin || ""}
                  onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
