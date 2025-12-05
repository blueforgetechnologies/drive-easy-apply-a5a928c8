import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign, Sparkles, Loader2, Clock, BarChart3, RefreshCw, Settings, HardDrive } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [lastGeocodeRefresh, setLastGeocodeRefresh] = useState<Date>(new Date());
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
  const { data: recentActivity } = useQuery({
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
      
      return {
        emails: emailsCount || 0,
        loads: loadsCount || 0,
        matches: matchesCount || 0
      };
    }
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
      return data || [];
    }
  });

  // Get current hour stats for display
  const { data: currentHourEmailStats } = useQuery({
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
    refetchInterval: 20000 // Refresh every 20 seconds
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

  const totalEstimatedMonthlyCost = (
    geocodingCost +
    mapLoadsCost +
    directionsCost +
    parseFloat(estimatedCosts.resend.estimatedCost)
  ).toFixed(2);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Usage & Costs</h2>
        <p className="text-muted-foreground mt-2">
          Monitor your service usage and estimated costs
        </p>
      </div>

      {/* Total Cost Overview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Estimated Monthly Cost (Last 30 Days)
          </CardTitle>
          <CardDescription>Based on current usage patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">
            ${totalEstimatedMonthlyCost}
          </div>
        </CardContent>
      </Card>

      {/* Geocode Cache Stats */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5 text-green-500" />
                Geocode Cache Performance
              </CardTitle>
              <CardDescription>Cache reduces Mapbox API calls</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isGeocodeStatsFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">
                {isGeocodeStatsFetching ? 'Refreshing...' : `Last: ${lastGeocodeRefresh.toLocaleTimeString()}`} • {geocodeCacheRefreshInterval / 1000}s
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    <Settings className="h-3.5 w-3.5" />
                    <span className="sr-only md:not-sr-only md:inline">Refresh Rate</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Auto-refresh interval</p>
                    <Select
                      value={geocodeCacheRefreshInterval.toString()}
                      onValueChange={(value) => {
                        setGeocodeCacheRefreshInterval(parseInt(value));
                        toast.success(`Geocode cache refresh rate set to ${parseInt(value) / 1000}s`);
                        refetchGeocodeStats();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10000">10 seconds</SelectItem>
                        <SelectItem value="20000">20 seconds</SelectItem>
                        <SelectItem value="30000">30 seconds</SelectItem>
                        <SelectItem value="60000">1 minute</SelectItem>
                        <SelectItem value="120000">2 minutes</SelectItem>
                        <SelectItem value="300000">5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Last updated: {lastGeocodeRefresh.toLocaleTimeString()}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => refetchGeocodeStats()}
                disabled={isGeocodeStatsFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGeocodeStatsFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cached Locations</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.totalLocations?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Cache Hits</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.totalHits?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.cacheHitRate || 0}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Est. Savings</p>
              <p className="text-2xl font-semibold text-green-600">${geocodeStats?.estimatedSavings || '0.00'}</p>
            </div>
          </div>
          
          {/* Daily Stats History */}
          {dailyStats && dailyStats.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-3">Daily History (Last 7 Days)</p>
              <div className="space-y-2">
                {dailyStats.map((stat: any) => (
                  <div key={stat.id} className="flex justify-between items-center text-sm py-1 px-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">{new Date(stat.recorded_at).toLocaleDateString()}</span>
                    <div className="flex gap-4">
                      <span>+{stat.new_locations_today} new</span>
                      <span>{stat.hits_today} hits</span>
                      <span className="text-green-600 font-medium">${Number(stat.estimated_savings).toFixed(2)} saved</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>• Each cache hit saves one Mapbox API call ($0.75/1,000 = $0.00075)</p>
            <p>• Savings calculated based on cache hits that would have been billable API calls</p>
            <p>• Stats snapshot daily at midnight ET</p>
          </div>
        </CardContent>
      </Card>

      {/* Mapbox Usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                Mapbox Usage & Billing - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
              </CardTitle>
              <CardDescription>Current month geocoding and map rendering costs (resets monthly)</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">
                {isRefreshing ? 'Refreshing...' : `Last: ${lastRefresh.toLocaleTimeString()}`} • {mapboxRefreshInterval / 1000}s
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    <Settings className="h-3.5 w-3.5" />
                    <span className="sr-only md:not-sr-only md:inline">Refresh Rate</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Auto-refresh interval</p>
                    <Select
                      value={mapboxRefreshInterval.toString()}
                      onValueChange={(value) => {
                        setMapboxRefreshInterval(parseInt(value));
                        toast.success(`Refresh rate set to ${parseInt(value) / 1000}s`);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5000">5 seconds</SelectItem>
                        <SelectItem value="10000">10 seconds</SelectItem>
                        <SelectItem value="20000">20 seconds</SelectItem>
                        <SelectItem value="30000">30 seconds</SelectItem>
                        <SelectItem value="60000">1 minute</SelectItem>
                        <SelectItem value="300000">5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Last updated: {lastRefresh.toLocaleTimeString()}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Geocoding API */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Geocoding API (Current Month)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">API Calls</p>
                <p className="text-lg font-semibold">{estimatedCosts.mapbox.geocodingApiCalls.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cache Saved</p>
                <p className="text-lg font-semibold text-green-600">{estimatedCosts.mapbox.geocodingCacheSaved.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Free Tier (100K)</p>
                <p className="text-lg font-semibold text-green-600">
                  {estimatedCosts.mapbox.geocodingFreeRemaining > 0 
                    ? `${estimatedCosts.mapbox.geocodingFreeRemaining.toLocaleString()} left` 
                    : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Billable Calls</p>
                <p className="text-lg font-semibold text-amber-600">{estimatedCosts.mapbox.geocodingBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Est. Cost</p>
                <p className="text-lg font-semibold text-red-600">${estimatedCosts.mapbox.geocodingCost}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Rate: $0.75/1K (100K-500K) • $0.60/1K (500K-1M) • $0.45/1K (1M+) • Check <a href="https://console.mapbox.com/account/invoices" target="_blank" rel="noopener noreferrer" className="text-primary underline">Mapbox dashboard</a> for exact billing</p>
          </div>
          
          {/* Map Loads */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-sm font-medium">Map Loads (GL JS) - Current Month</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Loads</p>
                <p className="text-lg font-semibold">{estimatedCosts.mapbox.mapLoads.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Free Tier (50K)</p>
                <p className="text-lg font-semibold text-green-600">
                  {estimatedCosts.mapbox.mapLoadsFreeRemaining > 0 
                    ? `${estimatedCosts.mapbox.mapLoadsFreeRemaining.toLocaleString()} left` 
                    : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Billable Loads</p>
                <p className="text-lg font-semibold text-amber-600">{estimatedCosts.mapbox.mapLoadsBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Est. Cost</p>
                <p className="text-lg font-semibold text-red-600">${estimatedCosts.mapbox.mapLoadsCost}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Rate: $5.00/1K (50K-100K) • $4.00/1K (100K-200K) • $3.00/1K (200K+)</p>
          </div>

          {/* Directions API */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-sm font-medium">Directions API (Navigation) - Current Month</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Requests</p>
                <p className="text-lg font-semibold">{estimatedCosts.mapbox.directionsApiCalls.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Free Tier (100K)</p>
                <p className="text-lg font-semibold text-green-600">
                  {estimatedCosts.mapbox.directionsFreeRemaining > 0 
                    ? `${estimatedCosts.mapbox.directionsFreeRemaining.toLocaleString()} left` 
                    : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Billable Requests</p>
                <p className="text-lg font-semibold text-amber-600">{estimatedCosts.mapbox.directionsBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Est. Cost</p>
                <p className="text-lg font-semibold text-green-600">${estimatedCosts.mapbox.directionsCost}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Rate: $0.50/1K (100K-500K) • $0.40/1K (500K+) • Used for route optimization</p>
          </div>

          {/* Monthly History */}
          {monthlyHistory && monthlyHistory.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-3">Monthly History</p>
              <div className="space-y-2">
                {monthlyHistory.map((month: any) => (
                  <div key={month.id} className="flex justify-between items-center text-sm py-2 px-3 rounded bg-muted/50">
                    <span className="font-medium">{month.month_year}</span>
                    <div className="flex gap-4 text-xs md:text-sm">
                      <span>Geocoding: {month.geocoding_api_calls?.toLocaleString() || 0}</span>
                      <span>Maps: {month.map_loads?.toLocaleString() || 0}</span>
                      <span>Directions: {month.directions_api_calls?.toLocaleString() || 0}</span>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Lovable AI Usage
          </CardTitle>
          <CardDescription>AI model requests and costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Model</p>
            <p className="text-lg font-medium">google/gemini-2.5-flash</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Test AI Integration</p>
            <Button 
              onClick={() => testAiMutation.mutate()}
              disabled={testAiMutation.isPending}
              className="w-full"
            >
              {testAiMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing AI...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Test AI
                </>
              )}
            </Button>
            {aiTestResult && (
              <div className="mt-3 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">AI Response:</p>
                <p className="text-sm text-muted-foreground">{aiTestResult}</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>• Usage-based pricing per AI request</p>
            <p>• Check credit balance in Lovable workspace settings</p>
            <p>• Free monthly usage included, then pay-as-you-go</p>
          </div>
        </CardContent>
      </Card>

      {/* Email Volume Tracking */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Email Volume Tracking
              </CardTitle>
              <CardDescription>Incoming load emails by source - snapshots every 60 minutes</CardDescription>
            </div>
            <Select value={emailSource} onValueChange={setEmailSource}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sylectus">Sylectus</SelectItem>
                {/* Future sources can be added here */}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Summary */}
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

          {/* Current Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last Hour</p>
              <p className="text-2xl font-semibold">{currentHourEmailStats?.receivedThisHour || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Emails/Minute</p>
              <p className="text-2xl font-semibold text-primary">{currentHourEmailStats?.emailsPerMinute || '0.00'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pending Queue</p>
              <p className={`text-2xl font-semibold ${(currentHourEmailStats?.pendingCount || 0) > 50 ? 'text-red-600' : 'text-green-600'}`}>
                {currentHourEmailStats?.pendingCount || 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Processing Rate</p>
              <p className="text-2xl font-semibold">~300/min</p>
            </div>
          </div>

          {/* Historical Data Tabs */}
          <Tabs defaultValue="hourly" className="pt-4 border-t">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="hourly">Last 24 Hours</TabsTrigger>
              <TabsTrigger value="daily">Last 7 Days</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
            
            <TabsContent value="hourly" className="space-y-2 mt-4">
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {emailVolumeStats?.slice(0, 24).map((stat: any) => {
                  const hourStart = new Date(stat.hour_start);
                  const hourEnd = new Date(hourStart);
                  hourEnd.setHours(hourEnd.getHours() + 1);
                  return (
                    <div key={stat.id} className="flex justify-between items-center text-sm py-2 px-3 rounded bg-muted/50">
                      <span className="text-muted-foreground">
                        {hourStart.toLocaleDateString()} {hourStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {hourEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex gap-4">
                        <span className="text-green-600">{stat.emails_received} received</span>
                        <span>{stat.emails_processed} processed</span>
                        {stat.emails_pending > 0 && (
                          <span className="text-amber-600">{stat.emails_pending} pending</span>
                        )}
                        {stat.emails_failed > 0 && (
                          <span className="text-red-600">{stat.emails_failed} failed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(!emailVolumeStats || emailVolumeStats.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hourly data yet. Stats are recorded every hour.</p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="daily" className="space-y-2 mt-4">
              <div className="space-y-1">
                {(() => {
                  // Aggregate by day
                  const dailyData: Record<string, { received: number; processed: number; failed: number }> = {};
                  emailVolumeStats?.forEach((stat: any) => {
                    const day = new Date(stat.hour_start).toLocaleDateString();
                    if (!dailyData[day]) {
                      dailyData[day] = { received: 0, processed: 0, failed: 0 };
                    }
                    dailyData[day].received += stat.emails_received || 0;
                    dailyData[day].processed += stat.emails_processed || 0;
                    dailyData[day].failed += stat.emails_failed || 0;
                  });
                  
                  return Object.entries(dailyData).slice(0, 7).map(([day, data]) => (
                    <div key={day} className="flex justify-between items-center text-sm py-2 px-3 rounded bg-muted/50">
                      <span className="font-medium">{day}</span>
                      <div className="flex gap-4">
                        <span className="text-green-600">{data.received.toLocaleString()} received</span>
                        <span>{data.processed.toLocaleString()} processed</span>
                        {data.failed > 0 && <span className="text-red-600">{data.failed} failed</span>}
                        <span className="text-muted-foreground">{(data.received / 24).toFixed(1)}/hr avg</span>
                      </div>
                    </div>
                  ));
                })()}
                {(!emailVolumeStats || emailVolumeStats.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No daily data yet.</p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="monthly" className="space-y-2 mt-4">
              <div className="space-y-1">
                {(() => {
                  // Aggregate by month
                  const monthlyData: Record<string, { received: number; processed: number; failed: number }> = {};
                  emailVolumeStats?.forEach((stat: any) => {
                    const month = new Date(stat.hour_start).toLocaleDateString('default', { year: 'numeric', month: 'long' });
                    if (!monthlyData[month]) {
                      monthlyData[month] = { received: 0, processed: 0, failed: 0 };
                    }
                    monthlyData[month].received += stat.emails_received || 0;
                    monthlyData[month].processed += stat.emails_processed || 0;
                    monthlyData[month].failed += stat.emails_failed || 0;
                  });
                  
                  return Object.entries(monthlyData).map(([month, data]) => (
                    <div key={month} className="flex justify-between items-center text-sm py-2 px-3 rounded bg-muted/50">
                      <span className="font-medium">{month}</span>
                      <div className="flex gap-4">
                        <span className="text-green-600">{data.received.toLocaleString()} received</span>
                        <span>{data.processed.toLocaleString()} processed</span>
                        {data.failed > 0 && <span className="text-red-600">{data.failed} failed</span>}
                      </div>
                    </div>
                  ));
                })()}
                {(!emailVolumeStats || emailVolumeStats.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No monthly data yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="pt-2 border-t flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <p>• Live stats refresh every 20 seconds</p>
              <p>• Hourly snapshots recorded at the top of each hour</p>
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
                  setTimeout(() => window.location.reload(), 2000);
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
        </CardContent>
      </Card>

      {/* Database Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Storage
          </CardTitle>
          <CardDescription>Lovable Cloud database usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Records</p>
              <p className="text-lg font-semibold">{estimatedCosts.storage.totalRecords.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Estimated Size</p>
              <p className="text-lg font-semibold">~{estimatedCosts.storage.estimatedSize} MB</p>
            </div>
          </div>
          
          {/* Storage Limit Progress - Standard Tier */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Standard Tier Limit
              </p>
              <p className="text-sm text-muted-foreground">
                {estimatedCosts.storage.estimatedSize} / {STORAGE_LIMITS.standard} MB
              </p>
            </div>
            <Progress 
              value={(parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.standard) * 100} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{((parseFloat(estimatedCosts.storage.estimatedSize) / STORAGE_LIMITS.standard) * 100).toFixed(1)}% used</span>
              <span>{(STORAGE_LIMITS.standard - parseFloat(estimatedCosts.storage.estimatedSize)).toFixed(1)} MB remaining</span>
            </div>
          </div>

          {/* Storage Limit Progress - Pro Tier */}
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

          {/* Tier Info */}
          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            <p>• <strong>Standard:</strong> 500 MB included</p>
            <p>• <strong>Pro:</strong> 8 GB included, then $0.125/GB</p>
          </div>
          
          <div className="pt-4 border-t space-y-2">
            <p className="text-sm font-medium">Top Tables by Record Count</p>
            <div className="space-y-1">
              {tableCounts && Object.entries(tableCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([table, count]) => (
                  <div key={table} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{table.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity (30 Days)
          </CardTitle>
          <CardDescription>System usage statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Sylectus</span>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold">{(recentActivity?.emails || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">emails (30 days)</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Hunt Matches</span>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold">{(recentActivity?.matches || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">matches (30 days)</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Loads Created</span>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold">{(recentActivity?.loads || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">loads (30 days)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Optimization Tips */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Cost Optimization Tips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex gap-2">
            <span>•</span>
            <span>Disable hunt plans when not actively searching to avoid geocoding costs</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Geocoding only occurs when loads match hunt plans with location criteria</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Regular database cleanup of old records can help manage storage</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Lovable Cloud includes generous free tiers for most services</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsageCostsTab;
