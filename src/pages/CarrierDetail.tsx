import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  ArrowLeft, Save, MapPin, Search, RefreshCw, AlertCircle, CheckCircle, XCircle, 
  Upload, X, Image, Building2, Phone, Mail, Shield, Users, Truck, FileText, DollarSign, Landmark
} from "lucide-react";
// PDF.js removed to reduce bundle size

interface CarrierData {
  id: string;
  name: string;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  safer_status: string | null;
  safety_rating: string | null;
  carrier_symbol: string | null;
  dispatch_name: string | null;
  dispatch_phone: string | null;
  dispatch_email: string | null;
  after_hours_phone: string | null;
  personal_business: string | null;
  dun_bradstreet: string | null;
  emergency_contact_name: string | null;
  emergency_contact_title: string | null;
  emergency_contact_home_phone: string | null;
  emergency_contact_cell_phone: string | null;
  emergency_contact_email: string | null;
  logo_url: string | null;
  payee_id: string | null;
}

interface Payee {
  id: string;
  name: string;
  type: string | null;
  payment_method: string | null;
  bank_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
}

interface FactoringData {
  factoring_company_name: string | null;
  factoring_company_address: string | null;
  factoring_company_city: string | null;
  factoring_company_state: string | null;
  factoring_company_zip: string | null;
  factoring_contact_name: string | null;
  factoring_contact_email: string | null;
  factoring_contact_phone: string | null;
  factoring_percentage: number | null;
}

interface HighwayData {
  configured: boolean;
  found?: boolean;
  message?: string;
  error?: string;
  data?: {
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    compliance_status?: string;
    onboarding_status?: string;
    rightful_owner_validated?: boolean;
    dispatch_service_detected?: boolean;
    insurance_valid?: boolean;
    fleet_size?: number;
  };
}

