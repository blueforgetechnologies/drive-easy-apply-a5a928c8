import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign, Sparkles, Loader2, Clock, BarChart3, RefreshCw, HardDrive, LayoutGrid, List, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  const queryClient = useQueryClient();

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
    refetchIntervalInBackground: true, // Keep refetching even when tab is not focused
    staleTime: 0,
  });

  // Fetch incremental calls since last sync (new calls made by the app AFTER baseline was recorded)
  const { data: incrementalCalls, refetch: refetchIncremental } = useQuery({
    queryKey: ["mapbox-incremental", currentMonth, baselineUsage?.last_synced_at],
    queryFn: async () => {
      const lastSyncedAt = baselineUsage?.last_synced_at;
      console.log('[Mapbox] Fetching incremental since:', lastSyncedAt);
      
      if (!lastSyncedAt) {
        setLastRefresh(new Date());
        return { geocoding: 0, mapLoads: 0, directions: 0 };
      }
      
      // Count new geocoding calls since last sync
      const { count: geocodingCount } = await supabase
        .from('geocode_cache')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSyncedAt)
        .eq('month_created', currentMonth);
      
      // Count new map loads since last sync
      const { count: mapLoadsCount } = await supabase
        .from('map_load_tracking')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSyncedAt)
        .eq('month_year', currentMonth);
      
      // Count new directions API calls since last sync
      const { count: directionsCount } = await supabase
        .from('directions_api_tracking')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSyncedAt)
        .eq('month_year', currentMonth);
      
      const result = {
        geocoding: geocodingCount || 0,
        mapLoads: mapLoadsCount || 0,
        directions: directionsCount || 0
      };
      console.log('[Mapbox] Incremental data:', result);
      setLastRefresh(new Date());
      return result;
    },
    enabled: !!baselineUsage,
    refetchInterval: mapboxRefreshInterval,
    refetchIntervalInBackground: true,
    staleTime: 0,
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

  // Fetch geocode cache stats for cache performance display
  const { data: geocodeStats, isFetching: isGeocodeStatsFetching, refetch: refetchGeocodeStats } = useQuery({
    queryKey: ["geocode-cache-stats", geocodeCacheRefreshInterval],
    queryFn: async () => {
      console.log('[Geocode Cache] Fetching stats...');
      // Get total locations count
      const { count: totalLocations } = await supabase
        .from('geocode_cache')
        .select('*', { count: 'exact', head: true });
      
      // Get sum of hit_count using a manual aggregation query
      const { data: hitData, error } = await supabase
        .from('geocode_cache')
        .select('hit_count');
      
      if (error) throw error;
      
      // Since we can't easily sum in Supabase client, fetch in batches if needed
      // For now, use a workaround: fetch all hit_counts with pagination
      let totalHits = 0;
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from('geocode_cache')
          .select('hit_count')
          .range(offset, offset + batchSize - 1);
        
        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        
        totalHits += batch.reduce((sum, row) => sum + (row.hit_count || 1), 0);
        
        if (batch.length < batchSize) break;
        offset += batchSize;
      }
      
      const cacheSaved = Math.max(0, totalHits - (totalLocations || 0));
      const estimatedSavings = cacheSaved * 0.00075;
      
      setLastGeocodeRefresh(new Date());
      console.log('[Geocode Cache] Stats:', { totalLocations, totalHits, cacheSaved });
      
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
    staleTime: 0,
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

  // Fetch table counts
  const { data: tableCounts } = useQuery({
    queryKey: ["usage-table-counts"],
    queryFn: async () => {
      const tables = [
        'loads', 'load_emails', 'load_stops', 'load_hunt_matches',
        'vehicles', 'applications', 'dispatchers', 'carriers',
        'customers', 'payees', 'settlements', 'invoices',
        'maintenance_records', 'audit_logs', 'load_documents', 'geocode_cache'
      ] as const;
      
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const { count } = await supabase
          .from(table as any)
          .select('*', { count: 'exact', head: true });
        counts[table] = count || 0;
      }
      return counts;
    }
  });

  // Fetch recent activity counts (last 30 days)
  const { data: recentActivity, refetch: refetchRecentActivity } = useQuery({
    queryKey: ["usage-recent-activity"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: emailsCount } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      const { count: loadsCount } = await supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      const { count: matchesCount } = await supabase
        .from('load_hunt_matches')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      setLastActivityRefresh(new Date());
      return {
        emails: emailsCount || 0,
        loads: loadsCount || 0,
        matches: matchesCount || 0
      };
    },
    refetchInterval: activityRefreshInterval,
    refetchIntervalInBackground: true,
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
    refetchInterval: mapboxRefreshInterval
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
  const { data: pubsubStats, refetch: refetchPubsub } = useQuery({
    queryKey: ["usage-pubsub", currentMonth],
    queryFn: async () => {
      // Get email count and date range from load_emails for accurate Pub/Sub calculation
      const { data: emailData, count: emailCount } = await supabase
        .from('load_emails')
        .select('received_at', { count: 'exact' })
        .order('received_at', { ascending: true });
      
      const totalEmails = emailCount || 0;
      
      // Calculate days of data
      let daysOfData = 1;
      if (emailData && emailData.length >= 2) {
        const firstEmail = new Date(emailData[0].received_at);
        const lastEmail = new Date(emailData[emailData.length - 1].received_at);
        daysOfData = Math.max(1, (lastEmail.getTime() - firstEmail.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      // Each Pub/Sub notification is ~1.5KB average
      const avgMessageSize = 1500; // bytes
      const totalBytes = totalEmails * avgMessageSize;
      const totalMB = totalBytes / (1024 * 1024);
      const totalGB = totalMB / 1024;
      
      // Gmail API calls estimation (~45 API calls per email processed)
      // Breakdown: token refresh, list messages, get message details, mark as read, retries
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
        projected30DayApiCallsInMillions: (projected30DayApiCalls / 1_000_000).toFixed(2)
      };
    },
    refetchInterval: pubsubRefreshInterval,
    refetchIntervalInBackground: true,
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
  // Cloud is billed at ~$0.01 per unit
  const { data: cloudUsageStats } = useQuery({
    queryKey: ["cloud-usage-estimate", currentMonth],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Count database operations (writes are ~1 unit each, reads are fractional)
      // Estimate based on recent activity in high-volume tables
      
      // Email processing operations
      const { count: emailOps } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      // Hunt match operations (high volume - created/updated frequently)
      const { count: matchOps } = await supabase
        .from('load_hunt_matches')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      // Geocode cache operations
      const { count: geocodeOps } = await supabase
        .from('geocode_cache')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      // Map load tracking operations
      const { count: mapTrackingOps } = await supabase
        .from('map_load_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      // Directions API tracking operations
      const { count: directionsOps } = await supabase
        .from('directions_api_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      // AI usage tracking operations
      const { count: aiOps } = await supabase
        .from('ai_usage_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      // Email send tracking operations
      const { count: emailSendOps } = await supabase
        .from('email_send_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      // Audit log operations
      const { count: auditOps } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', thirtyDaysAgo.toISOString());

      // Match action history
      const { count: matchActionOps } = await supabase
        .from('match_action_history')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Email volume stats
      const { count: emailVolumeOps } = await supabase
        .from('email_volume_stats')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      // Calculate total write operations
      const writeOps = (emailOps || 0) + (matchOps || 0) + (geocodeOps || 0) + 
                       (mapTrackingOps || 0) + (directionsOps || 0) + (aiOps || 0) + 
                       (emailSendOps || 0) + (auditOps || 0) + (matchActionOps || 0) + 
                       (emailVolumeOps || 0);
      
      // Estimate read operations (typically 3-5x write operations for active apps)
      // Load Hunter does many reads for matching, filtering, realtime subscriptions
      const estimatedReadMultiplier = 4;
      const estimatedReadOps = writeOps * estimatedReadMultiplier;
      
      // Edge function invocations (estimate based on email processing + AI + other functions)
      // Each email triggers ~2-3 edge function calls (webhook, process-queue, etc.)
      const edgeFunctionCalls = (emailOps || 0) * 2.5 + (aiOps || 0) + (emailSendOps || 0);
      
      // Realtime subscriptions add to read operations
      // Estimate ~10 subscription updates per email received
      const realtimeOps = (emailOps || 0) * 10;
      
      // Total operations (for informational metrics only - Cloud billing is separate)
      const totalOps = writeOps + Math.round(estimatedReadOps) + Math.round(edgeFunctionCalls) + realtimeOps;
      
      // Estimated cost calculation based on actual historical data:
      // Known: $25 actual cost for ~186K write operations = $0.000134 per write op
      // This rate is derived from real Lovable Cloud billing data
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
          emails: emailOps || 0,
          matches: matchOps || 0,
          geocode: geocodeOps || 0,
          mapTracking: mapTrackingOps || 0,
          directions: directionsOps || 0,
          ai: aiOps || 0,
          emailSend: emailSendOps || 0,
          audit: auditOps || 0,
          matchActions: matchActionOps || 0,
          emailVolume: emailVolumeOps || 0
        }
      };
    },
    refetchInterval: 60000, // Refresh every minute
  });

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

  // Cloud usage cost (based on historical rate: $25 / 186K write ops = $0.000134/op)
  const cloudCostNumber = parseFloat(cloudUsageStats?.estimatedCost || '0');

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
              <InfoTooltip text="Sum of all estimated service costs: Mapbox APIs, Lovable AI usage, email services, and Lovable Cloud (estimated at $0.000134 per write op based on your actual $25 billing for 186K ops)." />
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

              {/* Lovable Cloud Section - Estimated */}
              <div className="bg-background/50 rounded-lg p-3 border border-amber-500/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-amber-600" />
                    <span className="font-medium text-sm">Lovable Cloud</span>
                    <InfoTooltip text="Estimated based on historical rate: $25 actual cost / 186K write ops = $0.000134 per write operation. Compare with Settings → Plans & Credits for actual billing." />
                  </div>
                  <span className="font-semibold text-sm text-amber-600">~${costBreakdown.cloud.estimatedCost.toFixed(2)}</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Write Operations:</span>
                    <span className="font-medium">{costBreakdown.cloud.writeOps.toLocaleString()}</span>
                  </div>
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
                      <span>Rate:</span>
                      <span>$0.000134/write</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
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
            <p className="flex gap-1"><span>•</span><span>Geocoding only occurs when loads match hunt criteria</span></p>
            {!isCompactView && (
              <>
                <p className="flex gap-2"><span>•</span><span>Regular database cleanup of old records can help manage storage</span></p>
                <p className="flex gap-2"><span>•</span><span>Lovable Cloud includes generous free tiers for most services</span></p>
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
