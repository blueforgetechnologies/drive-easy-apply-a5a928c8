import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Shield, Loader2, Building2, Users, Truck, Target, RefreshCw, Flag, Check, X, Minus,
  Mail, Zap, MapPin, Brain, AlertTriangle, Clock, Activity, MousePointer2, ExternalLink,
  Navigation, Database, LayoutGrid, Rocket, Inbox, HelpCircle, PiggyBank
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReleaseControlTab } from "@/components/inspector/ReleaseControlTab";
import DedupCostTab from "@/components/inspector/DedupCostTab";
import EmailRoutingHealthTab from "@/pages/EmailRoutingHealthTab";
import UnroutableEmailsTab from "@/pages/UnroutableEmailsTab";

interface TenantMetrics {
  tenant_id: string;
  tenant_name: string;
  status: string | null;
  release_channel: string | null;
  created_at: string;
  gmail_alias: string | null;
  last_email_received_at: string | null;
  email_health_status: 'healthy' | 'warning' | 'critical' | 'no_source';
  metrics: {
    users_count: number;
    drivers_count: number;
    active_vehicles_count: number;
    pending_vehicles_count: number;
    active_hunts_count: number;
  };
}

interface FeatureFlagResolution {
  flag_key: string;
  flag_name: string;
  global_default: boolean;
  release_channel_value: boolean | null;
  tenant_override_value: boolean | null;
  effective_value: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default';
  is_killswitch: boolean;
}

interface LoadHunterHealth {
  total_emails_received: number;
  unique_emails_processed: number;
  deduped_emails_count: number;
  dedupe_rate_percentage: number;
  loads_created: number;
  loads_matched: number;
  active_hunts_count: number;
  average_processing_time_ms: number | null;
  geocoding_requests_count: number;
  geocoding_cache_hits: number;
  geocoding_cache_hit_rate: number;
  ai_parsing_calls_count: number;
  ingestion_enabled: boolean;
  webhook_enabled: boolean;
  last_error_at: string | null;
  errors_last_24h: number;
  queue_pending_count: number;
  queue_failed_count: number;
  oldest_pending_at: string | null;
  queue_lag_seconds: number | null;
  tenant_id: string | null;
  tenant_name: string | null;
  time_window: string;
}

interface UIActionHealth {
  action: {
    id: string;
    action_key: string;
    ui_location: string;
    action_type: string;
    backend_target: string | null;
    enabled: boolean;
    feature_flag_key: string | null;
    tenant_scope: string;
    description: string | null;
    last_verified_at: string;
  };
  status: "healthy" | "broken" | "disabled";
  issues: string[];
  backend_exists: boolean;
  feature_flag_enabled: boolean | null;
}

interface UIActionsSummary {
  total: number;
  healthy: number;
  broken: number;
  disabled: number;
}

