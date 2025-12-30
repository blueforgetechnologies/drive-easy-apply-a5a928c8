import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, Building2, Users, Truck, Target, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function Inspector() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tenants, setTenants] = useState<TenantMetrics[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Check admin role (Platform Admin)
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
      
      // Fetch tenant data after authorization
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
    setFetching(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("inspector-tenants", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("Error calling inspector-tenants:", fnError);
        setError(fnError.message || "Failed to fetch tenant data");
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      setTenants(data?.tenants || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("An unexpected error occurred");
    } finally {
      setFetching(false);
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
      default:
        return <Badge variant="outline">{channel || "—"}</Badge>;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Calculate totals
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <h1 className="text-2xl font-semibold">Platform Inspector</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTenants}
          disabled={fetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
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

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tenants Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {fetching && tenants.length === 0 ? (
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
    </div>
  );
}
