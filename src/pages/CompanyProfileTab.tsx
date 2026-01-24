import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Upload, X, Image, Landmark, Truck, Calculator } from "lucide-react";
// PDF.js removed to reduce bundle size - PDF upload converts to image on server

export default function CompanyProfileTab() {
  const { tenantId, shouldFilter } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [carriers, setCarriers] = useState<{ id: string; name: string; dot_number: string | null }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadCompanyProfile();
      loadCarriers();
    }
  }, [tenantId, shouldFilter]);

  const loadCarriers = async () => {
    if (!tenantId && shouldFilter) return;
    
    try {
      let query = supabase
        .from("carriers")
        .select("id, name, dot_number")
        .eq("status", "active")
        .order("name");
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setCarriers(data || []);
    } catch (error) {
      console.error("Failed to load carriers:", error);
    }
  };

  const loadCompanyProfile = async () => {
    if (!tenantId && shouldFilter) {
      setLoading(false);
      return;
    }
    
    try {
      let query = supabase
        .from("company_profile")
        .select("*")
        .limit(1);
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setProfile(data);
      } else {
        // Initialize with empty profile if none exists
        setProfile({
          company_name: "",
          legal_name: "",
          address: "",
          city: "",
          state: "",
          zip: "",
          phone: "",
          email: "",
          website: "",
          dot_number: "",
          mc_number: "",
          tax_id: "",
          default_currency: "USD",
          default_timezone: "America/New_York",
          default_carrier_id: null,
          billing_terms: "",
          remittance_info: "",
          factoring_company_name: "",
          factoring_company_address: "",
          factoring_company_city: "",
          factoring_company_state: "",
          factoring_company_zip: "",
          factoring_contact_name: "",
          factoring_contact_email: "",
          factoring_contact_phone: "",
          tenant_id: tenantId,
        });
      }
    } catch (error: any) {
      toast.error("Failed to load company profile");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId && shouldFilter) {
      toast.error("No tenant selected");
      return;
    }
    
    setSaving(true);
    try {
      const profileData = {
        ...profile,
        tenant_id: tenantId,
      };
      
      if (profile.id) {
        // Update existing profile
        const { error } = await supabase
          .from("company_profile")
          .update(profileData)
          .eq("id", profile.id);
        if (error) throw error;
      } else {
        // Insert new profile
        const { data, error } = await supabase
          .from("company_profile")
          .insert([profileData])
          .select()
          .single();
        if (error) throw error;
        setProfile(data);
      }
      
      toast.success("Company profile saved successfully");
    } catch (error: any) {
      toast.error("Failed to save company profile");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // PDF to image conversion removed - only accept image uploads

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');

    if (!isImage) {
      toast.error('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `company-logo-${tenantId || 'default'}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

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

  const updateField = (field: string, value: any) => {
    setProfile((prev: any) => ({ ...prev, [field]: value }));
  };

  if (!tenantId && shouldFilter) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Please select a tenant to view company profile.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Company Profile</h1>
            <p className="text-muted-foreground">Manage your company information and settings</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo Upload */}
            <div>
              <Label>Company Logo</Label>
              <div className="mt-2 flex items-center gap-4">
                {profile?.logo_url ? (
                  <div className="relative">
                    <img 
                      src={profile.logo_url} 
                      alt="Company Logo" 
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
            </div>

            <div>
              <Label>Company Name *</Label>
              <Input
                value={profile?.company_name || ""}
                onChange={(e) => updateField("company_name", e.target.value)}
                placeholder="ABC Trucking LLC"
              />
            </div>

            <div>
              <Label>Legal Name</Label>
              <Input
                value={profile?.legal_name || ""}
                onChange={(e) => updateField("legal_name", e.target.value)}
              />
            </div>

            <div>
              <Label>DOT Number</Label>
              <Input
                value={profile?.dot_number || ""}
                onChange={(e) => updateField("dot_number", e.target.value)}
              />
            </div>

            <div>
              <Label>MC Number</Label>
              <Input
                value={profile?.mc_number || ""}
                onChange={(e) => updateField("mc_number", e.target.value)}
              />
            </div>

            <div>
              <Label>Tax ID / EIN</Label>
              <Input
                value={profile?.tax_id || ""}
                onChange={(e) => updateField("tax_id", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Phone</Label>
              <Input
                value={profile?.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={profile?.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>

            <div>
              <Label>Website</Label>
              <Input
                value={profile?.website || ""}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://www.example.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Accounting Department Section */}
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              Accounting Department
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Contact Name</Label>
                <Input
                  value={profile?.accounting_contact_name || ""}
                  onChange={(e) => updateField("accounting_contact_name", e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <Label>Accounting Email</Label>
                <Input
                  type="email"
                  value={profile?.accounting_email || ""}
                  onChange={(e) => updateField("accounting_email", e.target.value)}
                  placeholder="accounting@company.com"
                />
              </div>
              <div>
                <Label>Accounting Phone</Label>
                <Input
                  value={profile?.accounting_phone || ""}
                  onChange={(e) => updateField("accounting_phone", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Street Address</Label>
            <Input
              value={profile?.address || ""}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>City</Label>
              <Input
                value={profile?.city || ""}
                onChange={(e) => updateField("city", e.target.value)}
              />
            </div>

            <div>
              <Label>State</Label>
              <Input
                value={profile?.state || ""}
                onChange={(e) => updateField("state", e.target.value)}
                maxLength={2}
              />
            </div>

            <div>
              <Label>ZIP</Label>
              <Input
                value={profile?.zip || ""}
                onChange={(e) => updateField("zip", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Factoring Company Section */}
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-amber-600" />
            Factoring Company (Billing Party)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input
                value={profile?.factoring_company_name || ""}
                onChange={(e) => updateField("factoring_company_name", e.target.value)}
                placeholder="OTR Capital, LLC"
              />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input
                value={profile?.factoring_contact_name || ""}
                onChange={(e) => updateField("factoring_contact_name", e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div>
              <Label>Factoring Fee (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={profile?.factoring_percentage ?? 2}
                onChange={(e) => updateField("factoring_percentage", parseFloat(e.target.value) || 0)}
                placeholder="2"
              />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={profile?.factoring_contact_email || ""}
                onChange={(e) => updateField("factoring_contact_email", e.target.value)}
                placeholder="contact@factoring.com"
              />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                value={profile?.factoring_contact_phone || ""}
                onChange={(e) => updateField("factoring_contact_phone", e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={profile?.factoring_company_address || ""}
              onChange={(e) => updateField("factoring_company_address", e.target.value)}
              placeholder="Dept. #390, P.O. Box 1000"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>City</Label>
              <Input
                value={profile?.factoring_company_city || ""}
                onChange={(e) => updateField("factoring_company_city", e.target.value)}
                placeholder="Memphis"
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={profile?.factoring_company_state || ""}
                onChange={(e) => updateField("factoring_company_state", e.target.value)}
                maxLength={2}
                placeholder="TN"
              />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input
                value={profile?.factoring_company_zip || ""}
                onChange={(e) => updateField("factoring_company_zip", e.target.value)}
                placeholder="38148-0390"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            System Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Default Carrier</Label>
              <Select 
                value={profile?.default_carrier_id || ""} 
                onValueChange={(value) => updateField("default_carrier_id", value || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select default carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name} {carrier.dot_number ? `(DOT: ${carrier.dot_number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Currency</Label>
              <Select 
                value={profile?.default_currency || "USD"} 
                onValueChange={(value) => updateField("default_currency", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Timezone</Label>
              <Select 
                value={profile?.default_timezone || "America/New_York"} 
                onValueChange={(value) => updateField("default_timezone", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Billing Terms</Label>
            <Textarea
              value={profile?.billing_terms || ""}
              onChange={(e) => updateField("billing_terms", e.target.value)}
              placeholder="Enter your standard billing terms..."
              rows={3}
            />
          </div>
          <div>
            <Label>Remittance Info</Label>
            <Textarea
              value={profile?.remittance_info || ""}
              onChange={(e) => updateField("remittance_info", e.target.value)}
              placeholder="Enter remittance information for invoices..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}