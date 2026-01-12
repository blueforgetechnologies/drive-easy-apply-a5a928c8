import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Mail, 
  Plus, 
  Trash2, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface InboundAddress {
  id: string;
  email_address: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
}

interface CustomInboundAddressesProps {
  tenantId: string;
  tenantName: string;
}

export default function CustomInboundAddresses({
  tenantId,
  tenantName,
}: CustomInboundAddressesProps) {
  const [addresses, setAddresses] = useState<InboundAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    loadAddresses();
  }, [tenantId]);

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenant_inbound_addresses")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddresses((data as InboundAddress[]) || []);
    } catch (error: any) {
      console.error("Error loading inbound addresses:", error);
      toast.error("Failed to load custom inbound addresses");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = async () => {
    const trimmedEmail = newAddress.trim().toLowerCase();
    
    if (!trimmedEmail) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    if (!trimmedEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .insert({
          tenant_id: tenantId,
          email_address: trimmedEmail,
          is_active: true,
          created_by: user?.id,
          notes: newNotes.trim() || null,
        });

      if (error) {
        if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
          toast.error("This email address is already mapped to a tenant");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Custom inbound address added");
      setNewAddress("");
      setNewNotes("");
      await loadAddresses();
    } catch (error: any) {
      console.error("Error adding address:", error);
      toast.error(error.message || "Failed to add address");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (address: InboundAddress) => {
    try {
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .update({ is_active: !address.is_active })
        .eq("id", address.id);

      if (error) throw error;

      toast.success(`Address ${!address.is_active ? "activated" : "deactivated"}`);
      await loadAddresses();
    } catch (error: any) {
      console.error("Error toggling address:", error);
      toast.error("Failed to update address");
    }
  };

  const handleDelete = async (address: InboundAddress) => {
    if (!confirm(`Delete ${address.email_address}? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .delete()
        .eq("id", address.id);

      if (error) throw error;

      toast.success("Address removed");
      await loadAddresses();
    } catch (error: any) {
      console.error("Error deleting address:", error);
      toast.error("Failed to delete address");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Custom Inbound Addresses
        </CardTitle>
        <CardDescription>
          Alternative email addresses that route to this tenant (for providers that can't use plus-addressing)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>When to use</AlertTitle>
          <AlertDescription className="text-sm">
            Use this if your loadboard provider sends to a custom domain email (e.g., <code className="bg-muted px-1 rounded">p.d@customdomain.com</code>) 
            that forwards to Gmail. The forwarding often strips the plus-address, so add the forwarding address here 
            to ensure emails are properly routed.
          </AlertDescription>
        </Alert>

        {/* Add New Address */}
        <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
          <p className="text-sm font-medium">Add Custom Address</p>
          <div className="flex gap-2">
            <Input
              placeholder="p.d@customdomain.com"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleAddAddress} 
              disabled={adding || !newAddress.trim()}
              size="sm"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Add</span>
            </Button>
          </div>
          <Input
            placeholder="Notes (optional) - e.g., 'Sylectus forwards here'"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Existing Addresses */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : addresses.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">
            No custom inbound addresses configured
          </p>
        ) : (
          <div className="space-y-2">
            {addresses.map((address) => (
              <div 
                key={address.id} 
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  !address.is_active ? "opacity-50 bg-muted/30" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{address.email_address}</code>
                    <Badge 
                      variant={address.is_active ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {address.is_active ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </div>
                  {address.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{address.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(address)}
                  >
                    {address.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(address)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
