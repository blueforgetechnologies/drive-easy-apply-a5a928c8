import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign, Sparkles, Loader2, Clock, BarChart3, RefreshCw, HardDrive, LayoutGrid, List, Info, Archive, Settings, Zap, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { RefreshControl } from "@/components/RefreshControl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Info tooltip component for explanations
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
// Storage tier limits in MB
const STORAGE_LIMITS = {
  standard: 500, // 500 MB
  pro: 8000, // 8 GB
};

const UsageCostsTab = () => {
  const [aiTestResult, setAiTestResult] = useState<string>("");
  const [emailSource, setEmailSource] = useState<string>("sylectus");
  const [mapboxRefreshInterval, setMapboxRefreshInterval] = useState<number>(20000); // 20 seconds default
  const [geocodeCacheRefreshInterval, setGeocodeCacheRefreshInterval] = useState<number>(30000); // 30 seconds default
  const [emailRefreshInterval, setEmailRefreshInterval] = useState<number>(30000); // 30 seconds default
  const [databaseRefreshInterval, setDatabaseRefreshInterval] = useState<number>(30000); // 30 seconds default
  const [activityRefreshInterval, setActivityRefreshInterval] = useState<number>(30000); // 30 seconds default
  const [pubsubRefreshInterval, setPubsubRefreshInterval] = useState<number>(60000); // 1 minute default
  const [resendRefreshInterval, setResendRefreshInterval] = useState<number>(60000); // 1 minute default
  const [aiRefreshInterval, setAiRefreshInterval] = useState<number>(60000); // 1 minute default
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [lastGeocodeRefresh, setLastGeocodeRefresh] = useState<Date>(new Date());
  const [lastEmailRefresh, setLastEmailRefresh] = useState<Date>(new Date());
  const [lastDatabaseRefresh, setLastDatabaseRefresh] = useState<Date>(new Date());
  const [lastActivityRefresh, setLastActivityRefresh] = useState<Date>(new Date());
  const [lastPubsubRefresh, setLastPubsubRefresh] = useState<Date>(new Date());
  const [lastResendRefresh, setLastResendRefresh] = useState<Date>(new Date());
  const [lastAiRefresh, setLastAiRefresh] = useState<Date>(new Date());
  const [isCompactView, setIsCompactView] = useState<boolean>(false);
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [actualSpend, setActualSpend] = useState<string>("");
  const [calibratedRate, setCalibratedRate] = useState<number | null>(null);
  const queryClient = useQueryClient();
  
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

  // Archive old emails mutation (moves emails >30 days to archive table)
  const archiveEmailsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('archive-old-emails');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Archived ${data.archived} emails. Main: ${data.mainTableCount}, Archive: ${data.archiveTableCount}`);
      queryClient.invalidateQueries({ queryKey: ["usage-table-counts"] });
      queryClient.invalidateQueries({ queryKey: ["usage-pubsub"] });
    },
    onError: (error: any) => {
      console.error("Archive error:", error);
      toast.error(error.message || "Failed to archive emails");
    }
  });

  // Get current month in YYYY-MM format
  const currentMonth = new Date().toISOString().slice(0, 7);

  // CRITICAL: BASELINE + INCREMENTAL ARCHITECTURE (DO NOT CHANGE)
  // 1. Baseline comes from mapbox_monthly_usage table (synced from Mapbox dashboard)
  // 2. Incremental counts from tracking tables SINCE last_synced_at are added on top
  // 3. This preserves user's baseline data while showing real-time updates
  
  const { data: baselineUsage, isFetching: isUsageFetching, refetch: refetchBaseline } = useQuery({
    queryKey: ["mapbox-baseline", currentMonth],
    queryFn: async () => {
      console.log('[Mapbox] Fetching baseline for month:', currentMonth);
      const { data, error } = await supabase
        .from('mapbox_monthly_usage')
        .select('*')
        .eq('month_year', currentMonth)
        .maybeSingle();
      
      if (error) {
        console.error('[Mapbox] Baseline fetch error:', error);
        throw error;
      }
      console.log('[Mapbox] Baseline data:', data);
      return data;
    },
    refetchInterval: mapboxRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 10000, // Show cached data for 10s while refreshing in background
    gcTime: 300000,
  });

  // Fetch incremental calls since last sync - PARALLEL queries
  const { data: incrementalCalls, refetch: refetchIncremental } = useQuery({
    queryKey: ["mapbox-incremental", currentMonth, baselineUsage?.last_synced_at],
    queryFn: async () => {
      const lastSyncedAt = baselineUsage?.last_synced_at;
      console.log('[Mapbox] Fetching incremental since:', lastSyncedAt);
      
      if (!lastSyncedAt) {
        setLastRefresh(new Date());
        return { geocoding: 0, mapLoads: 0, directions: 0 };
      }
      
      // Run all three counts in PARALLEL
      const [geocodingResult, mapLoadsResult, directionsResult] = await Promise.all([
        supabase
          .from('geocode_cache')
          .select('*', { count: 'exact', head: true })
          .gt('created_at', lastSyncedAt)
          .eq('month_created', currentMonth),
        supabase
          .from('map_load_tracking')
          .select('*', { count: 'exact', head: true })
          .gt('created_at', lastSyncedAt)
          .eq('month_year', currentMonth),
        supabase
          .from('directions_api_tracking')
          .select('*', { count: 'exact', head: true })
          .gt('created_at', lastSyncedAt)
          .eq('month_year', currentMonth)
      ]);
      
      const result = {
        geocoding: geocodingResult.count || 0,
        mapLoads: mapLoadsResult.count || 0,
        directions: directionsResult.count || 0
      };
      console.log('[Mapbox] Incremental data:', result);
      setLastRefresh(new Date());
      return result;
    },
    enabled: !!baselineUsage,
    refetchInterval: mapboxRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 10000, // Show cached data while refreshing
    gcTime: 300000,
  });

  // FALLBACK: Manual interval to force refresh if React Query fails to auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[Mapbox] Manual interval refresh triggered');
      refetchBaseline();
      if (baselineUsage) {
        refetchIncremental();
      }
    }, mapboxRefreshInterval);
    
    return () => clearInterval(interval);
  }, [mapboxRefreshInterval, refetchBaseline, refetchIncremental, baselineUsage]);

  // Combined usage: baseline (from Mapbox dashboard) + incremental (new calls since sync)
  const currentMonthUsage = baselineUsage ? {
    ...baselineUsage,
    geocoding_api_calls: (baselineUsage.geocoding_api_calls || 0) + (incrementalCalls?.geocoding || 0),
    map_loads: (baselineUsage.map_loads || 0) + (incrementalCalls?.mapLoads || 0),
    directions_api_calls: (baselineUsage.directions_api_calls || 0) + (incrementalCalls?.directions || 0),
  } : null;
  
  // Log combined usage for debugging
  useEffect(() => {
    if (baselineUsage) {
      console.log('[Mapbox] Combined usage:', {
        baseline: baselineUsage.geocoding_api_calls,
        incremental: incrementalCalls?.geocoding || 0,
        total: currentMonthUsage?.geocoding_api_calls
      });
    }
  }, [baselineUsage, incrementalCalls, currentMonthUsage]);

  // Fetch geocode cache stats - read directly from cache for accurate real-time data
  const { data: geocodeStats, isFetching: isGeocodeStatsFetching, refetch: refetchGeocodeStats } = useQuery({
    queryKey: ["geocode-cache-stats"],
    queryFn: async () => {
      console.log('[Geocode Cache] Fetching real-time stats from cache table...');
      
      // Get count of locations
      const { count: totalLocations } = await supabase
        .from('geocode_cache')
        .select('*', { count: 'exact', head: true });
      
      // Get sum of hit_count - need to fetch all rows due to no aggregate support
      // Fetch in batches to handle large tables
      let totalHits = 0;
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch } = await supabase
          .from('geocode_cache')
          .select('hit_count')
          .range(offset, offset + batchSize - 1);
        
        if (!batch || batch.length === 0) break;
        totalHits += batch.reduce((sum, row) => sum + (row.hit_count || 1), 0);
        offset += batchSize;
        if (batch.length < batchSize) break;
      }
      
      const cacheSaved = Math.max(0, totalHits - (totalLocations || 0));
      const estimatedSavings = cacheSaved * 0.00075; // $0.75 per 1000 calls saved
      
      setLastGeocodeRefresh(new Date());
      console.log('[Geocode Cache] Real-time stats:', { totalLocations, totalHits, cacheSaved });
      
      return {
        totalLocations: totalLocations || 0,
        totalHits,
        cacheSaved,
        estimatedSavings: estimatedSavings.toFixed(2),
        cacheHitRate: totalHits > 0 ? (cacheSaved / totalHits * 100).toFixed(1) : '0'
      };
    },
    refetchInterval: geocodeCacheRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 30000,
    gcTime: 300000,
  });

  // Fetch historical geocode cache stats
  const { data: dailyStats } = useQuery({
    queryKey: ["geocode-daily-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geocode_cache_daily_stats')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(7);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch table counts - PARALLEL queries for speed
  const { data: tableCounts } = useQuery({
    queryKey: ["usage-table-counts"],
    queryFn: async () => {
      const tables = [
        'loads', 'load_emails', 'load_stops', 'load_hunt_matches',
        'vehicles', 'applications', 'dispatchers', 'carriers',
        'customers', 'payees', 'settlements', 'invoices',
        'maintenance_records', 'audit_logs', 'load_documents', 'geocode_cache'
      ] as const;
      
      // Run all count queries in parallel instead of sequentially
      const countPromises = tables.map(table => 
        supabase
          .from(table as any)
          .select('*', { count: 'exact', head: true })
          .then(({ count }) => ({ table, count: count || 0 }))
      );
      
      const results = await Promise.all(countPromises);
      const counts: Record<string, number> = {};
      results.forEach(({ table, count }) => { counts[table] = count; });
      return counts;
    },
    staleTime: 60000, // Keep fresh for 1 minute
    gcTime: 300000, // Cache for 5 minutes
  });

  // Fetch recent activity counts (last 30 days) - PARALLEL queries
  const { data: recentActivity, refetch: refetchRecentActivity } = useQuery({
    queryKey: ["usage-recent-activity"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
      
      const [emailsResult, loadsResult, matchesResult] = await Promise.all([
        supabase
          .from('load_emails')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgoISO),
        supabase
          .from('loads')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgoISO),
        supabase
          .from('load_hunt_matches')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgoISO)
      ]);
      
      setLastActivityRefresh(new Date());
      return {
        emails: emailsResult.count || 0,
        loads: loadsResult.count || 0,
        matches: matchesResult.count || 0
      };
    },
    refetchInterval: activityRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 30000, // Show cached data for 30s
    gcTime: 300000,
  });

  // Fetch map load tracking (current month)
  const { data: mapLoadStats } = useQuery({
    queryKey: ["usage-map-loads", currentMonth],
    queryFn: async () => {
      const { count } = await supabase
        .from('map_load_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      return count || 0;
    },
    refetchInterval: mapboxRefreshInterval,
    staleTime: 10000,
    gcTime: 300000,
  });

  // Fetch email volume stats (hourly history)
  const { data: emailVolumeStats, refetch: refetchEmailVolume } = useQuery({
    queryKey: ["email-volume-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_volume_stats')
        .select('*')
        .order('hour_start', { ascending: false })
        .limit(168); // Last 7 days worth of hourly data
      
      if (error) throw error;
      setLastEmailRefresh(new Date());
      return data || [];
    },
    refetchInterval: emailRefreshInterval,
    refetchIntervalInBackground: true,
  });

  // Get current hour stats for display
  const { data: currentHourEmailStats, refetch: refetchCurrentHourStats } = useQuery({
    queryKey: ["current-hour-email-stats"],
    queryFn: async () => {
      const now = new Date();
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);
      
      // Get emails received in CURRENT hour (from hourStart to now)
      const { count: receivedThisHour } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', hourStart.toISOString());
      
      // Get pending emails using RPC (email_queue has RLS blocking client access)
      const { data: pendingCount } = await supabase
        .rpc('get_email_queue_pending_count');

      // Calculate minutes elapsed this hour for accurate rate
      const minutesElapsed = Math.max(1, now.getMinutes() + (now.getSeconds() / 60));
      const emailsPerMinute = ((receivedThisHour || 0) / minutesElapsed).toFixed(2);
      
      return {
        receivedThisHour: receivedThisHour || 0,
        pendingCount: pendingCount || 0,
        emailsPerMinute
      };
    },
    refetchInterval: emailRefreshInterval,
    refetchIntervalInBackground: true,
  });

  // Fetch Directions API tracking (current month)
  const { data: directionsApiStats } = useQuery({
    queryKey: ["usage-directions-api", currentMonth],
    queryFn: async () => {
      const { count } = await supabase
        .from('directions_api_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      return count || 0;
    },
    refetchInterval: mapboxRefreshInterval
  });

  // Fetch Pub/Sub tracking (current month) - Google Cloud costs based on email volume
  // IMPORTANT: Keep this query lightweight (counts + min/max timestamps only)
  const { data: pubsubStats, refetch: refetchPubsub } = useQuery({
    queryKey: ["usage-pubsub", currentMonth],
    queryFn: async () => {
      // Run the minimum required queries in PARALLEL
      const [countRes, firstRes, lastRes] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true }),
        supabase
          .from('load_emails')
          .select('received_at')
          .order('received_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('load_emails')
          .select('received_at')
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const totalEmails = countRes.count || 0;

      // Calculate days of data using min/max timestamps
      let daysOfData = 1;
      const firstReceivedAt = firstRes.data?.received_at ? new Date(firstRes.data.received_at) : null;
      const lastReceivedAt = lastRes.data?.received_at ? new Date(lastRes.data.received_at) : null;
      if (firstReceivedAt && lastReceivedAt) {
        daysOfData = Math.max(1, (lastReceivedAt.getTime() - firstReceivedAt.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Each Pub/Sub notification is ~1.5KB average
      const avgMessageSize = 1500; // bytes
      const totalBytes = totalEmails * avgMessageSize;
      const totalMB = totalBytes / (1024 * 1024);
      const totalGB = totalMB / 1024;

      // Gmail API calls estimation (~45 API calls per email processed)
      const API_CALLS_PER_EMAIL = 45;
      const totalApiCalls = totalEmails * API_CALLS_PER_EMAIL;
      const apiCallsPerDay = totalApiCalls / daysOfData;
      const projected30DayApiCalls = Math.round(apiCallsPerDay * 30);

      // Project to 30 days
      const emailsPerDay = totalEmails / daysOfData;
      const projected30DayEmails = Math.round(emailsPerDay * 30);
      const projected30DayGB = (projected30DayEmails * avgMessageSize) / (1024 * 1024 * 1024);

      // Free tier is 10GB, cost is ~$40 per TiB after that
      const FREE_TIER_GB = 10;
      const estimatedCost = projected30DayGB > FREE_TIER_GB
        ? ((projected30DayGB - FREE_TIER_GB) * 0.04).toFixed(2)
        : '0.00';

      setLastPubsubRefresh(new Date());
      return {
        count: totalEmails,
        totalBytes,
        totalMB: totalMB.toFixed(2),
        totalGB: totalGB.toFixed(3),
        daysOfData: daysOfData.toFixed(1),
        emailsPerDay: Math.round(emailsPerDay),
        projected30DayEmails,
        projected30DayGB: projected30DayGB.toFixed(2),
        freeTierGB: FREE_TIER_GB,
        withinFreeTier: projected30DayGB <= FREE_TIER_GB,
        estimatedCost,
        // API calls tracking
        totalApiCalls,
        apiCallsPerDay: Math.round(apiCallsPerDay),
        projected30DayApiCalls,
        apiCallsInMillions: (totalApiCalls / 1_000_000).toFixed(2),
        projected30DayApiCallsInMillions: (projected30DayApiCalls / 1_000_000).toFixed(2),
      };
    },
    refetchInterval: pubsubRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 60000,
    gcTime: 300000,
  });

  // Fetch Resend email tracking (current month)
  const { data: resendStats, refetch: refetchResend } = useQuery({
    queryKey: ["usage-resend", currentMonth],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('email_send_tracking')
        .select('email_type, success', { count: 'exact' })
        .eq('month_year', currentMonth);
      
      if (error) throw error;
      
      const byType: Record<string, number> = {};
      const successCount = data?.filter(r => r.success).length || 0;
      data?.forEach(row => {
        byType[row.email_type] = (byType[row.email_type] || 0) + 1;
      });
      
      setLastResendRefresh(new Date());
      return { 
        count: count || 0, 
        byType,
        successCount,
        failedCount: (count || 0) - successCount,
        // Resend pricing: $0.001 per email after 3k free
        estimatedCost: Math.max(0, ((count || 0) - 3000) * 0.001).toFixed(2)
      };
    },
    refetchInterval: resendRefreshInterval,
    refetchIntervalInBackground: true,
  });

  // Fetch Lovable AI tracking (current month) - comprehensive stats with feature breakdown
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
      
      // Model breakdown
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

      // Feature breakdown - shows where AI is being used
      const featureBreakdown: Record<string, { count: number; tokens: number; label: string }> = {};
      const featureLabels: Record<string, string> = {
        'freight_calculator_text': 'Freight Calculator (Text)',
        'freight_calculator_image': 'Freight Calculator (Image)',
        'load_email_parsing': 'Load Email Parsing',
        'ai_update_customers': 'Customer AI Update',
        'test_ai': 'AI Test',
        'unknown': 'Unknown',
      };
      
      data?.forEach(row => {
        const feature = row.feature || 'unknown';
        if (!featureBreakdown[feature]) {
          featureBreakdown[feature] = { 
            count: 0, 
            tokens: 0, 
            label: featureLabels[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          };
        }
        featureBreakdown[feature].count++;
        featureBreakdown[feature].tokens += row.total_tokens || 0;
      });
      
      // Calculate days of data for projections
      let daysOfData = 1;
      if (data && data.length >= 2) {
        const firstRequest = new Date(data[0].created_at);
        const lastRequest = new Date(data[data.length - 1].created_at);
        daysOfData = Math.max(1, (lastRequest.getTime() - firstRequest.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Daily averages and projections
      const requestCount = count || 0;
      const requestsPerDay = requestCount / daysOfData;
      const tokensPerDay = totalTokens / daysOfData;
      const projected30DayRequests = Math.round(requestsPerDay * 30);
      const projected30DayTokens = Math.round(tokensPerDay * 30);
      
      // Average tokens per request
      const avgTokensPerRequest = requestCount > 0 ? Math.round(totalTokens / requestCount) : 0;
      const avgPromptTokens = requestCount > 0 ? Math.round(totalPromptTokens / requestCount) : 0;
      const avgCompletionTokens = requestCount > 0 ? Math.round(totalCompletionTokens / requestCount) : 0;
      
      // Estimated cost calculation (approximate based on typical Lovable AI pricing)
      // Gemini Flash: ~$0.075 per 1M input, ~$0.30 per 1M output
      // Gemini Pro: ~$1.25 per 1M input, ~$5.00 per 1M output
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
        projected30DayRequests,
        projected30DayTokens,
        avgTokensPerRequest,
        avgPromptTokens,
        avgCompletionTokens,
        estimatedCost: estimatedCost > 0 ? `$${estimatedCost.toFixed(4)}` : 'Free tier'
      };
    },
    refetchInterval: aiRefreshInterval,
    refetchIntervalInBackground: true,
  });

  // Fetch historical monthly usage
  const { data: monthlyHistory } = useQuery({
    queryKey: ["mapbox-monthly-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapbox_monthly_usage')
        .select('*')
        .order('month_year', { ascending: false })
        .limit(12);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: mapboxRefreshInterval
  });

  // Estimate Lovable Cloud usage (database operations, edge functions, storage)
  // Cloud is billed at ~$0.01 per unit - uses PARALLEL queries for speed and reliability
  const { data: cloudUsageStats, refetch: refetchCloudUsage, isFetching: isCloudFetching } = useQuery({
    queryKey: ["cloud-usage-estimate", currentMonth],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
      
      console.log('[Cloud Usage] Fetching operations since:', thirtyDaysAgoISO);
      
      // Run ALL queries in PARALLEL for speed and to prevent silent failures
      const [
        emailResult,
        matchResult,
        geocodeResult,
        mapTrackingResult,
        directionsResult,
        aiResult,
        emailSendResult,
        auditResult,
        matchActionResult,
        emailVolumeResult,
        archiveResult
      ] = await Promise.all([
        // Email processing operations (high volume)
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        // Hunt match operations
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        // Geocode cache operations
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        // Map load tracking operations
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        // Directions API tracking operations
        supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        // AI usage tracking operations
        supabase.from('ai_usage_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        // Email send tracking operations
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true }).eq('month_year', currentMonth),
        // Audit log operations
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('timestamp', thirtyDaysAgoISO),
        // Match action history
        supabase.from('match_action_history').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        // Email volume stats
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO),
        // Archived emails (also counts toward operations)
        supabase.from('load_emails_archive').select('*', { count: 'exact', head: true }).gte('archived_at', thirtyDaysAgoISO)
      ]);
      
      // Extract counts with error handling
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
      
      console.log('[Cloud Usage] Raw counts:', {
        emails: emailOps,
        matches: matchOps,
        geocode: geocodeOps,
        mapTracking: mapTrackingOps,
        directions: directionsOps,
        ai: aiOps,
        emailSend: emailSendOps,
        audit: auditOps,
        matchActions: matchActionOps,
        emailVolume: emailVolumeOps,
        archive: archiveOps
      });
      
      // Calculate total write operations
      const writeOps = emailOps + matchOps + geocodeOps + mapTrackingOps + 
                       directionsOps + aiOps + emailSendOps + auditOps + 
                       matchActionOps + emailVolumeOps + archiveOps;
      
      // Estimate read operations (typically 3-5x write operations for active apps)
      // Load Hunter does many reads for matching, filtering, realtime subscriptions
      const estimatedReadMultiplier = 4;
      const estimatedReadOps = writeOps * estimatedReadMultiplier;
      
      // Edge function invocations (estimate based on email processing + AI + other functions)
      // Each email triggers ~2-3 edge function calls (webhook, process-queue, etc.)
      const edgeFunctionCalls = emailOps * 2.5 + aiOps + emailSendOps;
      
      // Realtime subscriptions add to read operations
      // Estimate ~10 subscription updates per email received
      const realtimeOps = emailOps * 10;
      
      // Total operations (for informational metrics only - Cloud billing is separate)
      const totalOps = writeOps + Math.round(estimatedReadOps) + Math.round(edgeFunctionCalls) + realtimeOps;
      
      // Estimated cost calculation based on actual historical data:
      // Known: $25 actual cost for ~186K write operations = $0.000134 per write op
      // This rate is derived from real Lovable Cloud billing data
      const COST_PER_WRITE_OP = 0.000134;
      const estimatedCost = writeOps * COST_PER_WRITE_OP;
      
      console.log('[Cloud Usage] Total:', { writeOps, estimatedCost: estimatedCost.toFixed(2) });
      
      return {
        writeOps,
        estimatedReadOps,
        edgeFunctionCalls: Math.round(edgeFunctionCalls),
        realtimeOps,
        totalOps,
        estimatedCost: estimatedCost.toFixed(2),
        breakdown: {
          emails: emailOps,
          matches: matchOps,
          geocode: geocodeOps,
          mapTracking: mapTrackingOps,
          directions: directionsOps,
          ai: aiOps,
          emailSend: emailSendOps,
          audit: auditOps,
          matchActions: matchActionOps,
          emailVolume: emailVolumeOps,
          archive: archiveOps
        }
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds for more real-time tracking
    staleTime: 15000,
    gcTime: 300000,
  });

  // Query for real-time cost drivers (1h and 24h breakdown)
  const { data: costDrivers, refetch: refetchCostDrivers, isFetching: isCostDriversFetching } = useQuery({
    queryKey: ["cost-drivers"],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Run all queries in parallel
      const [
        emails1h, emails24h,
        geocode1h, geocode24h,
        matches1h, matches24h,
        mapLoads1h, mapLoads24h,
        emailVolume1h, emailVolume24h
      ] = await Promise.all([
        // Emails
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('load_emails').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        // Geocode
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        // Matches
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        // Map loads
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
        // Email volume stats
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo),
      ]);
      
      // Get hourly breakdown for chart
      const { data: hourlyEmails } = await supabase
        .from('load_emails')
        .select('created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: true });
      
      // Group by hour
      const hourlyBreakdown: Record<string, number> = {};
      hourlyEmails?.forEach((email) => {
        const hour = new Date(email.created_at).toISOString().slice(0, 13);
        hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + 1;
      });
      
      const result = {
        oneHour: {
          emails: emails1h.count ?? 0,
          geocode: geocode1h.count ?? 0,
          matches: matches1h.count ?? 0,
          mapLoads: mapLoads1h.count ?? 0,
          emailVolume: emailVolume1h.count ?? 0,
        },
        twentyFourHours: {
          emails: emails24h.count ?? 0,
          geocode: geocode24h.count ?? 0,
          matches: matches24h.count ?? 0,
          mapLoads: mapLoads24h.count ?? 0,
          emailVolume: emailVolume24h.count ?? 0,
        },
        hourlyBreakdown,
        // Calculate estimated hourly rate based on 24h data
        hourlyRate: (emails24h.count ?? 0) / 24,
        // Estimated edge function calls (each email = ~2.5 function calls)
        edgeFunctions1h: Math.round((emails1h.count ?? 0) * 2.5),
        edgeFunctions24h: Math.round((emails24h.count ?? 0) * 2.5),
      };
      
      console.log('[Cost Drivers]', result);
      return result;
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
  
  // Handle calibration save
  const handleCalibrate = () => {
    const spend = parseFloat(actualSpend);
    if (isNaN(spend) || spend <= 0) {
      toast.error('Please enter a valid spend amount');
      return;
    }
    
    const writeOps = cloudUsageStats?.writeOps || 0;
    if (writeOps <= 0) {
      toast.error('No write operations recorded yet');
      return;
    }
    
    const newRate = spend / writeOps;
    setCalibratedRate(newRate);
    localStorage.setItem('cloud_calibrated_rate', newRate.toString());
    localStorage.setItem('cloud_calibration_date', new Date().toISOString());
    localStorage.setItem('cloud_calibration_spend', spend.toString());
    localStorage.setItem('cloud_calibration_ops', writeOps.toString());
    toast.success(`Calibrated! New rate: $${newRate.toFixed(6)}/write op`);
    setShowCalibration(false);
    setActualSpend("");
  };
  
  // Clear calibration
  const clearCalibration = () => {
    setCalibratedRate(null);
    localStorage.removeItem('cloud_calibrated_rate');
    localStorage.removeItem('cloud_calibration_date');
    localStorage.removeItem('cloud_calibration_spend');
    localStorage.removeItem('cloud_calibration_ops');
    toast.success('Calibration cleared, using default rate');
  };
  
  // Get effective rate (calibrated or default)
  const effectiveRate = calibratedRate ?? 0.000134;

  // Track if any mapbox query is fetching
  const isRefreshing = isUsageFetching;

  // Mapbox pricing tiers (tiered pricing)
  const MAPBOX_GEOCODING_FREE_TIER = 100000;
  const MAPBOX_MAP_LOADS_FREE_TIER = 50000;

  // Calculate tiered geocoding cost
  const calculateGeocodingCost = (calls: number): number => {
    if (calls <= MAPBOX_GEOCODING_FREE_TIER) return 0;
    
    let cost = 0;
    let remaining = calls - MAPBOX_GEOCODING_FREE_TIER;
    
    // Tier 1: 100,001 - 500,000 @ $0.75/1,000
    const tier1 = Math.min(remaining, 400000);
    cost += (tier1 / 1000) * 0.75;
    remaining -= tier1;
    
    if (remaining <= 0) return cost;
    
    // Tier 2: 500,001 - 1,000,000 @ $0.60/1,000
    const tier2 = Math.min(remaining, 500000);
    cost += (tier2 / 1000) * 0.60;
    remaining -= tier2;
    
    if (remaining <= 0) return cost;
    
    // Tier 3: 1,000,000+ @ $0.45/1,000
    cost += (remaining / 1000) * 0.45;
    
    return cost;
  };

  // Calculate tiered map loads cost
  const calculateMapLoadsCost = (loads: number): number => {
    if (loads <= MAPBOX_MAP_LOADS_FREE_TIER) return 0;
    
    let cost = 0;
    let remaining = loads - MAPBOX_MAP_LOADS_FREE_TIER;
    
    // Tier 1: 50,001 - 100,000 @ $5.00/1,000
    const tier1 = Math.min(remaining, 50000);
    cost += (tier1 / 1000) * 5.00;
    remaining -= tier1;
    
    if (remaining <= 0) return cost;
    
    // Tier 2: 100,001 - 200,000 @ $4.00/1,000
    const tier2 = Math.min(remaining, 100000);
    cost += (tier2 / 1000) * 4.00;
    remaining -= tier2;
    
    if (remaining <= 0) return cost;
    
    // Tier 3: 200,001+ @ $3.00/1,000
    cost += (remaining / 1000) * 3.00;
    
    return cost;
  };

  // Calculate Directions API cost
  const MAPBOX_DIRECTIONS_FREE_TIER = 100000;
  const calculateDirectionsCost = (requests: number): number => {
    if (requests <= MAPBOX_DIRECTIONS_FREE_TIER) return 0;
    
    let cost = 0;
    let remaining = requests - MAPBOX_DIRECTIONS_FREE_TIER;
    
    // Tier 1: 100,001 - 500,000 @ $0.50/1,000
    const tier1 = Math.min(remaining, 400000);
    cost += (tier1 / 1000) * 0.50;
    remaining -= tier1;
    
    if (remaining <= 0) return cost;
    
    // Tier 2: 500,001+ @ $0.40/1,000
    cost += (remaining / 1000) * 0.40;
    
    return cost;
  };

  // Current month geocoding API calls - baseline + incremental (live updates every 20s)
  const currentMonthGeocodingCalls = currentMonthUsage?.geocoding_api_calls || 0;
  const billableGeocodingCalls = Math.max(0, currentMonthGeocodingCalls - MAPBOX_GEOCODING_FREE_TIER);
  const geocodingCost = calculateGeocodingCost(currentMonthGeocodingCalls);

  // Current month map loads - baseline + incremental
  const currentMonthMapLoads = currentMonthUsage?.map_loads || 0;
  const billableMapLoads = Math.max(0, currentMonthMapLoads - MAPBOX_MAP_LOADS_FREE_TIER);
  const mapLoadsCost = calculateMapLoadsCost(currentMonthMapLoads);

  // Current month directions API - baseline + incremental
  const currentMonthDirectionsCalls = currentMonthUsage?.directions_api_calls || 0;
  const billableDirectionsCalls = Math.max(0, currentMonthDirectionsCalls - MAPBOX_DIRECTIONS_FREE_TIER);
  const directionsCost = calculateDirectionsCost(currentMonthDirectionsCalls);

  // Cache stats for display - use pre-calculated values from query
  const cacheSavedCalls = geocodeStats?.cacheSaved || 0;

  const estimatedCosts = {
    mapbox: {
      // Current month API calls
      geocodingApiCalls: currentMonthGeocodingCalls,
      // Cache savings (all-time)
      geocodingCacheSaved: cacheSavedCalls,
      geocodingFreeRemaining: Math.max(0, MAPBOX_GEOCODING_FREE_TIER - currentMonthGeocodingCalls),
      geocodingBillable: billableGeocodingCalls,
      geocodingCost: Number(geocodingCost).toFixed(2),
      mapLoads: currentMonthMapLoads,
      mapLoadsFreeRemaining: Math.max(0, MAPBOX_MAP_LOADS_FREE_TIER - currentMonthMapLoads),
      mapLoadsBillable: billableMapLoads,
      mapLoadsCost: Number(mapLoadsCost).toFixed(2),
      directionsApiCalls: currentMonthDirectionsCalls,
      directionsFreeRemaining: Math.max(0, MAPBOX_DIRECTIONS_FREE_TIER - currentMonthDirectionsCalls),
      directionsBillable: billableDirectionsCalls,
      directionsCost: Number(directionsCost).toFixed(2)
    },
    resend: {
      emailsSent: recentActivity?.emails || 0,
      estimatedCost: ((recentActivity?.emails || 0) * 0.001).toFixed(2) // $1 per 1000 emails
    },
    storage: {
      totalRecords: Object.values(tableCounts || {}).reduce((a, b) => a + b, 0),
      estimatedSize: (Object.values(tableCounts || {}).reduce((a, b) => a + b, 0) * 0.001).toFixed(2) // Rough estimate in MB
    }
  };

  // Parse AI cost to number (remove $ and 'Free tier' handling)
  const aiCostNumber = aiStats?.estimatedCost && aiStats.estimatedCost !== 'Free tier' 
    ? parseFloat(aiStats.estimatedCost.replace('$', '')) 
    : 0;

  // Cloud usage cost - uses calibrated rate if available
  const cloudCostNumber = (cloudUsageStats?.writeOps || 0) * effectiveRate;

  // Cost breakdown object for detailed display
  const costBreakdown = {
    mapbox: {
      geocoding: geocodingCost,
      mapLoads: mapLoadsCost,
      directions: directionsCost,
      total: geocodingCost + mapLoadsCost + directionsCost
    },
    ai: {
      total: aiCostNumber
    },
    email: {
      resend: parseFloat(resendStats?.estimatedCost || '0'),
      pubsub: parseFloat(pubsubStats?.estimatedCost || '0'),
      total: parseFloat(resendStats?.estimatedCost || '0') + parseFloat(pubsubStats?.estimatedCost || '0')
    },
    cloud: {
      totalOps: cloudUsageStats?.totalOps || 0,
      writeOps: cloudUsageStats?.writeOps || 0,
      readOps: cloudUsageStats?.estimatedReadOps || 0,
      edgeFunctions: cloudUsageStats?.edgeFunctionCalls || 0,
      realtime: cloudUsageStats?.realtimeOps || 0,
      estimatedCost: cloudCostNumber
    }
  };

  // Total estimated monthly cost (includes Cloud estimate based on historical rate)
  const totalEstimatedMonthlyCost = (
    costBreakdown.mapbox.total +
    costBreakdown.ai.total +
    costBreakdown.email.total +
    costBreakdown.cloud.estimatedCost
  ).toFixed(2);

  return (
    <TooltipProvider>
    <div className={`space-y-${isCompactView ? '3' : '6'} p-${isCompactView ? '4' : '6'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`${isCompactView ? 'text-xl' : 'text-3xl'} font-bold tracking-tight`}>Usage & Costs</h2>
          {!isCompactView && <p className="text-muted-foreground mt-2">Monitor your service usage and estimated costs</p>}
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={isCompactView ? "ghost" : "secondary"}
            size="sm"
            className="h-7 px-2"
            onClick={() => setIsCompactView(false)}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1" />
            Full
          </Button>
          <Button
            variant={isCompactView ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2"
            onClick={() => setIsCompactView(true)}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            Compact
          </Button>
        </div>
      </div>

      {/* Total Cost Overview with Detailed Breakdown */}
      <Card className={`border-primary/20 bg-primary/5 ${isCompactView ? 'py-0' : ''}`}>
        <CardHeader className={isCompactView ? 'py-3 px-4' : ''}>
          <div className="flex items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
              <DollarSign className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
              {isCompactView ? 'Est. Monthly Cost' : 'Estimated Monthly Cost (Last 30 Days)'}
              <InfoTooltip text={calibratedRate 
                ? `Sum of all estimated service costs using your calibrated rate ($${calibratedRate.toFixed(6)}/write op). Check Settings → Plans & Credits for actual billing.` 
                : "Sum of all estimated service costs: Mapbox APIs, Lovable AI usage, email services, and Lovable Cloud. Calibrate with actual billing for better accuracy."
              } />
            </CardTitle>
            <div className={`font-bold text-primary ${isCompactView ? 'text-xl' : 'text-4xl'}`}>
              ${totalEstimatedMonthlyCost}
            </div>
          </div>
          {!isCompactView && <CardDescription>Based on current usage patterns</CardDescription>}
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 pb-3 px-4' : ''}>
          {/* Detailed Cost Breakdown */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              Cost Breakdown
              <InfoTooltip text="Detailed breakdown of all tracked costs. Each service shows its individual components and subtotal." />
            </div>
            
            <div className="grid gap-3">
              {/* Mapbox Section */}
              <div className="bg-background/50 rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Map className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-sm">Mapbox APIs</span>
                  </div>
                  <span className="font-semibold text-sm">${costBreakdown.mapbox.total.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Geocoding:</span>
                    <span>${costBreakdown.mapbox.geocoding.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Map Loads:</span>
                    <span>${costBreakdown.mapbox.mapLoads.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Directions:</span>
                    <span>${costBreakdown.mapbox.directions.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* AI Section */}
              <div className="bg-background/50 rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="font-medium text-sm">Lovable AI</span>
                  </div>
                  <span className="font-semibold text-sm">
                    {aiCostNumber > 0 ? `$${aiCostNumber.toFixed(4)}` : 'Free tier'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Requests: {aiStats?.count || 0}</span>
                    <span>Tokens: {(aiStats?.totalTokens || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Email Services Section */}
              <div className="bg-background/50 rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-orange-500" />
                    <span className="font-medium text-sm">Email Services</span>
                  </div>
                  <span className="font-semibold text-sm">${costBreakdown.email.total.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Resend ({resendStats?.count || 0} emails):</span>
                    <span>${costBreakdown.email.resend.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Pub/Sub:</span>
                    <span>${costBreakdown.email.pubsub.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Lovable Cloud Section - Estimated with detailed breakdown */}
              <div className="bg-background/50 rounded-lg p-3 border border-amber-500/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-amber-600" />
                    <span className="font-medium text-sm">Lovable Cloud</span>
                    <InfoTooltip text="Estimated based on historical rate: $25 actual cost / 186K write ops = $0.000134 per write operation. Compare with Settings → Plans & Credits for actual billing." />
                    {isCloudFetching && <Loader2 className="h-3 w-3 animate-spin text-amber-600" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => refetchCloudUsage()}
                      disabled={isCloudFetching}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isCloudFetching ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <span className="font-semibold text-sm text-amber-600">~${costBreakdown.cloud.estimatedCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground font-medium">
                    <span>Write Operations (30 days):</span>
                    <span className="text-foreground">{costBreakdown.cloud.writeOps.toLocaleString()}</span>
                  </div>
                  
                  {/* Write operations breakdown */}
                  {cloudUsageStats?.breakdown && costBreakdown.cloud.writeOps > 0 && (
                    <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 pt-1 border-t border-border/30 text-[10px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Emails:</span>
                        <span>{(cloudUsageStats.breakdown.emails || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Geocode:</span>
                        <span>{(cloudUsageStats.breakdown.geocode || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Matches:</span>
                        <span>{(cloudUsageStats.breakdown.matches || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Map Track:</span>
                        <span>{(cloudUsageStats.breakdown.mapTracking || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Email Vol:</span>
                        <span>{(cloudUsageStats.breakdown.emailVolume || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Archive:</span>
                        <span>{(cloudUsageStats.breakdown.archive || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-border/50">
                    <div className="flex justify-between text-muted-foreground">
                      <span>DB Reads (est 4x):</span>
                      <span>{costBreakdown.cloud.readOps.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Edge Functions:</span>
                      <span>{costBreakdown.cloud.edgeFunctions.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Realtime (est):</span>
                      <span>{costBreakdown.cloud.realtime.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Rate{calibratedRate ? ' (calibrated)' : ''}:</span>
                      <span className={calibratedRate ? 'text-amber-600 font-medium' : ''}>${effectiveRate.toFixed(6)}/write</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Drivers Panel - Real-time activity */}
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Zap className={`text-orange-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
                {isCompactView ? 'Cost Drivers' : 'Real-Time Cost Drivers'}
                <InfoTooltip text="Shows what's actually consuming resources right now. High numbers here indicate where costs are coming from." />
              </CardTitle>
              {!isCompactView && <CardDescription>Activity breakdown for last 1 hour and 24 hours</CardDescription>}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetchCostDrivers()}
              disabled={isCostDriversFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isCostDriversFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-3' : ''}>
          <div className="grid grid-cols-2 gap-4">
            {/* Last 1 Hour */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-orange-500" />
                Last 1 Hour
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Emails Processed</span>
                  <span className={`font-medium ${(costDrivers?.oneHour.emails || 0) > 500 ? 'text-red-500' : ''}`}>
                    {(costDrivers?.oneHour.emails || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Geocode Calls</span>
                  <span className="font-medium">{(costDrivers?.oneHour.geocode || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Match Operations</span>
                  <span className="font-medium">{(costDrivers?.oneHour.matches || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Edge Functions (est)</span>
                  <span className="font-medium">{(costDrivers?.edgeFunctions1h || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {/* Last 24 Hours */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Last 24 Hours
                {costDrivers?.hourlyRate && (
                  <span className="text-xs text-muted-foreground">
                    (~{Math.round(costDrivers.hourlyRate)}/hr avg)
                  </span>
                )}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Emails Processed</span>
                  <span className={`font-medium ${(costDrivers?.twentyFourHours.emails || 0) > 10000 ? 'text-red-500' : ''}`}>
                    {(costDrivers?.twentyFourHours.emails || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Geocode Calls</span>
                  <span className="font-medium">{(costDrivers?.twentyFourHours.geocode || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Match Operations</span>
                  <span className="font-medium">{(costDrivers?.twentyFourHours.matches || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-background/50">
                  <span className="text-muted-foreground">Edge Functions (est)</span>
                  <span className="font-medium">{(costDrivers?.edgeFunctions24h || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Warning if high volume */}
          {(costDrivers?.twentyFourHours.emails || 0) > 10000 && (
            <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-red-600">High Volume Alert:</span>
                <span className="text-muted-foreground ml-1">
                  {(costDrivers?.twentyFourHours.emails || 0).toLocaleString()} emails in 24h. 
                  Est. ~${((costDrivers?.twentyFourHours.emails || 0) * effectiveRate * 2.5).toFixed(2)}/day in Cloud costs.
                </span>
              </div>
            </div>
          )}
          
          {/* Projection */}
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Projected 30-day cost (at current rate):</span>
              <span className="font-medium text-foreground">
                ~${((costDrivers?.twentyFourHours.emails || 0) * effectiveRate * 2.5 * 30).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calibration Panel */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Settings className={`text-blue-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
                {isCompactView ? 'Calibrate' : 'Calibrate Cost Estimates'}
                <InfoTooltip text="Enter your actual billing to compute a more accurate cost-per-operation rate. This improves future projections." />
              </CardTitle>
              {!isCompactView && <CardDescription>Sync estimates with actual Lovable billing for accuracy</CardDescription>}
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
          <CardContent className={isCompactView ? 'pt-0 px-3 pb-3' : ''}>
            {calibratedRate && (
              <div className="mb-3 p-2 rounded bg-blue-500/10 border border-blue-500/20 text-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium text-blue-600">Calibrated Rate Active:</span>
                    <span className="text-muted-foreground ml-1">
                      ${calibratedRate.toFixed(6)}/write op
                    </span>
                    {localStorage.getItem('cloud_calibration_date') && (
                      <span className="text-muted-foreground ml-2">
                        (set {new Date(localStorage.getItem('cloud_calibration_date')!).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearCalibration} className="h-6 text-xs">
                    Clear
                  </Button>
                </div>
              </div>
            )}
            
            {showCalibration && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  <p>Check your Lovable billing (Settings → Plans & Credits) and enter the actual amount spent on Cloud this billing period:</p>
                </div>
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
                  <Button onClick={handleCalibrate} disabled={!actualSpend}>
                    Calibrate
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Current tracked write operations: <span className="font-medium">{(cloudUsageStats?.writeOps || 0).toLocaleString()}</span></p>
                  {actualSpend && parseFloat(actualSpend) > 0 && (cloudUsageStats?.writeOps || 0) > 0 && (
                    <p>
                      This would set rate to: <span className="font-medium text-blue-600">
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

      {/* Geocode Cache Stats */}
      <Card className={`border-green-500/20 bg-green-500/5 ${isCompactView ? 'py-0' : ''}`}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Map className={`text-green-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
                {isCompactView ? 'Geocode Cache' : 'Geocode Cache Performance'}
              </CardTitle>
              {!isCompactView && <CardDescription>Cache reduces Mapbox API calls</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastGeocodeRefresh}
              refreshInterval={geocodeCacheRefreshInterval}
              onIntervalChange={setGeocodeCacheRefreshInterval}
              onRefresh={() => refetchGeocodeStats()}
              isRefreshing={isGeocodeStatsFetching}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-2' : 'space-y-4'}>
          <div className={`grid ${isCompactView ? 'grid-cols-5 gap-2' : 'grid-cols-2 md:grid-cols-5 gap-4'}`}>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                Cached Locations
                {!isCompactView && <InfoTooltip text="Unique addresses stored in cache. Each represents one initial API call made to Mapbox." />}
              </p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{geocodeStats?.totalLocations?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                Total Lookups
                {!isCompactView && <InfoTooltip text="Total times the cache was accessed (both first-time and repeat lookups)." />}
              </p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{geocodeStats?.totalHits?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                Calls Saved
                {!isCompactView && <InfoTooltip text="API calls avoided by using cached data. Equals Total Lookups minus Cached Locations." />}
              </p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{geocodeStats?.cacheSaved?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                Hit Rate
                {!isCompactView && <InfoTooltip text="Percentage of lookups that used cached data instead of making a new API call." />}
              </p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{geocodeStats?.cacheHitRate || 0}%</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                Est. Savings
                {!isCompactView && <InfoTooltip text="Estimated money saved by using cache instead of making API calls. Calculated as (Total Lookups - Cached Locations) × $0.00075." />}
              </p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>${geocodeStats?.estimatedSavings || '0.00'}</p>
            </div>
          </div>
          
          {/* Daily Stats History */}
          {dailyStats && dailyStats.length > 0 && (
            <div className={isCompactView ? 'pt-2 border-t' : 'pt-4 border-t'}>
              <p className={`font-medium ${isCompactView ? 'text-xs mb-1' : 'text-sm mb-3'}`}>Daily History (Last 7 Days)</p>
              <div className={isCompactView ? 'space-y-0.5' : 'space-y-2'}>
                {dailyStats.slice(0, isCompactView ? 3 : 7).map((stat: any) => (
                  <div key={stat.id} className={`flex justify-between items-center rounded bg-muted/50 ${isCompactView ? 'text-xs py-1 px-2' : 'text-sm py-1 px-2'}`}>
                    <span className="text-muted-foreground">{new Date(stat.recorded_at).toLocaleDateString()}</span>
                    <div className={`flex ${isCompactView ? 'gap-2' : 'gap-4'}`}>
                      <span>+{stat.new_locations_today} new</span>
                      <span>{stat.hits_today} hits</span>
                      <span className="text-green-600 font-medium">${Number(stat.estimated_savings).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {!isCompactView && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              <p>• Each cache hit saves one Mapbox API call ($0.75/1,000 = $0.00075)</p>
              <p>• Savings calculated based on cache hits that would have been billable API calls</p>
              <p>• Stats snapshot daily at midnight ET</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mapbox Usage */}
      <Card className={isCompactView ? 'py-0' : ''}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Map className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
                {isCompactView ? 'Mapbox Usage' : `Mapbox Usage & Billing - ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`}
              </CardTitle>
              {!isCompactView && <CardDescription>Current month geocoding and map rendering costs (resets monthly)</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastRefresh}
              refreshInterval={mapboxRefreshInterval}
              onIntervalChange={setMapboxRefreshInterval}
              onRefresh={() => { refetchBaseline(); refetchIncremental(); }}
              isRefreshing={isRefreshing}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-2' : 'space-y-4'}>
          {/* Geocoding API */}
          <div className={isCompactView ? 'space-y-1' : 'space-y-2'}>
            <p className={`font-medium ${isCompactView ? 'text-xs' : 'text-sm'}`}>Geocoding API</p>
            <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-2 md:grid-cols-4 gap-3'}`}>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>API Calls</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.geocodingApiCalls.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Free Tier</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'} ${estimatedCosts.mapbox.geocodingFreeRemaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {estimatedCosts.mapbox.geocodingFreeRemaining > 0 ? `${estimatedCosts.mapbox.geocodingFreeRemaining.toLocaleString()} left` : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Billable</p>
                <p className={`font-semibold text-amber-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.geocodingBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Est. Cost</p>
                <p className={`font-semibold text-red-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>${estimatedCosts.mapbox.geocodingCost}</p>
              </div>
            </div>
            {!isCompactView && <p className="text-xs text-muted-foreground">Rate: $0.75/1K (100K-500K) • $0.60/1K (500K-1M) • $0.45/1K (1M+) • Check <a href="https://console.mapbox.com/account/invoices" target="_blank" rel="noopener noreferrer" className="text-primary underline">Mapbox dashboard</a> for exact billing</p>}
          </div>
          
          {/* Map Loads */}
          <div className={`${isCompactView ? 'space-y-1 pt-1 border-t' : 'space-y-2 pt-3 border-t'}`}>
            <p className={`font-medium ${isCompactView ? 'text-xs' : 'text-sm'}`}>Map Loads (GL JS)</p>
            <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-2 md:grid-cols-4 gap-3'}`}>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Total Loads</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.mapLoads.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Free Tier</p>
                <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>
                  {estimatedCosts.mapbox.mapLoadsFreeRemaining > 0 ? `${estimatedCosts.mapbox.mapLoadsFreeRemaining.toLocaleString()} left` : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Billable</p>
                <p className={`font-semibold text-amber-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.mapLoadsBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Est. Cost</p>
                <p className={`font-semibold text-red-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>${estimatedCosts.mapbox.mapLoadsCost}</p>
              </div>
            </div>
            {!isCompactView && <p className="text-xs text-muted-foreground">Rate: $5.00/1K (50K-100K) • $4.00/1K (100K-200K) • $3.00/1K (200K+)</p>}
          </div>

          {/* Directions API */}
          <div className={`${isCompactView ? 'space-y-1 pt-1 border-t' : 'space-y-2 pt-3 border-t'}`}>
            <p className={`font-medium ${isCompactView ? 'text-xs' : 'text-sm'}`}>Directions API</p>
            <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-2 md:grid-cols-4 gap-3'}`}>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Total Requests</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.directionsApiCalls.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Free Tier</p>
                <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>
                  {estimatedCosts.mapbox.directionsFreeRemaining > 0 ? `${estimatedCosts.mapbox.directionsFreeRemaining.toLocaleString()} left` : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Billable</p>
                <p className={`font-semibold text-amber-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.mapbox.directionsBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Est. Cost</p>
                <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>${estimatedCosts.mapbox.directionsCost}</p>
              </div>
            </div>
            {!isCompactView && <p className="text-xs text-muted-foreground">Rate: $0.50/1K (100K-500K) • $0.40/1K (500K+) • Used for route optimization</p>}
          </div>

          {/* Monthly History */}
          {monthlyHistory && monthlyHistory.length > 0 && (
            <div className={isCompactView ? 'pt-1 border-t' : 'pt-4 border-t'}>
              <p className={`font-medium ${isCompactView ? 'text-xs mb-1' : 'text-sm mb-3'}`}>Monthly History</p>
              <div className={isCompactView ? 'space-y-0.5' : 'space-y-2'}>
                {monthlyHistory.slice(0, isCompactView ? 2 : undefined).map((month: any) => (
                  <div key={month.id} className={`flex justify-between items-center rounded bg-muted/50 ${isCompactView ? 'text-xs py-1 px-2' : 'text-sm py-2 px-3'}`}>
                    <span className="font-medium">{month.month_year}</span>
                    <div className={`flex ${isCompactView ? 'gap-2' : 'gap-4 text-xs md:text-sm'}`}>
                      <span>Geo: {month.geocoding_api_calls?.toLocaleString() || 0}</span>
                      <span>Maps: {month.map_loads?.toLocaleString() || 0}</span>
                      <span>Dir: {month.directions_api_calls?.toLocaleString() || 0}</span>
                      <span className="text-red-600 font-medium">${Number(month.total_cost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lovable AI Usage */}
      <Card className={isCompactView ? 'py-0' : ''}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Sparkles className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
                Lovable AI Usage
              </CardTitle>
              {!isCompactView && <CardDescription>AI model requests and costs</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastAiRefresh}
              refreshInterval={aiRefreshInterval}
              onIntervalChange={setAiRefreshInterval}
              onRefresh={() => refetchAi()}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-2' : 'space-y-4'}>
          <div className={`flex ${isCompactView ? 'items-center gap-4' : 'flex-col space-y-2'}`}>
            <div className={isCompactView ? 'flex items-center gap-2' : 'space-y-2'}>
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Model:</p>
              <p className={`font-medium ${isCompactView ? 'text-sm' : 'text-lg'}`}>google/gemini-2.5-flash</p>
            </div>
            <Button 
              onClick={() => testAiMutation.mutate()}
              disabled={testAiMutation.isPending}
              size={isCompactView ? 'sm' : 'default'}
              className={isCompactView ? 'h-7 text-xs' : 'w-full'}
            >
              {testAiMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Test AI
                </>
              )}
            </Button>
          </div>
          {aiTestResult && (
            <div className={`bg-muted rounded-md ${isCompactView ? 'p-2' : 'mt-3 p-3'}`}>
              <p className={`font-medium ${isCompactView ? 'text-xs mb-0.5' : 'text-sm mb-1'}`}>Response:</p>
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>{aiTestResult}</p>
            </div>
          )}
          {!isCompactView && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              <p>• Usage-based pricing per AI request</p>
              <p>• Check credit balance in Lovable workspace settings</p>
              <p>• Free monthly usage included, then pay-as-you-go</p>
            </div>
          )}
          {/* AI Usage Stats from tracking */}
          <div className={`${isCompactView ? 'pt-1 border-t' : 'pt-3 border-t'}`}>
            <p className={`font-medium ${isCompactView ? 'text-xs mb-1' : 'text-sm mb-2'}`}>This Month's Usage ({aiStats?.daysOfData || 0} days)</p>
            
            {/* Main stats grid */}
            <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-4 gap-4'}`}>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Requests</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{aiStats?.count || 0}</p>
                <p className="text-xs text-muted-foreground">~{aiStats?.requestsPerDay || 0}/day</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Total Tokens</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{(aiStats?.totalTokens || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">~{aiStats?.avgTokensPerRequest || 0}/req</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>30-Day Projection</p>
                <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{(aiStats?.projected30DayTokens || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">~{aiStats?.projected30DayRequests || 0} requests</p>
              </div>
              <div className="space-y-0.5">
                <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-xs'}`}>Est. Cost</p>
                <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-lg'}`}>{aiStats?.estimatedCost || 'Free tier'}</p>
                <p className="text-xs text-muted-foreground">This month</p>
              </div>
            </div>
              
            {/* Token breakdown */}
            {!isCompactView && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Input Tokens (Prompt)</p>
                  <p className="font-semibold text-sm">{(aiStats?.totalPromptTokens || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">~{aiStats?.avgPromptTokens || 0} avg/request</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Output Tokens (Completion)</p>
                  <p className="font-semibold text-sm">{(aiStats?.totalCompletionTokens || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">~{aiStats?.avgCompletionTokens || 0} avg/request</p>
                </div>
              </div>
            )}
            
            {/* Feature breakdown - shows WHERE AI is being used */}
            {!isCompactView && aiStats?.featureBreakdown && Object.keys(aiStats.featureBreakdown).length > 0 && (
              <div className="mt-3 pt-2 border-t">
                <p className="text-xs font-medium mb-2">Usage by Feature</p>
                <div className="space-y-1">
                  {Object.entries(aiStats.featureBreakdown)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([feature, stats]) => (
                    <div key={feature} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground truncate max-w-[180px]">{stats.label}</span>
                      <span className="font-medium">{stats.count} requests • {stats.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Model breakdown */}
            {!isCompactView && aiStats?.modelBreakdown && Object.keys(aiStats.modelBreakdown).length > 0 && (
              <div className="mt-3 pt-2 border-t">
                <p className="text-xs font-medium mb-2">Usage by Model</p>
                <div className="space-y-1">
                  {Object.entries(aiStats.modelBreakdown).map(([model, stats]) => (
                    <div key={model} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground truncate max-w-[180px]">{model}</span>
                      <span className="font-medium">{stats.count} requests • {stats.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Google Cloud Pub/Sub Usage */}
      <Card className={`border-orange-500/20 bg-orange-500/5 ${isCompactView ? 'py-0' : ''}`}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Mail className={`text-orange-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
                Google Cloud Pub/Sub
                <InfoTooltip text="Tracks Gmail push notifications via Google Cloud Pub/Sub. Each webhook call = 1 message. Pricing: ~$0.40 per million messages." />
              </CardTitle>
              {!isCompactView && <CardDescription>Gmail push notification costs - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastPubsubRefresh}
              refreshInterval={pubsubRefreshInterval}
              onIntervalChange={setPubsubRefreshInterval}
              onRefresh={() => refetchPubsub()}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2' : ''}>
          <div className={`grid ${isCompactView ? 'grid-cols-5 gap-2' : 'grid-cols-5 gap-4'}`}>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Emails Received</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{pubsubStats?.count?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">{pubsubStats?.daysOfData || 0} days of data</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Gmail API Calls</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>
                {pubsubStats?.totalApiCalls && pubsubStats.totalApiCalls >= 1_000_000 
                  ? `${pubsubStats.apiCallsInMillions}M` 
                  : (pubsubStats?.totalApiCalls?.toLocaleString() || 0)}
              </p>
              <p className="text-xs text-muted-foreground">~45 calls/email</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Data Transfer</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>
                {Number(pubsubStats?.totalMB || 0) >= 1000 
                  ? `${pubsubStats?.totalGB || '0'} GB` 
                  : `${pubsubStats?.totalMB || '0'} MB`}
                <span className="text-muted-foreground font-normal text-sm"> /10GB</span>
              </p>
              <p className="text-xs text-muted-foreground">~1.5 KB per message</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>30-Day Projection</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>
                {pubsubStats?.projected30DayApiCalls && pubsubStats.projected30DayApiCalls >= 1_000_000 
                  ? `${pubsubStats.projected30DayApiCallsInMillions}M calls` 
                  : `${pubsubStats?.projected30DayApiCalls?.toLocaleString() || 0} calls`}
              </p>
              <p className="text-xs text-muted-foreground">~{pubsubStats?.projected30DayEmails?.toLocaleString() || 0} emails</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Est. Monthly Cost</p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>${pubsubStats?.estimatedCost || '0.00'}</p>
              <p className={`text-xs ${pubsubStats?.withinFreeTier ? 'text-green-600' : 'text-orange-500'}`}>
                {pubsubStats?.withinFreeTier ? '✓ Within free tiers' : 'Exceeds free tier'}
              </p>
            </div>
          </div>
          {!isCompactView && (
            <p className="text-xs text-muted-foreground mt-2">
              Pub/Sub: 10GB/month free, ~$40/TiB after • Gmail API: FREE (unlimited requests)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resend Email Costs */}
      <Card className={`border-purple-500/20 bg-purple-500/5 ${isCompactView ? 'py-0' : ''}`}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Mail className={`text-purple-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
                Resend Email Service
                <InfoTooltip text="Tracks outbound emails sent via Resend (driver invites, admin invites). First 3,000 emails/month free, then $0.001 per email." />
              </CardTitle>
              {!isCompactView && <CardDescription>Outbound email costs - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastResendRefresh}
              refreshInterval={resendRefreshInterval}
              onIntervalChange={setResendRefreshInterval}
              onRefresh={() => refetchResend()}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2' : ''}>
          <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-4 gap-4'}`}>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Emails Sent</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{resendStats?.count || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Successful</p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{resendStats?.successCount || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Failed</p>
              <p className={`font-semibold text-red-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{resendStats?.failedCount || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Est. Cost</p>
              <p className={`font-semibold text-green-600 ${isCompactView ? 'text-sm' : 'text-2xl'}`}>${resendStats?.estimatedCost || '0.00'}</p>
            </div>
          </div>
          {resendStats?.byType && Object.keys(resendStats.byType).length > 0 && (
            <div className={`${isCompactView ? 'mt-1 pt-1 border-t' : 'mt-3 pt-3 border-t'}`}>
              <p className={`font-medium ${isCompactView ? 'text-xs mb-1' : 'text-sm mb-2'}`}>By Type</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(resendStats.byType).map(([type, count]) => (
                  <span key={type} className={`px-2 py-0.5 bg-muted rounded ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                    {type}: {count as number}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!isCompactView && (
            <p className="text-xs text-muted-foreground mt-2">Rate: $0.001/email after 3,000 free tier</p>
          )}
        </CardContent>
      </Card>

      {/* Email Volume Tracking */}
      <Card className={isCompactView ? 'py-0' : ''}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <BarChart3 className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
                {isCompactView ? 'Email Volume' : 'Email Volume Tracking'}
              </CardTitle>
              {!isCompactView && <CardDescription>Incoming load emails by source - snapshots every 60 minutes</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastEmailRefresh}
              refreshInterval={emailRefreshInterval}
              onIntervalChange={setEmailRefreshInterval}
              onRefresh={() => {
                refetchEmailVolume();
                refetchCurrentHourStats();
                setLastEmailRefresh(new Date());
              }}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-2' : 'space-y-4'}>
          {/* Source Summary - compact inline */}
          {isCompactView ? (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="capitalize">{emailSource}:</span>
                <span className="font-medium">{recentActivity?.emails?.toLocaleString() || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span>Matches:</span>
                <span className="font-medium">{recentActivity?.matches?.toLocaleString() || 0}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium capitalize">{emailSource}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{recentActivity?.emails?.toLocaleString() || 0}</p>
                    <p className="text-xs text-muted-foreground">emails (30 days)</p>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Hunt Matches</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{recentActivity?.matches?.toLocaleString() || 0}</p>
                    <p className="text-xs text-muted-foreground">matches (30 days)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Current Stats */}
          <div className={`grid ${isCompactView ? 'grid-cols-4 gap-2' : 'grid-cols-2 md:grid-cols-4 gap-4'}`}>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Last Hour</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{currentHourEmailStats?.receivedThisHour || 0}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Emails/Min</p>
              <p className={`font-semibold text-primary ${isCompactView ? 'text-sm' : 'text-2xl'}`}>{currentHourEmailStats?.emailsPerMinute || '0.00'}</p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Pending</p>
              <p className={`font-semibold ${(currentHourEmailStats?.pendingCount || 0) > 50 ? 'text-red-600' : 'text-green-600'} ${isCompactView ? 'text-sm' : 'text-2xl'}`}>
                {currentHourEmailStats?.pendingCount || 0}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Capacity</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-2xl'}`}>~300/min</p>
            </div>
          </div>

          {/* Historical Data Tabs */}
          <Tabs defaultValue="hourly" className={isCompactView ? 'pt-1 border-t' : 'pt-4 border-t'}>
            <TabsList className={`grid w-full grid-cols-3 ${isCompactView ? 'h-7' : ''}`}>
              <TabsTrigger value="hourly" className={isCompactView ? 'text-xs py-1' : ''}>24 Hours</TabsTrigger>
              <TabsTrigger value="daily" className={isCompactView ? 'text-xs py-1' : ''}>7 Days</TabsTrigger>
              <TabsTrigger value="monthly" className={isCompactView ? 'text-xs py-1' : ''}>Monthly</TabsTrigger>
            </TabsList>
            
            <TabsContent value="hourly" className={`space-y-1 ${isCompactView ? 'mt-1' : 'mt-4'}`}>
              <div className={`overflow-y-auto ${isCompactView ? 'max-h-[120px] space-y-0.5' : 'max-h-[300px] space-y-1'}`}>
                {emailVolumeStats?.slice(0, isCompactView ? 6 : 24).map((stat: any) => {
                  const hourStart = new Date(stat.hour_start);
                  const hourEnd = new Date(hourStart);
                  hourEnd.setHours(hourEnd.getHours() + 1);
                  return (
                    <div key={stat.id} className={`flex justify-between items-center rounded bg-muted/50 ${isCompactView ? 'text-xs py-1 px-2' : 'text-sm py-2 px-3'}`}>
                      <span className="text-muted-foreground">
                        {hourStart.toLocaleDateString()} {hourStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className={`flex ${isCompactView ? 'gap-2' : 'gap-4'}`}>
                        <span className="text-green-600">{stat.emails_received} rcv</span>
                        <span>{stat.emails_processed} proc</span>
                        <span className="text-blue-600">{stat.matches_count || 0} match</span>
                      </div>
                    </div>
                  );
                })}
                {(!emailVolumeStats || emailVolumeStats.length === 0) && (
                  <p className={`text-muted-foreground text-center py-2 ${isCompactView ? 'text-xs' : 'text-sm'}`}>No hourly data yet.</p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="daily" className={`space-y-1 ${isCompactView ? 'mt-1' : 'mt-4'}`}>
              <div className={isCompactView ? 'space-y-0.5' : 'space-y-1'}>
                {(() => {
                  const dailyData: Record<string, { received: number; processed: number; failed: number; matched: number }> = {};
                  emailVolumeStats?.forEach((stat: any) => {
                    const day = new Date(stat.hour_start).toLocaleDateString();
                    if (!dailyData[day]) {
                      dailyData[day] = { received: 0, processed: 0, failed: 0, matched: 0 };
                    }
                    dailyData[day].received += stat.emails_received || 0;
                    dailyData[day].processed += stat.emails_processed || 0;
                    dailyData[day].failed += stat.emails_failed || 0;
                    dailyData[day].matched += stat.matches_count || 0;
                  });
                  
                  return Object.entries(dailyData).slice(0, isCompactView ? 4 : 7).map(([day, data]) => (
                    <div key={day} className={`flex justify-between items-center rounded bg-muted/50 ${isCompactView ? 'text-xs py-1 px-2' : 'text-sm py-2 px-3'}`}>
                      <span className="font-medium">{day}</span>
                      <div className={`flex ${isCompactView ? 'gap-2' : 'gap-4'}`}>
                        <span className="text-green-600">{data.received.toLocaleString()} rcv</span>
                        <span>{data.processed.toLocaleString()} proc</span>
                        <span className="text-blue-600">{data.matched.toLocaleString()} match</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </TabsContent>
            
            <TabsContent value="monthly" className={`space-y-1 ${isCompactView ? 'mt-1' : 'mt-4'}`}>
              <div className={isCompactView ? 'space-y-0.5' : 'space-y-1'}>
                {(() => {
                  const monthlyData: Record<string, { received: number; processed: number; failed: number; matched: number }> = {};
                  emailVolumeStats?.forEach((stat: any) => {
                    const month = new Date(stat.hour_start).toLocaleDateString('default', { year: 'numeric', month: 'short' });
                    if (!monthlyData[month]) {
                      monthlyData[month] = { received: 0, processed: 0, failed: 0, matched: 0 };
                    }
                    monthlyData[month].received += stat.emails_received || 0;
                    monthlyData[month].processed += stat.emails_processed || 0;
                    monthlyData[month].failed += stat.emails_failed || 0;
                    monthlyData[month].matched += stat.matches_count || 0;
                  });
                  
                  return Object.entries(monthlyData).map(([month, data]) => (
                    <div key={month} className={`flex justify-between items-center rounded bg-muted/50 ${isCompactView ? 'text-xs py-1 px-2' : 'text-sm py-2 px-3'}`}>
                      <span className="font-medium">{month}</span>
                      <div className={`flex ${isCompactView ? 'gap-2' : 'gap-4'}`}>
                        <span className="text-green-600">{data.received.toLocaleString()} rcv</span>
                        <span>{data.processed.toLocaleString()} proc</span>
                        <span className="text-blue-600">{data.matched.toLocaleString()} match</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </TabsContent>
          </Tabs>

          {!isCompactView && (
            <div className="pt-2 border-t flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                <p>• Hourly snapshots recorded at top of each hour</p>
                <p>• Processing rate: 100 emails/batch (~300/min capacity)</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { error } = await supabase.functions.invoke('snapshot-email-volume');
                    if (error) throw error;
                    toast.success("Snapshot triggered - refreshing...");
                    refetchEmailVolume();
                    refetchCurrentHourStats();
                  } catch (err) {
                    toast.error("Failed to trigger snapshot");
                  }
                }}
                className="flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Snapshot Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database Storage */}
      <Card className={isCompactView ? 'py-0' : ''}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Database className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
                {isCompactView ? 'Database' : 'Database Storage'}
              </CardTitle>
              {!isCompactView && <CardDescription>Lovable Cloud database usage</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastDatabaseRefresh}
              refreshInterval={databaseRefreshInterval}
              onIntervalChange={setDatabaseRefreshInterval}
              onRefresh={() => {
                queryClient.invalidateQueries({ queryKey: ["usage-table-counts"] });
                setLastDatabaseRefresh(new Date());
              }}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-2' : 'space-y-4'}>
          {/* Current Usage */}
          <div className={`flex ${isCompactView ? 'items-center gap-4' : 'flex-col space-y-2'}`}>
            <div className={`flex ${isCompactView ? 'items-center gap-2' : 'items-center justify-between'}`}>
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Records:</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>{estimatedCosts.storage.totalRecords.toLocaleString()}</p>
            </div>
            <div className={`flex ${isCompactView ? 'items-center gap-2' : 'items-center justify-between'}`}>
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>Size:</p>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-lg'}`}>~{estimatedCosts.storage.estimatedSize} MB</p>
            </div>
          </div>
          
          {/* Storage Progress */}
          <div className={isCompactView ? 'pt-1 border-t space-y-1' : 'pt-4 border-t space-y-3'}>
            <div className="flex items-center justify-between">
              <p className={`font-medium flex items-center gap-1 ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                <HardDrive className={isCompactView ? 'h-3 w-3' : 'h-4 w-4'} />
                Standard (500 MB)
              </p>
              <p className={`text-muted-foreground ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                {((parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.standard) * 100).toFixed(1)}%
              </p>
            </div>
            <Progress 
              value={(parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.standard) * 100} 
              className={isCompactView ? 'h-1.5' : 'h-2'}
            />
          </div>

          {!isCompactView && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    Pro Tier Limit
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {estimatedCosts.storage.estimatedSize} / {(STORAGE_LIMITS.pro / 1000).toFixed(0)} GB
                  </p>
                </div>
                <Progress 
                  value={(parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.pro) * 100} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{((parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.pro) * 100).toFixed(2)}% used</span>
                  <span>{((STORAGE_LIMITS.pro - parseFloat(estimatedCosts.storage.estimatedSize)) / 1000).toFixed(2)} GB remaining</span>
                </div>
              </div>
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                <p>• <strong>Standard:</strong> 500 MB included</p>
                <p>• <strong>Pro:</strong> 8 GB included, then $0.125/GB</p>
              </div>
            </>
          )}
          
          {/* Top Tables */}
          <div className={isCompactView ? 'pt-1 border-t space-y-1' : 'pt-4 border-t space-y-2'}>
            <p className={`font-medium ${isCompactView ? 'text-xs' : 'text-sm'}`}>Top Tables</p>
            <div className={isCompactView ? 'space-y-0.5' : 'space-y-1'}>
              {tableCounts && Object.entries(tableCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, isCompactView ? 3 : 5)
                .map(([table, count]) => (
                  <div key={table} className={`flex justify-between ${isCompactView ? 'text-xs' : 'text-sm'}`}>
                    <span className="text-muted-foreground capitalize">{table.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Archive Old Emails Button */}
          {!isCompactView && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => archiveEmailsMutation.mutate()}
                disabled={archiveEmailsMutation.isPending}
              >
                {archiveEmailsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Archive Emails &gt; 30 Days
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Moves old load emails to archive table to reduce main table size and improve query performance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className={isCompactView ? 'py-0' : ''}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
                <Activity className={isCompactView ? 'h-4 w-4' : 'h-5 w-5'} />
                {isCompactView ? 'Activity (30d)' : 'Recent Activity (30 Days)'}
              </CardTitle>
              {!isCompactView && <CardDescription>System usage statistics</CardDescription>}
            </div>
            <RefreshControl
              lastRefresh={lastActivityRefresh}
              refreshInterval={activityRefreshInterval}
              onIntervalChange={setActivityRefreshInterval}
              onRefresh={() => refetchRecentActivity()}
            />
          </div>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2 space-y-1' : 'space-y-3'}>
          <div className={`flex items-center justify-between ${isCompactView ? 'py-1' : 'py-2 border-b'}`}>
            <div className="flex items-center gap-2">
              <Mail className={isCompactView ? 'h-3 w-3 text-muted-foreground' : 'h-4 w-4 text-muted-foreground'} />
              <span className={isCompactView ? 'text-xs' : 'text-sm'}>Sylectus</span>
            </div>
            <div className={isCompactView ? '' : 'text-right'}>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-xl'}`}>{(recentActivity?.emails || 0).toLocaleString()}</p>
              {!isCompactView && <p className="text-xs text-muted-foreground">emails (30 days)</p>}
            </div>
          </div>
          <div className={`flex items-center justify-between ${isCompactView ? 'py-1' : 'py-2 border-b'}`}>
            <div className="flex items-center gap-2">
              <Activity className={isCompactView ? 'h-3 w-3 text-muted-foreground' : 'h-4 w-4 text-muted-foreground'} />
              <span className={isCompactView ? 'text-xs' : 'text-sm'}>Hunt Matches</span>
            </div>
            <div className={isCompactView ? '' : 'text-right'}>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-xl'}`}>{(recentActivity?.matches || 0).toLocaleString()}</p>
              {!isCompactView && <p className="text-xs text-muted-foreground">matches (30 days)</p>}
            </div>
          </div>
          <div className={`flex items-center justify-between ${isCompactView ? 'py-1' : 'py-2'}`}>
            <div className="flex items-center gap-2">
              <Database className={isCompactView ? 'h-3 w-3 text-muted-foreground' : 'h-4 w-4 text-muted-foreground'} />
              <span className={isCompactView ? 'text-xs' : 'text-sm'}>Loads Created</span>
            </div>
            <div className={isCompactView ? '' : 'text-right'}>
              <p className={`font-semibold ${isCompactView ? 'text-sm' : 'text-xl'}`}>{(recentActivity?.loads || 0).toLocaleString()}</p>
              {!isCompactView && <p className="text-xs text-muted-foreground">loads (30 days)</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Optimization Tips */}
      <Card className={`border-amber-500/20 bg-amber-500/5 ${isCompactView ? 'py-0' : ''}`}>
        <CardHeader className={isCompactView ? 'py-2 px-3' : ''}>
          <CardTitle className={`flex items-center gap-2 ${isCompactView ? 'text-sm' : ''}`}>
            <TrendingUp className={`text-amber-500 ${isCompactView ? 'h-4 w-4' : 'h-5 w-5'}`} />
            Cost Optimization Tips
          </CardTitle>
        </CardHeader>
        <CardContent className={isCompactView ? 'pt-0 px-3 pb-2' : ''}>
          <div className={`space-y-1 ${isCompactView ? 'text-xs' : 'text-sm'}`}>
            <p className="flex gap-1"><span>•</span><span>Disable hunt plans when not actively searching</span></p>
            <p className="flex gap-1"><span>•</span><span>Smart matching pre-filters emails by region (saves ~60% matching costs)</span></p>
            {!isCompactView && (
              <>
                <p className="flex gap-2"><span>•</span><span>Archive old emails to keep the main table small and queries fast</span></p>
                <p className="flex gap-2"><span>•</span><span>Shared realtime updates reduce duplicate polling across dispatchers</span></p>
                <p className="flex gap-2"><span>•</span><span>Keep ALL tab disabled when not testing to avoid expensive queries</span></p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
};

export default UsageCostsTab;
