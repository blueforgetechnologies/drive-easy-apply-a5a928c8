import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, X, Image, Landmark } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker for v3.x
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function CompanyProfileTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCompanyProfile();
  }, []);

  const loadCompanyProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("company_profile")
        .select("*")
        .limit(1)
        .maybeSingle();

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
    setSaving(true);
    try {
      if (profile.id) {
        // Update existing profile
        const { error } = await supabase
          .from("company_profile")
          .update(profile)
          .eq("id", profile.id);
        if (error) throw error;
      } else {
        // Insert new profile
        const { data, error } = await supabase
          .from("company_profile")
          .insert([profile])
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

  const convertPdfToImage = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const scale = 2; // Higher scale for better quality
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

    // Validate file type
    if (!isImage && !isPdf) {
      toast.error('Please upload an image or PDF file');
      return;
    }

    // Validate file size (max 10MB for PDFs, 5MB for images)
    const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(isPdf ? 'PDF must be less than 10MB' : 'Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      let fileToUpload: Blob = file;
      let fileName: string;

      // Convert PDF to image if needed
      if (isPdf) {
        toast.info('Converting PDF to image...');
        fileToUpload = await convertPdfToImage(file);
        fileName = `company-logo-${Date.now()}.png`;
      } else {
        const fileExt = file.name.split('.').pop();
        fileName = `company-logo-${Date.now()}.${fileExt}`;
      }

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, fileToUpload, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Default Payment Terms</Label>
              <Input
                value={profile?.billing_terms || ""}
                onChange={(e) => updateField("billing_terms", e.target.value)}
                placeholder="Net 30"
              />
            </div>

            <div>
              <Label>Remittance Information</Label>
              <Textarea
                value={profile?.remittance_info || ""}
                onChange={(e) => updateField("remittance_info", e.target.value)}
                placeholder="Payment instructions..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Default Currency</Label>
              <Input
                value={profile?.default_currency || "USD"}
                onChange={(e) => updateField("default_currency", e.target.value)}
                maxLength={3}
              />
            </div>

            <div>
              <Label>Default Timezone</Label>
              <Input
                value={profile?.default_timezone || "America/New_York"}
                onChange={(e) => updateField("default_timezone", e.target.value)}
                placeholder="America/New_York"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
