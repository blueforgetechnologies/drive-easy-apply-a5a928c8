import { useState } from "react";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Database, Inbox, Mail, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { toast } from "sonner";

interface TimeWindowMetrics {
  window_label: string;
  window_minutes: number;
  email_content_unique_count: number;
  email_content_total_receipts: number;
  email_content_dup_savings_pct: number;
  email_content_payload_url_populated_pct: number;
  email_queue_total_count: number;
  email_queue_unique_dedupe_keys: number;
  email_queue_dedup_collision_count: number;
  unroutable_count: number;
  unroutable_pct: number;
}

interface RecentContentExample {
  provider: string;
  content_hash_prefix: string;
  receipt_count: number;
  payload_url_present: boolean;
  last_seen_at: string;
}

interface RecentUnroutableExample {
  received_at: string;
  failure_reason: string | null;
  extracted_alias: string | null;
  delivered_to_header: string | null;
}

interface DedupCostData {
  generated_at: string;
  metrics: TimeWindowMetrics[];
  health_status: {
    overall: "healthy" | "warning" | "critical";
    unroutable_15m: "healthy" | "warning" | "critical";
    payload_url_pct: "healthy" | "warning" | "critical";
    queue_collisions: "healthy" | "warning" | "critical";
  };
  recent_content_examples: RecentContentExample[];
  recent_unroutable_examples: RecentUnroutableExample[];
}

type HealthStatus = "healthy" | "warning" | "critical";

function getStatusIcon(status: HealthStatus): React.ReactNode {
  switch (status) {
    case "healthy":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "critical":
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <CheckCircle className="w-4 h-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: HealthStatus): React.ReactNode {
  switch (status) {
    case "healthy":
      return (
        <Badge variant="default" className="bg-green-500/20 text-green-700 border-green-500/30">
          ✅ Healthy
        </Badge>
      );
    case "warning":
      return (
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
          ⚠️ Warning
        </Badge>
      );
    case "critical":
      return <Badge variant="destructive">🔴 Critical</Badge>;
    default:
      return <Badge variant="secondary">Unknown</Badge>;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export default function DedupCostTab() {
  const [data, setData] = useState<DedupCostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }

      const { data: responseData, error: fnError } = await supabase.functions.invoke(
        "inspector-dedup-cost",
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (fnError) {
        setError(fnError.message || "Failed to fetch dedup cost data");
        return;
      }

      if (responseData?.error) {
        setError(responseData.error);
        return;
      }

      setData(responseData);
      toast.success("Dedup & Cost metrics refreshed");
    } catch (err) {
      console.error("Error fetching dedup cost data:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dedup & Cost Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Email content deduplication, queue dedup, and unroutable analysis
          </p>
        </div>
        <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {data ? "Refresh" : "Load Metrics"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Click &quot;Load Metrics&quot; to fetch dedup and cost data
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Health Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  Overall Health Status
                </CardTitle>
                {getStatusBadge(data.health_status.overall)}
              </div>
              <CardDescription>
                Generated at {formatDate(data.generated_at)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {getStatusIcon(data.health_status.unroutable_15m)}
                  <div>
                    <p className="text-sm font-medium">Unroutable (15m)</p>
                    <p className="text-xs text-muted-foreground">
                      {data.metrics[0]?.unroutable_count ?? 0} emails
                      {data.health_status.unroutable_15m !== "healthy" && (
                        <span className="ml-1">(threshold: ⚠️≥50, 🔴≥200)</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {getStatusIcon(data.health_status.payload_url_pct)}
                  <div>
                    <p className="text-sm font-medium">Payload URL %</p>
                    <p className="text-xs text-muted-foreground">
                      {data.metrics[2]?.email_content_payload_url_populated_pct ?? 0}%
                      {data.health_status.payload_url_pct !== "healthy" && (
                        <span className="ml-1">(threshold: ⚠️&lt;95%, 🔴&lt;80%)</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {getStatusIcon(data.health_status.queue_collisions)}
                  <div>
                    <p className="text-sm font-medium">Queue Collisions (15m)</p>
                    <p className="text-xs text-muted-foreground">
                      {data.metrics[0]?.email_queue_dedup_collision_count ?? 0} collisions
                      {data.health_status.queue_collisions !== "healthy" && (
                        <span className="ml-1">(threshold: ⚠️&gt;0, 🔴&gt;10)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics by Time Window */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4" />
                Metrics by Time Window
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Window</TableHead>
                    <TableHead className="w-[100px] text-right">Content Unique</TableHead>
                    <TableHead className="w-[100px] text-right">Total Receipts</TableHead>
                    <TableHead className="w-[110px] text-right">Dedup Savings %</TableHead>
                    <TableHead className="w-[110px] text-right">Payload URL %</TableHead>
                    <TableHead className="w-[90px] text-right">Queue Total</TableHead>
                    <TableHead className="w-[110px] text-right">Queue Collisions</TableHead>
                    <TableHead className="w-[110px] text-right">Unroutable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.metrics.map((m) => (
                    <TableRow key={m.window_label}>
                      <TableCell className="font-medium">{m.window_label}</TableCell>
                      <TableCell className="text-right">{m.email_content_unique_count}</TableCell>
                      <TableCell className="text-right">{m.email_content_total_receipts}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={m.email_content_dup_savings_pct > 0 ? "default" : "secondary"}>
                          {m.email_content_dup_savings_pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            m.email_content_payload_url_populated_pct >= 95
                              ? "default"
                              : m.email_content_payload_url_populated_pct >= 80
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {m.email_content_payload_url_populated_pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{m.email_queue_total_count}</TableCell>
                      <TableCell className="text-right">
                        {m.email_queue_dedup_collision_count > 0 ? (
                          <Badge variant="destructive">{m.email_queue_dedup_collision_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.unroutable_count > 0 ? (
                          <span>
                            {m.unroutable_count} ({m.unroutable_pct}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Content Examples */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Recent Content Examples (Last 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent_content_examples.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent content</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Content Hash</TableHead>
                      <TableHead className="text-right">Receipt Count</TableHead>
                      <TableHead>Payload URL</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_content_examples.map((ex, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline">{ex.provider}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{ex.content_hash_prefix}</TableCell>
                        <TableCell className="text-right">
                          {ex.receipt_count > 1 ? (
                            <Badge variant="default">{ex.receipt_count}</Badge>
                          ) : (
                            <span>1</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ex.payload_url_present ? (
                            <Badge variant="default" className="bg-green-500/20 text-green-700">
                              <HardDrive className="w-3 h-3 mr-1" />
                              Stored
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(ex.last_seen_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Recent Unroutable Examples */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="w-4 h-4" />
                Recent Unroutable Examples (Last 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent_unroutable_examples.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">No unroutable emails - all routing successful!</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Received</TableHead>
                      <TableHead>Failure Reason</TableHead>
                      <TableHead>Extracted Alias</TableHead>
                      <TableHead>Delivered-To Header</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_unroutable_examples.map((ex, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{formatDate(ex.received_at)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">
                            {ex.failure_reason || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {ex.extracted_alias || <span className="text-muted-foreground italic">none</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {ex.delivered_to_header || <span className="italic">none</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
