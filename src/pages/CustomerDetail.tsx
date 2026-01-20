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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Save, Building2, Phone, Mail, MapPin, Search, CheckCircle, XCircle } from "lucide-react";
import { BrokerCreditBadge } from "@/components/BrokerCreditBadge";

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
  mc_number: string | null;
  dot_number: string | null;
  factoring_approval: string | null;
}

interface FMCSAResult {
  name: string;
  dba_name: string | null;
  mc_number: string | null;
  usdot: string;
  phone: string | null;
  physical_address: string | null;
  safer_status: string | null;
  safety_rating: string | null;
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [usdotLookup, setUsdotLookup] = useState("");
  const [mcLookup, setMcLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDialogOpen, setLookupDialogOpen] = useState(false);
  const [lookupResult, setLookupResult] = useState<FMCSAResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupType, setLookupType] = useState<"usdot" | "mc">("usdot");

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
      setUsdotLookup(data.dot_number || "");
      setMcLookup(data.mc_number || "");
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
          mc_number: customer.mc_number,
          dot_number: customer.dot_number,
          factoring_approval: customer.factoring_approval,
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

  const handleUsdotLookup = async () => {
    if (!usdotLookup.trim()) {
      toast.error("Please enter a USDOT number");
      return;
    }

    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    setLookupType("usdot");
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ usdot: usdotLookup }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        setLookupError(error.error || "Company not found in FMCSA database");
        setLookupDialogOpen(true);
        return;
      }

      const data = await response.json();
      if (data.error) {
        setLookupError(data.error);
        setLookupDialogOpen(true);
        return;
      }
      setLookupResult(data);
      setLookupDialogOpen(true);
    } catch (error: any) {
      setLookupError(error.message || "Failed to fetch FMCSA data");
      setLookupDialogOpen(true);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleMcLookup = async () => {
    if (!mcLookup.trim()) {
      toast.error("Please enter an MC number");
      return;
    }

    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    setLookupType("mc");
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mc: mcLookup }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        setLookupError(error.error || "Company not found in FMCSA database");
        setLookupDialogOpen(true);
        return;
      }

      const data = await response.json();
      if (data.error) {
        setLookupError(data.error);
        setLookupDialogOpen(true);
        return;
      }
      setLookupResult(data);
      setLookupDialogOpen(true);
    } catch (error: any) {
      setLookupError(error.message || "Failed to fetch FMCSA data");
      setLookupDialogOpen(true);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleApplyLookupResult = () => {
    if (customer && lookupResult) {
      setCustomer({
        ...customer,
        name: lookupResult.dba_name || lookupResult.name || customer.name,
        mc_number: lookupResult.mc_number || customer.mc_number,
        dot_number: lookupResult.usdot || customer.dot_number,
        phone: lookupResult.phone || customer.phone,
        address: lookupResult.physical_address || customer.address,
      });
      setUsdotLookup(lookupResult.usdot || usdotLookup);
      setMcLookup(lookupResult.mc_number || mcLookup);
      toast.success("Company information applied");
    }
    setLookupDialogOpen(false);
    setLookupResult(null);
    setLookupError(null);
  };

  const handleDiscardLookupResult = () => {
    setLookupDialogOpen(false);
    setLookupResult(null);
    setLookupError(null);
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
          {/* OTR Credit Check Badge */}
          <BrokerCreditBadge
            brokerName={customer.name}
            mcNumber={customer.mc_number}
            customerId={customer.id}
            showCheckButton={true}
          />
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

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>USDOT Number</Label>
                <Input
                  value={customer.dot_number || ""}
                  onChange={(e) => {
                    updateField("dot_number", e.target.value);
                    setUsdotLookup(e.target.value);
                  }}
                  placeholder="Enter USDOT"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleUsdotLookup} 
                  disabled={lookupLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {lookupLoading ? "Searching..." : "Search FMCSA"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>MC Number</Label>
                <Input
                  value={customer.mc_number || ""}
                  onChange={(e) => {
                    updateField("mc_number", e.target.value);
                    setMcLookup(e.target.value);
                  }}
                  placeholder="Enter MC Number"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleMcLookup} 
                  disabled={lookupLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {lookupLoading && lookupType === "mc" ? "Searching..." : "Search FMCSA"}
                </Button>
              </div>
            </div>

            <div>
              <Label>Factoring Approval</Label>
              <Select 
                value={customer.factoring_approval || "pending"} 
                onValueChange={(value) => updateField("factoring_approval", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="not_approved">Not Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
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

      {/* FMCSA Lookup Result Dialog */}
      <Dialog open={lookupDialogOpen} onOpenChange={setLookupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lookupError ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Company Not Found
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Company Found
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {lookupError ? (
            <div className="py-4">
              <p className="text-muted-foreground">{lookupError}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please verify the {lookupType === "mc" ? "MC" : "USDOT"} number and try again.
              </p>
            </div>
          ) : lookupResult && (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">Company:</span>
                <span className="col-span-2">{lookupResult.dba_name || lookupResult.name || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">Legal Name:</span>
                <span className="col-span-2">{lookupResult.name || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">USDOT:</span>
                <span className="col-span-2">{lookupResult.usdot || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">MC Number:</span>
                <span className="col-span-2">{lookupResult.mc_number || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">Phone:</span>
                <span className="col-span-2">{lookupResult.phone || '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-muted-foreground">Address:</span>
                <span className="col-span-2">{lookupResult.physical_address || '—'}</span>
              </div>
              {lookupResult.safer_status && (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="font-medium text-muted-foreground">SAFER Status:</span>
                  <span className="col-span-2">
                    <Badge variant={lookupResult.safer_status === 'NOT AUTHORIZED' ? 'destructive' : 'default'}>
                      {lookupResult.safer_status}
                    </Badge>
                  </span>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            {lookupError ? (
              <Button variant="outline" onClick={handleDiscardLookupResult}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleDiscardLookupResult}>
                  Discard
                </Button>
                <Button onClick={handleApplyLookupResult} className="bg-green-600 hover:bg-green-700">
                  Apply to Customer
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
