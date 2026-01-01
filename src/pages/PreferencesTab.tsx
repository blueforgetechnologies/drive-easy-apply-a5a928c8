import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Globe, Save } from "lucide-react";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "America/Phoenix", label: "Arizona Time (MST)" },
  { value: "UTC", label: "UTC" },
];

const DATE_FORMATS = [
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "dd/MM/yyyy", label: "DD/MM/YYYY" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD" },
];

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
];

export default function PreferencesTab() {
  const { tenantId, shouldFilter } = useTenantFilter();
  const [preferences, setPreferences] = useState({
    timezone: "America/New_York",
    date_format: "MM/dd/yyyy",
    currency: "USD",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadPreferences();
    }
  }, [tenantId, shouldFilter]);

  const loadPreferences = async () => {
    if (!tenantId && shouldFilter) {
      setLoading(false);
      return;
    }
    
    try {
      // First try to load tenant preferences
      if (tenantId) {
        const { data: tenantPrefs, error } = await supabase
          .from("tenant_preferences")
          .select("*")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (!error && tenantPrefs) {
          setPreferences({
            timezone: tenantPrefs.timezone || "America/New_York",
            date_format: tenantPrefs.date_format || "MM/dd/yyyy",
            currency: tenantPrefs.currency || "USD",
          });
          setLoading(false);
          return;
        }
      }

      // Fall back to user profile preferences
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", user.id)
        .single();

      if (profile?.timezone) {
        setPreferences(prev => ({ ...prev, timezone: profile.timezone }));
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      if (tenantId) {
        // Save to tenant_preferences table
        const { error } = await supabase
          .from("tenant_preferences")
          .upsert({
            tenant_id: tenantId,
            timezone: preferences.timezone,
            date_format: preferences.date_format,
            currency: preferences.currency,
          }, {
            onConflict: 'tenant_id'
          });

        if (error) throw error;
      } else {
        // Fall back to updating user profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("You must be logged in to save preferences");
          return;
        }

        const { error } = await supabase
          .from("profiles")
          .update({ timezone: preferences.timezone })
          .eq("id", user.id);

        if (error) throw error;
      }

      toast.success("Preferences saved successfully");
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId && shouldFilter) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Please select a tenant to manage preferences.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Regional Settings
          </CardTitle>
          <CardDescription>
            Configure timezone and regional preferences for this organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select 
              value={preferences.timezone} 
              onValueChange={(value) => setPreferences(prev => ({ ...prev, timezone: value }))}
            >
              <SelectTrigger id="timezone" className="w-full max-w-xs">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This timezone will be used throughout the application for displaying dates and times.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_format">Date Format</Label>
            <Select 
              value={preferences.date_format} 
              onValueChange={(value) => setPreferences(prev => ({ ...prev, date_format: value }))}
            >
              <SelectTrigger id="date_format" className="w-full max-w-xs">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((df) => (
                  <SelectItem key={df.value} value={df.value}>
                    {df.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select 
              value={preferences.currency} 
              onValueChange={(value) => setPreferences(prev => ({ ...prev, currency: value }))}
            >
              <SelectTrigger id="currency" className="w-full max-w-xs">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={savePreferences} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}