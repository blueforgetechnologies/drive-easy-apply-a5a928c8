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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <p className="text-xs text-muted-foreground">
                Items claimed per worker per cycle
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
            </div>

            <div className="space-y-2">
              <Label>Concurrent Limit</Label>
              <p className="text-xs text-muted-foreground">
                Max simultaneous requests per batch
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
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Loop Interval (ms)</Label>
              <p className="text-xs text-muted-foreground">
                Time between queue checks
              </p>
              <Input
                type="number"
                value={config.loop_interval_ms}
                onChange={(e) => updateConfig({ loop_interval_ms: parseInt(e.target.value) || 1000 })}
                min={1000}
                max={60000}
              />
            </div>

            <div className="space-y-2">
              <Label>Per-Request Delay (ms)</Label>
              <p className="text-xs text-muted-foreground">
                Delay between individual API calls (prevents rate limits)
              </p>
              <Input
                type="number"
                value={config.per_request_delay_ms}
                onChange={(e) => updateConfig({ per_request_delay_ms: parseInt(e.target.value) || 0 })}
                min={0}
                max={5000}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Max Retries</Label>
            <p className="text-xs text-muted-foreground">
              Retry attempts before marking as failed
            </p>
            <Input
              type="number"
              value={config.max_retries}
              onChange={(e) => updateConfig({ max_retries: parseInt(e.target.value) || 1 })}
              min={1}
              max={10}
              className="w-32"
            />
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
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Backoff on 429</Label>
              <p className="text-sm text-muted-foreground">
                Pause processing when rate limited
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
                How long to wait after hitting a rate limit
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
                Current: {(config.backoff_duration_ms / 1000).toFixed(0)} seconds
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>
            Add notes about current configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.notes || ""}
            onChange={(e) => updateConfig({ notes: e.target.value })}
            placeholder="e.g., Reduced batch size due to Gmail rate limiting issues..."
            rows={3}
          />
          {config.updated_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(config.updated_at).toLocaleString()}
              {config.updated_by && ` by ${config.updated_by}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Worker Info */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>How it works:</strong> Your Docker workers read this configuration from the database 
            every loop cycle. Changes take effect within a few seconds without needing to restart the workers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
