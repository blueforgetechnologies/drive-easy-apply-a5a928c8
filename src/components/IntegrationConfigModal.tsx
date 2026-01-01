import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProviderField {
  name: string;
  label: string;
  type: "password" | "text" | "email";
  placeholder: string;
  isSecret?: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  fields: ProviderField[];
  settingsFields?: ProviderField[];
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  samsara: {
    id: "samsara",
    name: "Samsara API",
    description: "Vehicle telematics and fleet tracking integration",
    fields: [
      { name: "api_key", label: "API Key", type: "password", placeholder: "Enter your Samsara API key", isSecret: true },
    ],
  },
  resend: {
    id: "resend",
    name: "Resend Email",
    description: "Transactional email service for notifications",
    fields: [
      { name: "api_key", label: "API Key", type: "password", placeholder: "re_xxxxxx...", isSecret: true },
    ],
    settingsFields: [
      { name: "from_email", label: "From Email", type: "email", placeholder: "noreply@yourdomain.com" },
    ],
  },
  mapbox: {
    id: "mapbox",
    name: "Mapbox",
    description: "Maps and geocoding services",
    fields: [
      { name: "token", label: "Access Token", type: "password", placeholder: "pk.xxxxxx...", isSecret: true },
    ],
  },
  weather: {
    id: "weather",
    name: "Weather API",
    description: "Real-time weather data for locations",
    fields: [
      { name: "api_key", label: "API Key", type: "password", placeholder: "Enter your Weather API key", isSecret: true },
    ],
  },
  highway: {
    id: "highway",
    name: "Highway",
    description: "Carrier identity verification and fraud prevention",
    fields: [
      { name: "api_key", label: "API Key", type: "password", placeholder: "Enter your Highway API key", isSecret: true },
    ],
    settingsFields: [
      { name: "base_url", label: "Base URL (optional)", type: "text", placeholder: "https://api.highway.com" },
    ],
  },
};

interface IntegrationConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  tenantId: string;
  existingHint?: string | null;
  existingSettings?: Record<string, unknown> | null;
  onSuccess: () => void;
}

export function IntegrationConfigModal({
  open,
  onOpenChange,
  provider,
  tenantId,
  existingHint,
  existingSettings,
  onSuccess,
}: IntegrationConfigModalProps) {
  const config = PROVIDER_CONFIGS[provider];
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>(
    (existingSettings as Record<string, string>) || {}
  );
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  if (!config) {
    return null;
  }

  const handleSave = async () => {
    // Validate required credentials
    const hasNewCredentials = Object.values(credentials).some(v => v?.trim());
    
    if (!existingHint && !hasNewCredentials) {
      toast.error("Please enter your API credentials");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        provider,
        is_enabled: true,
        settings,
      };

      // Only include credentials if new ones were entered
      if (hasNewCredentials) {
        payload.credentials = credentials;
      }

      const { data, error } = await supabase.functions.invoke("set-tenant-integration", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${config.name} configuration saved`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving integration:", error);
      toast.error("Failed to save configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-tenant-integration", {
        body: { tenant_id: tenantId, provider },
      });

      if (error) throw error;

      if (data?.status === "success") {
        toast.success("Connection test successful", {
          description: data.message,
        });
      } else {
        toast.error("Connection test failed", {
          description: data?.message || "Unknown error",
        });
      }
    } catch (error) {
      console.error("Error testing integration:", error);
      toast.error("Failed to test connection", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const toggleSecretVisibility = (fieldName: string) => {
    setShowSecrets(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {config.name}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credential fields */}
          {config.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <div className="relative">
                <Input
                  id={field.name}
                  type={field.isSecret && !showSecrets[field.name] ? "password" : "text"}
                  placeholder={existingHint ? `Current: ${existingHint}` : field.placeholder}
                  value={credentials[field.name] || ""}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="pr-10"
                />
                {field.isSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => toggleSecretVisibility(field.name)}
                  >
                    {showSecrets[field.name] ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                )}
              </div>
              {existingHint && (
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep existing credentials
                </p>
              )}
            </div>
          ))}

          {/* Settings fields (non-secret) */}
          {config.settingsFields?.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                type={field.type}
                placeholder={field.placeholder}
                value={settings[field.name] || ""}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {existingHint && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isSaving}
              className="sm:mr-auto"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isTesting}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
