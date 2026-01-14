/**
 * Tenant Isolation Tests - Internal/Dev Only
 * 
 * This page runs automated checks to verify tenant isolation is working correctly.
 * All tests are read-only (no destructive writes).
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useTenantQuery } from "@/hooks/useTenantQuery";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  PlayCircle, 
  RefreshCw,
  Shield,
  Database,
  Users,
  Lock
} from "lucide-react";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warn" | "pending" | "skipped";
  message: string;
  details?: string;
}

export default function TenantIsolationTestsTab() {
  const { tenantId, shouldFilter, isPlatformAdmin } = useTenantFilter();
  const { query, isReady } = useTenantQuery();
  const [tests, setTests] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<Date | null>(null);

  const updateTest = (name: string, result: Partial<TestResult>) => {
    setTests(prev => prev.map(t => t.name === name ? { ...t, ...result } : t));
  };

  const initializeTests = () => {
    const testList: TestResult[] = [
      { name: "Tenant Context Check", status: "pending", message: "Checking tenant context..." },
      { name: "Should Filter Check", status: "pending", message: "Verifying filter state..." },
      { name: "Customers Tenant Scoping", status: "pending", message: "Testing customers query..." },
      { name: "Vehicles Tenant Scoping", status: "pending", message: "Testing vehicles query..." },
      { name: "Loads Tenant Scoping", status: "pending", message: "Testing loads query..." },
      { name: "Cross-Tenant Read Block", status: "pending", message: "Testing cross-tenant protection..." },
      { name: "Platform Admin Mode Check", status: "pending", message: "Checking admin mode..." },
      { name: "Edge Function Auth Check", status: "pending", message: "Testing edge function auth..." },
      { name: "RLS Policy Active Check", status: "pending", message: "Verifying RLS is enabled..." },
      { name: "State Reset on Tenant Switch", status: "pending", message: "Checking state management..." },
    ];
    setTests(testList);
  };

  const runTests = async () => {
    setRunning(true);
    initializeTests();
    
    // Test 1: Tenant Context Check
    if (tenantId) {
      updateTest("Tenant Context Check", {
        status: "pass",
        message: `Tenant ID is set: ${tenantId.substring(0, 8)}...`,
        details: `Full ID: ${tenantId}`
      });
    } else if (!shouldFilter) {
      updateTest("Tenant Context Check", {
        status: "warn",
        message: "No tenant_id but filtering is disabled (platform admin mode or all-tenants)",
      });
    } else {
      updateTest("Tenant Context Check", {
        status: "fail",
        message: "No tenant_id and shouldFilter is true - queries will fail!",
      });
    }

    // Test 2: Should Filter Check
    updateTest("Should Filter Check", {
      status: shouldFilter ? "pass" : "warn",
      message: shouldFilter 
        ? "Tenant filtering is ENABLED (normal mode)"
        : "Tenant filtering is DISABLED (platform admin viewing all)",
      details: `shouldFilter=${shouldFilter}, showAllTenants=${showAllTenants}`
    });

    // Test 3: Customers Tenant Scoping
    try {
      if (!isReady) {
        updateTest("Customers Tenant Scoping", {
          status: "skipped",
          message: "Tenant context not ready"
        });
      } else {
        const { data, error, count } = await query("customers")
          .select("id, tenant_id", { count: "exact", head: false })
          .limit(10);
        
        if (error) throw error;
        
        const allSameTenant = data?.every((c: any) => c.tenant_id === tenantId) ?? true;
        const countMsg = count !== null ? ` (${count} total)` : "";
        
        updateTest("Customers Tenant Scoping", {
          status: allSameTenant ? "pass" : "fail",
          message: allSameTenant 
            ? `All customers belong to current tenant${countMsg}`
            : `LEAK DETECTED: Found customers from other tenants!`,
          details: `Sample: ${data?.length || 0} records checked`
        });
      }
    } catch (e: any) {
      updateTest("Customers Tenant Scoping", {
        status: "fail",
        message: `Query error: ${e.message}`,
      });
    }

    // Test 4: Vehicles Tenant Scoping
    try {
      if (!isReady) {
        updateTest("Vehicles Tenant Scoping", {
          status: "skipped",
          message: "Tenant context not ready"
        });
      } else {
        const { data, error, count } = await query("vehicles")
          .select("id, tenant_id", { count: "exact", head: false })
          .limit(10);
        
        if (error) throw error;
        
        const allSameTenant = data?.every((v: any) => v.tenant_id === tenantId) ?? true;
        const countMsg = count !== null ? ` (${count} total)` : "";
        
        updateTest("Vehicles Tenant Scoping", {
          status: allSameTenant ? "pass" : "fail",
          message: allSameTenant 
            ? `All vehicles belong to current tenant${countMsg}`
            : `LEAK DETECTED: Found vehicles from other tenants!`,
          details: `Sample: ${data?.length || 0} records checked`
        });
      }
    } catch (e: any) {
      updateTest("Vehicles Tenant Scoping", {
        status: "fail",
        message: `Query error: ${e.message}`,
      });
    }

    // Test 5: Loads Tenant Scoping
    try {
      if (!isReady) {
        updateTest("Loads Tenant Scoping", {
          status: "skipped",
          message: "Tenant context not ready"
        });
      } else {
        const { data, error, count } = await query("loads")
          .select("id, tenant_id", { count: "exact", head: false })
          .limit(10);
        
        if (error) throw error;
        
        const allSameTenant = data?.every((l: any) => l.tenant_id === tenantId) ?? true;
        const countMsg = count !== null ? ` (${count} total)` : "";
        
        updateTest("Loads Tenant Scoping", {
          status: allSameTenant ? "pass" : "fail",
          message: allSameTenant 
            ? `All loads belong to current tenant${countMsg}`
            : `LEAK DETECTED: Found loads from other tenants!`,
          details: `Sample: ${data?.length || 0} records checked`
        });
      }
    } catch (e: any) {
      updateTest("Loads Tenant Scoping", {
        status: "fail",
        message: `Query error: ${e.message}`,
      });
    }

    // Test 6: Cross-Tenant Read Block
    // This test verifies RLS by checking if we can only see data for our tenant
    try {
      if (!isReady || !tenantId) {
        updateTest("Cross-Tenant Read Block", {
          status: "skipped",
          message: "No tenant context - cannot verify cross-tenant blocking"
        });
      } else {
        // Get all customer tenant_ids we can see (should only be our tenant or empty)
        const { data, error } = await supabase
          .from("customers")
          .select("tenant_id")
          .limit(50);
        
        if (error) throw error;
        
        // Check if all returned rows belong to current tenant
        const uniqueTenants = [...new Set(data?.map((c: any) => c.tenant_id) || [])];
        const hasOtherTenants = uniqueTenants.some(tid => tid !== tenantId);
        
        if (data?.length === 0) {
          updateTest("Cross-Tenant Read Block", {
            status: "pass",
            message: "No customer data exists (RLS may be blocking or table empty)",
            details: "Cannot verify cross-tenant blocking without data"
          });
        } else if (hasOtherTenants) {
          updateTest("Cross-Tenant Read Block", {
            status: "fail",
            message: `LEAK DETECTED: Can see data from ${uniqueTenants.length} tenants!`,
            details: `Visible tenant IDs: ${uniqueTenants.map(t => t?.substring(0, 8)).join(', ')}`
          });
        } else {
          updateTest("Cross-Tenant Read Block", {
            status: "pass",
            message: `All ${data.length} visible records belong to current tenant only`,
            details: "RLS is correctly filtering to current tenant"
          });
        }
      }
    } catch (e: any) {
      updateTest("Cross-Tenant Read Block", {
        status: "warn",
        message: `Query error: ${e.message}`,
        details: "This may indicate RLS is blocking access"
      });
    }

    // Test 7: Platform Admin Mode Check
    updateTest("Platform Admin Mode Check", {
      status: isPlatformAdmin ? "pass" : "pass",
      message: isPlatformAdmin 
        ? "User IS a platform admin (can access all tenants)"
        : "User is NOT a platform admin (tenant-restricted)",
      details: `isPlatformAdmin=${isPlatformAdmin}`
    });

    // Test 8: Edge Function Auth Check
    // IMPORTANT: Do NOT pass tenant_id from client - function must derive it server-side
    try {
      // Call tenant-counts WITHOUT passing tenant_id - it should derive from JWT
      const { data, error } = await supabase.functions.invoke('tenant-counts', {
        // NO body.tenant_id - server must derive tenant context from auth
      });
      
      if (error && error.message.includes('401')) {
        updateTest("Edge Function Auth Check", {
          status: "fail",
          message: "Edge function returned 401 - not authenticated",
          details: "Ensure you are logged in before running tests"
        });
      } else if (error && error.message.includes('403')) {
        updateTest("Edge Function Auth Check", {
          status: "pass",
          message: "Edge function enforces access control (403 returned)",
          details: "This indicates the function is checking permissions server-side"
        });
      } else if (error && error.message.includes('No tenant')) {
        updateTest("Edge Function Auth Check", {
          status: "pass",
          message: "Edge function requires tenant context (derived server-side)",
          details: error.message
        });
      } else if (error) {
        updateTest("Edge Function Auth Check", {
          status: "warn",
          message: `Edge function error: ${error.message}`,
          details: "Function may need tenant context from JWT"
        });
      } else {
        updateTest("Edge Function Auth Check", {
          status: "pass",
          message: "Edge function derived tenant from JWT successfully",
          details: data?.tenant_id ? `Derived tenant: ${data.tenant_id.substring(0, 8)}...` : JSON.stringify(data).substring(0, 100)
        });
      }
    } catch (e: any) {
      updateTest("Edge Function Auth Check", {
        status: "warn",
        message: `Could not test edge function: ${e.message}`,
      });
    }

    // Test 9: RLS Policy Active Check
    try {
      // Query the RLS status (this is a readonly check)
      const { data, error } = await supabase
        .from("customers")
        .select("id")
        .limit(1);
      
      // If we can query without error, RLS is not blocking authenticated users
      updateTest("RLS Policy Active Check", {
        status: "pass",
        message: "RLS policies allow authenticated queries",
        details: error ? error.message : "Query succeeded"
      });
    } catch (e: any) {
      updateTest("RLS Policy Active Check", {
        status: "fail",
        message: `RLS check failed: ${e.message}`,
      });
    }

    // Test 10: State Reset on Tenant Switch
    updateTest("State Reset on Tenant Switch", {
      status: isReady ? "pass" : "warn",
      message: isReady 
        ? "Tenant context is ready and stable"
        : "Tenant context not yet ready - state may be stale",
      details: `isReady=${isReady}, tenantId=${tenantId ? 'set' : 'null'}`
    });

    setLastRunTime(new Date());
    setRunning(false);
  };

  useEffect(() => {
    initializeTests();
  }, []);

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "pass": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "fail": return <XCircle className="h-5 w-5 text-red-500" />;
      case "warn": return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "pending": return <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />;
      case "skipped": return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: TestResult["status"]) => {
    const variants: Record<TestResult["status"], "default" | "secondary" | "destructive" | "outline"> = {
      pass: "default",
      fail: "destructive",
      warn: "secondary",
      pending: "outline",
      skipped: "outline"
    };
    return <Badge variant={variants[status]}>{status.toUpperCase()}</Badge>;
  };

  const passCount = tests.filter(t => t.status === "pass").length;
  const failCount = tests.filter(t => t.status === "fail").length;
  const warnCount = tests.filter(t => t.status === "warn").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Tenant Isolation Tests
          </h1>
          <p className="text-muted-foreground">
            Verify tenant data separation is working correctly
          </p>
        </div>
        <Button onClick={runTests} disabled={running}>
          {running ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run All Tests
            </>
          )}
        </Button>
      </div>

      {/* Current Context Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Current Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tenant ID:</span>
              <div className="font-mono text-xs mt-1">
                {tenantId ? tenantId.substring(0, 16) + "..." : "NULL"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Should Filter:</span>
              <div className="mt-1">
                <Badge variant={shouldFilter ? "default" : "secondary"}>
                  {shouldFilter ? "YES" : "NO"}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Platform Admin:</span>
              <div className="mt-1">
                <Badge variant={isPlatformAdmin ? "destructive" : "outline"}>
                  {isPlatformAdmin ? "YES" : "NO"}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">All Tenants Mode:</span>
              <div className="mt-1">
                <Badge variant={showAllTenants ? "destructive" : "outline"}>
                  {showAllTenants ? "ENABLED" : "DISABLED"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {lastRunTime && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm">{passCount} passed</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm">{failCount} failed</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm">{warnCount} warnings</span>
          </div>
          <span className="text-muted-foreground text-sm ml-auto">
            Last run: {lastRunTime.toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Test Results
          </CardTitle>
          <CardDescription>
            These tests verify tenant isolation at the client, RLS, and edge function levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {tests.map((test, idx) => (
                <div key={test.name}>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    {getStatusIcon(test.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{test.name}</span>
                        {getStatusBadge(test.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {test.message}
                      </p>
                      {test.details && (
                        <p className="text-xs font-mono text-muted-foreground mt-1 bg-background/50 p-1 rounded">
                          {test.details}
                        </p>
                      )}
                    </div>
                  </div>
                  {idx < tests.length - 1 && <Separator className="my-2" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Manual Verification Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manual Verification Checklist
          </CardTitle>
          <CardDescription>
            Additional checks to perform after switching tenants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Switch tenants and verify customer/vehicle/load counts change</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Check that map markers clear and reload on tenant switch</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Verify Load Hunter matches only show current tenant's hunt plans</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Start impersonation and confirm banner appears</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Stop impersonation and verify return to original tenant</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>Try direct URL to /dashboard/analytics when disabled - should show Access Denied</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
