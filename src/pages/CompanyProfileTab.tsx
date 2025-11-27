import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function CompanyProfileTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

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
