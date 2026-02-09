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
import { UserPlus } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { effectiveTenant } = useTenantContext();

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
  };

  const handleInvite = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter first and last name.",
        variant: "destructive",
      });
      return;
    }
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
      // Get current user's profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      // Insert invite record
      const { error: insertError } = await supabase
        .from("invites")
        .insert({
          email: email.toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          invited_by: user.id,
          tenant_id: effectiveTenant?.id || null,
          accepted_at: existingUser ? new Date().toISOString() : null,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          toast({
            title: "Already invited",
            description: "This email has already been invited.",
            variant: "destructive",
          });
          return;
        }
        throw insertError;
      }

      // If user already exists, add them to tenant_users immediately
      if (existingUser && effectiveTenant?.id) {
        await supabase.from("tenant_users").upsert({
          user_id: existingUser.id,
          tenant_id: effectiveTenant.id,
          role: "admin",
          is_active: true,
        }, { onConflict: "user_id,tenant_id" });
        
        // Ensure profile exists with name
        await supabase.from("profiles").upsert({
          id: existingUser.id,
          email: email.toLowerCase(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
          phone: phone.trim() || null,
        }, { onConflict: "id" });
      }

      // Send invitation email
      const { data: { session } } = await supabase.auth.getSession();
      const { error: emailError } = await supabase.functions.invoke("send-invite", {
        body: {
          email: email.toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          inviterName: profile?.full_name || user.email || "Admin",
          tenantName: effectiveTenant?.name || undefined,
          tenantId: effectiveTenant?.id || undefined,
          isExistingUser: !!existingUser,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (emailError) throw emailError;

      toast({
        title: "Invitation sent!",
        description: `An invitation has been sent to ${firstName} ${lastName}`,
      });

      resetForm();
      setOpen(false);
    } catch (error: any) {
      console.error("Error inviting user:", error);
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
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Admin User</DialogTitle>
          <DialogDescription>
            Send an email invitation to add a new admin who can help manage applications.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone number <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
            {loading ? "Sending..." : "Send Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
