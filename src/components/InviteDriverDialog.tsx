import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Mail } from "lucide-react";

interface Carrier {
  id: string;
  name: string;
}

export function InviteDriverDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [driverName, setDriverName] = useState("");
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>("");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const { toast } = useToast();
  const { effectiveTenant } = useTenantContext();

  // Fetch carriers when dialog opens
  useEffect(() => {
    if (open && effectiveTenant?.id) {
      loadCarriers();
    }
  }, [open, effectiveTenant?.id]);

  const loadCarriers = async () => {
    if (!effectiveTenant?.id) return;
    
    setLoadingCarriers(true);
    try {
      const { data, error } = await supabase
        .from("carriers")
        .select("id, name")
        .eq("tenant_id", effectiveTenant.id)
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      setCarriers(data || []);
      
      // Auto-select first carrier if only one exists
      if (data && data.length === 1) {
        setSelectedCarrierId(data[0].id);
      }
    } catch (error) {
      console.error("Error loading carriers:", error);
    } finally {
      setLoadingCarriers(false);
    }
  };

  const handleInvite = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCarrierId) {
      toast({
        title: "Carrier required",
        description: "Please select a company for the application.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase.functions.invoke("send-driver-invite", {
        body: {
          email: email.toLowerCase(),
          name: driverName.trim() || undefined,
          tenant_id: effectiveTenant?.id,
          carrier_id: selectedCarrierId,
          test_mode: localStorage.getItem("app_test_mode") === "true",
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);
      const testMode = localStorage.getItem("app_test_mode") === "true";
      
      toast({
        title: testMode ? "🧪 Test invitation sent!" : "Application invite sent!",
        description: testMode 
          ? `Test mode active: Link includes validation bypass. Application link for ${selectedCarrier?.name || 'the company'} has been sent to ${email}`
          : `An application link for ${selectedCarrier?.name || 'the company'} has been sent to ${email}`,
      });

      setEmail("");
      setDriverName("");
      setSelectedCarrierId("");
      setOpen(false);
    } catch (error: any) {
      console.error("Error sending driver invite:", error);
      toast({
        title: "Failed to send invite",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
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
          className="h-[28px] px-2.5 text-[12px] font-medium gap-1.5 border-0 rounded-l-full rounded-r-none btn-glossy-violet text-white"
        >
          <Mail className="h-3.5 w-3.5" />
          Invite Driver to Apply
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Driver to Apply</DialogTitle>
          <DialogDescription>
            Send an email invitation with a link to the driver application form.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="carrier">Company</Label>
            <Select 
              value={selectedCarrierId} 
              onValueChange={setSelectedCarrierId}
              disabled={loadingCarriers}
            >
              <SelectTrigger id="carrier">
                <SelectValue placeholder={loadingCarriers ? "Loading..." : "Select a company"} />
              </SelectTrigger>
              <SelectContent>
                {carriers.map((carrier) => (
                  <SelectItem key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="driverName">Driver Name (Optional)</Label>
            <Input
              id="driverName"
              type="text"
              placeholder="John Doe"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="driverEmail">Driver Email Address</Label>
            <Input
              id="driverEmail"
              type="email"
              placeholder="driver@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  handleInvite();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleInvite} disabled={loading || !selectedCarrierId}>
            {loading ? "Sending..." : "Send Application Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
