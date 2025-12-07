import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Save, MapPin, Search, RefreshCw, AlertCircle, CheckCircle, XCircle, Upload, X, Image } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker for v3.x
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [carrier, setCarrier] = useState<CarrierData | null>(null);
  const [usdotLookup, setUsdotLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [highwayData, setHighwayData] = useState<HighwayData | null>(null);
  const [highwayLoading, setHighwayLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCarrier();
  }, [id]);

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
      
      // Auto-fetch Highway data if DOT number exists
      if (data.dot_number) {
        fetchHighwayData(data.dot_number);
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
          headers: {
            'Content-Type': 'application/json',
          },
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

  const convertPdfToImage = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const scale = 2;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert PDF to image'));
      }, 'image/png', 1.0);
    });
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      toast.error('Please upload an image or PDF file');
      return;
    }

    const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(isPdf ? 'PDF must be less than 10MB' : 'Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      let fileToUpload: Blob = file;
      let fileName: string;

      if (isPdf) {
        toast.info('Converting PDF to image...');
        fileToUpload = await convertPdfToImage(file);
        fileName = `carrier-logo-${id}-${Date.now()}.png`;
      } else {
        const fileExt = file.name.split('.').pop();
        fileName = `carrier-logo-${id}-${Date.now()}.${fileExt}`;
      }

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, fileToUpload, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      updateField('logo_url', publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    updateField('logo_url', null);
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
          headers: {
            'Content-Type': 'application/json',
          },
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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!carrier) {
    return <div className="text-center py-8">Carrier not found</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard/business?subtab=carriers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Carriers
          </Button>
          <h1 className="text-3xl font-bold">{carrier.name}</h1>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">Status:</Label>
            <Select value={carrier.status} onValueChange={(value) => updateField("status", value)}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Logo, Safer Status & Dispatch Info */}
        <div className="space-y-6">
          {/* Carrier Logo Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Carrier Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {carrier?.logo_url ? (
                  <div className="relative">
                    <img 
                      src={carrier.logo_url} 
                      alt="Carrier Logo" 
                      className="h-20 w-20 object-contain border rounded-lg bg-white"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveLogo}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or PDF up to 10MB</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Safer Status Section */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Safer Status:</Label>
                <Badge 
                  variant={
                    carrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') 
                      ? 'destructive' 
                      : 'default'
                  }
                  className="mt-2 w-full justify-center py-2 text-sm font-medium"
                >
                  {carrier.safer_status || "AUTHORIZED FOR PROPERTY"}
                </Badge>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Safer Rating Check:</Label>
                <Badge 
                  variant={
                    carrier.safety_rating?.toUpperCase() === 'CONDITIONAL'
                      ? 'destructive'
                      : 'default'
                  }
                  className="mt-2 w-full justify-center py-2 text-sm font-medium"
                >
                  {carrier.safety_rating || "NONE"}
                </Badge>
              </div>

              <Separator />

              <div>
                <Label className="text-sm text-muted-foreground">Carrier Admins:</Label>
                <div className="mt-2 flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{carrier.contact_name || "Not Set"}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                    EDIT
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Carrier Payees:</Label>
                <div className="mt-2 flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{carrier.contact_name || "Not Set"}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                    EDIT
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dispatch Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dispatch Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Dispatch Name:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dispatch_name || ""}
                    onChange={(e) => updateField("dispatch_name", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Dispatch Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dispatch_phone || ""}
                    onChange={(e) => updateField("dispatch_phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Dispatch Email:</Label>
                <div className="relative">
                  <Input
                    type="email"
                    value={carrier.dispatch_email || ""}
                    onChange={(e) => updateField("dispatch_email", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>After Hours Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.after_hours_phone || ""}
                    onChange={(e) => updateField("after_hours_phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Personal/Business:</Label>
                <Input
                  value={carrier.personal_business || ""}
                  onChange={(e) => updateField("personal_business", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Highway Data */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  Highway Data
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
            <CardContent className="space-y-3">
              {!highwayData ? (
                <p className="text-sm text-muted-foreground">
                  {carrier?.dot_number ? 'Loading Highway data...' : 'Enter DOT number to fetch Highway data'}
                </p>
              ) : !highwayData.configured ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Highway API not configured</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add HIGHWAY_API_KEY to enable carrier verification, contact enrichment, and fraud prevention.
                  </p>
                </div>
              ) : highwayData.error ? (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">{highwayData.error}</span>
                </div>
              ) : !highwayData.found ? (
                <p className="text-sm text-muted-foreground">Carrier not found in Highway database</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact Email</Label>
                      <p className="font-medium">{highwayData.data?.contact_email || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact Phone</Label>
                      <p className="font-medium">{highwayData.data?.contact_phone || '—'}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Rightful Owner</span>
                      {highwayData.data?.rightful_owner_validated ? (
                        <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Validated</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Dispatch Service</span>
                      {highwayData.data?.dispatch_service_detected ? (
                        <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Detected</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">None Detected</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Insurance</span>
                      {highwayData.data?.insurance_valid ? (
                        <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Valid</Badge>
                      ) : (
                        <Badge variant="outline">Unknown</Badge>
                      )}
                    </div>
                  </div>
                  
                  {highwayData.data?.fleet_size && (
                    <>
                      <Separator />
                      <div className="text-sm">
                        <Label className="text-xs text-muted-foreground">Fleet Size</Label>
                        <p className="font-medium">{highwayData.data.fleet_size} vehicles</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Contact Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Carrier Symbol:</Label>
                <Input
                  value={carrier.carrier_symbol || ""}
                  onChange={(e) => updateField("carrier_symbol", e.target.value)}
                />
              </div>

              <div>
                <Label>Company Name:</Label>
                <Input
                  value={carrier.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div>
                <Label>Address:</Label>
                <div className="relative">
                  <Input
                    value={carrier.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>USDOT:</Label>
                  <Input
                    value={usdotLookup}
                    onChange={(e) => setUsdotLookup(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleUsdotLookup} 
                    disabled={lookupLoading}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    {lookupLoading ? "Loading..." : "Search"}
                  </Button>
                </div>
              </div>

              <div>
                <Label>MC:</Label>
                <Input
                  value={carrier.mc_number || ""}
                  onChange={(e) => updateField("mc_number", e.target.value)}
                />
              </div>

              <div>
                <Label>Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>DUN &Brad Street:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dun_bradstreet || ""}
                    onChange={(e) => updateField("dun_bradstreet", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-4">Emergency Contact</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Contact Name:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_name || ""}
                        onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Title:</Label>
                    <Input
                      value={carrier.emergency_contact_title || ""}
                      onChange={(e) => updateField("emergency_contact_title", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>Home Phone:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_home_phone || ""}
                        onChange={(e) => updateField("emergency_contact_home_phone", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Cell Phone:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_cell_phone || ""}
                        onChange={(e) => updateField("emergency_contact_cell_phone", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Email:</Label>
                    <div className="relative">
                      <Input
                        type="email"
                        value={carrier.emergency_contact_email || ""}
                        onChange={(e) => updateField("emergency_contact_email", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Payee Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payee Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-b pb-2">
                <span className="text-sm font-medium text-blue-600 cursor-pointer hover:underline">
                  {carrier.contact_name || "Not Set"}
                </span>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Contact:</Label>
                <p className="text-sm mt-1">{carrier.contact_name || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Phone:</Label>
                <p className="text-sm mt-1">{carrier.phone || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Physical Address:</Label>
                <p className="text-sm mt-1">{carrier.address || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Email:</Label>
                <p className="text-sm mt-1">{carrier.email || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Pay Percentage:</Label>
                <p className="text-sm mt-1">0</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Auto Approve:</Label>
                <p className="text-sm mt-1">true</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">W9:</Label>
                <p className="text-sm mt-1">—</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">EIN:</Label>
                <p className="text-sm mt-1">—</p>
              </div>

              <Button className="w-full bg-blue-500 hover:bg-blue-600">
                Go to Payee Details
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
