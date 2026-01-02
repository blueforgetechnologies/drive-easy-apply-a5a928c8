import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Field definition from edge function
interface FieldDef {
  key: string;
  label: string;
  type: 'password' | 'text' | 'email';
  placeholder: string;
  required: boolean;
}

interface IntegrationConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  providerName: string;
  providerDescription: string;
  tenantId: string;
  existingHint?: string | null;
  existingSettings?: Record<string, unknown> | null;
  // Fields from edge catalog - UI renders these, no local catalog
  credentialFields: FieldDef[];
  settingsFields: FieldDef[];
  onSuccess: () => void;
}

export function IntegrationConfigModal({
  open,
  onOpenChange,
  provider,
  providerName,
  providerDescription,
  tenantId,
  existingHint,
  existingSettings,
  credentialFields,
  settingsFields,
  onSuccess,
}: IntegrationConfigModalProps) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>(
    (existingSettings as Record<string, string>) || {}
  );
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // If no credential fields, this provider isn't configurable
  if (!credentialFields || credentialFields.length === 0) {
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

      // Only include credentials if new ones were entered (write-only, never echo)
      if (hasNewCredentials) {
        payload.credentials = credentials;
      }

      const { data, error } = await supabase.functions.invoke("set-tenant-integration", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${providerName} configuration saved`);
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

      if (data?.status === "healthy") {
        toast.success("Connection test successful", {
          description: data.message,
        });
      } else if (data?.status === "disabled") {
        toast.info("Integration is disabled", {
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

  const toggleSecretVisibility = (fieldKey: string) => {
    setShowSecrets(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const isSecretField = (type: string) => type === 'password';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {providerName}</DialogTitle>
          <DialogDescription>{providerDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credential fields - rendered from edge catalog */}
          {credentialFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <div className="relative">
                <Input
                  id={field.key}
                  type={isSecretField(field.type) && !showSecrets[field.key] ? "password" : "text"}
                  placeholder={existingHint ? `Current: ${existingHint}` : field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="pr-10"
                />
                {isSecretField(field.type) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => toggleSecretVisibility(field.key)}
                  >
                    {showSecrets[field.key] ? (
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

          {/* Settings fields (non-secret) - rendered from edge catalog */}
          {settingsFields?.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type={field.type === 'email' ? 'email' : 'text'}
                placeholder={field.placeholder}
                value={settings[field.key] || ""}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, [field.key]: e.target.value }))
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
