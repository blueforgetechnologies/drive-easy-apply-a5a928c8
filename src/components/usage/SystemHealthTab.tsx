import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Database, 
  Mail, 
  Truck, 
  Archive,
  AlertTriangle,
  Play,
  Loader2,
  TrendingDown,
  Shield
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface CleanupJobLog {
  id: string;
  job_name: string;
  executed_at: string;
  records_affected: number;
  success: boolean;
  error_message: string | null;
  duration_ms: number;
}

interface TableSizeInfo {
  table_name: string;
  row_count: number;
  should_cleanup: boolean;
  retention_days: number;
}

const JOB_CONFIG = {
  email_queue_cleanup: { 
    label: "Email Queue", 
    icon: Mail, 
    retention: "7 days",
    description: "Removes processed email queue entries"
  },
  pubsub_tracking_cleanup: { 
    label: "Pubsub Tracking", 
    icon: Database, 
    retention: "7 days",
    description: "Cleans webhook tracking records"
  },
  vehicle_location_cleanup: { 
    label: "Vehicle Locations", 
    icon: Truck, 
    retention: "8 days",
    description: "Removes old location history"
  },
  email_archive: { 
    label: "Email Archive", 
    icon: Archive, 
    retention: "8 days",
    description: "Archives old load emails"
  }
};

