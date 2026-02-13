import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  ArrowLeft, Save, Building2, Phone, Mail, MapPin, Search, 
  CheckCircle, XCircle, DollarSign, ShieldCheck, Loader2,
  FileText
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenantFilter } from "@/hooks/useTenantFilter";

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
  otr_approval_status: string | null;
  otr_credit_limit: number | null;
  otr_last_checked_at: string | null;
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
  const { tenantId } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDialogOpen, setLookupDialogOpen] = useState(false);
  const [lookupResult, setLookupResult] = useState<FMCSAResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupType, setLookupType] = useState<"usdot" | "mc">("usdot");
  const [checkingFactoring, setCheckingFactoring] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
    name: true,
    mc_number: true,
    dot_number: true,
    phone: true,
    address: true,
  });

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

  // Auto-save a single field immediately (for critical fields like MC/DOT)
  const autoSaveField = async (field: keyof CustomerData, value: any) => {
    if (!id) return;
    try {
      const { error } = await supabase
        .from("customers")
        .update({ [field]: value || null })
        .eq("id", id);
      if (error) throw error;
      console.log(`[AutoSave] ${field} saved:`, value);
    } catch (err: any) {
      console.error(`[AutoSave] Failed to save ${field}:`, err);
      toast.error(`Failed to auto-save ${field}`);
    }
  };

  const handleFMCSALookup = async (type: "usdot" | "mc") => {
    const value = type === "usdot" ? customer?.dot_number : customer?.mc_number;
    if (!value?.trim()) {
      toast.error(`Please enter a ${type === "usdot" ? "USDOT" : "MC"} number`);
      return;
    }

    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    setLookupType(type);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(type === "usdot" ? { usdot: value } : { mc: value }),
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
      setSelectedFields({ name: true, mc_number: true, dot_number: true, phone: true, address: true });
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
      const updates: Partial<CustomerData> = {};
      if (selectedFields.name && (lookupResult.dba_name || lookupResult.name)) {
        updates.name = lookupResult.dba_name || lookupResult.name || customer.name;
      }
      if (selectedFields.mc_number && lookupResult.mc_number) {
        updates.mc_number = lookupResult.mc_number;
      }
      if (selectedFields.dot_number && lookupResult.usdot) {
        updates.dot_number = lookupResult.usdot;
      }
      if (selectedFields.phone && lookupResult.phone) {
        updates.phone = lookupResult.phone;
      }
      if (selectedFields.address && lookupResult.physical_address) {
        updates.address = lookupResult.physical_address;
      }
      setCustomer({ ...customer, ...updates });
      toast.success("Selected fields applied");
    }
    setLookupDialogOpen(false);
    setLookupResult(null);
    setLookupError(null);
  };

  const handleCheckFactoringApproval = async () => {
    if (!customer?.mc_number) {
      toast.error("MC number required for factoring check");
      return;
    }

    if (!tenantId) {
      toast.error("No tenant context");
      return;
    }

    setCheckingFactoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-broker-credit', {
        body: {
          tenant_id: tenantId,
          mc_number: customer.mc_number,
          broker_name: customer.name,
          customer_id: customer.id,
          force_check: true
        }
      });

      if (error) {
        console.error('OTR check error:', error);
        toast.error('Failed to check factoring approval');
        return;
      }

      // Update local state
      if (data?.approval_status) {
        setCustomer(prev => prev ? {
          ...prev,
          otr_approval_status: data.approval_status,
          otr_credit_limit: data.credit_limit || prev.otr_credit_limit,
          otr_last_checked_at: new Date().toISOString()
        } : null);
      }

      // Show result
      if (data?.approval_status === 'approved') {
        toast.success('Factoring Approved', {
          description: data.credit_limit ? `Credit Limit: $${data.credit_limit.toLocaleString()}` : 'Broker approved for factoring'
        });
      } else if (data?.approval_status === 'not_approved') {
        toast.error('Factoring Not Approved', {
          description: 'This broker is not approved for factoring'
        });
      } else if (data?.approval_status === 'call_otr') {
        toast.warning('Contact OTR', {
          description: 'Contact OTR Solutions for more information'
        });
      } else if (data?.approval_status === 'not_found') {
        toast.warning('Not Found', {
          description: 'Broker not found in OTR system'
        });
      }
    } catch (err) {
      console.error('OTR check error:', err);
      toast.error('Failed to check factoring approval');
    } finally {
      setCheckingFactoring(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Active</Badge>;
      case "inactive": return <Badge variant="secondary">Inactive</Badge>;
      case "pending": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getFactoringBadge = (status: string | null) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Approved</Badge>;
      case "not_approved": return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Not Approved</Badge>;
      case "call_otr": return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Call OTR</Badge>;
      case "not_found": return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30">Not Found</Badge>;
      default: return <Badge variant="outline">Unchecked</Badge>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!customer) {
    return <div className="text-center py-8 text-muted-foreground">Customer not found</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/business?subtab=customers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{customer.name}</h1>
              {getStatusBadge(customer.status)}
            </div>
            <p className="text-sm text-muted-foreground">
              {customer.mc_number && `MC# ${customer.mc_number}`}
              {customer.mc_number && customer.dot_number && " • "}
              {customer.dot_number && `DOT# ${customer.dot_number}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Factoring Status Card */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Factoring Approval</span>
                  {getFactoringBadge(customer.otr_approval_status)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {customer.otr_credit_limit && (
                    <span>Credit Limit: ${customer.otr_credit_limit.toLocaleString()}</span>
                  )}
                  {customer.otr_last_checked_at && (
                    <span className="ml-2">
                      • Last checked: {new Date(customer.otr_last_checked_at).toLocaleDateString()}
                    </span>
                  )}
                  {!customer.otr_credit_limit && !customer.otr_last_checked_at && (
                    <span>Not yet checked with OTR Solutions</span>
                  )}
                </div>
              </div>
            </div>
            <Button 
              onClick={handleCheckFactoringApproval} 
              disabled={checkingFactoring || !customer.mc_number}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {checkingFactoring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Check Factoring Approval
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Company Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Company
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Company Name *</Label>
              <Input value={customer.name} onChange={(e) => updateField("name", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input value={customer.contact_name || ""} onChange={(e) => updateField("contact_name", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={customer.status} onValueChange={(v) => updateField("status", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Street Address</Label>
              <Input value={customer.address || ""} onChange={(e) => updateField("address", e.target.value)} className="h-9" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={customer.city || ""} onChange={(e) => updateField("city", e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input value={customer.state || ""} onChange={(e) => updateField("state", e.target.value)} className="h-9" placeholder="CA" maxLength={2} />
              </div>
              <div>
                <Label className="text-xs">ZIP</Label>
                <Input value={customer.zip || ""} onChange={(e) => updateField("zip", e.target.value)} className="h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Primary Phone</Label>
              <Input type="tel" value={customer.phone || ""} onChange={(e) => updateField("phone", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Mobile</Label>
              <Input type="tel" value={customer.phone_mobile || ""} onChange={(e) => updateField("phone_mobile", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Fax</Label>
              <Input type="tel" value={customer.phone_fax || ""} onChange={(e) => updateField("phone_fax", e.target.value)} className="h-9" />
            </div>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Primary Email</Label>
              <Input type="email" value={customer.email || ""} onChange={(e) => updateField("email", e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Secondary Email</Label>
              <Input type="email" value={customer.email_secondary || ""} onChange={(e) => updateField("email_secondary", e.target.value)} className="h-9" />
            </div>
          </CardContent>
        </Card>

        {/* FMCSA & Compliance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              FMCSA & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">USDOT Number</Label>
                <Input value={customer.dot_number || ""} onChange={(e) => updateField("dot_number", e.target.value)} onBlur={(e) => autoSaveField("dot_number", e.target.value)} className="h-9" placeholder="Enter USDOT" />
              </div>
              <Button variant="secondary" size="sm" className="mt-5 h-9" onClick={() => handleFMCSALookup("usdot")} disabled={lookupLoading}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">MC Number</Label>
                <Input value={customer.mc_number || ""} onChange={(e) => updateField("mc_number", e.target.value)} onBlur={(e) => autoSaveField("mc_number", e.target.value)} className="h-9" placeholder="Enter MC" />
              </div>
              <Button variant="secondary" size="sm" className="mt-5 h-9" onClick={() => handleFMCSALookup("mc")} disabled={lookupLoading}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Payment Terms</Label>
              <Input value={customer.payment_terms || ""} onChange={(e) => updateField("payment_terms", e.target.value)} className="h-9" placeholder="e.g., Net 30" />
            </div>
            <div>
              <Label className="text-xs">Credit Limit ($)</Label>
              <Input type="number" value={customer.credit_limit || ""} onChange={(e) => updateField("credit_limit", e.target.value ? parseFloat(e.target.value) : null)} className="h-9" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={customer.notes || ""} onChange={(e) => updateField("notes", e.target.value)} rows={3} placeholder="Additional notes..." />
        </CardContent>
      </Card>

      {/* FMCSA Lookup Dialog */}
      <Dialog open={lookupDialogOpen} onOpenChange={setLookupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lookupError ? (
                <><XCircle className="h-5 w-5 text-red-500" />Company Not Found</>
              ) : (
                <><CheckCircle className="h-5 w-5 text-green-500" />Company Found</>
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
            <div className="space-y-3 py-4 text-sm">
              {[
                { key: "name", label: "Company", value: lookupResult.dba_name || lookupResult.name || '—' },
                { key: null, label: "Legal Name", value: lookupResult.name || '—' },
                { key: "dot_number", label: "USDOT", value: lookupResult.usdot || '—' },
                { key: "mc_number", label: "MC Number", value: lookupResult.mc_number || '—' },
                { key: "phone", label: "Phone", value: lookupResult.phone || '—' },
                { key: "address", label: "Address", value: lookupResult.physical_address || '—' },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  {row.key ? (
                    <Checkbox
                      checked={selectedFields[row.key] ?? false}
                      onCheckedChange={(checked) =>
                        setSelectedFields((prev) => ({ ...prev, [row.key!]: !!checked }))
                      }
                    />
                  ) : (
                    <div className="w-4" />
                  )}
                  <span className="text-muted-foreground w-24 shrink-0">{row.label}:</span>
                  <span className="font-medium truncate">{row.value}</span>
                </div>
              ))}
              {lookupResult.safer_status && (
                <div className="flex items-center gap-3">
                  <div className="w-4" />
                  <span className="text-muted-foreground w-24 shrink-0">SAFER Status:</span>
                  <Badge variant={lookupResult.safer_status === 'NOT AUTHORIZED' ? 'destructive' : 'default'}>
                    {lookupResult.safer_status}
                  </Badge>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            {lookupError ? (
              <Button variant="outline" onClick={() => setLookupDialogOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setLookupDialogOpen(false)}>Discard</Button>
                <Button onClick={handleApplyLookupResult} className="bg-green-600 hover:bg-green-700">Apply Selected</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
