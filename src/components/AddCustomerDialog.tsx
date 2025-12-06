import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddCustomerDialogProps {
  onCustomerAdded?: (customerId: string) => void;
}

export function AddCustomerDialog({ onCustomerAdded }: AddCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupType, setLookupType] = useState<"usdot" | "mc">("usdot");
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    dot_number: "",
    mc_number: "",
  });

  const handleLookup = async () => {
    if (!lookupValue.trim()) {
      toast.error(`Please enter a ${lookupType === "usdot" ? "USDOT" : "MC"} number`);
      return;
    }

    setLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lookupType === "usdot" ? { usdot: lookupValue } : { mc: lookupValue }),
        }
      );
      
      const data = await response.json();
      
      if (data.error || data.found === false) {
        toast.error(data.error || "Company not found");
        return;
      }

      setFormData({
        ...formData,
        name: data.dba_name || data.name || formData.name,
        phone: data.phone || formData.phone,
        address: data.physical_address || formData.address,
        dot_number: data.usdot || formData.dot_number,
        mc_number: data.mc_number || formData.mc_number,
      });
      
      toast.success("Company information loaded");
    } catch (error: any) {
      toast.error("Failed to fetch company data");
      console.error(error);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error("Customer name is required");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert([{
          name: formData.name,
          contact_name: formData.contact_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          dot_number: formData.dot_number || null,
          mc_number: formData.mc_number || null,
          status: "active",
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Customer added successfully");
      setOpen(false);
      setFormData({
        name: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        dot_number: "",
        mc_number: "",
      });
      setLookupValue("");
      
      if (onCustomerAdded && data) {
        onCustomerAdded(data.id);
      }
    } catch (error: any) {
      toast.error("Error adding customer");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        
        {/* FMCSA Lookup Section */}
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <Label className="text-sm font-medium">Search FMCSA by USDOT or MC</Label>
          <div className="flex gap-2">
            <Select value={lookupType} onValueChange={(val) => setLookupType(val as "usdot" | "mc")}>
              <SelectTrigger className="w-[120px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="usdot">USDOT</SelectItem>
                <SelectItem value="mc">MC</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={lookupType === "usdot" ? "Enter USDOT number" : "Enter MC number"}
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              className="flex-1"
            />
            <Button 
              type="button" 
              onClick={handleLookup} 
              disabled={lookupLoading}
            >
              <Search className="h-4 w-4 mr-2" />
              {lookupLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dot_number">USDOT Number</Label>
              <Input
                id="dot_number"
                value={formData.dot_number}
                onChange={(e) => setFormData({ ...formData, dot_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="mc_number">MC Number</Label>
              <Input
                id="mc_number"
                value={formData.mc_number}
                onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="zip">ZIP</Label>
              <Input
                id="zip"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