export function SystemHealthTab() {
  const queryClient = useQueryClient();
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Fetch recent cleanup job logs
  const { data: jobLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["cleanup-job-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleanup_job_logs')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as CleanupJobLog[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch table sizes for monitoring
  const { data: tableSizes, isLoading: sizesLoading } = useQuery({
    queryKey: ["table-sizes-health"],
    queryFn: async () => {
      const tables = [
        { name: 'email_queue', retention: 7 },
        { name: 'pubsub_tracking', retention: 7 },
        { name: 'vehicle_location_history', retention: 8 },
        { name: 'load_emails', retention: 8 },
        { name: 'load_emails_archive', retention: null },
        { name: 'load_hunt_matches', retention: null },
        { name: 'geocode_cache', retention: null },
      ];

      const results: TableSizeInfo[] = [];
      
      for (const table of tables) {
        const { count } = await supabase
          .from(table.name as any)
          .select('*', { count: 'exact', head: true });
        
        results.push({
          table_name: table.name,
          row_count: count || 0,
          should_cleanup: table.retention !== null,
          retention_days: table.retention || 0
        });
      }
      
      return results;
    },
    staleTime: 60000,
  });

  // Fetch geocode cache savings
  const { data: geocodeSavings } = useQuery({
    queryKey: ["geocode-savings"],
    queryFn: async () => {
      const { data } = await supabase
        .from('geocode_cache')
        .select('hit_count');
      
      const totalHits = data?.reduce((sum, row) => sum + (row.hit_count || 0), 0) || 0;
      const savingsPerHit = 0.005; // $0.005 per geocode API call
      return {
        totalHits,
        estimatedSavings: totalHits * savingsPerHit
      };
    },
  });

  // Run cleanup manually
  const runCleanup = useMutation({
    mutationFn: async (jobName?: string) => {
      setRunningJob(jobName || 'all');
      
      const body = jobName ? { jobs: [jobName] } : {};
      
      const { data, error } = await supabase.functions.invoke('cleanup-stale-data', {
        body
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Cleanup completed: ${data.summary?.total_records_cleaned || 0} records cleaned`);
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ["table-sizes-health"] });
    },
    onError: (error) => {
      toast.error(`Cleanup failed: ${error.message}`);
    },
    onSettled: () => {
      setRunningJob(null);
    }
  });

  // Get last execution for each job type
  const getLastExecution = (jobName: string): CleanupJobLog | undefined => {
    return jobLogs?.find(log => log.job_name === jobName);
  };

  // Determine job health status
  const getJobHealth = (jobName: string) => {
    const lastExec = getLastExecution(jobName);
    
    if (!lastExec) {
      return { status: 'never', color: 'text-muted-foreground', icon: Clock };
    }
    
    const hoursSinceExec = (Date.now() - new Date(lastExec.executed_at).getTime()) / (1000 * 60 * 60);
    
    if (!lastExec.success) {
      return { status: 'error', color: 'text-destructive', icon: XCircle };
    }
    
    if (hoursSinceExec > 25) { // Should run daily
      return { status: 'stale', color: 'text-yellow-500', icon: AlertTriangle };
    }
    
    return { status: 'healthy', color: 'text-green-500', icon: CheckCircle2 };
  };

  const isLoading = logsLoading || sizesLoading;

  return (
    <div className="space-y-6">
      {/* Header with Run All button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">System Health Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Track cleanup jobs and cost-saving features
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchLogs()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => runCleanup.mutate(undefined)}
            disabled={runningJob !== null}
          >
            {runningJob === 'all' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run All Cleanups
          </Button>
        </div>
      </div>

      {/* Cost Savings Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <TrendingDown className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Geocode Cache Savings</p>
                <p className="text-2xl font-bold text-green-500">
                  ${geocodeSavings?.estimatedSavings.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {geocodeSavings?.totalHits.toLocaleString() || 0} cache hits
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Archive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Archived Emails</p>
                <p className="text-2xl font-bold">
                  {tableSizes?.find(t => t.table_name === 'load_emails_archive')?.row_count.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Moved from active table
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Load Emails</p>
                <p className="text-2xl font-bold">
                  {tableSizes?.find(t => t.table_name === 'load_emails')?.row_count.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  8-day retention
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cleanup Jobs Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cleanup Jobs Status</CardTitle>
          <CardDescription>
            Automated cleanup jobs run daily to reduce costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(JOB_CONFIG).map(([jobName, config]) => {
                const health = getJobHealth(jobName);
                const lastExec = getLastExecution(jobName);
                const Icon = config.icon;
                const HealthIcon = health.icon;
                
                return (
                  <div 
                    key={jobName}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-full bg-muted">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{config.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {config.retention}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {lastExec && (
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">
                            Last run: {formatDistanceToNow(new Date(lastExec.executed_at), { addSuffix: true })}
                          </p>
                          {lastExec.records_affected > 0 && (
                            <p className="text-xs text-green-600">
                              {lastExec.records_affected.toLocaleString()} records cleaned
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <HealthIcon className={`h-5 w-5 ${health.color}`} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => runCleanup.mutate(jobName)}
                          disabled={runningJob !== null}
                        >
                          {runningJob === jobName ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Sizes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Database Table Sizes</CardTitle>
          <CardDescription>
            Monitor table growth and cleanup effectiveness
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sizesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {tableSizes?.map(table => (
                <div 
                  key={table.table_name}
                  className="p-3 rounded-lg border bg-muted/30"
                >
                  <p className="text-xs text-muted-foreground font-mono">
                    {table.table_name}
                  </p>
                  <p className="text-xl font-bold">
                    {table.row_count.toLocaleString()}
                  </p>
                  {table.should_cleanup && (
                    <Badge variant="outline" className="text-xs mt-1">
                      {table.retention_days}d retention
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Job Executions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Job Executions</CardTitle>
          <CardDescription>
            Last 10 cleanup job runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : jobLogs && jobLogs.length > 0 ? (
            <div className="space-y-2">
              {jobLogs.slice(0, 10).map(log => (
                <div 
                  key={log.id}
                  className="flex items-center justify-between py-2 px-3 rounded border text-sm"
                >
                  <div className="flex items-center gap-3">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium">
                      {JOB_CONFIG[log.job_name as keyof typeof JOB_CONFIG]?.label || log.job_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{log.records_affected} records</span>
                    <span>{log.duration_ms}ms</span>
                    <span>{format(new Date(log.executed_at), 'MMM d, HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No cleanup jobs have run yet. Click "Run All Cleanups" to start.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
