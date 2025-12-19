import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Sparkles, Loader2, Clock, BarChart3, RefreshCw, Info, Settings, Zap, AlertTriangle, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshControl } from "@/components/RefreshControl";

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

const LovableCloudAITab = () => {
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [actualSpend, setActualSpend] = useState<string>("");
  const [calibratedRate, setCalibratedRate] = useState<number | null>(null);
  const [aiTestResult, setAiTestResult] = useState<string>("");
  const [lastAiRefresh, setLastAiRefresh] = useState<Date>(new Date());
  const [aiRefreshInterval, setAiRefreshInterval] = useState<number>(60000);
  const queryClient = useQueryClient();
  
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  // Load calibrated rate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cloud_calibrated_rate');
    if (saved) {
      setCalibratedRate(parseFloat(saved));
    }
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

  // Cloud usage stats query
  const { data: cloudUsageStats, refetch: refetchCloudUsage, isFetching: isCloudFetching } = useQuery({
    queryKey: ["cloud-usage-estimate", currentMonth],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
      
      const [
        emailResult, matchResult, geocodeResult, mapTrackingResult,
        directionsResult, aiResult, emailSendResult, auditResult,
        matchActionResult, emailVolumeResult, archiveResult
      ] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        supabase.from('ai_usage_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('timestamp', thirtyDaysAgoISO),
        supabase.from('match_action_history').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        supabase.from('load_emails_archive').select('*', { count: 'exact', head: true }).gte('archived_at', thirtyDaysAgoISO)
      ]);
      
      const emailOps = emailResult.count ?? 0;
      const matchOps = matchResult.count ?? 0;
      const geocodeOps = geocodeResult.count ?? 0;
      const mapTrackingOps = mapTrackingResult.count ?? 0;
      const directionsOps = directionsResult.count ?? 0;
      const aiOps = aiResult.count ?? 0;
      const emailSendOps = emailSendResult.count ?? 0;
      const auditOps = auditResult.count ?? 0;
      const matchActionOps = matchActionResult.count ?? 0;
      const emailVolumeOps = emailVolumeResult.count ?? 0;
      const archiveOps = archiveResult.count ?? 0;
      
      const writeOps = emailOps + matchOps + geocodeOps + mapTrackingOps + 
                       directionsOps + aiOps + emailSendOps + auditOps + 
                       matchActionOps + emailVolumeOps + archiveOps;
      
      const estimatedReadMultiplier = 4;
      const estimatedReadOps = writeOps * estimatedReadMultiplier;
      const edgeFunctionCalls = emailOps * 2.5 + aiOps + emailSendOps;
      const realtimeOps = emailOps * 10;
      const totalOps = writeOps + Math.round(estimatedReadOps) + Math.round(edgeFunctionCalls) + realtimeOps;
      
      const COST_PER_WRITE_OP = 0.000134;
      const estimatedCost = writeOps * COST_PER_WRITE_OP;
      
      return {
        writeOps,
        estimatedReadOps,
        edgeFunctionCalls: Math.round(edgeFunctionCalls),
        realtimeOps,
        totalOps,
        estimatedCost: estimatedCost.toFixed(2),
        breakdown: {
          emails: emailOps, matches: matchOps, geocode: geocodeOps,
          mapTracking: mapTrackingOps, directions: directionsOps, ai: aiOps,
          emailSend: emailSendOps, audit: auditOps, matchActions: matchActionOps,
          emailVolume: emailVolumeOps, archive: archiveOps
        }
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
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
  const cloudCostNumber = (cloudUsageStats?.writeOps || 0) * effectiveRate;

  const handleCalibrate = () => {
    const spend = parseFloat(actualSpend);
    const writeOps = cloudUsageStats?.writeOps || 0;
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

  const aiCostNumber = aiStats?.estimatedCost && aiStats.estimatedCost !== 'Free tier' 
    ? parseFloat(aiStats.estimatedCost.replace('$', '')) : 0;

  const totalEstimatedCost = (cloudCostNumber + aiCostNumber).toFixed(2);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lovable Cloud & AI</h2>
          <p className="text-muted-foreground mt-1">Monitor cloud operations, AI usage, and cost drivers</p>
        </div>

        {/* Total Estimated Cost */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5" />
                Estimated Cloud + AI Cost (30 Days)
                <InfoTooltip text={calibratedRate 
                  ? `Using calibrated rate: $${calibratedRate.toFixed(6)}/write op` 
                  : "Estimated based on tracked operations. Calibrate for better accuracy."
                } />
              </CardTitle>
              <div className="text-3xl font-bold text-primary">${totalEstimatedCost}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-amber-600" />
                <span>Cloud: ~${cloudCostNumber.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span>AI: {aiStats?.estimatedCost || 'Free tier'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lovable Cloud Usage */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-amber-600" />
                  Lovable Cloud
                  <InfoTooltip text="Database operations, edge functions, and realtime subscriptions. Rate: $0.000134/write (or calibrated rate)." />
                  {isCloudFetching && <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
                </CardTitle>
                <CardDescription>Write operations and estimated costs</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => refetchCloudUsage()} disabled={isCloudFetching}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${isCloudFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <span className="text-xl font-bold text-amber-600">~${cloudCostNumber.toFixed(2)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Write Operations</p>
                <p className="text-2xl font-semibold">{(cloudUsageStats?.writeOps || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">DB Reads (est 4x)</p>
                <p className="text-2xl font-semibold">{(cloudUsageStats?.estimatedReadOps || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Edge Functions</p>
                <p className="text-2xl font-semibold">{(cloudUsageStats?.edgeFunctionCalls || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rate{calibratedRate ? ' (calibrated)' : ''}</p>
                <p className={`text-lg font-semibold ${calibratedRate ? 'text-amber-600' : ''}`}>${effectiveRate.toFixed(6)}/write</p>
              </div>
            </div>

            {/* Write operations breakdown */}
            {cloudUsageStats?.breakdown && (cloudUsageStats?.writeOps || 0) > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">Write Operations Breakdown</p>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Emails</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.emails || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Matches</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.matches || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Geocode</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.geocode || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Map Track</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.mapTracking || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Email Vol</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.emailVolume || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50">
                    <p className="text-muted-foreground">Archive</p>
                    <p className="font-semibold">{(cloudUsageStats.breakdown.archive || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Drivers Panel */}
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  Real-Time Cost Drivers
                  <InfoTooltip text="Shows what's consuming resources. High numbers indicate cost sources." />
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
                    <span className={`font-medium ${(costDrivers?.oneHour.emails || 0) > 500 ? 'text-red-500' : ''}`}>
                      {(costDrivers?.oneHour.emails || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Geocode</span>
                    <span className="font-medium">{(costDrivers?.oneHour.geocode || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Matches</span>
                    <span className="font-medium">{(costDrivers?.oneHour.matches || 0).toLocaleString()}</span>
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
                    <span className={`font-medium ${(costDrivers?.twentyFourHours.emails || 0) > 10000 ? 'text-red-500' : ''}`}>
                      {(costDrivers?.twentyFourHours.emails || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Geocode</span>
                    <span className="font-medium">{(costDrivers?.twentyFourHours.geocode || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Matches</span>
                    <span className="font-medium">{(costDrivers?.twentyFourHours.matches || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background/50">
                    <span className="text-muted-foreground">Edge Functions</span>
                    <span className="font-medium">{(costDrivers?.edgeFunctions24h || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* High volume alert */}
            {(costDrivers?.twentyFourHours.emails || 0) > 10000 && (
              <div className="mt-4 p-3 rounded bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-red-600">High Volume:</span>
                  <span className="text-muted-foreground ml-1">
                    {(costDrivers?.twentyFourHours.emails || 0).toLocaleString()} emails/24h. 
                    Est. ~${((costDrivers?.twentyFourHours.emails || 0) * effectiveRate * 2.5).toFixed(2)}/day.
                  </span>
                </div>
              </div>
            )}
            
            <div className="mt-4 pt-3 border-t text-sm text-muted-foreground flex justify-between">
              <span>Projected 30-day cost:</span>
              <span className="font-medium text-foreground">
                ~${((costDrivers?.twentyFourHours.emails || 0) * effectiveRate * 2.5 * 30).toFixed(2)}
              </span>
            </div>
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
                  <InfoTooltip text="Enter actual billing to compute a more accurate rate." />
                </CardTitle>
                <CardDescription>Sync estimates with actual Lovable billing</CardDescription>
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
                    <p>Tracked write ops: <span className="font-medium">{(cloudUsageStats?.writeOps || 0).toLocaleString()}</span></p>
                    {actualSpend && parseFloat(actualSpend) > 0 && (cloudUsageStats?.writeOps || 0) > 0 && (
                      <p>
                        New rate: <span className="font-medium text-blue-600">
                          ${(parseFloat(actualSpend) / (cloudUsageStats?.writeOps || 1)).toFixed(6)}/write
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
                <p className="text-xs text-muted-foreground">~{aiStats?.avgPromptTokens || 0} avg/request</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Output Tokens</p>
                <p className="font-semibold">{(aiStats?.totalCompletionTokens || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">~{aiStats?.avgCompletionTokens || 0} avg/request</p>
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

            {/* Model breakdown */}
            {aiStats?.modelBreakdown && Object.keys(aiStats.modelBreakdown).length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">Usage by Model</p>
                <div className="space-y-1">
                  {Object.entries(aiStats.modelBreakdown).map(([model, stats]) => (
                    <div key={model} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground truncate max-w-[200px]">{model}</span>
                      <span className="font-medium">{stats.count} • {stats.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <p>• Usage-based pricing per AI request</p>
              <p>• Check credit balance in Lovable workspace settings</p>
              <p>• Free monthly usage included, then pay-as-you-go</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default LovableCloudAITab;
