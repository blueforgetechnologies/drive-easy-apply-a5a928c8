import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Activity, AlertTriangle, Clock, RefreshCw, TrendingUp, Settings, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface UsageGmailTabProps {
  selectedMonth: string; // "YYYY-MM" or "all"
}

const getDateRange = (selectedMonth: string) => {
  if (selectedMonth === "all") {
    return { startISO: null, endISO: null, isAllTime: true };
  }
  const [y, m] = selectedMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: endExclusive.toISOString(), isAllTime: false };
};

// Gmail API free tier: $0 for reads, limited quota
const GMAIL_DAILY_QUOTA = 1000000000; // 1B quota units per day (example)

export function UsageGmailTab({ selectedMonth }: UsageGmailTabProps) {
  const { startISO, endISO, isAllTime } = getDateRange(selectedMonth);
  const periodLabel = isAllTime ? "all time" : selectedMonth;

  // Manual tracking state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualRequests, setManualRequests] = useState("");
  const [manualErrors, setManualErrors] = useState("");
  
  // Load saved Gmail stats from localStorage
  const [savedStats, setSavedStats] = useState<{
    requests: number;
    errors: number;
    errorRate: number;
    lastUpdated: string;
  } | null>(null);

  // Calibration state
  const [showCalibrate, setShowCalibrate] = useState(false);
  const [calibrateRequests, setCalibrateRequests] = useState("");
  const [calibration, setCalibration] = useState<{
    actualRequests: number;
    emailsAtCalibration: number;
    multiplier: number;
    calibratedAt: string;
  } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('gmail_api_stats');
    if (saved) {
      setSavedStats(JSON.parse(saved));
    }
    const savedCalibration = localStorage.getItem('gmail_api_calibration');
    if (savedCalibration) {
      setCalibration(JSON.parse(savedCalibration));
    }
  }, []);

  // Count emails processed via Gmail API (from load_emails table)
  const { data: emailProcessingStats, refetch: refetchStats, isFetching } = useQuery({
    queryKey: ["gmail-api-usage", selectedMonth],
    queryFn: async () => {
      let totalEmails = 0;
      let failedEmails = 0;

      if (isAllTime) {
        const { count: totalCount } = await supabase
          .from('load_emails')
          .select('*', { count: 'exact', head: true });
        
        const { count: failedCount } = await supabase
          .from('email_queue')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed');
        
        totalEmails = totalCount || 0;
        failedEmails = failedCount || 0;
      } else {
        const { count: totalCount } = await supabase
          .from('load_emails')
          .select('*', { count: 'exact', head: true })
          .gte('received_at', startISO!)
          .lt('received_at', endISO!);
        
        totalEmails = totalCount || 0;
      }

      return { 
        totalEmails, 
        failedEmails,
        // Estimate API calls: ~3 calls per email (list, get, modify)
        estimatedApiCalls: totalEmails * 3,
      };
    },
    refetchInterval: 60000,
  });

  // Email queue stats
  const { data: queueStats } = useQuery({
    queryKey: ["gmail-queue-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_queue')
        .select('status, attempts')
        .order('queued_at', { ascending: false })
        .limit(1000);
      
      const pending = data?.filter(e => e.status === 'pending').length || 0;
      const processing = data?.filter(e => e.status === 'processing').length || 0;
      const failed = data?.filter(e => e.status === 'failed').length || 0;
      const completed = data?.filter(e => e.status === 'completed').length || 0;
      const avgAttempts = data?.length 
        ? data.reduce((sum, e) => sum + (e.attempts || 0), 0) / data.length 
        : 0;
      
      return { pending, processing, failed, completed, avgAttempts };
    },
    refetchInterval: 30000,
  });

  const handleSaveManualStats = () => {
    const requests = parseInt(manualRequests) || 0;
    const errors = parseInt(manualErrors) || 0;
    const errorRate = requests > 0 ? (errors / requests) * 100 : 0;
    
    const stats = {
      requests,
      errors,
      errorRate,
      lastUpdated: new Date().toISOString(),
    };
    
    localStorage.setItem('gmail_api_stats', JSON.stringify(stats));
    setSavedStats(stats);
    setShowManualEntry(false);
    setManualRequests("");
    setManualErrors("");
    toast.success("Gmail API stats saved");
  };

  const clearManualStats = () => {
    localStorage.removeItem('gmail_api_stats');
    setSavedStats(null);
    toast.success("Manual stats cleared");
  };

  const handleCalibrate = () => {
    const actualRequests = parseInt(calibrateRequests) || 0;
    const currentEmails = emailProcessingStats?.totalEmails || 0;
    
    if (actualRequests <= 0 || currentEmails <= 0) {
      toast.error("Need valid requests count and email data");
      return;
    }
    
    const multiplier = actualRequests / currentEmails;
    
    const cal = {
      actualRequests,
      emailsAtCalibration: currentEmails,
      multiplier,
      calibratedAt: new Date().toISOString(),
    };
    
    localStorage.setItem('gmail_api_calibration', JSON.stringify(cal));
    setCalibration(cal);
    setShowCalibrate(false);
    setCalibrateRequests("");
    toast.success(`Calibrated: ${multiplier.toFixed(2)} requests per email`);
  };

  const clearCalibration = () => {
    localStorage.removeItem('gmail_api_calibration');
    setCalibration(null);
    toast.success("Calibration cleared");
  };

  // Calculate calibrated estimate
  const getCalibratedEstimate = () => {
    if (!emailProcessingStats) return 0;
    if (calibration) {
      return Math.round(emailProcessingStats.totalEmails * calibration.multiplier);
    }
    return emailProcessingStats.estimatedApiCalls;
  };

  // Use manual stats if available, otherwise use calibrated/default estimates
  const calibratedRequests = getCalibratedEstimate();
  const displayRequests = savedStats?.requests || calibratedRequests;
  const displayErrors = savedStats?.errors || queueStats?.failed || 0;
  const errorRate = savedStats?.errorRate || (displayRequests > 0 ? (displayErrors / displayRequests) * 100 : 0);

  const metrics = [
    {
      title: "Total Requests",
      icon: Activity,
      value: displayRequests.toLocaleString(),
      subtext: savedStats ? "from GCP Console" : calibration ? `calibrated (${calibration.multiplier.toFixed(1)}x)` : "estimated (3x)",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Error Rate",
      icon: AlertTriangle,
      value: `${errorRate.toFixed(1)}%`,
      subtext: `${displayErrors.toLocaleString()} errors`,
      color: errorRate > 10 ? "text-destructive" : "text-yellow-500",
      bgColor: errorRate > 10 ? "bg-destructive/10" : "bg-yellow-500/10",
    },
    {
      title: "Emails Processed",
      icon: Mail,
      value: (emailProcessingStats?.totalEmails || 0).toLocaleString(),
      subtext: periodLabel,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Queue Status",
      icon: Clock,
      value: (queueStats?.pending || 0).toString(),
      subtext: "pending",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Gmail API Usage
              </CardTitle>
              <CardDescription>
                API requests and quota consumption ({periodLabel})
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={showCalibrate} onOpenChange={setShowCalibrate}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Target className="h-4 w-4 mr-2" />
                    Calibrate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Calibrate API Estimates</DialogTitle>
                    <DialogDescription>
                      Enter the actual request count from GCP Console to improve estimate accuracy.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Actual Total Requests (from GCP)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g., 2689724"
                        value={calibrateRequests}
                        onChange={(e) => setCalibrateRequests(e.target.value)}
                      />
                    </div>
                    <div className="p-3 rounded-lg bg-muted text-sm">
                      <p className="font-medium">Current Data:</p>
                      <p className="text-muted-foreground">
                        {(emailProcessingStats?.totalEmails || 0).toLocaleString()} emails processed
                      </p>
                      <p className="text-muted-foreground">
                        Default estimate: {(emailProcessingStats?.estimatedApiCalls || 0).toLocaleString()} requests (3x)
                      </p>
                      {calibrateRequests && (
                        <p className="text-primary mt-2">
                          New multiplier: {((parseInt(calibrateRequests) || 0) / (emailProcessingStats?.totalEmails || 1)).toFixed(2)}x per email
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleCalibrate} className="flex-1">
                        Save Calibration
                      </Button>
                      {calibration && (
                        <Button variant="outline" onClick={clearCalibration}>
                          Clear
                        </Button>
                      )}
                    </div>
                    {calibration && (
                      <p className="text-xs text-muted-foreground">
                        Last calibrated: {new Date(calibration.calibratedAt).toLocaleDateString()} 
                        ({calibration.multiplier.toFixed(2)}x multiplier)
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualEntry(!showManualEntry)}
              >
                <Settings className="h-4 w-4 mr-2" />
                {savedStats ? "Update Stats" : "Enter Stats"}
              </Button>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Estimated Cost</p>
                <p className="text-3xl font-bold text-green-600">$0.00</p>
                <p className="text-xs text-muted-foreground">Gmail API is free</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchStats()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Manual Entry Panel */}
      {showManualEntry && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Enter GCP Console Stats
            </CardTitle>
            <CardDescription>
              Copy values from your Google Cloud Console → APIs & Services → Gmail API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-sm font-medium mb-1.5 block">Total Requests</label>
                <Input
                  type="number"
                  placeholder="e.g., 2689724"
                  value={manualRequests}
                  onChange={(e) => setManualRequests(e.target.value)}
                />
              </div>
              <div className="flex-1 max-w-xs">
                <label className="text-sm font-medium mb-1.5 block">Errors (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 9"
                  value={manualErrors}
                  onChange={(e) => setManualErrors(e.target.value)}
                />
              </div>
              <Button onClick={handleSaveManualStats}>Save</Button>
            </div>
            {savedStats && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={clearManualStats}>
                  Clear Saved Stats
                </Button>
                <span className="text-xs text-muted-foreground">
                  Last updated: {new Date(savedStats.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: Go to GCP Console → APIs & Services → Gmail API → Metrics to get accurate numbers.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                  <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metric.value}</p>
                <p className="text-xs text-muted-foreground">{metric.subtext}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Queue Status Breakdown */}
      {queueStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Email Queue Status</CardTitle>
            <CardDescription>Current processing pipeline status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-orange-500/10 text-center">
                <p className="text-muted-foreground text-xs">Pending</p>
                <p className="font-bold text-lg">{queueStats.pending}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <p className="text-muted-foreground text-xs">Processing</p>
                <p className="font-bold text-lg">{queueStats.processing}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <p className="text-muted-foreground text-xs">Completed</p>
                <p className="font-bold text-lg">{queueStats.completed}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10 text-center">
                <p className="text-muted-foreground text-xs">Failed</p>
                <p className="font-bold text-lg">{queueStats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Gmail API Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Gmail API is free</strong> - Google does not charge for Gmail API usage, 
            but there are quota limits:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>1 billion quota units per day</li>
            <li>250 quota units per user per second</li>
            <li>Different operations cost different quota units (e.g., messages.get = 5 units)</li>
          </ul>
          <p className="pt-2">
            Your {(emailProcessingStats?.totalEmails || 0).toLocaleString()} emails used approximately{' '}
            <strong>{((emailProcessingStats?.estimatedApiCalls || 0) * 5).toLocaleString()}</strong> quota units
            (estimating 5 units per call × 3 calls per email).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}