export default function Inspector() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  
  // Tenants state
  const [tenants, setTenants] = useState<TenantMetrics[]>([]);
  const [fetchingTenants, setFetchingTenants] = useState(false);
  const [tenantsError, setTenantsError] = useState<string | null>(null);

  // Feature flags state
  const [selectedFlagsTenantId, setSelectedFlagsTenantId] = useState<string>("");
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagResolution[]>([]);
  const [fetchingFlags, setFetchingFlags] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [selectedTenantChannel, setSelectedTenantChannel] = useState<string | null>(null);

  // Load Hunter health state
  const [selectedHealthTenantId, setSelectedHealthTenantId] = useState<string>("");
  const [loadHunterHealth, setLoadHunterHealth] = useState<LoadHunterHealth | null>(null);
  const [fetchingHealth, setFetchingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [retryingFailed, setRetryingFailed] = useState(false);

  // UI Actions state
  const [uiActions, setUIActions] = useState<UIActionHealth[]>([]);
  const [uiActionsSummary, setUIActionsSummary] = useState<UIActionsSummary | null>(null);
  const [fetchingActions, setFetchingActions] = useState(false);
  const [actionsError, setActionsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (mounted) {
          navigate("/auth", { replace: true });
        }
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!mounted) return;

      if (roleError) {
        console.error("Error checking admin role:", roleError);
        toast.error("Access denied");
        navigate("/dashboard", { replace: true });
        return;
      }

      if (!roleData) {
        toast.error("Platform Admin access required");
        navigate("/dashboard", { replace: true });
        return;
      }

      setAuthorized(true);
      setLoading(false);
      fetchTenants();
    }

    checkAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth", { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  async function fetchTenants() {
    setFetchingTenants(true);
    setTenantsError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTenantsError("Not authenticated");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("inspector-tenants", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        setTenantsError(fnError.message || "Failed to fetch tenant data");
        return;
      }

      if (data?.error) {
        setTenantsError(data.error);
        return;
      }

      setTenants(data?.tenants || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      setTenantsError("An unexpected error occurred");
    } finally {
      setFetchingTenants(false);
    }
  }

  async function fetchFeatureFlags(tenantId?: string) {
    setFetchingFlags(true);
    setFlagsError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setFlagsError("Not authenticated");
        return;
      }

      const queryParams = tenantId ? `?tenant_id=${tenantId}` : "";
      const { data, error: fnError } = await supabase.functions.invoke(`inspector-feature-flags${queryParams}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        setFlagsError(fnError.message || "Failed to fetch feature flags");
        return;
      }

      if (data?.error) {
        setFlagsError(data.error);
        return;
      }

      setFeatureFlags(data?.flags || []);
      setSelectedTenantChannel(data?.release_channel || null);
    } catch (err) {
      console.error("Unexpected error:", err);
      setFlagsError("An unexpected error occurred");
    } finally {
      setFetchingFlags(false);
    }
  }

  async function fetchLoadHunterHealth(tenantId?: string) {
    setFetchingHealth(true);
    setHealthError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHealthError("Not authenticated");
        return;
      }

      const queryParams = tenantId ? `?tenant_id=${tenantId}` : "";
      const { data, error: fnError } = await supabase.functions.invoke(`inspector-load-hunter-health${queryParams}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        setHealthError(fnError.message || "Failed to fetch Load Hunter health");
        return;
      }

      if (data?.error) {
        setHealthError(data.error);
        return;
      }

      setLoadHunterHealth(data?.health || null);
    } catch (err) {
      console.error("Unexpected error:", err);
      setHealthError("An unexpected error occurred");
    } finally {
      setFetchingHealth(false);
    }
  }

  async function fetchUIActions() {
    setFetchingActions(true);
    setActionsError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setActionsError("Not authenticated");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("inspector-ui-actions", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        setActionsError(fnError.message || "Failed to fetch UI actions");
        return;
      }

      if (data?.error) {
        setActionsError(data.error);
        return;
      }

      setUIActions(data?.actions || []);
      setUIActionsSummary(data?.summary || null);
    } catch (err) {
      console.error("Unexpected error:", err);
      setActionsError("An unexpected error occurred");
    } finally {
      setFetchingActions(false);
    }
  }

  function handleFlagsTenantSelect(tenantId: string) {
    setSelectedFlagsTenantId(tenantId);
    if (tenantId) {
      fetchFeatureFlags(tenantId);
    } else {
      fetchFeatureFlags();
    }
  }

  function handleHealthTenantSelect(tenantId: string) {
    setSelectedHealthTenantId(tenantId);
    fetchLoadHunterHealth(tenantId || undefined);
  }

  async function retryFailedEmails() {
    setRetryingFailed(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data, error } = await supabase.functions.invoke("retry-failed-emails", {
        body: { error_filter: "mimeType", limit: 200 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        toast.error(`Failed to retry emails: ${error.message}`);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`Reset ${data.reset_count} failed emails for retry`);
      // Refresh health data
      fetchLoadHunterHealth(selectedHealthTenantId || undefined);
    } catch (err) {
      console.error("Error retrying failed emails:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setRetryingFailed(false);
    }
  }

  function getEmailHealthBadge(status: string | null) {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-600 text-white border-0 shadow-sm">🟢 Healthy</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500 text-black border-0 shadow-sm">🟡 Warning</Badge>;
      case "critical":
        return <Badge className="bg-red-600 text-white border-0 shadow-sm">🔴 Critical</Badge>;
      case "no_source":
        return <Badge variant="outline" className="bg-muted/80">⚪ No Source</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted/80">—</Badge>;
    }
  }

  function getStatusBadge(status: string | null) {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "trial":
        return <Badge variant="secondary">Trial</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  }

  function getChannelBadge(channel: string | null) {
    switch (channel) {
      case "stable":
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Stable</Badge>;
      case "beta":
        return <Badge variant="outline" className="border-orange-500 text-orange-600">Beta</Badge>;
      case "canary":
        return <Badge variant="outline" className="border-purple-500 text-purple-600">Canary</Badge>;
      case "internal":
        return <Badge variant="outline" className="border-red-500 text-red-600">Internal</Badge>;
      case "pilot":
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Pilot</Badge>;
      case "general":
        return <Badge variant="outline" className="border-green-500 text-green-600">General</Badge>;
      default:
        return <Badge variant="outline">{channel || "—"}</Badge>;
    }
  }

  function getSourceBadge(source: string) {
    switch (source) {
      case "tenant_override":
        return <Badge variant="default" className="bg-gradient-to-b from-purple-500 to-purple-700 text-white !px-3 !py-1.5 shadow-md">Tenant Override</Badge>;
      case "release_channel":
        return <Badge variant="secondary" className="bg-gradient-to-b from-orange-400 to-orange-600 text-white !px-3 !py-1.5 shadow-md">Release Channel</Badge>;
      case "global_default":
        return <Badge variant="outline">Global Default</Badge>;
      default:
        return <Badge variant="outline">{source}</Badge>;
    }
  }

  function getBooleanIcon(value: boolean | null) {
    if (value === null) {
      return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
    return value ? (
      <Check className="w-4 h-4 text-green-600" />
    ) : (
      <X className="w-4 h-4 text-red-500" />
    );
  }

  function getHealthStatus(health: LoadHunterHealth | null): 'healthy' | 'warning' | 'critical' {
    if (!health) return 'warning';
    
    // Critical conditions
    if (!health.ingestion_enabled || !health.webhook_enabled) return 'critical';
    if (health.errors_last_24h > 10) return 'critical';
    if (health.queue_pending_count > 100) return 'critical';
    if ((health.queue_lag_seconds || 0) > 300) return 'critical';
    
    // Warning conditions
    if (health.errors_last_24h > 0) return 'warning';
    if (health.queue_pending_count > 20) return 'warning';
    if ((health.queue_lag_seconds || 0) > 60) return 'warning';
    if (health.geocoding_cache_hit_rate < 50) return 'warning';
    
    return 'healthy';
  }

  function getHealthStatusBadge(status: 'healthy' | 'warning' | 'critical') {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-600">Healthy</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 text-black">Warning</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
    }
  }

  function getActionStatusBadge(status: 'healthy' | 'broken' | 'disabled') {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-600">Healthy</Badge>;
      case 'broken':
        return <Badge variant="destructive">Broken</Badge>;
      case 'disabled':
        return <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>;
    }
  }

  function getActionTypeIcon(type: string) {
    switch (type) {
      case 'navigate':
        return <Navigation className="w-4 h-4 text-blue-500" />;
      case 'api_call':
        return <Zap className="w-4 h-4 text-orange-500" />;
      case 'mutation':
        return <Database className="w-4 h-4 text-purple-500" />;
      case 'modal':
        return <LayoutGrid className="w-4 h-4 text-green-500" />;
      case 'external_link':
        return <ExternalLink className="w-4 h-4 text-cyan-500" />;
      default:
        return <MousePointer2 className="w-4 h-4 text-muted-foreground" />;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(dateString: string | null) {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const totals = tenants.reduce(
    (acc, t) => ({
      users: acc.users + t.metrics.users_count,
      drivers: acc.drivers + t.metrics.drivers_count,
      activeVehicles: acc.activeVehicles + t.metrics.active_vehicles_count,
      pendingVehicles: acc.pendingVehicles + t.metrics.pending_vehicles_count,
      hunts: acc.hunts + t.metrics.active_hunts_count,
    }),
    { users: 0, drivers: 0, activeVehicles: 0, pendingVehicles: 0, hunts: 0 }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const healthStatus = getHealthStatus(loadHunterHealth);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5" />
        <h1 className="text-2xl font-semibold">Platform Inspector</h1>
      </div>

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="feature-flags" className="flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="load-hunter" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Load Hunter Health
          </TabsTrigger>
          <TabsTrigger value="ui-actions" className="flex items-center gap-2">
            <MousePointer2 className="w-4 h-4" />
            UI Actions
          </TabsTrigger>
          <TabsTrigger value="release-control" className="flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            Release Control
          </TabsTrigger>
          <TabsTrigger value="email-routing" className="flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Email Routing
          </TabsTrigger>
          <TabsTrigger value="unroutable" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Unroutable
          </TabsTrigger>
          <TabsTrigger value="dedup-cost" className="flex items-center gap-2">
            <PiggyBank className="w-4 h-4" />
            Dedup & Cost
          </TabsTrigger>
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchTenants} disabled={fetchingTenants}>
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchingTenants ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Total Tenants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{tenants.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.users}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Total Drivers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.drivers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Active Vehicles
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Vehicles with status = 'active'</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.activeVehicles}</p>
                {totals.pendingVehicles > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">+{totals.pendingVehicles} pending</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Active Hunts
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Hunt plans with enabled = true</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.hunts}</p>
              </CardContent>
            </Card>
          </div>

          {tenantsError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{tenantsError}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Tenants Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {fetchingTenants && tenants.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tenants.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No tenants found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Email Health</TableHead>
                      <TableHead>Gmail Alias</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Users</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-1">
                          Vehicles
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Active + pending vehicles</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </span>
                      </TableHead>
                      <TableHead className="text-right">Active Hunts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.tenant_id}>
                        <TableCell className="font-medium">{tenant.tenant_name}</TableCell>
                        <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                        <TableCell>{getEmailHealthBadge(tenant.email_health_status)}</TableCell>
                        <TableCell className="font-mono text-xs">{tenant.gmail_alias || "—"}</TableCell>
                        <TableCell>{getChannelBadge(tenant.release_channel)}</TableCell>
                        <TableCell className="text-right">{tenant.metrics.users_count}</TableCell>
                        <TableCell className="text-right">
                          {tenant.metrics.active_vehicles_count}
                          {tenant.metrics.pending_vehicles_count > 0 && (
                            <span className="text-muted-foreground text-xs ml-1">(+{tenant.metrics.pending_vehicles_count})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{tenant.metrics.active_hunts_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feature Flags Tab */}
        <TabsContent value="feature-flags" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-64">
              <Select value={selectedFlagsTenantId || "__global__"} onValueChange={(v) => handleFlagsTenantSelect(v === "__global__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">Global (no tenant)</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                        {tenant.tenant_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTenantChannel && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Release Channel: {getChannelBadge(selectedTenantChannel)}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchFeatureFlags(selectedFlagsTenantId || undefined)} disabled={fetchingFlags}>
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchingFlags ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {flagsError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{flagsError}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="w-5 h-5" />
                Feature Flags Resolution
                {selectedFlagsTenantId && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    for {tenants.find(t => t.tenant_id === selectedFlagsTenantId)?.tenant_name}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fetchingFlags && featureFlags.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : featureFlags.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Select a tenant or refresh to view feature flags.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchFeatureFlags(selectedFlagsTenantId || undefined)} disabled={fetchingFlags}>
                    Load Feature Flags
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flag Key</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center">Effective</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-center">Tenant Override</TableHead>
                      <TableHead className="text-center">Release Channel</TableHead>
                      <TableHead className="text-center">Global Default</TableHead>
                      <TableHead className="text-center">Killswitch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {featureFlags.map((flag) => (
                      <TableRow key={flag.flag_key}>
                        <TableCell className="font-mono text-sm">{flag.flag_key}</TableCell>
                        <TableCell>{flag.flag_name}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">{getBooleanIcon(flag.effective_value)}</div>
                        </TableCell>
                        <TableCell>{getSourceBadge(flag.source)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">{getBooleanIcon(flag.tenant_override_value)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">{getBooleanIcon(flag.release_channel_value)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">{getBooleanIcon(flag.global_default)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          {flag.is_killswitch && <Badge variant="destructive" className="text-xs">KS</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span>Enabled</span>
                </div>
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4 text-red-500" />
                  <span>Disabled</span>
                </div>
                <div className="flex items-center gap-2">
                  <Minus className="w-4 h-4 text-muted-foreground" />
                  <span>Not Set / Inherited</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">KS</Badge>
                  <span>Killswitch (global override)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Load Hunter Health Tab */}
        <TabsContent value="load-hunter" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="w-64">
              <Select value={selectedHealthTenantId || "__all__"} onValueChange={(v) => handleHealthTenantSelect(v === "__all__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tenants</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                      {tenant.tenant_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchLoadHunterHealth(selectedHealthTenantId || undefined)} disabled={fetchingHealth}>
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchingHealth ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {healthError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{healthError}</p>
              </CardContent>
            </Card>
          )}

          {fetchingHealth && !loadHunterHealth ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !loadHunterHealth ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">Click refresh to load Load Hunter health data.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchLoadHunterHealth(selectedHealthTenantId || undefined)}>
                  Load Health Data
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Health Status Banner */}
              <Card className={healthStatus === 'critical' ? 'border-destructive' : healthStatus === 'warning' ? 'border-yellow-500' : 'border-green-500'}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Activity className="w-6 h-6" />
                      <div>
                        <h3 className="font-semibold">System Status</h3>
                        <p className="text-sm text-muted-foreground">
                          {loadHunterHealth.tenant_name || "All Tenants"} • Today (UTC)
                        </p>
                      </div>
                    </div>
                    {getHealthStatusBadge(healthStatus)}
                  </div>
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Emails Received
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{loadHunterHealth.total_emails_received.toLocaleString()}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Processed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{loadHunterHealth.unique_emails_processed.toLocaleString()}</p>
                    {loadHunterHealth.dedupe_rate_percentage > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {loadHunterHealth.deduped_emails_count} deduped ({loadHunterHealth.dedupe_rate_percentage}%)
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Geocoding
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{loadHunterHealth.geocoding_requests_count.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {loadHunterHealth.geocoding_cache_hits} cache hits ({loadHunterHealth.geocoding_cache_hit_rate}%)
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      AI Parsing
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{loadHunterHealth.ai_parsing_calls_count.toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Health Indicators & Queue Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Health Indicators
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Ingestion Enabled</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.ingestion_enabled ? (
                              <Badge className="bg-green-600">Yes</Badge>
                            ) : (
                              <Badge variant="destructive">No</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Webhook Enabled</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.webhook_enabled ? (
                              <Badge className="bg-green-600">Yes</Badge>
                            ) : (
                              <Badge variant="destructive">No</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Errors (24h)</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.errors_last_24h > 0 ? (
                              <Badge variant="destructive">{loadHunterHealth.errors_last_24h}</Badge>
                            ) : (
                              <Badge variant="outline">0</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Last Error</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDateTime(loadHunterHealth.last_error_at)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Avg Processing Time</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.average_processing_time_ms !== null 
                              ? `${loadHunterHealth.average_processing_time_ms}ms`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Queue Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Pending Items</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.queue_pending_count > 20 ? (
                              <Badge className="bg-yellow-500 text-black">{loadHunterHealth.queue_pending_count}</Badge>
                            ) : loadHunterHealth.queue_pending_count > 0 ? (
                              <Badge variant="secondary">{loadHunterHealth.queue_pending_count}</Badge>
                            ) : (
                              <Badge variant="outline">0</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Failed Items</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {loadHunterHealth.queue_failed_count > 0 ? (
                                <>
                                  <Badge variant="destructive">{loadHunterHealth.queue_failed_count}</Badge>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={retryFailedEmails}
                                    disabled={retryingFailed}
                                    className="h-6 text-xs"
                                  >
                                    {retryingFailed ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      "Retry"
                                    )}
                                  </Button>
                                </>
                              ) : (
                                <Badge variant="outline">0</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Queue Lag</TableCell>
                          <TableCell className="text-right">
                            {loadHunterHealth.queue_lag_seconds !== null ? (
                              loadHunterHealth.queue_lag_seconds > 60 ? (
                                <Badge className="bg-yellow-500 text-black">{loadHunterHealth.queue_lag_seconds}s</Badge>
                              ) : (
                                <span>{loadHunterHealth.queue_lag_seconds}s</span>
                              )
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Oldest Pending</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDateTime(loadHunterHealth.oldest_pending_at)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Active Hunts</TableCell>
                          <TableCell className="text-right">{loadHunterHealth.active_hunts_count}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* Load Processing Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Load Processing Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-8">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{loadHunterHealth.loads_created}</p>
                      <p className="text-sm text-muted-foreground">Loads Created</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{loadHunterHealth.loads_matched}</p>
                      <p className="text-sm text-muted-foreground">Matches Generated</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{loadHunterHealth.active_hunts_count}</p>
                      <p className="text-sm text-muted-foreground">Active Hunt Plans</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* UI Actions Tab */}
        <TabsContent value="ui-actions" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchUIActions} disabled={fetchingActions}>
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchingActions ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {actionsError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{actionsError}</p>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          {uiActionsSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MousePointer2 className="w-4 h-4" />
                    Total Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{uiActionsSummary.total}</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Healthy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{uiActionsSummary.healthy}</p>
                </CardContent>
              </Card>
              <Card className={uiActionsSummary.broken > 0 ? "border-destructive" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm font-medium flex items-center gap-2 ${uiActionsSummary.broken > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    <AlertTriangle className="w-4 h-4" />
                    Broken
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${uiActionsSummary.broken > 0 ? "text-destructive" : ""}`}>{uiActionsSummary.broken}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <X className="w-4 h-4" />
                    Disabled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-muted-foreground">{uiActionsSummary.disabled}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MousePointer2 className="w-5 h-5" />
                UI Action Registry
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fetchingActions && uiActions.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : uiActions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Click refresh to load UI actions registry.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={fetchUIActions} disabled={fetchingActions}>
                    Load UI Actions
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action Key</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-center">Type</TableHead>
                      <TableHead>Backend Target</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Feature Flag</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uiActions.map((item) => (
                      <TableRow 
                        key={item.action.id} 
                        className={item.status === 'broken' ? 'bg-destructive/10' : ''}
                      >
                        <TableCell className="font-mono text-sm">{item.action.action_key}</TableCell>
                        <TableCell className="text-muted-foreground">{item.action.ui_location}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {getActionTypeIcon(item.action.action_type)}
                            <span className="text-xs text-muted-foreground">{item.action.action_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.action.backend_target || "—"}</TableCell>
                        <TableCell className="text-center">{getActionStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-xs">{item.action.feature_flag_key || "—"}</TableCell>
                        <TableCell>
                          {item.issues.length > 0 ? (
                            <div className="flex items-start gap-1">
                              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                              <span className="text-xs text-destructive">{item.issues.join("; ")}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-500" />
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span>API Call</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-500" />
                  <span>Mutation</span>
                </div>
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-green-500" />
                  <span>Modal</span>
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-cyan-500" />
                  <span>External Link</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Release Control Tab */}
        <TabsContent value="release-control">
          <ReleaseControlTab />
        </TabsContent>

        {/* Email Routing Health Tab */}
        <TabsContent value="email-routing">
          <EmailRoutingHealthTab />
        </TabsContent>

        {/* Unroutable Emails Tab */}
        <TabsContent value="unroutable">
          <UnroutableEmailsTab />
        </TabsContent>

        {/* Dedup & Cost Tab */}
        <TabsContent value="dedup-cost">
          <DedupCostTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