export default function CarrierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId, shouldFilter, isPlatformAdmin } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [carrier, setCarrier] = useState<CarrierData | null>(null);
  const [usdotLookup, setUsdotLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [highwayData, setHighwayData] = useState<HighwayData | null>(null);
  const [highwayLoading, setHighwayLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [selectedPayee, setSelectedPayee] = useState<Payee | null>(null);
  const [factoringData, setFactoringData] = useState<FactoringData | null>(null);

  useEffect(() => {
    loadCarrier();
    loadPayees();
    loadFactoringData();
  }, [id, tenantId, shouldFilter]);

  const loadPayees = async () => {
    try {
      let query = supabase
        .from("payees")
        .select("id, name, type, payment_method, bank_name, email, phone, address, status")
        .eq("status", "active")
        .order("name");

      // Apply tenant filter - ALWAYS ON
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPayees(data || []);
    } catch (error: any) {
      console.error("Failed to load payees:", error);
    }
  };

  const loadFactoringData = async () => {
    try {
      let query = supabase
        .from("company_profile")
        .select(`
          factoring_company_name,
          factoring_company_address,
          factoring_company_city,
          factoring_company_state,
          factoring_company_zip,
          factoring_contact_name,
          factoring_contact_email,
          factoring_contact_phone,
          factoring_percentage
        `);

      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      setFactoringData(data);
    } catch (error: any) {
      console.error("Failed to load factoring data:", error);
    }
  };

  const loadCarrier = async () => {
    try {
      const { data, error } = await supabase
        .from("carriers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCarrier(data);
      setUsdotLookup(data.dot_number || "");
      
      if (data.dot_number) {
        fetchHighwayData(data.dot_number);
      }

      // Load selected payee if exists
      if (data.payee_id) {
        const { data: payeeData } = await supabase
          .from("payees")
          .select("id, name, type, payment_method, bank_name, email, phone, address, status")
          .eq("id", data.payee_id)
          .maybeSingle();
        
        if (payeeData) {
          setSelectedPayee(payeeData);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load carrier details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHighwayData = async (dotNumber: string) => {
    if (!dotNumber) return;
    
    setHighwayLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-highway-data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dot_number: dotNumber }),
        }
      );
      
      const data = await response.json();
      setHighwayData(data);
      
      if (data.configured && data.found && data.data?.contact_email) {
        toast.success("Highway data loaded successfully");
      }
    } catch (error: any) {
      console.error('Highway API error:', error);
      setHighwayData({ configured: false, error: error.message });
    } finally {
      setHighwayLoading(false);
    }
  };

  // PDF to image conversion removed - only accept image uploads

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !carrier) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file (PNG, JPG, etc.)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `${carrier.id}-logo-${Date.now()}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('carrier-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('carrier-logos')
        .getPublicUrl(fileName);

      setCarrier({ ...carrier, logo_url: publicUrl });
      toast.success("Logo uploaded successfully");
    } catch (error: any) {
      toast.error("Failed to upload logo: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    if (carrier) {
      setCarrier({ ...carrier, logo_url: null });
      toast.success("Logo removed");
    }
  };

  const handleSave = async () => {
    if (!carrier) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("carriers")
        .update({
          name: carrier.name,
          mc_number: carrier.mc_number,
          dot_number: carrier.dot_number,
          contact_name: carrier.contact_name,
          email: carrier.email,
          phone: carrier.phone,
          address: carrier.address,
          status: carrier.status,
          safer_status: carrier.safer_status,
          safety_rating: carrier.safety_rating,
          carrier_symbol: carrier.carrier_symbol,
          dispatch_name: carrier.dispatch_name,
          dispatch_phone: carrier.dispatch_phone,
          dispatch_email: carrier.dispatch_email,
          after_hours_phone: carrier.after_hours_phone,
          personal_business: carrier.personal_business,
          dun_bradstreet: carrier.dun_bradstreet,
          emergency_contact_name: carrier.emergency_contact_name,
          emergency_contact_title: carrier.emergency_contact_title,
          emergency_contact_home_phone: carrier.emergency_contact_home_phone,
          emergency_contact_cell_phone: carrier.emergency_contact_cell_phone,
          emergency_contact_email: carrier.emergency_contact_email,
          logo_url: carrier.logo_url,
          payee_id: carrier.payee_id,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Carrier updated successfully");
    } catch (error: any) {
      toast.error("Failed to update carrier: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePayeeSelect = (payeeId: string) => {
    if (!carrier) return;
    
    const payee = payees.find(p => p.id === payeeId);
    setSelectedPayee(payee || null);
    setCarrier({ ...carrier, payee_id: payeeId || null });
  };

  const handleClearPayee = () => {
    if (!carrier) return;
    setSelectedPayee(null);
    setCarrier({ ...carrier, payee_id: null });
  };

  const handleUsdotLookup = async () => {
    if (!usdotLookup.trim()) {
      toast.error("Please enter a USDOT number");
      return;
    }

    setLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usdot: usdotLookup }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Carrier not found");
      }

      const data = await response.json();
      
      if (carrier) {
        setCarrier({
          ...carrier,
          name: data.dba_name || data.name || carrier.name,
          mc_number: data.mc_number || carrier.mc_number,
          dot_number: data.usdot || usdotLookup,
          phone: data.phone || carrier.phone,
          address: data.physical_address || carrier.address,
          safer_status: data.safer_status || carrier.safer_status,
          safety_rating: data.safety_rating || carrier.safety_rating,
        });
      }
      
      toast.success("Carrier information loaded successfully");
    } catch (error: any) {
      toast.error("Failed to fetch carrier data: " + error.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const updateField = (field: keyof CarrierData, value: any) => {
    if (carrier) {
      setCarrier({ ...carrier, [field]: value });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'inactive': return 'bg-slate-500/10 text-slate-600 border-slate-200';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!carrier) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Carrier not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dashboard/business?subtab=carriers")} variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Carriers
            </Button>
            <div className="hidden sm:flex items-center gap-3">
              {carrier.logo_url ? (
                <img src={carrier.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain border bg-white" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                  {carrier.name?.[0]?.toUpperCase() || 'C'}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-lg">{carrier.name}</h1>
                <Badge variant="outline" className={getStatusColor(carrier.status)}>
                  {carrier.status || 'Pending'}
                </Badge>
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="company" className="space-y-6">
          <TabsList className="bg-white dark:bg-slate-800 p-1 shadow-sm">
            <TabsTrigger value="company" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <Building2 className="w-4 h-4 mr-2" />
              Company
            </TabsTrigger>
            <TabsTrigger value="dispatch" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
              <Truck className="w-4 h-4 mr-2" />
              Dispatch
            </TabsTrigger>
            <TabsTrigger value="safety" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
              <Shield className="w-4 h-4 mr-2" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="payee" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
              <DollarSign className="w-4 h-4 mr-2" />
              Payee
            </TabsTrigger>
            <TabsTrigger value="factoring" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <Landmark className="w-4 h-4 mr-2" />
              Factoring
            </TabsTrigger>
          </TabsList>

          {/* Company Tab */}
          <TabsContent value="company" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Logo & Basic Info */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Building2 className="w-5 h-5" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Logo Upload */}
                  <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    {carrier.logo_url ? (
                      <div className="relative">
                        <img src={carrier.logo_url} alt="Logo" className="h-16 w-16 object-contain border rounded-lg bg-white" />
                        <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={handleRemoveLogo}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                        <Image className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleLogoUpload} className="hidden" />
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? 'Uploading...' : 'Upload Logo'}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or PDF up to 10MB</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                    <Select value={carrier.status} onValueChange={(value) => updateField("status", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company Name</Label>
                    <Input value={carrier.name} onChange={(e) => updateField("name", e.target.value)} className="border-slate-200 focus:border-blue-500" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Carrier Symbol</Label>
                    <Input value={carrier.carrier_symbol || ""} onChange={(e) => updateField("carrier_symbol", e.target.value)} className="border-slate-200 focus:border-blue-500" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Address
                    </Label>
                    <Input value={carrier.address || ""} onChange={(e) => updateField("address", e.target.value)} className="border-slate-200 focus:border-blue-500" />
                  </div>
                </CardContent>
              </Card>

              {/* DOT & MC */}
              <Card className="border-l-4 border-l-indigo-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-indigo-600">
                    <FileText className="w-5 h-5" />
                    Authority Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">USDOT Number</Label>
                      <Input value={usdotLookup} onChange={(e) => setUsdotLookup(e.target.value)} className="border-slate-200 focus:border-indigo-500" />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleUsdotLookup} disabled={lookupLoading} className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                        <Search className="h-4 w-4 mr-1" />
                        {lookupLoading ? "..." : "Search"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">MC Number</Label>
                    <Input value={carrier.mc_number || ""} onChange={(e) => updateField("mc_number", e.target.value)} className="border-slate-200 focus:border-indigo-500" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">DUN & Bradstreet</Label>
                    <Input value={carrier.dun_bradstreet || ""} onChange={(e) => updateField("dun_bradstreet", e.target.value)} className="border-slate-200 focus:border-indigo-500" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Personal/Business</Label>
                    <Input value={carrier.personal_business || ""} onChange={(e) => updateField("personal_business", e.target.value)} className="border-slate-200 focus:border-indigo-500" />
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <Phone className="w-5 h-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Name</Label>
                      <Input value={carrier.contact_name || ""} onChange={(e) => updateField("contact_name", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </Label>
                      <Input value={carrier.phone || ""} onChange={(e) => updateField("phone", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email
                      </Label>
                      <Input type="email" value={carrier.email || ""} onChange={(e) => updateField("email", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Dispatch Tab */}
          <TabsContent value="dispatch" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <Truck className="w-5 h-5" />
                    Dispatch Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Name</Label>
                    <Input value={carrier.dispatch_name || ""} onChange={(e) => updateField("dispatch_name", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Phone</Label>
                    <Input value={carrier.dispatch_phone || ""} onChange={(e) => updateField("dispatch_phone", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Email</Label>
                    <Input type="email" value={carrier.dispatch_email || ""} onChange={(e) => updateField("dispatch_email", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">After Hours Phone</Label>
                    <Input value={carrier.after_hours_phone || ""} onChange={(e) => updateField("after_hours_phone", e.target.value)} className="border-slate-200 focus:border-emerald-500" />
                  </div>
                </CardContent>
              </Card>

              {/* Emergency Contact */}
              <Card className="border-l-4 border-l-rose-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-rose-600">
                    <AlertCircle className="w-5 h-5" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
                      <Input value={carrier.emergency_contact_name || ""} onChange={(e) => updateField("emergency_contact_name", e.target.value)} className="border-slate-200 focus:border-rose-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
                      <Input value={carrier.emergency_contact_title || ""} onChange={(e) => updateField("emergency_contact_title", e.target.value)} className="border-slate-200 focus:border-rose-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Home Phone</Label>
                      <Input value={carrier.emergency_contact_home_phone || ""} onChange={(e) => updateField("emergency_contact_home_phone", e.target.value)} className="border-slate-200 focus:border-rose-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cell Phone</Label>
                      <Input value={carrier.emergency_contact_cell_phone || ""} onChange={(e) => updateField("emergency_contact_cell_phone", e.target.value)} className="border-slate-200 focus:border-rose-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email
                    </Label>
                    <Input type="email" value={carrier.emergency_contact_email || ""} onChange={(e) => updateField("emergency_contact_email", e.target.value)} className="border-slate-200 focus:border-rose-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Safety Tab */}
          <TabsContent value="safety" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-l-4 border-l-amber-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <Shield className="w-5 h-5" />
                    SAFER Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Operating Status</Label>
                    <Badge 
                      variant={carrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') ? 'destructive' : 'default'}
                      className="w-full justify-center py-3 text-sm font-medium"
                    >
                      {carrier.safer_status || "AUTHORIZED FOR PROPERTY"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Safety Rating</Label>
                    <Badge 
                      variant={carrier.safety_rating?.toUpperCase() === 'CONDITIONAL' ? 'destructive' : 'default'}
                      className="w-full justify-center py-3 text-sm font-medium"
                    >
                      {carrier.safety_rating || "NONE"}
                    </Badge>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <span className="text-sm text-muted-foreground">Carrier Admins</span>
                      <span className="text-sm font-medium">{carrier.contact_name || "Not Set"}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <span className="text-sm text-muted-foreground">Carrier Payees</span>
                      <span className="text-sm font-medium">{carrier.contact_name || "Not Set"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Highway Data */}
              <Card className="border-l-4 border-l-violet-500 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-violet-600">
                      Highway Verification
                      {!highwayData?.configured && (
                        <Badge variant="outline" className="text-xs">Not Configured</Badge>
                      )}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => carrier?.dot_number && fetchHighwayData(carrier.dot_number)}
                      disabled={highwayLoading || !carrier?.dot_number}
                      className="h-8 w-8 p-0"
                    >
                      <RefreshCw className={`h-4 w-4 ${highwayLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!highwayData ? (
                    <p className="text-sm text-muted-foreground">
                      {carrier?.dot_number ? 'Loading Highway data...' : 'Enter DOT number to fetch Highway data'}
                    </p>
                  ) : !highwayData.configured ? (
                    <div className="space-y-2 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Highway API not configured</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Add HIGHWAY_API_KEY to enable carrier verification.
                      </p>
                    </div>
                  ) : highwayData.error ? (
                    <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm">{highwayData.error}</span>
                    </div>
                  ) : !highwayData.found ? (
                    <p className="text-sm text-muted-foreground p-4 bg-slate-50 rounded-lg">Carrier not found in Highway database</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div>
                          <Label className="text-xs text-muted-foreground">Contact Email</Label>
                          <p className="font-medium text-sm">{highwayData.data?.contact_email || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Contact Phone</Label>
                          <p className="font-medium text-sm">{highwayData.data?.contact_phone || '—'}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <span className="text-sm text-muted-foreground">Rightful Owner</span>
                          {highwayData.data?.rightful_owner_validated ? (
                            <Badge className="bg-emerald-500"><CheckCircle className="h-3 w-3 mr-1" /> Validated</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <span className="text-sm text-muted-foreground">Dispatch Service</span>
                          {highwayData.data?.dispatch_service_detected ? (
                            <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Detected</Badge>
                          ) : (
                            <Badge className="bg-emerald-500">None Detected</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <span className="text-sm text-muted-foreground">Insurance</span>
                          {highwayData.data?.insurance_valid ? (
                            <Badge className="bg-emerald-500"><CheckCircle className="h-3 w-3 mr-1" /> Valid</Badge>
                          ) : (
                            <Badge variant="outline">Unknown</Badge>
                          )}
                        </div>
                      </div>
                      
                      {highwayData.data?.fleet_size && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <Label className="text-xs text-muted-foreground">Fleet Size</Label>
                          <p className="font-medium">{highwayData.data.fleet_size} vehicles</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Payee Tab */}
          <TabsContent value="payee" className="space-y-6">
            <Card className="border-l-4 border-l-violet-500 shadow-sm max-w-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-violet-600">
                  <DollarSign className="w-5 h-5" />
                  Payee Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Payee Selection */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select Payee</Label>
                  <div className="flex gap-2">
                    <Select 
                      value={carrier.payee_id || ""} 
                      onValueChange={handlePayeeSelect}
                    >
                      <SelectTrigger className="border-slate-200 focus:border-violet-500">
                        <SelectValue placeholder="Select a payee..." />
                      </SelectTrigger>
                      <SelectContent>
                        {payees.map((payee) => (
                          <SelectItem key={payee.id} value={payee.id}>
                            {payee.name} {payee.type ? `(${payee.type})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {carrier.payee_id && (
                      <Button variant="outline" size="icon" onClick={handleClearPayee}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Selected Payee Details */}
                {selectedPayee ? (
                  <div className="space-y-4 p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg border border-violet-100 dark:border-violet-800">
                    <div className="flex items-center justify-between">
                      <span className="text-violet-600 dark:text-violet-400 font-medium text-lg">
                        {selectedPayee.name}
                      </span>
                      {selectedPayee.type && (
                        <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-200">
                          {selectedPayee.type}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <Label className="text-xs text-muted-foreground">Phone</Label>
                        <p className="text-sm font-medium">{selectedPayee.phone || "—"}</p>
                      </div>
                      <div className="space-y-1 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <p className="text-sm font-medium">{selectedPayee.email || "—"}</p>
                      </div>
                      <div className="space-y-1 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <Label className="text-xs text-muted-foreground">Payment Method</Label>
                        <p className="text-sm font-medium">{selectedPayee.payment_method || "—"}</p>
                      </div>
                      <div className="space-y-1 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <Label className="text-xs text-muted-foreground">Bank Name</Label>
                        <p className="text-sm font-medium">{selectedPayee.bank_name || "—"}</p>
                      </div>
                    </div>

                    <div className="space-y-1 p-3 bg-white dark:bg-slate-800 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <p className="text-sm font-medium">{selectedPayee.address || "—"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
                    <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No payee selected</p>
                    <p className="text-xs text-muted-foreground mt-1">Select a payee from the dropdown above</p>
                  </div>
                )}

                <Button 
                  onClick={() => navigate("/dashboard/payees")}
                  variant="outline"
                  className="w-full"
                >
                  Manage Payees
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Factoring Tab */}
          <TabsContent value="factoring" className="space-y-6">
            <Card className="border-l-4 border-l-amber-400 shadow-sm">
              <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <Landmark className="w-5 h-5" />
                  Factoring Company (Billing Party)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {/* Row 1: Company Name & Contact Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company Name</Label>
                    <Input 
                      value={factoringData?.factoring_company_name || ""} 
                      readOnly
                      className="border-slate-200 bg-amber-50/50 focus:border-amber-500" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Name</Label>
                    <Input 
                      value={factoringData?.factoring_contact_name || ""} 
                      readOnly
                      className="border-slate-200 focus:border-amber-500" 
                    />
                  </div>
                </div>

                {/* Row 2: Factoring Fee & Contact Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Factoring Fee (%)</Label>
                    <Input 
                      value={factoringData?.factoring_percentage?.toString() || ""} 
                      readOnly
                      className="border-slate-200 bg-amber-50/50 focus:border-amber-500" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Email</Label>
                    <Input 
                      value={factoringData?.factoring_contact_email || ""} 
                      readOnly
                      className="border-slate-200 focus:border-amber-500" 
                    />
                  </div>
                </div>

                {/* Row 3: Contact Phone */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Phone</Label>
                  <Input 
                    value={factoringData?.factoring_contact_phone || ""} 
                    readOnly
                    className="border-slate-200 focus:border-amber-500" 
                  />
                </div>

                {/* Row 4: Address */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
                  <Input 
                    value={factoringData?.factoring_company_address || ""} 
                    readOnly
                    className="border-slate-200 focus:border-amber-500" 
                  />
                </div>

                {/* Row 5: City, State, ZIP */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
                    <Input 
                      value={factoringData?.factoring_company_city || ""} 
                      readOnly
                      className="border-slate-200 focus:border-amber-500" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">State</Label>
                    <Input 
                      value={factoringData?.factoring_company_state || ""} 
                      readOnly
                      className="border-slate-200 focus:border-amber-500" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">ZIP</Label>
                    <Input 
                      value={factoringData?.factoring_company_zip || ""} 
                      readOnly
                      className="border-slate-200 focus:border-amber-500" 
                    />
                  </div>
                </div>

                {!factoringData?.factoring_company_name && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
                    <p className="text-sm text-muted-foreground">No factoring company configured</p>
                    <p className="text-xs text-muted-foreground mt-1">Set up factoring information in Company Profile settings</p>
                  </div>
                )}

                <Button 
                  onClick={() => navigate("/dashboard/settings?tab=company")}
                  variant="outline"
                  className="w-full mt-4"
                >
                  Manage Company Profile
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
