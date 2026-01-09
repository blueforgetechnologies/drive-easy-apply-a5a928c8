import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Settings as SettingsIcon, Bell, Mail } from "lucide-react";
import { toast } from "sonner";
import { IntegrationConfigModal } from "@/components/IntegrationConfigModal";

// Field definition from edge function
interface FieldDef {
  key: string;
  label: string;
  type: 'password' | 'text' | 'email';
  placeholder: string;
  required: boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  is_configured: boolean;
  is_enabled: boolean;
  credentials_hint: string | null;
  settings: Record<string, unknown> | null;
  sync_status: "healthy" | "failed" | "partial" | "pending" | "disabled" | "not_configured";
  error_message: string | null;
  last_checked_at: string | null;
  last_sync_at: string | null;
  credentialFields: FieldDef[];
  settingsFields: FieldDef[];
}

export default function IntegrationsTab() {
  const { tenantId, shouldFilter } = useTenantFilter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  // Gmail push state
  const [isSettingUpPush, setIsSettingUpPush] = useState(false);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unknown" | "active" | "error">("unknown");

  const loadIntegrations = useCallback(async () => {
    if (shouldFilter && !tenantId) return;

    try {
      const body = tenantId ? { tenant_id: tenantId } : {};
      const { data, error } = await supabase.functions.invoke("check-tenant-integrations", {
        body,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setIntegrations((data?.integrations ?? []) as Integration[]);
    } catch (error) {
      console.error("Error loading integrations:", error);
      toast.error("Failed to load integrations", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIntegrations([]);
    }
  }, [tenantId, shouldFilter]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (shouldFilter && !tenantId) return;

      setIsLoading(true);
      try {
        await loadIntegrations();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [tenantId, shouldFilter, loadIntegrations]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadIntegrations();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadIntegrations]);

  const handleTestIntegration = useCallback(
    async (integration: Integration) => {
      if (!tenantId) {
        toast.error("Please select a tenant to test integrations.");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("test-tenant-integration", {
          body: { tenant_id: tenantId, provider: integration.id },
        });

        if (error) throw error;

        if (data?.status === "healthy") {
          toast.success("Connection test successful", { description: data.message });
        } else if (data?.status === "disabled") {
          toast.info("Integration is disabled", { description: data.message });
        } else {
          toast.error("Connection test failed", {
            description: data?.message || "Unknown error",
          });
        }

        await loadIntegrations();
      } catch (error) {
        console.error("Error testing integration:", error);
        toast.error("Failed to test connection", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [tenantId, loadIntegrations]
  );

  const handleConfigure = useCallback((integration: Integration) => {
    setSelectedProvider(integration.id);
    setSelectedIntegration(integration);
    setConfigModalOpen(true);
  }, []);

  const connectGmail = async () => {
    if (!tenantId) return;

    setIsConnectingGmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-auth", {
        body: { action: "start", tenantId },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to start Gmail connection");
      if (!data?.authUrl) throw new Error("No authorization URL returned");

      window.open(data.authUrl, "gmail-oauth", "width=520,height=720");
      toast.info("Complete Gmail authorization in the popup, then come back here.");
    } catch (error) {
      console.error("Error starting Gmail OAuth:", error);
      toast.error("Failed to start Gmail connection", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const setupGmailPush = async () => {
    if (!tenantId) return;

    setIsSettingUpPush(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-auth", {
        body: { action: "setup-push", tenantId },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to setup Gmail push");

      setPushStatus("active");
      toast.success("Gmail push notifications configured!", {
        description: data?.expiration
          ? `Expires: ${new Date(parseInt(data.expiration)).toLocaleString()}`
          : undefined,
      });
    } catch (error) {
      console.error("Error setting up Gmail push:", error);
      setPushStatus("error");
      toast.error("Failed to setup Gmail push notifications", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSettingUpPush(false);
    }
  };

  const getStatusIcon = (status: string, isConfigured: boolean) => {
    if (!isConfigured) {
      return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "partial":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "pending":
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, isConfigured: boolean, isEnabled: boolean) => {
    if (!isConfigured) {
      return <Badge variant="secondary">Not Configured</Badge>;
    }
    if (!isEnabled) {
      return <Badge variant="outline">Disabled</Badge>;
    }
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-500">Operational</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "partial":
        return <Badge className="bg-yellow-500">Degraded</Badge>;
      case "pending":
        return <Badge className="bg-blue-500">Pending</Badge>;
      case "disabled":
        return <Badge variant="outline">Disabled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const failedCount = integrations.filter(
    (i) => i.is_configured && i.is_enabled && (i.sync_status === "failed" || i.sync_status === "partial")
  ).length;

  if (!tenantId && shouldFilter) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Please select a tenant to manage integrations.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter out gmail from main list (it has special handling)
  const mainIntegrations = integrations.filter((i) => i.id !== "gmail");
  const gmailIntegration = integrations.find((i) => i.id === "gmail");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">API Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Configure and monitor integrations for this organization
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} size="sm" variant="outline">
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {failedCount > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              {failedCount} Integration{failedCount > 1 ? "s" : ""} Experiencing Issues
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Gmail Integration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <CardTitle className="text-base">Gmail Push Notifications</CardTitle>
                <CardDescription>Enable real-time email notifications for Load Hunter</CardDescription>
              </div>
            </div>
            {pushStatus === "active" && <Badge className="bg-green-500">Active</Badge>}
            {pushStatus === "error" && <Badge variant="destructive">Error</Badge>}
          </div>
        </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect a Gmail account, then enable push notifications to receive instant load emails.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={connectGmail}
                  disabled={isConnectingGmail}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  {isConnectingGmail ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Connect / Reconnect Gmail
                    </>
                  )}
                </Button>

                <Button
                  onClick={setupGmailPush}
                  disabled={isSettingUpPush}
                  size="sm"
                  className="gap-2"
                >
                  {isSettingUpPush ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      Setup Gmail Push
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
      </Card>

      {/* Integration Cards */}
      <div className="grid gap-4">
        {mainIntegrations.map((integration) => (
          <Card key={integration.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {getStatusIcon(integration.sync_status, integration.is_configured)}
                  <div>
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <CardDescription>{integration.description}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(integration.sync_status, integration.is_configured, integration.is_enabled)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  {integration.is_configured && integration.credentials_hint && (
                    <p className="text-sm text-muted-foreground">
                      Credentials: {integration.credentials_hint}
                    </p>
                  )}
                  {integration.error_message && (
                    <p className="text-sm text-destructive">Error: {integration.error_message}</p>
                  )}
                  {integration.last_checked_at && (
                    <p className="text-xs text-muted-foreground">
                      Last checked: {new Date(integration.last_checked_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {integration.is_configured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestIntegration(integration)}
                    >
                      Test
                    </Button>
                  )}
                  <Button
                    variant={integration.is_configured ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleConfigure(integration)}
                    className="gap-1.5"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    {integration.is_configured ? "Update" : "Configure"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Configuration Modal */}
      {selectedProvider && selectedIntegration && (
        <IntegrationConfigModal
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
          provider={selectedProvider}
          providerName={selectedIntegration.name}
          providerDescription={selectedIntegration.description}
          tenantId={tenantId!}
          existingHint={selectedIntegration.credentials_hint}
          existingSettings={selectedIntegration.settings}
          credentialFields={selectedIntegration.credentialFields || []}
          settingsFields={selectedIntegration.settingsFields || []}
          onSuccess={loadIntegrations}
        />
      )}
    </div>
  );
}
