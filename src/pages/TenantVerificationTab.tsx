import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Database, Truck, Package, Zap } from "lucide-react";
import { toast } from "sonner";

interface TenantCount {
  tenant_id: string;
  tenant_name: string;
  vehicles: number;
  loads: number;
}

interface CountsData {
  success: boolean;
  requested_tenant_id: string | null;
  scoped: { vehicles: number; loads: number } | null;
  global_by_tenant: TenantCount[];
}

interface SeedResult {
  success: boolean;
  tenant_id: string;
  vehicles_created: number;
  loads_created: number;
  message: string;
}

export default function TenantVerificationTab() {
  const navigate = useNavigate();
  const { effectiveTenant, isPlatformAdmin, isImpersonating } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [countsData, setCountsData] = useState<CountsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[TenantVerification] effectiveTenant:", effectiveTenant);
  }, [effectiveTenant]);

  useEffect(() => {
    if (!isPlatformAdmin) {
      toast.error("Platform admin access required");
      navigate("/dashboard");
      return;
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (isPlatformAdmin && effectiveTenant?.id) {
      refreshCounts();
    }
  }, [isPlatformAdmin, effectiveTenant?.id]);

  const refreshCounts = async () => {
    if (!effectiveTenant?.id) {
      setError("No effective tenant selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[TenantVerification] Calling tenant-counts with tenant_id:", effectiveTenant.id);
      const { data, error: fnError } = await supabase.functions.invoke("tenant-counts", {
        body: { tenant_id: effectiveTenant.id },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      console.log("[TenantVerification] Counts result:", data);
      setCountsData(data);
    } catch (err: any) {
      console.error("[TenantVerification] Error:", err);
      setError(err.message || "Failed to load counts");
      toast.error("Failed to load tenant counts");
    } finally {
      setLoading(false);
    }
  };

  const seedData = async () => {
    if (!effectiveTenant?.id) {
      toast.error("No effective tenant selected");
      return;
    }

    setSeeding(true);

    try {
      console.log("[TenantVerification] Seeding data for tenant:", effectiveTenant.id);
      const { data, error: fnError } = await supabase.functions.invoke("tenant-seed-data", {
        body: {
          tenant_id: effectiveTenant.id,
          vehicles: 5,
          loads: 5,
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const result = data as SeedResult;
      toast.success(result.message);
      console.log("[TenantVerification] Seed result:", result);

      // Refresh counts after seeding
      await refreshCounts();
    } catch (err: any) {
      console.error("[TenantVerification] Seed error:", err);
      toast.error(err.message || "Failed to seed data");
    } finally {
      setSeeding(false);
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
            This page creates test data and queries counts using service role. For verification only.
          </p>
        </div>
      </div>

      {/* Current Effective Tenant */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Current Effective Tenant</CardTitle>
        </CardHeader>
        <CardContent>
          {effectiveTenant ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Tenant ID</p>
                <p className="font-mono text-sm break-all">{effectiveTenant.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Name</p>
                <p className="font-medium">{effectiveTenant.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Channel</p>
                <Badge variant="outline">{effectiveTenant.release_channel || "—"}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">State</p>
                {isImpersonating ? (
                  <Badge className="bg-amber-500 text-black">Impersonating</Badge>
                ) : (
                  <Badge variant="secondary">Normal</Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-destructive font-medium">No effective tenant selected!</p>
          )}
        </CardContent>
      </Card>

      {/* Scoped Counts Card - THE KEY DISPLAY */}
      <Card className="border-primary border-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-primary" />
            SCOPED COUNTS (should change when switching tenants)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : error ? (
            <div className="text-destructive">{error}</div>
          ) : countsData?.scoped ? (
            <div className="grid grid-cols-2 gap-8">
              <div className="flex items-center gap-4">
                <Truck className="h-10 w-10 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Vehicles</p>
                  <p className="text-4xl font-bold">{countsData.scoped.vehicles}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Package className="h-10 w-10 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Loads</p>
                  <p className="text-4xl font-bold">{countsData.scoped.loads}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-amber-600">No tenant selected or no data available</p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button onClick={seedData} disabled={seeding || !effectiveTenant?.id} variant="default">
          <Zap className={`h-4 w-4 mr-2 ${seeding ? "animate-pulse" : ""}`} />
          {seeding ? "Seeding..." : "Seed 5 Vehicles + 5 Loads"}
        </Button>
        <Button onClick={refreshCounts} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Counts
        </Button>
      </div>

      {/* Interpretation */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="py-4">
          <div className="text-sm space-y-2">
            <p>
              <strong>Test procedure:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Note the current scoped counts above</li>
              <li>Switch to a different tenant using the Tenant Switcher in the header</li>
              <li>Return to this page and click "Refresh Counts"</li>
              <li>
                <strong>If counts change:</strong>{" "}
                <span className="text-green-600">✓ Tenant isolation is working</span>
              </li>
              <li>
                <strong>If counts stay the same:</strong>{" "}
                <span className="text-destructive">✗ Bug in tenant_id filtering</span>
              </li>
            </ol>
            <p className="mt-3">
              Use "Seed 5 Vehicles + 5 Loads" to create test data for the current tenant, then switch
              tenants and verify counts differ.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Global Counts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Global Counts by Tenant (for comparison)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : countsData?.global_by_tenant ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Vehicles</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead>Current?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countsData.global_by_tenant.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    countsData.global_by_tenant.map((row) => {
                      const isCurrent = row.tenant_id === effectiveTenant?.id;
                      return (
                        <TableRow key={row.tenant_id} className={isCurrent ? "bg-primary/10" : ""}>
                          <TableCell>
                            <div className="font-medium">{row.tenant_name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
                              {row.tenant_id}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {row.vehicles}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {row.loads}
                          </TableCell>
                          <TableCell>
                            {isCurrent && (
                              <Badge variant="default" className="text-xs">
                                Current
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
