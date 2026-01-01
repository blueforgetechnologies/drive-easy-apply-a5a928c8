import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Check, X, Building2, Phone, Mail, MapPin } from "lucide-react";
import { useTenantId } from "@/hooks/useTenantId";

interface ExtractedCustomerData {
  customer_name?: string;
  customer_address?: string;
  customer_city?: string;
  customer_state?: string;
  customer_zip?: string;
  customer_mc_number?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_contact?: string;
}

interface NewCustomerPromptProps {
  extractedData: ExtractedCustomerData;
  onCustomerAdded: (customerId: string) => void;
  onDismiss: () => void;
}

export function NewCustomerPrompt({ extractedData, onCustomerAdded, onDismiss }: NewCustomerPromptProps) {
  const tenantId = useTenantId();
  const [loading, setLoading] = useState(false);

  const handleAddCustomer = async () => {
    if (!extractedData.customer_name) {
      toast.error("Customer name is required");
      return;
    }

    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert([{
          name: extractedData.customer_name,
          contact_name: extractedData.customer_contact || null,
          email: extractedData.customer_email || null,
          phone: extractedData.customer_phone || null,
          address: extractedData.customer_address || null,
          city: extractedData.customer_city || null,
          state: extractedData.customer_state || null,
          zip: extractedData.customer_zip || null,
          mc_number: extractedData.customer_mc_number || null,
          status: "active",
          tenant_id: tenantId,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success(`Customer "${extractedData.customer_name}" added successfully`);
      onCustomerAdded(data.id);
    } catch (error: any) {
      console.error("Error adding customer:", error);
      toast.error("Failed to add customer: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <UserPlus className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm">New Customer Detected</h4>
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
              Not in database
            </Badge>
          </div>
          
          <div className="space-y-1 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{extractedData.customer_name}</span>
              {extractedData.customer_mc_number && (
                <Badge variant="secondary" className="text-xs">MC# {extractedData.customer_mc_number}</Badge>
              )}
            </div>
            
            {extractedData.customer_contact && (
              <div className="flex items-center gap-2">
                <span className="text-xs">Contact: {extractedData.customer_contact}</span>
              </div>
            )}
            
            {(extractedData.customer_address || extractedData.customer_city) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-xs">
                  {[
                    extractedData.customer_address,
                    extractedData.customer_city,
                    extractedData.customer_state,
                    extractedData.customer_zip
                  ].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              {extractedData.customer_phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="text-xs">{extractedData.customer_phone}</span>
                </div>
              )}
              {extractedData.customer_email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="text-xs">{extractedData.customer_email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAddCustomer}
              disabled={loading}
              className="gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              {loading ? "Adding..." : "Add as New Customer"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              disabled={loading}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Skip
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
