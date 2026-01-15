import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Mail, ArrowRight, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface TenantEmailConfig {
  tenant_id: string;
  tenant_name: string;
  gmail_alias: string | null;
  connected_gmail: string | null;
  token_expiry: string | null;
  has_connection: boolean;
}

export function EmailRoutingOverview() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<TenantEmailConfig[]>([]);
  const [connectedGmail, setConnectedGmail] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all tenants with their Gmail config
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name, gmail_alias")
        .order("name");

      // Get all Gmail tokens
      const { data: tokens } = await supabase
        .from("gmail_tokens")
        .select("tenant_id, user_email, token_expiry");

      if (tenants) {
        const tokenMap = new Map(tokens?.map(t => [t.tenant_id, t]) || []);
        
        // Find the connected Gmail (the one with OAuth)
        const connectedToken = tokens?.[0];
        if (connectedToken) {
          setConnectedGmail(connectedToken.user_email);
        }

        const configList: TenantEmailConfig[] = tenants.map(tenant => {
          const token = tokenMap.get(tenant.id);
          return {
            tenant_id: tenant.id,
            tenant_name: tenant.name,
            gmail_alias: tenant.gmail_alias,
            connected_gmail: token?.user_email || null,
            token_expiry: token?.token_expiry || null,
            has_connection: !!token,
          };
        });

        setConfigs(configList);
      }
    } catch (error) {
      console.error("Error loading email routing config:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const baseEmail = connectedGmail?.split("@")[0] || "email";
  const domain = connectedGmail?.split("@")[1] || "gmail.com";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Routing Overview
            </CardTitle>
            <CardDescription>
              Visual map of Gmail connections and alias routing
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected Gmail Source */}
        <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-full bg-primary text-primary-foreground">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-lg">Connected Gmail (OAuth)</p>
              <p className="text-primary font-mono">{connectedGmail || "No Gmail connected"}</p>
            </div>
            {connectedGmail && (
              <Badge variant="default" className="ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            All load emails are polled from this inbox and routed based on aliases
          </p>
        </div>

        {/* Routing Flow Diagram */}
        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-4 pl-16">
            <div className="flex items-center gap-2 -ml-[52px] text-muted-foreground">
              <ArrowRight className="h-5 w-5" />
              <span className="text-sm font-medium">Routes to tenants via +alias</span>
            </div>

            {configs.map((config) => {
              const aliasEmail = config.gmail_alias 
                ? `${baseEmail}${config.gmail_alias}@${domain}`
                : null;
              
              return (
                <div 
                  key={config.tenant_id}
                  className={`relative p-4 rounded-lg border ${
                    config.has_connection 
                      ? "border-green-300 bg-green-50 dark:bg-green-950/20" 
                      : config.gmail_alias 
                        ? "border-blue-300 bg-blue-50 dark:bg-blue-950/20"
                        : "border-muted bg-muted/30"
                  }`}
                >
                  {/* Connection indicator */}
                  <div className="absolute -left-[52px] top-1/2 -translate-y-1/2 flex items-center">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      config.has_connection 
                        ? "bg-green-500 border-green-500" 
                        : config.gmail_alias
                          ? "bg-blue-500 border-blue-500"
                          : "bg-muted border-muted-foreground"
                    }`} />
                    <div className={`w-8 h-0.5 ${
                      config.has_connection 
                        ? "bg-green-500" 
                        : config.gmail_alias
                          ? "bg-blue-500"
                          : "bg-muted"
                    }`} />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{config.tenant_name}</p>
                        {config.has_connection && (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OAuth Owner
                          </Badge>
                        )}
                      </div>
                      
                      {config.gmail_alias ? (
                        <div className="mt-1">
                          <p className="text-sm text-muted-foreground">Receives emails sent to:</p>
                          <p className="font-mono text-sm text-primary font-medium">
                            {aliasEmail}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          No alias configured
                        </p>
                      )}
                    </div>

                    <div className="text-right text-sm">
                      {config.gmail_alias && (
                        <Badge variant="secondary" className="font-mono">
                          {config.gmail_alias}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-4 border-t text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>OAuth connection owner</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Alias routing configured</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted border border-muted-foreground" />
            <span>No routing configured</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
          <p className="font-medium">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li><strong>Default Tenant</strong> owns the Gmail OAuth connection ({connectedGmail})</li>
            <li>Other tenants use <strong>+alias</strong> routing (e.g., <code className="bg-background px-1 rounded">{baseEmail}+talbi@{domain}</code>)</li>
            <li>Tenants configure their Sylectus/FullCircle to send to their alias email</li>
            <li>System automatically routes emails to correct tenant based on alias</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
