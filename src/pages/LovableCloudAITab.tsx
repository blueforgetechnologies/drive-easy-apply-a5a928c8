import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Sparkles, Loader2, Clock, BarChart3, RefreshCw, Info, Settings, Zap, AlertTriangle, DollarSign, TrendingUp, Calculator, Bell, Calendar, Database, Server, Radio, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshControl } from "@/components/RefreshControl";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, AreaChart, Area, BarChart, Bar } from 'recharts';

// Info tooltip component
const InfoTooltip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help inline-flex ml-1" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs text-xs">
      <p>{text}</p>
    </TooltipContent>
  </Tooltip>
);

// Cost category with color coding
const CostCategory = ({ 
  label, 
  amount, 
  percentage, 
  icon: Icon, 
  color 
}: { 
  label: string; 
  amount: number; 
  percentage: number; 
  icon: React.ElementType; 
  color: string;
}) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border">
    <div className={`p-2 rounded-full ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-bold">${amount.toFixed(2)}</span>
      </div>
      <Progress value={percentage} className="h-1.5 mt-1" />
    </div>
    <span className="text-xs text-muted-foreground w-10 text-right">{percentage.toFixed(0)}%</span>
  </div>
);

const LovableCloudAITab = () => {
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [actualSpend, setActualSpend] = useState<string>("");
  const [calibratedRate, setCalibratedRate] = useState<number | null>(null);
  const [aiTestResult, setAiTestResult] = useState<string>("");
  const [lastAiRefresh, setLastAiRefresh] = useState<Date>(new Date());
  const [aiRefreshInterval, setAiRefreshInterval] = useState<number>(60000);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(100);
  const [showBudgetSettings, setShowBudgetSettings] = useState<boolean>(false);
  const queryClient = useQueryClient();
  
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  // Load settings from localStorage
  useEffect(() => {
    const savedRate = localStorage.getItem('cloud_calibrated_rate');
    const savedBudget = localStorage.getItem('cloud_monthly_budget');
    if (savedRate) setCalibratedRate(parseFloat(savedRate));
    if (savedBudget) setMonthlyBudget(parseFloat(savedBudget));
  }, []);

  // Test AI mutation
  const testAiMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-ai', {
        body: { prompt: "Say hello and confirm you're working!" }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAiTestResult(data.response);
      toast.success("AI test successful!");
    },
    onError: (error: any) => {
      console.error("AI test error:", error);
      toast.error(error.message || "AI test failed");
    }
  });

  // Comprehensive cost breakdown query - ALL TIME to match Lovable billing
  const { data: costBreakdown, refetch: refetchCostBreakdown, isFetching: isCostFetching } = useQuery({
    queryKey: ["comprehensive-cost-breakdown-alltime"],
    queryFn: async () => {
      console.log('[Cloud Usage] Fetching ALL-TIME operations to match Lovable billing');
      
      // Fetch ALL write operations (no date filter) to match Lovable's billing
      const [
        emailResult, matchResult, geocodeResult, mapTrackingResult,
        directionsResult, aiResult, emailSendResult, auditResult,
        matchActionResult, emailVolumeResult, archiveResult,
        vehicleLocationResult, missedLoadsResult, pubsubResult,
        loadsResult, loadStopsResult
      ] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true }),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('ai_usage_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
        supabase.from('match_action_history').select('*', { count: 'exact', head: true }),
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }),
        supabase.from('load_emails_archive').select('*', { count: 'exact', head: true }),
        supabase.from('vehicle_location_history').select('*', { count: 'exact', head: true }),
        supabase.from('missed_loads_history').select('*', { count: 'exact', head: true }),
        supabase.from('pubsub_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('loads').select('*', { count: 'exact', head: true }),
        supabase.from('load_stops').select('*', { count: 'exact', head: true }),
      ]);
      
      // Categorize costs
      const emailIngestion = {
        emails: emailResult.count ?? 0,
        geocode: geocodeResult.count ?? 0,
        emailVolume: emailVolumeResult.count ?? 0,
        archive: archiveResult.count ?? 0,
        pubsub: pubsubResult.count ?? 0,
      };
      
      const huntOperations = {
        matches: matchResult.count ?? 0,
        matchActions: matchActionResult.count ?? 0,
        missedLoads: missedLoadsResult.count ?? 0,
      };
      
      const loadManagement = {
        loads: loadsResult.count ?? 0,
        loadStops: loadStopsResult.count ?? 0,
      };
      
      const tracking = {
        mapTracking: mapTrackingResult.count ?? 0,
        directions: directionsResult.count ?? 0,
        vehicleLocation: vehicleLocationResult.count ?? 0,
      };
      
      const other = {
        ai: aiResult.count ?? 0,
        emailSend: emailSendResult.count ?? 0,
        audit: auditResult.count ?? 0,
      };
      
      const totalEmailIngestion = Object.values(emailIngestion).reduce((a, b) => a + b, 0);
      const totalHuntOps = Object.values(huntOperations).reduce((a, b) => a + b, 0);
      const totalLoadMgmt = Object.values(loadManagement).reduce((a, b) => a + b, 0);
      const totalTracking = Object.values(tracking).reduce((a, b) => a + b, 0);
      const totalOther = Object.values(other).reduce((a, b) => a + b, 0);
      const totalWriteOps = totalEmailIngestion + totalHuntOps + totalLoadMgmt + totalTracking + totalOther;
      
      // Edge function estimates
      const edgeFunctionCalls = (emailIngestion.emails * 2.5) + (other.ai) + (other.emailSend) + (tracking.directions);
      
      // Realtime estimates (subscriptions)
      const realtimeEvents = emailIngestion.emails * 5; // Estimate 5 realtime events per email
      
      // Database reads estimate
      const estimatedReads = totalWriteOps * 4;

      console.log('[Cloud Usage] All-time totals:', {
        writeOps: totalWriteOps,
        emails: emailIngestion.emails,
        geocode: emailIngestion.geocode,
      });
      
      return {
        categories: {
          emailIngestion: { ops: totalEmailIngestion, details: emailIngestion },
          huntOperations: { ops: totalHuntOps, details: huntOperations },
          loadManagement: { ops: totalLoadMgmt, details: loadManagement },
          tracking: { ops: totalTracking, details: tracking },
          other: { ops: totalOther, details: other },
        },
        totals: {
          writeOps: totalWriteOps,
          edgeFunctions: Math.round(edgeFunctionCalls),
          realtimeEvents: Math.round(realtimeEvents),
          estimatedReads,
        },
        raw: {
          emails: emailIngestion.emails,
          matches: huntOperations.matches,
          geocode: emailIngestion.geocode,
          mapTracking: tracking.mapTracking,
          directions: tracking.directions,
          ai: other.ai,
        }
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Daily cost history for the past 7 days
  const { data: dailyCostHistory } = useQuery({
    queryKey: ["daily-cost-history"],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.setHours(0, 0, 0, 0)).toISOString();
        const dayEnd = new Date(date.setHours(23, 59, 59, 999)).toISOString();
        days.push({ date: date.toISOString().slice(0, 10), dayStart, dayEnd });
      }
      
      const results = await Promise.all(days.map(async (day) => {
        const [emails, geocode, matches] = await Promise.all([
          supabase.from('load_emails').select('*', { count: 'exact', head: true })
            .gte('created_at', day.dayStart).lte('created_at', day.dayEnd),
          supabase.from('geocode_cache').select('*', { count: 'exact', head: true })
            .gte('created_at', day.dayStart).lte('created_at', day.dayEnd),
          supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true })
            .gte('created_at', day.dayStart).lte('created_at', day.dayEnd),
        ]);
        
        const emailCount = emails.count ?? 0;
        const geocodeCount = geocode.count ?? 0;
        const matchCount = matches.count ?? 0;
        const totalOps = emailCount + geocodeCount + matchCount;
        
        return {
          date: day.date,
          day: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
          emails: emailCount,
          geocode: geocodeCount,
          matches: matchCount,
          totalOps,
        };
      }));
      
      return results;
    },
    refetchInterval: 60000,
  });

  // Hourly breakdown for today
  const { data: hourlyBreakdown } = useQuery({
    queryKey: ["hourly-breakdown"],
    queryFn: async () => {
      const hours = [];
      const now = new Date();
      for (let i = 23; i >= 0; i--) {
        const hourStart = new Date(now);
        hourStart.setHours(now.getHours() - i, 0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(hourStart.getHours() + 1, 0, 0, 0);
        hours.push({ 
          hour: hourStart.getHours(), 
          start: hourStart.toISOString(), 
          end: hourEnd.toISOString(),
          label: hourStart.toLocaleTimeString('en-US', { hour: 'numeric' })
        });
      }
      
      const results = await Promise.all(hours.map(async (hour) => {
        const { count } = await supabase.from('load_emails')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', hour.start)
          .lt('created_at', hour.end);
        
        return {
          hour: hour.label,
          emails: count ?? 0,
        };
      }));
      
      return results;
    },
    refetchInterval: 60000,
  });

  // Cost drivers query
  const { data: costDrivers, refetch: refetchCostDrivers, isFetching: isCostDriversFetching } = useQuery({
    queryKey: ["cost-drivers"],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const [
        emails1h, emails24h, geocode1h, geocode24h,
        matches1h, matches24h, mapLoads1h, mapLoads24h
      ] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
      ]);
      
      const emails24hCount = emails24h.count ?? 0;
      const edgeFunctions1h = Math.round((emails1h.count ?? 0) * 2.5);
      const edgeFunctions24h = Math.round(emails24hCount * 2.5);
      const hourlyRate = emails24hCount / 24;
      
      return {
        oneHour: {
          emails: emails1h.count ?? 0,
          geocode: geocode1h.count ?? 0,
          matches: matches1h.count ?? 0,
          mapLoads: mapLoads1h.count ?? 0,
        },
        twentyFourHours: {
          emails: emails24hCount,
          geocode: geocode24h.count ?? 0,
          matches: matches24h.count ?? 0,
          mapLoads: mapLoads24h.count ?? 0,
        },
        edgeFunctions1h,
        edgeFunctions24h,
        hourlyRate,
      };
    },
    refetchInterval: 30000,
  });

  // AI stats query
  const { data: aiStats, refetch: refetchAi } = useQuery({
    queryKey: ["usage-ai", currentMonth],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('ai_usage_tracking')
        .select('model, feature, prompt_tokens, completion_tokens, total_tokens, created_at', { count: 'exact' })
        .eq('month_year', currentMonth)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      const totalPromptTokens = data?.reduce((sum, row) => sum + (row.prompt_tokens || 0), 0) || 0;
      const totalCompletionTokens = data?.reduce((sum, row) => sum + (row.completion_tokens || 0), 0) || 0;
      const totalTokens = data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
      
      const modelBreakdown: Record<string, { count: number; tokens: number; promptTokens: number; completionTokens: number }> = {};
      data?.forEach(row => {
        const model = row.model || 'unknown';
        if (!modelBreakdown[model]) {
          modelBreakdown[model] = { count: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };
        }
        modelBreakdown[model].count++;
        modelBreakdown[model].tokens += row.total_tokens || 0;
        modelBreakdown[model].promptTokens += row.prompt_tokens || 0;
        modelBreakdown[model].completionTokens += row.completion_tokens || 0;
      });

      const featureLabels: Record<string, string> = {
        'freight_calculator_text': 'Freight Calculator (Text)',
        'freight_calculator_image': 'Freight Calculator (Image)',
        'load_email_parsing': 'Load Email Parsing',
        'ai_update_customers': 'Customer AI Update',
        'test_ai': 'AI Test',
        'unknown': 'Unknown',
      };
      
      const featureBreakdown: Record<string, { count: number; tokens: number; label: string }> = {};
      data?.forEach(row => {
        const feature = row.feature || 'unknown';
        if (!featureBreakdown[feature]) {
          featureBreakdown[feature] = { 
            count: 0, tokens: 0, 
            label: featureLabels[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          };
        }
        featureBreakdown[feature].count++;
        featureBreakdown[feature].tokens += row.total_tokens || 0;
      });
      
      let daysOfData = 1;
      if (data && data.length >= 2) {
        const firstRequest = new Date(data[0].created_at);
        const lastRequest = new Date(data[data.length - 1].created_at);
        daysOfData = Math.max(1, (lastRequest.getTime() - firstRequest.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      const requestCount = count || 0;
      const requestsPerDay = requestCount / daysOfData;
      const tokensPerDay = totalTokens / daysOfData;
      
      let estimatedCost = 0;
      Object.entries(modelBreakdown).forEach(([model, stats]) => {
        const isFlash = model.toLowerCase().includes('flash');
        const inputCostPer1M = isFlash ? 0.075 : 1.25;
        const outputCostPer1M = isFlash ? 0.30 : 5.00;
        estimatedCost += (stats.promptTokens / 1_000_000) * inputCostPer1M;
        estimatedCost += (stats.completionTokens / 1_000_000) * outputCostPer1M;
      });
      
      setLastAiRefresh(new Date());
      return { 
        count: requestCount,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        modelBreakdown,
        featureBreakdown,
        daysOfData: daysOfData.toFixed(1),
        requestsPerDay: Math.round(requestsPerDay),
        tokensPerDay: Math.round(tokensPerDay),
        projected30DayRequests: Math.round(requestsPerDay * 30),
        projected30DayTokens: Math.round(tokensPerDay * 30),
        avgTokensPerRequest: requestCount > 0 ? Math.round(totalTokens / requestCount) : 0,
        avgPromptTokens: requestCount > 0 ? Math.round(totalPromptTokens / requestCount) : 0,
        avgCompletionTokens: requestCount > 0 ? Math.round(totalCompletionTokens / requestCount) : 0,
        estimatedCost: estimatedCost > 0 ? `$${estimatedCost.toFixed(4)}` : 'Free tier'
      };
    },
    refetchInterval: aiRefreshInterval,
  });

  const effectiveRate = calibratedRate ?? 0.000134;
  
  // Calculate costs by category
  const emailIngestionCost = (costBreakdown?.categories.emailIngestion.ops || 0) * effectiveRate;
  const huntOpsCost = (costBreakdown?.categories.huntOperations.ops || 0) * effectiveRate;
  const loadMgmtCost = (costBreakdown?.categories.loadManagement.ops || 0) * effectiveRate;
  const trackingCost = (costBreakdown?.categories.tracking.ops || 0) * effectiveRate;
  const otherCost = (costBreakdown?.categories.other.ops || 0) * effectiveRate;
  
  // Edge function cost estimate (compute time)
  const edgeFunctionCost = (costBreakdown?.totals.edgeFunctions || 0) * 0.000001; // $0.001 per 1000 invocations
  
  // Realtime cost estimate
  const realtimeCost = (costBreakdown?.totals.realtimeEvents || 0) * 0.0000001;
  
  const totalCloudCost = emailIngestionCost + huntOpsCost + loadMgmtCost + trackingCost + otherCost + edgeFunctionCost + realtimeCost;
  const totalWriteOps = costBreakdown?.totals.writeOps || 0;

  // Calculate daily cost from 24h data
  const dailyCost = (costDrivers?.twentyFourHours?.emails || 0) * effectiveRate * 2.5;
  const projectedMonthlyCost = dailyCost * 30;

  const handleCalibrate = () => {
    const spend = parseFloat(actualSpend);
    const writeOps = totalWriteOps;
    if (spend > 0 && writeOps > 0) {
      const rate = spend / writeOps;
      setCalibratedRate(rate);
      localStorage.setItem('cloud_calibrated_rate', rate.toString());
      localStorage.setItem('cloud_calibration_date', new Date().toISOString());
      toast.success(`Calibrated rate set to $${rate.toFixed(6)} per write operation`);
      setActualSpend("");
      setShowCalibration(false);
    }
  };

  const clearCalibration = () => {
    setCalibratedRate(null);
    localStorage.removeItem('cloud_calibrated_rate');
    localStorage.removeItem('cloud_calibration_date');
    toast.success("Calibration cleared, using default rate");
  };

  const saveBudget = () => {
    localStorage.setItem('cloud_monthly_budget', monthlyBudget.toString());
    toast.success(`Budget set to $${monthlyBudget}/month`);
    setShowBudgetSettings(false);
  };

  const aiCostNumber = aiStats?.estimatedCost && aiStats.estimatedCost !== 'Free tier' 
    ? parseFloat(aiStats.estimatedCost.replace('$', '')) : 0;

  const totalEstimatedCost = totalCloudCost + aiCostNumber;
  const budgetUsagePercent = (projectedMonthlyCost / monthlyBudget) * 100;

  // Check spend alerts when cost data changes
  useEffect(() => {
    const checkSpendAlerts = async () => {
      if (totalCloudCost > 0) {
        try {
          await supabase.functions.invoke('send-spend-alert', {
            body: { estimated_spend: totalCloudCost }
          });
        } catch (error) {
          console.log('Spend alert check failed:', error);
        }
      }
    };
    
    checkSpendAlerts();
  }, [totalCloudCost]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Lovable Cloud & AI</h2>
            <p className="text-muted-foreground mt-1">Complete cost visibility and projections</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            refetchCostBreakdown();
            refetchCostDrivers();
            refetchAi();
          }} disabled={isCostFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isCostFetching ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
        </div>

        {/* Budget Alert Banner */}
        {budgetUsagePercent > 80 && (
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            budgetUsagePercent > 100 
              ? 'bg-red-500/10 border-red-500/30' 
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
              budgetUsagePercent > 100 ? 'text-red-500' : 'text-amber-500'
            }`} />
            <div>
              <p className={`font-medium ${budgetUsagePercent > 100 ? 'text-red-600' : 'text-amber-600'}`}>
                {budgetUsagePercent > 100 ? 'Over Budget!' : 'Approaching Budget Limit'}
              </p>
              <p className="text-sm text-muted-foreground">
                Projected monthly cost: ${projectedMonthlyCost.toFixed(2)} ({budgetUsagePercent.toFixed(0)}% of ${monthlyBudget} budget)
              </p>
            </div>
          </div>
        )}

        {/* Summary Cards Row */}
        <div className="grid grid-cols-5 gap-4">
          {/* All-Time Total - matches Lovable billing */}
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4 text-green-500" />
                All-Time Total
                <InfoTooltip text="Estimated total spend since project started. Calibrate with your actual Lovable billing for accuracy." />
              </div>
              <div className="text-2xl font-bold mt-1 text-green-600">${totalCloudCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {totalWriteOps.toLocaleString()} operations
              </div>
            </CardContent>
          </Card>

          {/* Today's Cost */}
          <Card className="border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Today's Cost
              </div>
              <div className="text-2xl font-bold mt-1">${dailyCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {(costDrivers?.twentyFourHours?.emails || 0).toLocaleString()} emails
              </div>
            </CardContent>
          </Card>

          {/* Projected Monthly */}
          <Card className={`border-primary/20 ${budgetUsagePercent > 100 ? 'border-red-500/50' : ''}`}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                30-Day Projection
              </div>
              <div className={`text-2xl font-bold mt-1 ${budgetUsagePercent > 100 ? 'text-red-500' : ''}`}>
                ${projectedMonthlyCost.toFixed(2)}
              </div>
              <div className="mt-1">
                <Progress value={Math.min(budgetUsagePercent, 100)} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* Current Hour Rate */}
          <Card className="border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Current Rate
              </div>
              <div className="text-2xl font-bold mt-1">
                {(costDrivers?.oneHour?.emails || 0).toLocaleString()}/hr
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {(costDrivers?.oneHour?.emails || 0) > (costDrivers?.hourlyRate || 0) 
                  ? <><ArrowUpRight className="h-3 w-3 text-red-500" /> Above avg</>
                  : <><ArrowDownRight className="h-3 w-3 text-green-500" /> Below avg</>
                }
              </div>
            </CardContent>
          </Card>

          {/* Budget */}
          <Card className="border-primary/20 cursor-pointer hover:bg-muted/50 transition-colors" 
                onClick={() => setShowBudgetSettings(!showBudgetSettings)}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bell className="h-4 w-4" />
                Monthly Budget
              </div>
              <div className="text-2xl font-bold mt-1">${monthlyBudget}</div>
              <div className="text-xs text-muted-foreground">Click to adjust</div>
            </CardContent>
          </Card>
        </div>

        {/* Budget Settings */}
        {showBudgetSettings && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">Monthly Budget Alert Threshold</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(parseFloat(e.target.value) || 0)}
                      className="w-32"
                    />
                    <Button onClick={saveBudget}>Save</Button>
                    <Button variant="ghost" onClick={() => setShowBudgetSettings(false)}>Cancel</Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  You'll see a warning when projected costs exceed 80% of this amount.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cost Breakdown by Category */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Cost Breakdown by Category
                  <InfoTooltip text="Detailed breakdown of what's consuming your cloud budget" />
                </CardTitle>
                <CardDescription>All-time database operations</CardDescription>
              </div>
              <div className="text-2xl font-bold">${totalCloudCost.toFixed(2)}</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <CostCategory 
              label="Email Ingestion" 
              amount={emailIngestionCost}
              percentage={totalCloudCost > 0 ? (emailIngestionCost / totalCloudCost) * 100 : 0}
              icon={HardDrive}
              color="bg-blue-500/10 text-blue-500"
            />
            <CostCategory 
              label="Hunt & Matching" 
              amount={huntOpsCost}
              percentage={totalCloudCost > 0 ? (huntOpsCost / totalCloudCost) * 100 : 0}
              icon={Zap}
              color="bg-orange-500/10 text-orange-500"
            />
            <CostCategory 
              label="Load Management" 
              amount={loadMgmtCost}
              percentage={totalCloudCost > 0 ? (loadMgmtCost / totalCloudCost) * 100 : 0}
              icon={Server}
              color="bg-green-500/10 text-green-500"
            />
            <CostCategory 
              label="Tracking & Maps" 
              amount={trackingCost}
              percentage={totalCloudCost > 0 ? (trackingCost / totalCloudCost) * 100 : 0}
              icon={BarChart3}
              color="bg-purple-500/10 text-purple-500"
            />
            <CostCategory 
              label="Edge Functions" 
              amount={edgeFunctionCost}
              percentage={totalCloudCost > 0 ? (edgeFunctionCost / totalCloudCost) * 100 : 0}
              icon={Server}
              color="bg-amber-500/10 text-amber-500"
            />
            <CostCategory 
              label="Other (AI, Email, Audit)" 
              amount={otherCost}
              percentage={totalCloudCost > 0 ? (otherCost / totalCloudCost) * 100 : 0}
              icon={Sparkles}
              color="bg-pink-500/10 text-pink-500"
            />
            
            {/* Detailed breakdown */}
            <div className="pt-4 mt-4 border-t">
              <p className="text-sm font-medium mb-3">Detailed Write Operations</p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted">
                  <p className="text-muted-foreground">Emails</p>
                  <p className="font-semibold text-lg">{(costBreakdown?.raw.emails || 0).toLocaleString()}</p>
                </div>
                <div className="p-2 rounded bg-muted">
                  <p className="text-muted-foreground">Geocode</p>
                  <p className="font-semibold text-lg">{(costBreakdown?.raw.geocode || 0).toLocaleString()}</p>
                </div>
                <div className="p-2 rounded bg-muted">
                  <p className="text-muted-foreground">Matches</p>
                  <p className="font-semibold text-lg">{(costBreakdown?.raw.matches || 0).toLocaleString()}</p>
                </div>
                <div className="p-2 rounded bg-muted">
                  <p className="text-muted-foreground">Edge Calls</p>
                  <p className="font-semibold text-lg">{(costBreakdown?.totals.edgeFunctions || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Cost History Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              7-Day Cost History
            </CardTitle>
            <CardDescription>Email volume and associated costs by day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyCostHistory || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'emails') return [value.toLocaleString(), 'Emails'];
                      if (name === 'cost') return [`$${(value * effectiveRate * 2.5).toFixed(2)}`, 'Est. Cost'];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="emails" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-center">
              {(dailyCostHistory || []).map((day, i) => (
                <div key={i} className="p-2 rounded bg-muted">
                  <p className="text-muted-foreground">{day.day}</p>
                  <p className="font-medium">${(day.emails * effectiveRate * 2.5).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 24-Hour Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              24-Hour Email Activity
            </CardTitle>
            <CardDescription>Hourly breakdown to identify peak usage times</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" className="text-xs" interval={2} />
                  <YAxis className="text-xs" />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="emails" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hunt Cost Calculator */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-green-500" />
              Hunt Cost Simulator
              <InfoTooltip text="Estimate additional costs when enabling hunts" />
            </CardTitle>
            <CardDescription>See how hunt plans affect your costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded bg-background border">
                <p className="text-sm font-medium mb-3">Current Rate: {(costDrivers?.hourlyRate || 0).toFixed(0)} emails/hour</p>
                <div className="grid grid-cols-5 gap-4 text-center">
                  <div className="p-3 rounded bg-muted">
                    <p className="text-xs text-muted-foreground">No Hunts</p>
                    <p className="text-lg font-bold">${dailyCost.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">/day</p>
                  </div>
                  <div className="p-3 rounded bg-muted">
                    <p className="text-xs text-muted-foreground">1 Hunt</p>
                    <p className="text-lg font-bold">${(dailyCost * 1.05).toFixed(2)}</p>
                    <p className="text-xs text-green-600">+5%</p>
                  </div>
                  <div className="p-3 rounded bg-muted">
                    <p className="text-xs text-muted-foreground">3 Hunts</p>
                    <p className="text-lg font-bold">${(dailyCost * 1.12).toFixed(2)}</p>
                    <p className="text-xs text-green-600">+12%</p>
                  </div>
                  <div className="p-3 rounded bg-muted">
                    <p className="text-xs text-muted-foreground">5 Hunts</p>
                    <p className="text-lg font-bold">${(dailyCost * 1.18).toFixed(2)}</p>
                    <p className="text-xs text-amber-600">+18%</p>
                  </div>
                  <div className="p-3 rounded bg-muted">
                    <p className="text-xs text-muted-foreground">10 Hunts</p>
                    <p className="text-lg font-bold">${(dailyCost * 1.30).toFixed(2)}</p>
                    <p className="text-xs text-red-600">+30%</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                * Estimates assume 10% match rate per hunt. Actual costs depend on pickup radius and email locations.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Real-Time Cost Drivers */}
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  Real-Time Cost Drivers
                </CardTitle>
                <CardDescription>Activity breakdown for last 1 hour and 24 hours</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchCostDrivers()} disabled={isCostDriversFetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isCostDriversFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              {/* Last 1 Hour */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Last 1 Hour
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Emails</span>
                    <span className={`font-medium ${(costDrivers?.oneHour?.emails || 0) > 500 ? 'text-red-500' : ''}`}>
                      {(costDrivers?.oneHour?.emails || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Geocode</span>
                    <span className="font-medium">{(costDrivers?.oneHour?.geocode || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Matches</span>
                    <span className="font-medium">{(costDrivers?.oneHour?.matches || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Edge Functions</span>
                    <span className="font-medium">{(costDrivers?.edgeFunctions1h || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              {/* Last 24 Hours */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <BarChart3 className="h-4 w-4 text-orange-500" />
                  Last 24 Hours
                  {costDrivers?.hourlyRate && (
                    <span className="text-xs text-muted-foreground">(~{Math.round(costDrivers.hourlyRate)}/hr)</span>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Emails</span>
                    <span className={`font-medium ${(costDrivers?.twentyFourHours?.emails || 0) > 10000 ? 'text-red-500' : ''}`}>
                      {(costDrivers?.twentyFourHours?.emails || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Geocode</span>
                    <span className="font-medium">{(costDrivers?.twentyFourHours?.geocode || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Matches</span>
                    <span className="font-medium">{(costDrivers?.twentyFourHours?.matches || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Edge Functions</span>
                    <span className="font-medium">{(costDrivers?.edgeFunctions24h || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* High volume alert */}
            {(costDrivers?.twentyFourHours?.emails || 0) > 10000 && (
              <div className="mt-4 p-3 rounded bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-red-600">High Volume:</span>
                  <span className="text-muted-foreground ml-1">
                    {(costDrivers?.twentyFourHours?.emails || 0).toLocaleString()} emails/24h. 
                    Est. ~${dailyCost.toFixed(2)}/day.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calibration Panel */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-blue-500" />
                  Calibrate Cost Estimates
                </CardTitle>
                <CardDescription>Sync estimates with actual Lovable billing for accuracy</CardDescription>
              </div>
              <Button 
                variant={showCalibration ? "secondary" : "outline"}
                size="sm" 
                onClick={() => setShowCalibration(!showCalibration)}
              >
                {showCalibration ? 'Hide' : 'Calibrate'}
              </Button>
            </div>
          </CardHeader>
          {(showCalibration || calibratedRate) && (
            <CardContent>
              {calibratedRate && (
                <div className="mb-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <div className="flex justify-between items-center">
                    <div className="text-sm">
                      <span className="font-medium text-blue-600">Calibrated Rate:</span>
                      <span className="text-muted-foreground ml-2">${calibratedRate.toFixed(6)}/write</span>
                      {localStorage.getItem('cloud_calibration_date') && (
                        <span className="text-muted-foreground ml-2">
                          (set {new Date(localStorage.getItem('cloud_calibration_date')!).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearCalibration}>Clear</Button>
                  </div>
                </div>
              )}
              
              {showCalibration && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Check Settings → Plans & Credits and enter actual Cloud spend:
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 75.00"
                        value={actualSpend}
                        onChange={(e) => setActualSpend(e.target.value)}
                        className="pl-7"
                      />
                    </div>
                    <Button onClick={handleCalibrate} disabled={!actualSpend}>Calibrate</Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Tracked write ops: <span className="font-medium">{totalWriteOps.toLocaleString()}</span></p>
                    {actualSpend && parseFloat(actualSpend) > 0 && totalWriteOps > 0 && (
                      <p>
                        New rate: <span className="font-medium text-blue-600">
                          ${(parseFloat(actualSpend) / totalWriteOps).toFixed(6)}/write
                        </span>
                        {' '}(vs default $0.000134)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Lovable AI Usage */}
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Lovable AI
                </CardTitle>
                <CardDescription>AI usage and costs - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</CardDescription>
              </div>
              <RefreshControl
                lastRefresh={lastAiRefresh}
                refreshInterval={aiRefreshInterval}
                onIntervalChange={setAiRefreshInterval}
                onRefresh={() => refetchAi()}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Model:</p>
                <p className="font-medium">google/gemini-2.5-flash</p>
              </div>
              <Button onClick={() => testAiMutation.mutate()} disabled={testAiMutation.isPending}>
                {testAiMutation.isPending ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Testing...</>
                ) : (
                  <><Sparkles className="mr-1 h-4 w-4" />Test AI</>
                )}
              </Button>
            </div>
            
            {aiTestResult && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">Response:</p>
                <p className="text-sm text-muted-foreground">{aiTestResult}</p>
              </div>
            )}

            <div className="pt-3 border-t">
              <p className="font-medium mb-2">This Month ({aiStats?.daysOfData || 0} days)</p>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-xl font-semibold">{aiStats?.count || 0}</p>
                  <p className="text-xs text-muted-foreground">~{aiStats?.requestsPerDay || 0}/day</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Tokens</p>
                  <p className="text-xl font-semibold">{(aiStats?.totalTokens || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">~{aiStats?.avgTokensPerRequest || 0}/req</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">30-Day Projection</p>
                  <p className="text-xl font-semibold">{(aiStats?.projected30DayTokens || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">~{aiStats?.projected30DayRequests || 0} requests</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Est. Cost</p>
                  <p className="text-xl font-semibold text-green-600">{aiStats?.estimatedCost || 'Free tier'}</p>
                  <p className="text-xs text-muted-foreground">This month</p>
                </div>
              </div>
            </div>

            {/* Token breakdown */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Input Tokens</p>
                <p className="font-semibold">{(aiStats?.totalPromptTokens || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Output Tokens</p>
                <p className="font-semibold">{(aiStats?.totalCompletionTokens || 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Feature breakdown */}
            {aiStats?.featureBreakdown && Object.keys(aiStats.featureBreakdown).length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">Usage by Feature</p>
                <div className="space-y-1">
                  {Object.entries(aiStats.featureBreakdown)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([feature, stats]) => (
                    <div key={feature} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{stats.label}</span>
                      <span className="font-medium">{stats.count} • {stats.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Explanation Footer */}
        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-2">Understanding Your Costs</p>
            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div>
                <p className="font-medium text-foreground mb-1">What We Track:</p>
                <ul className="space-y-0.5">
                  <li>• Database writes (emails, matches, geocode)</li>
                  <li>• Edge function invocations</li>
                  <li>• AI API calls and tokens</li>
                  <li>• Realtime message estimates</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">What's Not Tracked:</p>
                <ul className="space-y-0.5">
                  <li>• Database read queries</li>
                  <li>• Bandwidth/egress</li>
                  <li>• Storage costs</li>
                  <li>• Auth operations</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              <strong>Tip:</strong> Calibrate your costs by entering actual billing to get the most accurate projections.
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default LovableCloudAITab;