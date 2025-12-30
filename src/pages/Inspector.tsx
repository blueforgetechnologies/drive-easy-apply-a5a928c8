import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, Building2, Users, Truck, Target, RefreshCw, Flag, Check, X, Minus } from "lucide-react";
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

interface TenantMetrics {
  tenant_id: string;
  tenant_name: string;
  status: string | null;
  release_channel: string | null;
  created_at: string;
  metrics: {
    users_count: number;
    drivers_count: number;
    vehicles_count: number;
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

export default function Inspector() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  
  // Tenants state
  const [tenants, setTenants] = useState<TenantMetrics[]>([]);
  const [fetchingTenants, setFetchingTenants] = useState(false);
  const [tenantsError, setTenantsError] = useState<string | null>(null);

  // Feature flags state
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagResolution[]>([]);
  const [fetchingFlags, setFetchingFlags] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [selectedTenantChannel, setSelectedTenantChannel] = useState<string | null>(null);

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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("Error calling inspector-tenants:", fnError);
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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("Error calling inspector-feature-flags:", fnError);
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

  function handleTenantSelect(tenantId: string) {
    setSelectedTenantId(tenantId);
    if (tenantId) {
      fetchFeatureFlags(tenantId);
    } else {
      fetchFeatureFlags();
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
        return <Badge variant="default" className="bg-purple-600">Tenant Override</Badge>;
      case "release_channel":
        return <Badge variant="secondary" className="bg-orange-500 text-white">Release Channel</Badge>;
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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const totals = tenants.reduce(
    (acc, t) => ({
      users: acc.users + t.metrics.users_count,
      drivers: acc.drivers + t.metrics.drivers_count,
      vehicles: acc.vehicles + t.metrics.vehicles_count,
      hunts: acc.hunts + t.metrics.active_hunts_count,
    }),
    { users: 0, drivers: 0, vehicles: 0, hunts: 0 }
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
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTenants}
              disabled={fetchingTenants}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchingTenants ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
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
                  Total Vehicles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.vehicles}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Active Hunts
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
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Users</TableHead>
                      <TableHead className="text-right">Drivers</TableHead>
                      <TableHead className="text-right">Vehicles</TableHead>
                      <TableHead className="text-right">Active Hunts</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.tenant_id}>
                        <TableCell className="font-medium">{tenant.tenant_name}</TableCell>
                        <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                        <TableCell>{getChannelBadge(tenant.release_channel)}</TableCell>
                        <TableCell className="text-right">{tenant.metrics.users_count}</TableCell>
                        <TableCell className="text-right">{tenant.metrics.drivers_count}</TableCell>
                        <TableCell className="text-right">{tenant.metrics.vehicles_count}</TableCell>
                        <TableCell className="text-right">{tenant.metrics.active_hunts_count}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(tenant.created_at)}
                        </TableCell>
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
                <Select value={selectedTenantId} onValueChange={handleTenantSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Global (no tenant)</SelectItem>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchFeatureFlags(selectedTenantId || undefined)}
              disabled={fetchingFlags}
            >
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
                {selectedTenantId && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    for {tenants.find(t => t.tenant_id === selectedTenantId)?.tenant_name}
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
                  <p className="text-muted-foreground">
                    {selectedTenantId 
                      ? "No feature flags found. Click refresh to load."
                      : "Select a tenant to view feature flag resolution, or refresh to see global defaults."
                    }
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => fetchFeatureFlags(selectedTenantId || undefined)}
                    disabled={fetchingFlags}
                  >
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
                          <div className="flex justify-center">
                            {getBooleanIcon(flag.effective_value)}
                          </div>
                        </TableCell>
                        <TableCell>{getSourceBadge(flag.source)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            {getBooleanIcon(flag.tenant_override_value)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            {getBooleanIcon(flag.release_channel_value)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            {getBooleanIcon(flag.global_default)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {flag.is_killswitch && (
                            <Badge variant="destructive" className="text-xs">KS</Badge>
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
      </Tabs>
    </div>
  );
}
