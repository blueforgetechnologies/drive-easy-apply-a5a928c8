import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Database, Shield } from "lucide-react";
import { toast } from "sonner";

interface TenantDataRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  release_channel: string;
  entity: string;
  count: number;
}

interface DebugData {
  success: boolean;
  results: TenantDataRow[];
  totals: {
    vehicles: number;
    loads: number;
  };
}

export default function DebugTenantDataTab() {
  const navigate = useNavigate();
  const { effectiveTenant, isPlatformAdmin, isImpersonating } = useTenantContext();
  const { tenantId, showAllTenants } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DebugData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Redirect non-admins
    if (!isPlatformAdmin) {
      toast.error("Platform admin access required");
      navigate("/dashboard");
      return;
    }
    loadData();
  }, [isPlatformAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "debug-tenant-data"
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      setData(result);
    } catch (err: any) {
      console.error("Failed to load debug data:", err);
      setError(err.message || "Failed to load data");
      toast.error("Failed to load tenant data");
    } finally {
      setLoading(false);
    }
  };

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Warning Banner */}
      <div className="bg-destructive/90 text-destructive-foreground px-4 py-3 rounded-lg flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="flex-1">
          <p className="font-bold">DEBUG ONLY — REMOVE AFTER TENANT VERIFICATION</p>
          <p className="text-sm opacity-90">
            This page queries ALL tenant data using service role. For verification only.
          </p>
        </div>
      </div>

      {/* Current Context Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Current Effective Tenant Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Tenant ID</p>
              <p className="font-mono text-sm break-all">
                {effectiveTenant?.id || <span className="text-muted-foreground">None</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Name</p>
              <p className="font-medium">
                {effectiveTenant?.name || <span className="text-muted-foreground">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Release Channel</p>
              <Badge variant="outline" className="mt-1">
                {effectiveTenant?.release_channel || "—"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">State</p>
              <div className="flex items-center gap-2 mt-1">
                {isImpersonating ? (
                  <Badge className="bg-amber-500 text-black">Impersonating</Badge>
                ) : (
                  <Badge variant="secondary">Normal</Badge>
                )}
                {showAllTenants && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    All Tenants
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interpretation Guide */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p>
                <strong>If counts do NOT change when switching tenants →</strong>{" "}
                <span className="text-destructive">Data is shared (isolation broken)</span>
              </p>
              <p>
                <strong>If counts change when switching tenants →</strong>{" "}
                <span className="text-green-600">UI queries may be wrong (or data is isolated)</span>
              </p>
              <p className="text-muted-foreground">
                Compare these server-side counts with what you see in the UI after switching tenants.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Tenant Data Counts (Server-Side)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8 text-destructive">
              <p className="font-medium">Error loading data</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading tenant data...
            </div>
          ) : data ? (
            <>
              {/* Totals */}
              <div className="flex gap-6 mb-4 pb-4 border-b">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Total Vehicles</span>
                  <p className="text-2xl font-bold">{data.totals.vehicles}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Total Loads</span>
                  <p className="text-2xl font-bold">{data.totals.loads}</p>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead>Match?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No data found
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.results.map((row, idx) => {
                        const isCurrentTenant = row.tenant_id === tenantId;
                        return (
                          <TableRow
                            key={`${row.tenant_id}-${row.entity}`}
                            className={isCurrentTenant ? "bg-primary/5" : ""}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {row.tenant_name}
                                {isCurrentTenant && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                    Current
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                                {row.tenant_id}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{row.tenant_slug}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {row.release_channel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  row.entity === "vehicles"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-green-100 text-green-800"
                                }
                              >
                                {row.entity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {row.count}
                            </TableCell>
                            <TableCell>
                              {isCurrentTenant ? (
                                <span className="text-xs text-muted-foreground">
                                  Check UI
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
