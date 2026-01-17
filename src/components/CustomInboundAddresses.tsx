/**
 * Custom Inbound Addresses component for tenant-specific email routing.
 * 
 * TENANT ISOLATION: Uses React Query with tenantId in cache key to ensure
 * proper cache invalidation on tenant switch. No stale data cross-tenant.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  tenant_id: string;
}

interface CustomInboundAddressesProps {
  tenantId: string;
  tenantName: string;
}

export default function CustomInboundAddresses({
  tenantId,
  tenantName,
}: CustomInboundAddressesProps) {
  const queryClient = useQueryClient();
  const [newAddress, setNewAddress] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // CRITICAL: Query key includes tenantId for proper cache isolation
  const queryKey = ["tenant-inbound-addresses", tenantId];

  // Fetch addresses with React Query - includes tenantId in key
  const { data: addresses = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tenantId) {
        console.log("[CustomInboundAddresses] No tenantId, returning empty");
        return [];
      }
      
      console.log(`[CustomInboundAddresses] Loading addresses for tenant: ${tenantId}`);
      
      const { data, error } = await supabase
        .from("tenant_inbound_addresses")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[CustomInboundAddresses] Error:", error);
        throw error;
      }
      
      console.log(`[CustomInboundAddresses] Loaded ${data?.length || 0} addresses for tenant: ${tenantId}`);
      
      // Double-check tenant_id matches (paranoid security check)
      const filtered = (data || []).filter(addr => addr.tenant_id === tenantId);
      if (filtered.length !== data?.length) {
        console.error(`[CustomInboundAddresses] SECURITY: Filtered out ${(data?.length || 0) - filtered.length} cross-tenant addresses!`);
      }
      
      return filtered as InboundAddress[];
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Return empty array immediately when tenantId changes (before query runs)
    placeholderData: [],
  });

  // Add address mutation
  const addMutation = useMutation({
    mutationFn: async (params: { email: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .insert({
          tenant_id: tenantId,
          email_address: params.email.trim().toLowerCase(),
          is_active: true,
          created_by: user?.id,
          notes: params.notes.trim() || null,
        });

      if (error) {
        if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
          throw new Error("This email address is already mapped to a tenant");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Custom inbound address added");
      setNewAddress("");
      setNewNotes("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add address");
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: async (address: InboundAddress) => {
      // Security: verify we're updating the correct tenant's address
      if (address.tenant_id !== tenantId) {
        throw new Error("Security error: Cannot modify another tenant's address");
      }
      
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .update({ is_active: !address.is_active })
        .eq("id", address.id)
        .eq("tenant_id", tenantId); // Double-check tenant_id

      if (error) throw error;
    },
    onSuccess: (_, address) => {
      toast.success(`Address ${!address.is_active ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error("Failed to update address");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (address: InboundAddress) => {
      // Security: verify we're deleting the correct tenant's address
      if (address.tenant_id !== tenantId) {
        throw new Error("Security error: Cannot delete another tenant's address");
      }
      
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .delete()
        .eq("id", address.id)
        .eq("tenant_id", tenantId); // Double-check tenant_id

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Address removed");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error("Failed to delete address");
    },
  });

  const handleAddAddress = () => {
    const trimmedEmail = newAddress.trim().toLowerCase();
    
    if (!trimmedEmail) {
      toast.error("Please enter an email address");
      return;
    }

    if (!trimmedEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    // ALIAS-ONLY ROUTING: Warn that base emails are no longer used for routing
    if (!trimmedEmail.includes("+")) {
      toast.error("Base emails without +alias are no longer routed. Please use the tenant's +alias instead (e.g., p.d+tenantslug@domain.com)");
      return;
    }

    addMutation.mutate({ email: trimmedEmail, notes: newNotes });
  };

  const handleToggleActive = (address: InboundAddress) => {
    toggleMutation.mutate(address);
  };

  const handleDelete = (address: InboundAddress) => {
    if (!confirm(`Delete ${address.email_address}? This cannot be undone.`)) {
      return;
    }
    deleteMutation.mutate(address);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Custom Inbound Addresses
          <Badge variant="outline" className="ml-2 text-xs font-mono">
            tenant: {tenantId?.slice(0, 8)}...
          </Badge>
        </CardTitle>
        <CardDescription>
          Alternative email addresses that route to {tenantName} (for providers that can't use plus-addressing)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Deprecation Warning */}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Alias-Only Routing Active</AlertTitle>
          <AlertDescription className="text-sm">
            <strong>Base email addresses are no longer used for routing.</strong> All tenants must use <code className="bg-muted px-1 rounded">+alias</code> addressing 
            (e.g., <code className="bg-muted px-1 rounded">p.d+{tenantName.toLowerCase().replace(/\s+/g, '')}@domain.com</code>). 
            Emails without a valid +alias will be quarantined. This ensures strict tenant isolation.
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
              disabled={addMutation.isPending || !newAddress.trim()}
              size="sm"
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : addresses.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">
            No custom inbound addresses configured for this tenant
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
                    disabled={toggleMutation.isPending}
                  >
                    {address.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(address)}
                    disabled={deleteMutation.isPending}
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
