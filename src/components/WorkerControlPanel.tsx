import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Settings2, 
  Play, 
  Pause, 
  Power, 
  RefreshCw, 
  Clock, 
  Zap, 
  Shield,
  AlertTriangle,
  CheckCircle,
  Activity,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Heart,
  Wifi,
  WifiOff,
  Server,
  Trash2
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";

interface WorkerConfig {
  id: string;
  enabled: boolean;
  paused: boolean;
  batch_size: number;
  loop_interval_ms: number;
  concurrent_limit: number;
  per_request_delay_ms: number;
  backoff_on_429: boolean;
  backoff_duration_ms: number;
  max_retries: number;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
  restart_requested_at: string | null;
}

interface QueueStats {
  pending: number;
  processing: number;
  sent_today: number;
  failed_today: number;
}

interface VolumeDataPoint {
  hour: string;
  hourLabel: string;
  received: number;
  processed: number;
  failed: number;
  pending: number;
  matches: number;
}

interface WorkerHealth {
  worker_id: string;
  last_heartbeat: string;
  status: string;
  emails_sent: number;
  emails_failed: number;
  loops_completed: number;
  current_batch_size: number | null;
  rate_limit_until: string | null;
  error_message: string | null;
  connection_status: 'online' | 'stale' | 'offline';
  seconds_since_heartbeat: number;
}

