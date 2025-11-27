import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MaintenanceReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  currentOdometer: number | null;
  onSuccess: () => void;
}

export default function MaintenanceReminderDialog({
  open,
  onOpenChange,
  vehicleId,
  currentOdometer,
  onSuccess,
}: MaintenanceReminderDialogProps) {
  const [maintenanceType, setMaintenanceType] = useState("oil_change");
  const [dueByMiles, setDueByMiles] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Calculate oil change remaining if it's an oil change reminder
      const updateData: any = {};
      
      if (maintenanceType === "oil_change" && dueByMiles) {
        const dueOdometer = parseInt(dueByMiles);
        const remaining = currentOdometer ? Math.round(dueOdometer - currentOdometer) : null;
        
        updateData.oil_change_due = dueOdometer;
        updateData.oil_change_remaining = remaining;
      }

      if (dueDate) {
        updateData.next_service_date = format(dueDate, "yyyy-MM-dd");
      }

      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", vehicleId);

      if (error) throw error;

      toast.success("Maintenance reminder created successfully");
      onSuccess();
      onOpenChange(false);
      
      // Reset form
      setMaintenanceType("oil_change");
      setDueByMiles("");
      setDueDate(undefined);
    } catch (error: any) {
      toast.error("Failed to create reminder: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Maintenance Reminder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Maintenance Type</Label>
            <Select value={maintenanceType} onValueChange={setMaintenanceType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oil_change">Oil Change</SelectItem>
                <SelectItem value="tire_rotation">Tire Rotation</SelectItem>
                <SelectItem value="inspection">Annual Inspection</SelectItem>
                <SelectItem value="brake_service">Brake Service</SelectItem>
                <SelectItem value="transmission">Transmission Service</SelectItem>
                <SelectItem value="coolant">Coolant Flush</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="miles">Due By Miles (Odometer)</Label>
            <Input
              id="miles"
              type="number"
              placeholder="e.g., 150000"
              value={dueByMiles}
              onChange={(e) => setDueByMiles(e.target.value)}
            />
            {currentOdometer && dueByMiles && (
              <p className="text-sm text-muted-foreground">
                {parseInt(dueByMiles) - currentOdometer > 0 
                  ? `${parseInt(dueByMiles) - currentOdometer} miles remaining`
                  : <span className="text-destructive font-semibold">Overdue by {Math.abs(parseInt(dueByMiles) - currentOdometer)} miles</span>
                }
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (!dueByMiles && !dueDate)}>
              {saving ? "Saving..." : "Add Reminder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
