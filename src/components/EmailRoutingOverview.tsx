import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Mail, ArrowDown, CheckCircle2, RefreshCw, AlertTriangle, Crown } from "lucide-react";

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
  const [oauthOwner, setOauthOwner] = useState<TenantEmailConfig | null>(null);
  const [otherTenants, setOtherTenants] = useState<TenantEmailConfig[]>([]);
  const [connectedGmail, setConnectedGmail] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all tenants with their Gmail config
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name, gmail_alias")
        .order("name");

      // Get Gmail tokens via edge function (RLS blocks direct access)
      const { data: tokenResponse, error: tokenError } = await supabase.functions.invoke(
        "gmail-tenant-mapping",
        { body: { action: "list" } }
      );

      const tokens = tokenError ? [] : (tokenResponse?.gmail_tokens || []);

      if (tenants) {
        const tokenMap = new Map(tokens.map((t: any) => [t.tenant_id, t]));
        
        // Find the connected Gmail (the one with OAuth)
        const connectedToken = tokens[0];
        if (connectedToken) {
          setConnectedGmail(connectedToken.user_email);
        } else {
          setConnectedGmail(null);
        }

        const configList: TenantEmailConfig[] = tenants.map(tenant => {
          const token = tokenMap.get(tenant.id) as any;
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
        
        // Separate OAuth owner from other tenants
        const owner = configList.find(c => c.has_connection);
        setOauthOwner(owner || null);
        setOtherTenants(configList.filter(c => !c.has_connection));
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
        
        {/* OAuth Owner - Primary Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Crown className="h-4 w-4 text-amber-500" />
            Gmail OAuth Owner (Source of All Emails)
          </div>
          
          {oauthOwner ? (
            <div className="p-5 rounded-xl border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500 text-white">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg">{oauthOwner.tenant_name}</p>
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        OAuth Connected
                      </Badge>
                    </div>
                    <p className="text-lg font-mono text-green-700 dark:text-green-400 mt-1">
                      {connectedGmail}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All load emails are polled from this Gmail inbox
                    </p>
                  </div>
                </div>
                {oauthOwner.gmail_alias && (
                  <Badge variant="secondary" className="font-mono text-base px-3 py-1">
                    {oauthOwner.gmail_alias}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 space-y-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-400 text-white">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-lg text-amber-700 dark:text-amber-400">No Gmail Connected</p>
                  <p className="text-sm text-muted-foreground">
                    The platform owner must connect a Gmail account first
                  </p>
                </div>
              </div>
              
              {/* Instructions when no Gmail is connected */}
              <div className="p-4 rounded-lg bg-white dark:bg-background border border-amber-200 dark:border-amber-800">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-3">⚠️ New Tenants Cannot Receive Emails Until:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>
                    <strong>Platform Admin</strong> connects a Gmail account (e.g., <code className="bg-muted px-1 rounded">loads@yourcompany.com</code>)
                  </li>
                  <li>
                    The tenant is given their <strong>alias email</strong> (shown after tenant creation)
                  </li>
                  <li>
                    The tenant configures <strong>Sylectus/FullCircle</strong> to send load notifications to that alias
                  </li>
                </ol>
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">💡 To connect Gmail:</p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    Go to the Default Tenant's settings and click "Connect Gmail Account"
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* New Tenant Onboarding Steps - Only show when Gmail IS connected */}
        {connectedGmail && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 border border-green-200 dark:border-green-800">
            <p className="font-semibold text-green-800 dark:text-green-300 mb-3">✅ What a New Tenant Needs to Do:</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li className="text-muted-foreground">
                <strong>Get their alias email</strong> - created automatically when you add them (shown below)
              </li>
              <li className="text-muted-foreground">
                <strong>Configure Sylectus/FullCircle</strong> to send load notifications to their alias email
              </li>
              <li className="text-muted-foreground">
                <strong>That's it!</strong> - emails will automatically route to their tenant
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-green-200 dark:border-green-700">
              No additional Gmail OAuth needed - all tenants share the connection above
            </p>
          </div>
        )}

        {/* Arrow Divider */}
        {otherTenants.length > 0 && connectedGmail && (
          <div className="flex items-center justify-center py-2">
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ArrowDown className="h-6 w-6" />
              <span className="text-xs font-medium">Routes via +alias to</span>
            </div>
          </div>
        )}

        {/* Other Tenants - Alias Routing */}
        {otherTenants.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="h-4 w-4 text-blue-500" />
              Tenants Using Alias Routing ({otherTenants.length})
            </div>
            
            <div className="grid gap-3">
              {otherTenants.map((config) => {
                const aliasEmail = config.gmail_alias && connectedGmail
                  ? `${baseEmail}${config.gmail_alias}@${domain}`
                  : null;
                
                return (
                  <div 
                    key={config.tenant_id}
                    className={`p-4 rounded-lg border ${
                      config.gmail_alias 
                        ? "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20"
                        : "border-muted bg-muted/30"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          config.gmail_alias ? "bg-blue-500" : "bg-muted-foreground/30"
                        }`} />
                        <div>
                          <p className="font-semibold">{config.tenant_name}</p>
                          {config.gmail_alias && connectedGmail ? (
                            <div className="mt-1">
                              <p className="text-xs text-muted-foreground">Give this email to the tenant for Sylectus/FullCircle:</p>
                              <p className="font-mono text-sm text-blue-600 dark:text-blue-400 font-medium">
                                {aliasEmail}
                              </p>
                            </div>
                          ) : !connectedGmail ? (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              Waiting for Gmail OAuth connection
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              No alias configured - cannot receive emails
                            </p>
                          )}
                        </div>
                      </div>
                      {config.gmail_alias && (
                        <Badge variant="outline" className="font-mono">
                          {config.gmail_alias}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-4 border-t text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>OAuth owner (polls Gmail)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Alias routing active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
            <span>No alias configured</span>
          </div>
        </div>

        {/* How it works */}
        <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
          <p className="font-medium">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li><strong>{oauthOwner?.tenant_name || "One tenant"}</strong> owns the Gmail OAuth connection{connectedGmail && <> (<code className="bg-background px-1 rounded">{connectedGmail}</code>)</>}</li>
            <li>Other tenants use <strong>+alias</strong> routing{connectedGmail && <> (e.g., <code className="bg-background px-1 rounded">{baseEmail}+tenantname@{domain}</code>)</>}</li>
            <li>Each tenant tells their Sylectus/FullCircle to send emails to their alias address</li>
            <li>System automatically routes emails to the correct tenant based on the +alias</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