export function WorkerControlPanel() {
  const [config, setConfig] = useState<WorkerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [volumeData, setVolumeData] = useState<VolumeDataPoint[]>([]);
  const [chartOpen, setChartOpen] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth[]>([]);
  const [previousHealth, setPreviousHealth] = useState<WorkerHealth[]>([]);
  const [healthOpen, setHealthOpen] = useState(true);
  const [cleaningUp, setCleaningUp] = useState(false);

  // Cleanup dead workers (offline > 24 hours)
  const cleanupDeadWorkers = async () => {
    setCleaningUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-worker-heartbeats', {
        body: { cutoff_hours: 24 },
      });

      if (error) throw error;

      const deleted = Number((data as any)?.deleted ?? 0);
      if (!deleted) {
        toast.info('No dead workers to clean up');
      } else {
        toast.success(`Removed ${deleted} dead worker(s)`);
      }

      await loadWorkerHealth();
    } catch (error: any) {
      console.error("Error cleaning up dead workers:", error);
      toast.error("Failed to clean up dead workers", { description: error.message });
    } finally {
      setCleaningUp(false);
    }
  };
  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("worker_config")
        .select("*")
        .eq("id", "default")
        .single();

      if (error) throw error;
      setConfig(data);
      setHasChanges(false);
    } catch (error) {
      console.error("Error loading worker config:", error);
      toast.error("Failed to load worker configuration");
    } finally {
      setLoading(false);
    }
  };

  const loadQueueStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get pending and processing counts
      const { data: pending } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const { data: processing } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");

      const { data: sentToday } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("processed_at", today);

      const { data: failedToday } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("processed_at", today);

      setQueueStats({
        pending: (pending as any)?.length ?? 0,
        processing: (processing as any)?.length ?? 0,
        sent_today: (sentToday as any)?.length ?? 0,
        failed_today: (failedToday as any)?.length ?? 0,
      });
    } catch (error) {
      console.error("Error loading queue stats:", error);
    }
  };

  const loadVolumeData = async () => {
    try {
      setLoadingChart(true);
      const { data, error } = await supabase
        .from("email_volume_stats")
        .select("*")
        .order("hour_start", { ascending: true })
        .limit(48); // Last 48 hours

      if (error) throw error;

      const formattedData: VolumeDataPoint[] = (data || []).map((row) => {
        const date = new Date(row.hour_start);
        return {
          hour: row.hour_start,
          hourLabel: date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric',
            hour12: true 
          }),
          received: row.emails_received || 0,
          processed: row.emails_processed || 0,
          failed: row.emails_failed || 0,
          pending: row.emails_pending || 0,
          matches: row.matches_count || 0,
        };
      });

      setVolumeData(formattedData);
    } catch (error) {
      console.error("Error loading volume data:", error);
    } finally {
      setLoadingChart(false);
    }
  };

  const loadWorkerHealth = async () => {
    try {
      const { data, error } = await supabase
        .from("worker_heartbeats")
        .select("*")
        .order("last_heartbeat", { ascending: false });

      if (error) throw error;

      const healthData: WorkerHealth[] = (data || []).map((row) => {
        const secondsSince = (Date.now() - new Date(row.last_heartbeat).getTime()) / 1000;
        let connectionStatus: 'online' | 'stale' | 'offline' = 'offline';
        if (secondsSince < 120) connectionStatus = 'online';
        else if (secondsSince < 300) connectionStatus = 'stale';
        
        return {
          worker_id: row.id,
          last_heartbeat: row.last_heartbeat,
          status: row.status,
          emails_sent: row.emails_sent,
          emails_failed: row.emails_failed,
          loops_completed: row.loops_completed,
          current_batch_size: row.current_batch_size,
          rate_limit_until: row.rate_limit_until,
          error_message: row.error_message,
          connection_status: connectionStatus,
          seconds_since_heartbeat: secondsSince,
        };
      });

      // Check for status changes and show notifications
      if (previousHealth.length > 0) {
        healthData.forEach((worker) => {
          const prev = previousHealth.find(p => p.worker_id === worker.worker_id);
          if (prev) {
            // Worker went offline
            if (prev.connection_status !== 'offline' && worker.connection_status === 'offline') {
              toast.error(`🚨 Worker ${worker.worker_id} is OFFLINE!`, {
                description: `Last seen ${Math.floor(worker.seconds_since_heartbeat / 60)} minutes ago`,
                duration: 10000,
              });
            }
            // Worker came back online
            if (prev.connection_status === 'offline' && worker.connection_status === 'online') {
              toast.success(`✅ Worker ${worker.worker_id} is back ONLINE!`, {
                duration: 5000,
              });
            }
            // Worker hit rate limit
            if (!prev.rate_limit_until && worker.rate_limit_until) {
              toast.warning(`⚠️ Worker ${worker.worker_id} hit rate limit!`, {
                description: `Backing off until ${new Date(worker.rate_limit_until).toLocaleTimeString()}`,
                duration: 8000,
              });
            }
          }
        });
        
        // Check for new workers
        healthData.forEach((worker) => {
          const prev = previousHealth.find(p => p.worker_id === worker.worker_id);
          if (!prev && worker.connection_status === 'online') {
            toast.success(`🆕 New worker ${worker.worker_id} connected!`, {
              duration: 5000,
            });
          }
        });
      }

      setPreviousHealth(healthData);
      setWorkerHealth(healthData);
    } catch (error) {
      console.error("Error loading worker health:", error);
    }
  };

  useEffect(() => {
    loadConfig();
    loadQueueStats();
    loadVolumeData();
    loadWorkerHealth();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(() => {
      loadQueueStats();
      loadVolumeData();
      loadWorkerHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateConfig = (updates: Partial<WorkerConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
    setHasChanges(true);
  };

  const saveConfig = async () => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("worker_config")
        .update({
          enabled: config.enabled,
          paused: config.paused,
          batch_size: config.batch_size,
          loop_interval_ms: config.loop_interval_ms,
          concurrent_limit: config.concurrent_limit,
          per_request_delay_ms: config.per_request_delay_ms,
          backoff_on_429: config.backoff_on_429,
          backoff_duration_ms: config.backoff_duration_ms,
          max_retries: config.max_retries,
          notes: config.notes,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || null,
        })
        .eq("id", "default");

      if (error) throw error;
      
      toast.success("Worker configuration saved. Workers will pick up changes on next loop.");
      setHasChanges(false);
      loadConfig();
    } catch (error) {
      console.error("Error saving worker config:", error);
      toast.error("Failed to save worker configuration");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => updateConfig({ enabled: !config?.enabled });
  const togglePaused = () => updateConfig({ paused: !config?.paused });

  const requestRestart = async () => {
    setRestarting(true);
    try {
      const { error } = await supabase
        .from("worker_config")
        .update({
          restart_requested_at: new Date().toISOString(),
        })
        .eq("id", "default");

      if (error) throw error;
      
      toast.success("Restart signal sent. Workers will restart on their next loop cycle.");
      loadConfig();
    } catch (error) {
      console.error("Error requesting restart:", error);
      toast.error("Failed to send restart signal");
    } finally {
      setRestarting(false);
    }
  };

  const clearRestartSignal = async () => {
    try {
      const { error } = await supabase
        .from("worker_config")
        .update({
          restart_requested_at: null,
        })
        .eq("id", "default");

      if (error) throw error;
      toast.success("Restart signal cleared");
      loadConfig();
    } catch (error) {
      console.error("Error clearing restart signal:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Worker configuration not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            External Worker Control
          </h3>
          <p className="text-sm text-muted-foreground">
            Control your Docker email processing workers from here
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              Unsaved Changes
            </Badge>
          )}
          <Button onClick={saveConfig} disabled={!hasChanges || saving}>
            {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Queue Stats */}
      {queueStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold">{queueStats.pending.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Processing</span>
              </div>
              <p className="text-2xl font-bold">{queueStats.processing.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Sent Today</span>
              </div>
              <p className="text-2xl font-bold">{queueStats.sent_today.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Failed Today</span>
              </div>
              <p className="text-2xl font-bold">{queueStats.failed_today.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Worker Health Status - Collapsible */}
      <Collapsible open={healthOpen} onOpenChange={setHealthOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Worker Health Status
                      {workerHealth.length > 0 && (
                        <Badge 
                          variant="outline" 
                          className={
                            workerHealth.every(w => w.connection_status === 'online') 
                              ? "bg-green-500/10 text-green-600 border-green-500/30"
                              : workerHealth.some(w => w.connection_status === 'offline')
                              ? "bg-red-500/10 text-red-600 border-red-500/30"
                              : "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                          }
                        >
                          {workerHealth.filter(w => w.connection_status === 'online').length}/{workerHealth.length} Online
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Real-time health monitoring of your Docker workers
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {workerHealth.some(w => w.connection_status === 'offline') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void cleanupDeadWorkers();
                      }}
                      disabled={cleaningUp}
                    >
                      {cleaningUp ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Clean Dead
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {healthOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              {workerHealth.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Server className="h-12 w-12 mb-2 opacity-50" />
                  <p className="font-medium">No workers detected</p>
                  <p className="text-sm">Workers will appear here once they start sending heartbeats</p>
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg max-w-md">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>💡 Tip:</strong> Make sure your Docker workers are running and have the latest code that includes heartbeat reporting.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Worker Cards */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {workerHealth.map((worker) => (
                      <Card 
                        key={worker.worker_id} 
                        className={`border-2 ${
                          worker.connection_status === 'online' 
                            ? 'border-green-500/30 bg-green-500/5' 
                            : worker.connection_status === 'stale'
                            ? 'border-yellow-500/30 bg-yellow-500/5'
                            : 'border-red-500/30 bg-red-500/5'
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {worker.connection_status === 'online' ? (
                                <Wifi className="h-5 w-5 text-green-500" />
                              ) : worker.connection_status === 'stale' ? (
                                <Wifi className="h-5 w-5 text-yellow-500" />
                              ) : (
                                <WifiOff className="h-5 w-5 text-red-500" />
                              )}
                              <span className="font-semibold">{worker.worker_id}</span>
                            </div>
                            <Badge 
                              variant={worker.connection_status === 'online' ? 'default' : 'destructive'}
                              className={
                                worker.connection_status === 'online' 
                                  ? 'bg-green-500' 
                                  : worker.connection_status === 'stale'
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }
                            >
                              {worker.connection_status.toUpperCase()}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Heartbeat:</span>
                              <span className={worker.connection_status === 'offline' ? 'text-red-500 font-medium' : ''}>
                                {worker.seconds_since_heartbeat < 60 
                                  ? `${Math.floor(worker.seconds_since_heartbeat)}s ago`
                                  : worker.seconds_since_heartbeat < 3600
                                  ? `${Math.floor(worker.seconds_since_heartbeat / 60)}m ago`
                                  : `${Math.floor(worker.seconds_since_heartbeat / 3600)}h ago`
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Status:</span>
                              <span className={worker.status === 'healthy' ? 'text-green-600' : 'text-yellow-600'}>
                                {worker.status}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Emails Sent:</span>
                              <span className="font-medium">{worker.emails_sent.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Emails Failed:</span>
                              <span className={worker.emails_failed > 0 ? 'text-red-500' : ''}>
                                {worker.emails_failed.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Loop Count:</span>
                              <span>{worker.loops_completed.toLocaleString()}</span>
                            </div>
                            {worker.rate_limit_until && new Date(worker.rate_limit_until) > new Date() && (
                              <div className="mt-2 p-2 bg-yellow-500/20 rounded text-yellow-700 dark:text-yellow-300 text-xs">
                                ⚠️ Rate limited until {new Date(worker.rate_limit_until).toLocaleTimeString()}
                              </div>
                            )}
                            {worker.error_message && (
                              <div className="mt-2 p-2 bg-red-500/20 rounded text-red-700 dark:text-red-300 text-xs">
                                ❌ {worker.error_message}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Health Legend */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Online</p>
                        <p className="text-xs text-muted-foreground">
                          Worker heartbeat received within the last 2 minutes. Worker is healthy and processing.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Stale</p>
                        <p className="text-xs text-muted-foreground">
                          Last heartbeat 2-5 minutes ago. Worker may be busy or experiencing issues.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Offline</p>
                        <p className="text-xs text-muted-foreground">
                          No heartbeat for 5+ minutes. Worker has likely crashed or been stopped.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Notification Info */}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>🔔 Notifications:</strong> You'll receive pop-up alerts when workers go offline, come back online, or hit rate limits. 
                      Keep this page open to monitor worker health in real-time.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Email Volume Chart - Collapsible */}
      <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  <div>
                    <CardTitle className="text-base">Email Volume Trends</CardTitle>
                    <CardDescription>
                      Visual overview of email processing activity over time
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {chartOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              {loadingChart ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : volumeData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-2 opacity-50" />
                  <p>No volume data available yet</p>
                  <p className="text-sm">Data will appear as emails are processed</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Main Chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volumeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="processedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="hourLabel" 
                          tick={{ fontSize: 11 }} 
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }} 
                          tickLine={false}
                          axisLine={false}
                          width={50}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}
                          labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                        />
                        <Legend 
                          verticalAlign="top" 
                          height={36}
                          iconType="circle"
                        />
                        <Area
                          type="monotone"
                          dataKey="received"
                          name="📥 Received"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#receivedGradient)"
                        />
                        <Area
                          type="monotone"
                          dataKey="processed"
                          name="✅ Processed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          fill="url(#processedGradient)"
                        />
                        <Area
                          type="monotone"
                          dataKey="failed"
                          name="❌ Failed"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="url(#failedGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend Explanation */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Received</p>
                        <p className="text-xs text-muted-foreground">
                          Emails ingested from Gmail/other sources and added to the processing queue
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Processed</p>
                        <p className="text-xs text-muted-foreground">
                          Emails successfully parsed and matched to loads or archived
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Failed</p>
                        <p className="text-xs text-muted-foreground">
                          Emails that couldn't be processed due to errors (API limits, parsing issues)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chart Tips */}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>📊 Reading the Chart:</strong> A healthy system shows <strong>Received ≈ Processed</strong> over time. 
                      If <strong>Received &gt;&gt; Processed</strong>, workers may be too slow or paused. 
                      If <strong>Failed</strong> spikes, check for API rate limits or configuration issues above.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Master Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Master Controls
          </CardTitle>
          <CardDescription>
            Enable/disable or pause all workers globally
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>📋 Instructions:</strong> Use <strong>Enabled</strong> to completely turn workers on/off. 
              Use <strong>Paused</strong> for temporary maintenance without losing the "enabled" state. 
              When paused, workers stay running but don't claim new items.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Workers Enabled</Label>
              <p className="text-sm text-muted-foreground">
                When disabled, workers will not process any items
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? "ON" : "OFF"}
              </Badge>
              <Switch
                checked={config.enabled}
                onCheckedChange={toggleEnabled}
              />
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <Pause className="h-4 w-4" />
                Paused
              </Label>
              <p className="text-sm text-muted-foreground">
                Temporarily pause processing without disabling
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={config.paused ? "destructive" : "outline"}>
                {config.paused ? "PAUSED" : "RUNNING"}
              </Badge>
              <Switch
                checked={config.paused}
                onCheckedChange={togglePaused}
              />
            </div>
          </div>

          <Separator />

          {/* Restart Workers */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Restart Workers
              </Label>
              <p className="text-sm text-muted-foreground">
                Send a restart signal to all running workers. They will gracefully restart on next loop.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {config.restart_requested_at && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                  Restart pending since {new Date(config.restart_requested_at).toLocaleTimeString()}
                </Badge>
              )}
              {config.restart_requested_at ? (
                <Button variant="outline" size="sm" onClick={clearRestartSignal}>
                  Clear Signal
                </Button>
              ) : (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={requestRestart}
                  disabled={restarting}
                >
                  {restarting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Restart Workers
                </Button>
              )}
            </div>
          </div>

          {/* Instructions for restart */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
            <p className="text-sm text-orange-700 dark:text-orange-300">
              <strong>⚠️ Restart Info:</strong> When you click "Restart Workers", a signal is sent to the database. 
              Each worker checks for this signal every loop cycle and will gracefully exit, allowing Docker to restart it. 
              This is useful after deploying new worker code or clearing stuck state.
            </p>
          </div>

          {/* Recommended Settings */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mt-4">
            <p className="text-sm text-green-700 dark:text-green-300">
              <strong>✅ Recommended:</strong> Keep workers <strong>enabled</strong> and <strong>not paused</strong> for normal operation. 
              Only pause when you need to perform database maintenance or debug issues.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Performance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Performance Settings
          </CardTitle>
          <CardDescription>
            Adjust processing speed and concurrency
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>📋 Instructions:</strong> Balance speed vs API rate limits. Higher values = faster processing but more likely to hit rate limits. 
              If you see 429 errors, reduce batch size and increase delays.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <p className="text-xs text-muted-foreground">
                Number of queue items claimed per worker per cycle. Larger batches mean fewer database round-trips but longer processing time per cycle.
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  value={[config.batch_size]}
                  onValueChange={(v) => updateConfig({ batch_size: v[0] })}
                  min={1}
                  max={50}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={config.batch_size}
                  onChange={(e) => updateConfig({ batch_size: parseInt(e.target.value) || 1 })}
                  className="w-20"
                  min={1}
                  max={50}
                />
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 Recommended: <strong>5-15</strong> for Gmail API. Current: {config.batch_size} {config.batch_size >= 5 && config.batch_size <= 15 ? "✓" : "⚠️"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Concurrent Limit</Label>
              <p className="text-xs text-muted-foreground">
                Max parallel API requests within a batch. Higher = faster but more aggressive on rate limits.
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  value={[config.concurrent_limit]}
                  onValueChange={(v) => updateConfig({ concurrent_limit: v[0] })}
                  min={1}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={config.concurrent_limit}
                  onChange={(e) => updateConfig({ concurrent_limit: parseInt(e.target.value) || 1 })}
                  className="w-20"
                  min={1}
                  max={10}
                />
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 Recommended: <strong>2-3</strong> for Gmail API. Current: {config.concurrent_limit} {config.concurrent_limit >= 2 && config.concurrent_limit <= 3 ? "✓" : "⚠️"}
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Loop Interval (ms)</Label>
              <p className="text-xs text-muted-foreground">
                Time between queue checks when idle. Shorter = more responsive, but more database queries. Doesn't affect speed when queue has items.
              </p>
              <Input
                type="number"
                value={config.loop_interval_ms}
                onChange={(e) => updateConfig({ loop_interval_ms: parseInt(e.target.value) || 1000 })}
                min={1000}
                max={60000}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 Recommended: <strong>3000-5000ms</strong> (3-5 seconds). Current: {config.loop_interval_ms}ms {config.loop_interval_ms >= 3000 && config.loop_interval_ms <= 5000 ? "✓" : "⚠️"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Per-Request Delay (ms)</Label>
              <p className="text-xs text-muted-foreground">
                Delay added between each API call. Helps prevent bursts that trigger rate limits. 0 = no delay.
              </p>
              <Input
                type="number"
                value={config.per_request_delay_ms}
                onChange={(e) => updateConfig({ per_request_delay_ms: parseInt(e.target.value) || 0 })}
                min={0}
                max={5000}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 Recommended: <strong>100-200ms</strong> for Gmail API. Current: {config.per_request_delay_ms}ms {config.per_request_delay_ms >= 100 && config.per_request_delay_ms <= 200 ? "✓" : "⚠️"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Max Retries</Label>
            <p className="text-xs text-muted-foreground">
              How many times to retry a failed item before marking it as permanently failed. Includes transient errors like network timeouts.
            </p>
            <Input
              type="number"
              value={config.max_retries}
              onChange={(e) => updateConfig({ max_retries: parseInt(e.target.value) || 1 })}
              min={1}
              max={10}
              className="w-32"
            />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              💡 Recommended: <strong>3-5</strong>. Current: {config.max_retries} {config.max_retries >= 3 && config.max_retries <= 5 ? "✓" : "⚠️"}
            </p>
          </div>

          {/* Recommended Settings Summary */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-sm text-green-700 dark:text-green-300 mb-2">
              <strong>✅ Recommended Settings for Gmail API:</strong>
            </p>
            <ul className="text-sm text-green-700 dark:text-green-300 list-disc list-inside space-y-1">
              <li>Batch Size: <strong>10</strong> (balances efficiency and rate limits)</li>
              <li>Concurrent Limit: <strong>2</strong> (prevents overwhelming the API)</li>
              <li>Loop Interval: <strong>5000ms</strong> (good responsiveness without hammering DB)</li>
              <li>Per-Request Delay: <strong>100ms</strong> (spreads out requests to avoid bursts)</li>
              <li>Max Retries: <strong>3</strong> (handles transient failures without infinite loops)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limit Protection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Rate Limit Protection
          </CardTitle>
          <CardDescription>
            Automatic backoff when hitting API rate limits (429 errors)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>📋 Instructions:</strong> When enabled, workers will automatically pause when they receive a 429 "Too Many Requests" error from Gmail or other APIs. 
              This prevents wasting requests and allows the rate limit window to reset.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Backoff on 429</Label>
              <p className="text-sm text-muted-foreground">
                Automatically pause all workers when rate limited
              </p>
            </div>
            <Switch
              checked={config.backoff_on_429}
              onCheckedChange={(v) => updateConfig({ backoff_on_429: v })}
            />
          </div>

          {config.backoff_on_429 && (
            <div className="space-y-2">
              <Label>Backoff Duration (ms)</Label>
              <p className="text-xs text-muted-foreground">
                How long to wait after hitting a rate limit before resuming. Gmail's rate limit window is typically 60 seconds.
              </p>
              <Input
                type="number"
                value={config.backoff_duration_ms}
                onChange={(e) => updateConfig({ backoff_duration_ms: parseInt(e.target.value) || 5000 })}
                min={5000}
                max={300000}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                Current: {(config.backoff_duration_ms / 1000).toFixed(0)} seconds ({(config.backoff_duration_ms / 60000).toFixed(1)} minutes)
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 Recommended: <strong>30000-60000ms</strong> (30-60 seconds). Current: {config.backoff_duration_ms}ms {config.backoff_duration_ms >= 30000 && config.backoff_duration_ms <= 60000 ? "✓" : "⚠️"}
              </p>
            </div>
          )}

          {/* Recommended Settings */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-sm text-green-700 dark:text-green-300">
              <strong>✅ Recommended:</strong> Keep backoff <strong>enabled</strong> with a duration of <strong>30-60 seconds</strong>. 
              This matches Gmail's typical rate limit reset window and prevents cascading failures.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Notes</CardTitle>
          <CardDescription>
            Document why settings were changed for future reference
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>📋 Instructions:</strong> Use this space to document configuration changes. 
              Include the date, reason, and any observed results. This helps you remember why settings were adjusted.
            </p>
          </div>

          <Textarea
            value={config.notes || ""}
            onChange={(e) => updateConfig({ notes: e.target.value })}
            placeholder="e.g., 2024-01-09: Reduced batch size from 20 to 10 due to Gmail rate limiting. Also increased backoff to 60s. Will monitor for 24h..."
            rows={4}
          />
          {config.updated_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(config.updated_at).toLocaleString()}
              {config.updated_by && ` by ${config.updated_by}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Worker Info & Troubleshooting */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">ℹ️ How Workers Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Configuration Updates:</strong> Workers read this configuration from the database 
              every loop cycle. Changes take effect within a few seconds without restarting workers.
            </p>
            <p>
              <strong>Multiple Workers:</strong> If you run multiple Docker containers, they all share this config 
              and coordinate via the database to avoid processing the same items.
            </p>
          </div>
          
          <Separator />
          
          <div className="text-sm">
            <p className="font-medium mb-2">🔧 Troubleshooting Guide:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>Seeing 429 errors?</strong> Reduce batch size to 5-10, increase per-request delay to 200ms, enable backoff
              </li>
              <li>
                <strong>Processing too slow?</strong> Increase batch size (max 20), increase concurrent limit to 3, reduce loop interval
              </li>
              <li>
                <strong>Items stuck in "processing"?</strong> Worker may have crashed. Items auto-reset after 5 minutes
              </li>
              <li>
                <strong>High failure rate?</strong> Check if API credentials are valid, increase max retries to 5
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
