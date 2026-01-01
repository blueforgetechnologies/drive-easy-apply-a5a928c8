import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Shield, Database } from "lucide-react";
import { toast } from "sonner";

interface TableAudit {
  table_name: string;
  has_tenant_id: boolean;
  tenant_id_nullable: boolean;
  null_count: number;
  total_rows: number;
  null_percentage: number;
  rls_enabled: boolean;
  has_tenant_policy: boolean;
  counts_by_tenant: { tenant_id: string | null; tenant_name: string | null; count: number }[];
  issues: string[];
}

interface AuditResult {
  success: boolean;
  audited_at: string;
  results: TableAudit[];
  summary: {
    total_tables: number;
    tables_with_tenant_id: number;
    tables_with_issues: number;
    tables_with_nulls: number;
  };
}

export default function IsolationAuditTab() {
  const { isPlatformAdmin } = useTenantContext();
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log("[IsolationAudit] Running audit...");
      
      const { data, error: fnError } = await supabase.functions.invoke("tenant-isolation-audit", {
        body: {},
      });

      if (fnError) {
        throw fnError;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setAuditResult(data);
      toast.success("Audit completed");
    } catch (err: any) {
      console.error("[IsolationAudit] Error:", err);
      setError(err.message || "Failed to run audit");
      toast.error("Audit failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      runAudit();
    }
  }, [isPlatformAdmin]);

  if (!isPlatformAdmin) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <Shield className="h-12 w-12 mx-auto text-destructive mb-4" />
          <p className="text-destructive font-medium">Platform Admin Access Required</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (hasIssues: boolean) => {
    return hasIssues ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : (
      <CheckCircle className="h-4 w-4 text-green-500" />
    );
  };

  const getIssueSeverity = (issue: string): "destructive" | "warning" | "secondary" => {
    if (issue.startsWith("CRITICAL")) return "destructive";
    if (issue.startsWith("WARNING")) return "warning";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Tenant Isolation Audit
          </h2>
          <p className="text-muted-foreground">
            Verify tenant_id columns, RLS policies, and data isolation across all tables
          </p>
        </div>
        <Button onClick={runAudit} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Auditing..." : "Run Audit"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4">
            <p className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {auditResult && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{auditResult.summary.total_tables}</div>
                <p className="text-sm text-muted-foreground">Tables Audited</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">
                  {auditResult.summary.tables_with_tenant_id}
                </div>
                <p className="text-sm text-muted-foreground">Have tenant_id</p>
              </CardContent>
            </Card>
            <Card className={auditResult.summary.tables_with_issues > 0 ? "border-destructive" : ""}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.tables_with_issues > 0 ? "text-destructive" : "text-green-600"}`}>
                  {auditResult.summary.tables_with_issues}
                </div>
                <p className="text-sm text-muted-foreground">Tables with Issues</p>
              </CardContent>
            </Card>
            <Card className={auditResult.summary.tables_with_nulls > 0 ? "border-yellow-500" : ""}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.tables_with_nulls > 0 ? "text-yellow-600" : "text-green-600"}`}>
                  {auditResult.summary.tables_with_nulls}
                </div>
                <p className="text-sm text-muted-foreground">Have NULL tenant_id</p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Audited at: {new Date(auditResult.audited_at).toLocaleString()}
          </p>

          {/* Detailed Results */}
          <Card>
            <CardHeader>
              <CardTitle>Table-by-Table Audit</CardTitle>
              <CardDescription>
                Review each table's tenant isolation status. Issues highlighted in red need attention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Has tenant_id</TableHead>
                      <TableHead>Nullable</TableHead>
                      <TableHead>NULL Rows</TableHead>
                      <TableHead>Total Rows</TableHead>
                      <TableHead>Tenant Policy</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.results.map((table) => (
                      <TableRow
                        key={table.table_name}
                        className={table.issues.length > 0 ? "bg-destructive/5" : ""}
                      >
                        <TableCell>{getStatusIcon(table.issues.length > 0)}</TableCell>
                        <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                        <TableCell>
                          {table.has_tenant_id ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="destructive">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {table.has_tenant_id ? (
                            table.tenant_id_nullable ? (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                Nullable
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                NOT NULL
                              </Badge>
                            )
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {table.null_count > 0 ? (
                            <span className="text-destructive font-medium">
                              {table.null_count} ({table.null_percentage}%)
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>{table.total_rows}</TableCell>
                        <TableCell>
                          {table.has_tenant_policy ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              Unknown
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {table.issues.length === 0 ? (
                              <span className="text-green-600 text-sm">None</span>
                            ) : (
                              table.issues.map((issue, idx) => (
                                <Badge
                                  key={idx}
                                  variant={getIssueSeverity(issue) as any}
                                  className="text-xs"
                                >
                                  {issue}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Counts by Tenant - Expandable */}
          <Card>
            <CardHeader>
              <CardTitle>Row Distribution by Tenant</CardTitle>
              <CardDescription>
                Shows how data is distributed across tenants for each table
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auditResult.results
                  .filter((t) => t.counts_by_tenant.length > 0)
                  .map((table) => (
                    <details key={table.table_name} className="border rounded-lg p-3">
                      <summary className="cursor-pointer font-medium flex items-center gap-2">
                        <span className="font-mono text-sm">{table.table_name}</span>
                        <span className="text-muted-foreground text-sm">
                          ({table.total_rows} rows across {table.counts_by_tenant.length} tenant(s))
                        </span>
                      </summary>
                      <div className="mt-2 pl-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tenant</TableHead>
                              <TableHead>Tenant ID</TableHead>
                              <TableHead>Row Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {table.counts_by_tenant.map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  {item.tenant_id === null ? (
                                    <span className="text-destructive font-medium">(NULL)</span>
                                  ) : (
                                    item.tenant_name
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {item.tenant_id || "-"}
                                </TableCell>
                                <TableCell>{item.count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Fix Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Fix Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li><strong>Missing tenant_id:</strong> Add column with migration, then backfill existing rows</li>
            <li><strong>Nullable tenant_id:</strong> Backfill NULL rows, then ALTER to NOT NULL</li>
            <li><strong>No tenant RLS policy:</strong> Add RLS policy with <code>tenant_id = get_user_tenant_id(auth.uid())</code></li>
            <li><strong>UI queries:</strong> Ensure all list queries use <code>useTenantId()</code> or <code>useTenantFilter()</code></li>
            <li><strong>Inserts:</strong> Server-side edge functions must derive tenant_id from auth context</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
