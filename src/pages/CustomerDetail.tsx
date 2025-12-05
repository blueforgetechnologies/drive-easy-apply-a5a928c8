import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Building2, Phone, Mail, MapPin } from "lucide-react";

interface CustomerData {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  phone_mobile: string | null;
  phone_fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  payment_terms: string | null;
  credit_limit: number | null;
  notes: string | null;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<CustomerData | null>(null);

  useEffect(() => {
    loadCustomer();
  }, [id]);

  const loadCustomer = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCustomer(data);
    } catch (error: any) {
      toast.error("Failed to load customer details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!customer) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          name: customer.name,
          contact_name: customer.contact_name,
          email: customer.email,
          email_secondary: customer.email_secondary,
          phone: customer.phone,
          phone_secondary: customer.phone_secondary,
          phone_mobile: customer.phone_mobile,
          phone_fax: customer.phone_fax,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
          status: customer.status,
          payment_terms: customer.payment_terms,
          credit_limit: customer.credit_limit,
          notes: customer.notes,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Customer updated successfully");
    } catch (error: any) {
      toast.error("Failed to update customer: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CustomerData, value: any) => {
    if (customer) {
      setCustomer({ ...customer, [field]: value });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!customer) {
    return <div className="text-center py-8">Customer not found</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "inactive":
        return "bg-gray-500";
      case "pending":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard/business?subtab=customers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <h1 className="text-3xl font-bold">{customer.name}</h1>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">Status:</Label>
            <Select value={customer.status} onValueChange={(value) => updateField("status", value)}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={customer.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            <div>
              <Label>Contact Name</Label>
              <Input
                value={customer.contact_name || ""}
                onChange={(e) => updateField("contact_name", e.target.value)}
              />
            </div>

            <Separator />

            <div>
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Address
              </Label>
              <Input
                value={customer.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={customer.city || ""}
                  onChange={(e) => updateField("city", e.target.value)}
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={customer.state || ""}
                  onChange={(e) => updateField("state", e.target.value)}
                  placeholder="e.g., CA"
                />
              </div>
              <div>
                <Label>ZIP Code</Label>
                <Input
                  value={customer.zip || ""}
                  onChange={(e) => updateField("zip", e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div>
              <Label>Payment Terms</Label>
              <Input
                value={customer.payment_terms || ""}
                onChange={(e) => updateField("payment_terms", e.target.value)}
                placeholder="e.g., Net 30"
              />
            </div>

            <div>
              <Label>Credit Limit ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={customer.credit_limit || ""}
                onChange={(e) => updateField("credit_limit", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Primary Email
              </Label>
              <Input
                type="email"
                value={customer.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>

            <div>
              <Label>Secondary Email</Label>
              <Input
                type="email"
                value={customer.email_secondary || ""}
                onChange={(e) => updateField("email_secondary", e.target.value)}
              />
            </div>

            <Separator />

            <div>
              <Label>Primary Phone</Label>
              <Input
                type="tel"
                value={customer.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>

            <div>
              <Label>Secondary Phone</Label>
              <Input
                type="tel"
                value={customer.phone_secondary || ""}
                onChange={(e) => updateField("phone_secondary", e.target.value)}
              />
            </div>

            <div>
              <Label>Mobile</Label>
              <Input
                type="tel"
                value={customer.phone_mobile || ""}
                onChange={(e) => updateField("phone_mobile", e.target.value)}
              />
            </div>

            <div>
              <Label>Fax</Label>
              <Input
                type="tel"
                value={customer.phone_fax || ""}
                onChange={(e) => updateField("phone_fax", e.target.value)}
              />
            </div>

            <Separator />

            <div>
              <Label>Notes</Label>
              <Textarea
                value={customer.notes || ""}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
