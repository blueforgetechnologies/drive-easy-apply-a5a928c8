import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Settings as SettingsIcon, Bell, Mail } from "lucide-react";
import { toast } from "sonner";

interface Integration {
  id: string;
  name: string;
  description: string;
  status: "operational" | "degraded" | "down" | "checking";
  lastChecked?: string;
  error?: string;
}

export default function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "samsara",
      name: "Samsara API",
      description: "Vehicle telematics and fleet tracking",
      status: "checking",
    },
    {
      id: "fmcsa",
      name: "FMCSA/SaferWeb",
      description: "Carrier safety data and compliance",
      status: "checking",
    },
    {
      id: "weather",
      name: "Weather API",
      description: "Real-time weather data for locations",
      status: "checking",
    },
    {
      id: "resend",
      name: "Resend Email",
      description: "Transactional email service",
      status: "checking",
    },
    {
      id: "mapbox",
      name: "Mapbox",
      description: "Maps and geocoding services",
      status: "checking",
    },
  ]);
  const [isChecking, setIsChecking] = useState(false);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("P.D@talbilogistics.com");
  const [emailProvider, setEmailProvider] = useState("gmail");
  const [isSettingUpPush, setIsSettingUpPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unknown" | "active" | "error">("unknown");

  useEffect(() => {
    checkAllIntegrations();
    // Check every 5 minutes
    const interval = setInterval(checkAllIntegrations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const setupGmailPush = async () => {
    setIsSettingUpPush(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'setup-push' }
      });
      
      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      setPushStatus("active");
      toast.success("Gmail push notifications configured successfully!", {
        description: `Expires: ${data.expiration ? new Date(parseInt(data.expiration)).toLocaleString() : 'Unknown'}`
      });
    } catch (error) {
      console.error("Error setting up Gmail push:", error);
      setPushStatus("error");
      toast.error("Failed to setup Gmail push notifications", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setIsSettingUpPush(false);
    }
  };

  const checkAllIntegrations = async () => {
    setIsChecking(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-integrations');
      
      if (error) throw error;
      
      if (data && data.integrations) {
        setIntegrations(data.integrations.map((integration: any) => ({
          ...integration,
          lastChecked: new Date().toISOString(),
        })));
      }
    } catch (error) {
      console.error("Error checking integrations:", error);
      toast.error("Failed to check integration status");
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "operational":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "down":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "checking":
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "operational":
        return <Badge variant="default" className="bg-green-500">Operational</Badge>;
      case "degraded":
        return <Badge variant="default" className="bg-yellow-500">Degraded</Badge>;
      case "down":
        return <Badge variant="destructive">Down</Badge>;
      case "checking":
        return <Badge variant="outline">Checking...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const handleSaveEmailConfig = () => {
    if (!emailAddress) {
      toast.error("Please enter an email address");
      return;
    }
    toast.success("Email configuration saved");
    setEmailConfigOpen(false);
  };

  const failedIntegrationsCount = integrations.filter(
    (i) => i.status === "down" || i.status === "degraded"
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">API Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Monitor the status of all connected APIs and services
          </p>
        </div>
        <Button
          onClick={checkAllIntegrations}
          disabled={isChecking}
          size="sm"
          variant="outline"
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Status
            </>
          )}
        </Button>
      </div>

      {failedIntegrationsCount > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              {failedIntegrationsCount} Integration{failedIntegrationsCount > 1 ? "s" : ""} Experiencing Issues
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Email Configuration</CardTitle>
              <CardDescription>Configure Load Hunter email integration</CardDescription>
            </div>
            <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <SettingsIcon className="h-4 w-4" />
                  Configure
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure Email Integration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address to Monitor</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="loads@yourcompany.com"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the email address where you receive load offers
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Email Provider</Label>
                    <select
                      id="provider"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={emailProvider}
                      onChange={(e) => setEmailProvider(e.target.value)}
                    >
                      <option value="gmail">Gmail</option>
                      <option value="outlook">Outlook</option>
                      <option value="imap">Other (IMAP)</option>
                    </select>
                  </div>
                  <Button onClick={handleSaveEmailConfig} className="w-full">
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email Address:</span>
              <span className="font-medium">{emailAddress}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider:</span>
              <span className="font-medium capitalize">{emailProvider}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
            {pushStatus === "active" && <Badge variant="default" className="bg-green-500">Active</Badge>}
            {pushStatus === "error" && <Badge variant="destructive">Error</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Setup Gmail push notifications to receive instant load emails without polling.
            </p>
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
                  <Mail className="h-4 w-4" />
                  Setup Gmail Push
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {integrations.map((integration) => (
          <Card key={integration.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {getStatusIcon(integration.status)}
                  <div>
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <CardDescription>{integration.description}</CardDescription>
                  </div>
                </div>
                {getStatusBadge(integration.status)}
              </div>
            </CardHeader>
            {(integration.error || integration.lastChecked) && (
              <CardContent>
                {integration.error && (
                  <p className="text-sm text-red-500 mb-2">Error: {integration.error}</p>
                )}
                {integration.lastChecked && (
                  <p className="text-xs text-muted-foreground">
                    Last checked: {new Date(integration.lastChecked).toLocaleString()}
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
