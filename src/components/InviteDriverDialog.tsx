import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Mail } from "lucide-react";

export function InviteDriverDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [driverName, setDriverName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { effectiveTenant } = useTenantContext();

  const handleInvite = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
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
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Application invite sent!",
        description: `An application link has been sent to ${email}`,
      });

      setEmail("");
      setDriverName("");
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
          className="h-[30px] px-3 text-[13px] font-medium gap-1.5 border-0 rounded-full btn-glossy-violet text-white"
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
          <Button onClick={handleInvite} disabled={loading}>
            {loading ? "Sending..." : "Send Application Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
