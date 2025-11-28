import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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

  useEffect(() => {
    checkAllIntegrations();
    // Check every 5 minutes
    const interval = setInterval(checkAllIntegrations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
