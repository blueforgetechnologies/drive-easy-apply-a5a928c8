import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus } from "lucide-react";
import { useTenantId } from "@/hooks/useTenantId";

export function AddDriverDialog({ onDriverAdded }: { onDriverAdded?: (driverId: string) => void }) {
  const tenantId = useTenantId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("applications")
        .insert([{
          personal_info: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            dateOfBirth: formData.dateOfBirth,
          },
          driver_status: "active",
          status: "pending",
          submitted_at: new Date().toISOString(),
          tenant_id: tenantId,
          // Initialize required JSONB fields with defaults
          payroll_policy: {},
          license_info: {},
          why_hire_you: {},
          direct_deposit: {},
          contractor_agreement: {},
          safe_driving_policy: {},
          no_rider_policy: {},
          driver_dispatch_sheet: {},
          drug_alcohol_policy: {},
          document_upload: {},
          employment_history: {},
          driving_history: {},
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Driver added successfully");
      setOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        dateOfBirth: "",
      });
      
      if (onDriverAdded && data) {
        onDriverAdded(data.id);
      }
    } catch (error: any) {
      toast.error("Failed to add driver: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost"
          size="sm"
          className="h-[28px] px-2.5 text-[12px] font-medium gap-1.5 border-0 rounded-r-full rounded-l-none btn-glossy-primary text-white"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Driver
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Driver Manually</DialogTitle>
          <DialogDescription>
            Add a new driver directly without sending an invitation. You can edit full details after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Driver"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}