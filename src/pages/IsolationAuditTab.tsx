import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Shield, Database, Trash2, Wrench, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface TableAudit {
  table_name: string;
  has_tenant_id: boolean;
  tenant_id_nullable: boolean;
  total_rows: number;
  rows_with_null_tenant_id: number;
  rows_for_requested_tenant: number;
  rows_for_other_tenants: number;
  null_sample_ids: string[];
  other_tenant_sample_ids: string[];
  status: 'green' | 'yellow' | 'red';
  issues: string[];
}

interface AuditResult {
  success: boolean;
  audited_at: string;
  requested_tenant_id: string | null;
  requested_tenant_name: string | null;
  results: TableAudit[];
  summary: {
    total_tables: number;
    green_tables: number;
    yellow_tables: number;
    red_tables: number;
    total_null_rows: number;
    total_leaked_rows: number;
  };
}

export default function IsolationAuditTab() {
  const { effectiveTenant, isPlatformAdmin } = useTenantContext();
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Remediation dialogs
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wipeLoading, setWipeLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillDryRun, setBackfillDryRun] = useState(true);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log("[IsolationAudit] Running audit for tenant:", effectiveTenant?.id);
      
      const { data, error: fnError } = await supabase.functions.invoke("tenant-isolation-audit", {
        body: { tenant_id: effectiveTenant?.id },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

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

  const handleWipe = async () => {
    if (wipeConfirmText !== "WIPE") return;
    
    setWipeLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("tenant-wipe-test-data", {
        body: { confirm: true, tenant_id: effectiveTenant?.id },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      toast.success(`Wiped ${data.total_deleted} rows`);
      setWipeDialogOpen(false);
      setWipeConfirmText("");
      runAudit(); // Refresh
    } catch (err: any) {
      toast.error("Wipe failed: " + (err.message || "Unknown error"));
    } finally {
      setWipeLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfillLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("tenant-backfill-null", {
        body: { 
          confirm: true, 
          dry_run: backfillDryRun,
          default_tenant_id: effectiveTenant?.id,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (backfillDryRun) {
        toast.info(`Dry run: Would update ${data.total_updated} rows, skip ${data.total_skipped}`);
      } else {
        toast.success(`Backfilled ${data.total_updated} rows`);
        runAudit(); // Refresh
      }
      setBackfillDialogOpen(false);
    } catch (err: any) {
      toast.error("Backfill failed: " + (err.message || "Unknown error"));
    } finally {
      setBackfillLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      runAudit();
    }
  }, [isPlatformAdmin, effectiveTenant?.id]);

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

  const getStatusIcon = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'yellow':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'red':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return <Badge className="bg-green-100 text-green-800 border-green-200">ISOLATED</Badge>;
      case 'yellow':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">NULL DATA</Badge>;
      case 'red':
        return <Badge variant="destructive">LEAK DETECTED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Tenant Isolation Audit
          </h2>
          <p className="text-muted-foreground">
            Current Tenant: <span className="font-mono text-sm">{effectiveTenant?.name}</span>
            <span className="text-xs ml-2 opacity-60">({effectiveTenant?.id})</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runAudit} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Auditing..." : "Run Audit"}
          </Button>
          <Button variant="outline" onClick={() => setBackfillDialogOpen(true)}>
            <Wrench className="h-4 w-4 mr-2" />
            Backfill NULLs
          </Button>
          <Button variant="destructive" onClick={() => setWipeDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Wipe Test Data
          </Button>
        </div>
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{auditResult.summary.total_tables}</div>
                <p className="text-sm text-muted-foreground">Tables</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{auditResult.summary.green_tables}</div>
                <p className="text-sm text-muted-foreground">Isolated</p>
              </CardContent>
            </Card>
            <Card className={auditResult.summary.yellow_tables > 0 ? "border-yellow-500" : ""}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.yellow_tables > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
                  {auditResult.summary.yellow_tables}
                </div>
                <p className="text-sm text-muted-foreground">With NULLs</p>
              </CardContent>
            </Card>
            <Card className={auditResult.summary.red_tables > 0 ? "border-destructive" : ""}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.red_tables > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {auditResult.summary.red_tables}
                </div>
                <p className="text-sm text-muted-foreground">Leaking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.total_null_rows > 0 ? "text-yellow-600" : ""}`}>
                  {auditResult.summary.total_null_rows}
                </div>
                <p className="text-sm text-muted-foreground">NULL Rows</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${auditResult.summary.total_leaked_rows > 0 ? "text-destructive" : ""}`}>
                  {auditResult.summary.total_leaked_rows}
                </div>
                <p className="text-sm text-muted-foreground">Leaked Rows</p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Audited at: {new Date(auditResult.audited_at).toLocaleString()} • 
            Tenant: {auditResult.requested_tenant_name} ({auditResult.requested_tenant_id})
          </p>

          {/* Detailed Results */}
          <Card>
            <CardHeader>
              <CardTitle>Table-by-Table Results</CardTitle>
              <CardDescription>
                <span className="inline-flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> GREEN = Isolated</span>
                <span className="inline-flex items-center gap-1 ml-4"><AlertCircle className="h-3 w-3 text-yellow-500" /> YELLOW = Has NULLs</span>
                <span className="inline-flex items-center gap-1 ml-4"><XCircle className="h-3 w-3 text-destructive" /> RED = Data Leak</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Status</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">This Tenant</TableHead>
                      <TableHead className="text-right">Other Tenants</TableHead>
                      <TableHead className="text-right">NULL tenant_id</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.results.map((table) => (
                      <TableRow
                        key={table.table_name}
                        className={
                          table.status === 'red' ? "bg-destructive/5" :
                          table.status === 'yellow' ? "bg-yellow-50 dark:bg-yellow-900/10" : ""
                        }
                      >
                        <TableCell>{getStatusIcon(table.status)}</TableCell>
                        <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                        <TableCell className="text-right">{table.total_rows}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {table.rows_for_requested_tenant}
                        </TableCell>
                        <TableCell className="text-right">
                          {table.rows_for_other_tenants > 0 ? (
                            <span className="text-destructive font-bold">{table.rows_for_other_tenants}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {table.rows_with_null_tenant_id > 0 ? (
                            <span className="text-yellow-600 font-medium">{table.rows_with_null_tenant_id}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {table.issues.length === 0 ? (
                            <span className="text-green-600 text-sm">✓ Clean</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {table.issues.map((issue, idx) => (
                                <span key={idx} className="text-xs text-muted-foreground">{issue}</span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Sample IDs for investigation */}
          {auditResult.results.some(t => t.null_sample_ids.length > 0 || t.other_tenant_sample_ids.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Sample Row IDs for Investigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {auditResult.results
                  .filter(t => t.null_sample_ids.length > 0 || t.other_tenant_sample_ids.length > 0)
                  .map((table) => (
                    <div key={table.table_name} className="border rounded p-3">
                      <div className="font-mono text-sm font-medium mb-2">{table.table_name}</div>
                      {table.null_sample_ids.length > 0 && (
                        <div className="text-xs">
                          <span className="text-yellow-600 font-medium">NULL tenant_id: </span>
                          {table.null_sample_ids.join(', ')}
                        </div>
                      )}
                      {table.other_tenant_sample_ids.length > 0 && (
                        <div className="text-xs mt-1">
                          <span className="text-destructive font-medium">Other tenants: </span>
                          {table.other_tenant_sample_ids.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Wipe Dialog */}
      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Wipe Test Data
            </DialogTitle>
            <DialogDescription>
              This will DELETE all data for tenant: <strong>{effectiveTenant?.name}</strong>
              <br />
              <span className="text-destructive">This action cannot be undone!</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type "WIPE" to confirm</Label>
              <Input 
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
                placeholder="WIPE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWipeDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleWipe}
              disabled={wipeConfirmText !== "WIPE" || wipeLoading}
            >
              {wipeLoading ? "Wiping..." : "Wipe All Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backfill Dialog */}
      <Dialog open={backfillDialogOpen} onOpenChange={setBackfillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Backfill NULL tenant_id
            </DialogTitle>
            <DialogDescription>
              This will set tenant_id to <strong>{effectiveTenant?.name}</strong> for rows with NULL tenant_id.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="dryRun" 
                checked={backfillDryRun}
                onCheckedChange={(checked) => setBackfillDryRun(!!checked)}
              />
              <Label htmlFor="dryRun">Dry run (preview only, no changes)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackfillDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBackfill} disabled={backfillLoading}>
              {backfillLoading ? "Processing..." : backfillDryRun ? "Preview Changes" : "Apply Backfill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
