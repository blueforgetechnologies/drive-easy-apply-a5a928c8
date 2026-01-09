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
  Activity
} from "lucide-react";

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

export function WorkerControlPanel() {
  const [config, setConfig] = useState<WorkerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
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

  useEffect(() => {
    loadConfig();
    loadQueueStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(loadQueueStats, 30000);
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
