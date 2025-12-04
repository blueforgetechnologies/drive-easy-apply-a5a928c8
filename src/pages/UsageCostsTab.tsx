import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign, Sparkles, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const UsageCostsTab = () => {
  const [aiTestResult, setAiTestResult] = useState<string>("");

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

  // Fetch current month usage from mapbox_monthly_usage table
  const { data: currentMonthUsage } = useQuery({
    queryKey: ["current-month-usage", currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapbox_monthly_usage')
        .select('*')
        .eq('month_year', currentMonth)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data;
    }
  });

  // Fetch new geocode cache entries created AFTER the baseline was set (Dec 4, 2025 at current time)
  const { data: newCacheEntriesThisMonth } = useQuery({
    queryKey: ["new-cache-entries-since-base"],
    queryFn: async () => {
      // Only count entries created after Dec 4, 2025 ~18:00 UTC (when baseline of 210,623 was established)
      // Using end of day to ensure we don't double-count today's entries that are already in the baseline
      const baselineDate = '2025-12-05T00:00:00Z';
      const { count, error } = await supabase
        .from('geocode_cache')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', baselineDate);
      
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch geocode cache stats for cache performance display
  const { data: geocodeStats } = useQuery({
    queryKey: ["geocode-cache-stats"],
    queryFn: async () => {
      // Get all-time stats for cache performance
      const { data, error } = await supabase
        .from('geocode_cache')
        .select('hit_count, created_at');
      
      if (error) throw error;
      
      const totalLocations = data?.length || 0;
      const totalHits = data?.reduce((sum, row) => sum + (row.hit_count || 1), 0) || 0;
      const estimatedSavings = totalHits * 0.00075;
      
      return {
        totalLocations,
        totalHits,
        estimatedSavings: estimatedSavings.toFixed(2),
        cacheHitRate: totalLocations > 0 ? ((totalHits - totalLocations) / totalHits * 100).toFixed(1) : '0'
      };
    }
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
    }
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
    }
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
    }
  });

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

  // Current month geocoding API calls - base from mapbox_monthly_usage + new cache misses this month
  const baseGeocodingCalls = currentMonthUsage?.geocoding_api_calls || 0;
  const newGeocodingCalls = newCacheEntriesThisMonth || 0;
  // If we have a stored base, add new calls on top. Otherwise just use new calls.
  const currentMonthGeocodingCalls = baseGeocodingCalls > 0 ? baseGeocodingCalls + newGeocodingCalls : newGeocodingCalls;
  const billableGeocodingCalls = Math.max(0, currentMonthGeocodingCalls - MAPBOX_GEOCODING_FREE_TIER);
  const geocodingCost = calculateGeocodingCost(currentMonthGeocodingCalls);

  // Current month map loads - use mapbox_monthly_usage if available
  const currentMonthMapLoads = currentMonthUsage?.map_loads || mapLoadStats || 0;
  const billableMapLoads = Math.max(0, currentMonthMapLoads - MAPBOX_MAP_LOADS_FREE_TIER);
  const mapLoadsCost = currentMonthUsage?.map_loads_cost || calculateMapLoadsCost(currentMonthMapLoads);

  // Current month directions API - baseline from mapbox_monthly_usage + new tracking
  const baseDirectionsCalls = currentMonthUsage?.directions_api_calls || 0;
  const newDirectionsCalls = directionsApiStats || 0;
  const currentMonthDirectionsCalls = baseDirectionsCalls > 0 ? baseDirectionsCalls + newDirectionsCalls : newDirectionsCalls;
  const billableDirectionsCalls = Math.max(0, currentMonthDirectionsCalls - MAPBOX_DIRECTIONS_FREE_TIER);
  const directionsCost = calculateDirectionsCost(currentMonthDirectionsCalls);

  // Cache stats for display
  const cachedLocations = geocodeStats?.totalLocations || 0;
  const totalRequestsServed = geocodeStats?.totalHits || 0;
  const cacheSavedCalls = Math.max(0, totalRequestsServed - cachedLocations);

  const estimatedCosts = {
    mapbox: {
      // Current month API calls
      geocodingApiCalls: currentMonthGeocodingCalls,
      // Cache savings (all-time)
      geocodingCacheSaved: cacheSavedCalls,
      geocodingFreeRemaining: Math.max(0, MAPBOX_GEOCODING_FREE_TIER - currentMonthGeocodingCalls),
      geocodingBillable: billableGeocodingCalls,
      geocodingCost: geocodingCost.toFixed(2),
      mapLoads: currentMonthMapLoads,
      mapLoadsFreeRemaining: Math.max(0, MAPBOX_MAP_LOADS_FREE_TIER - currentMonthMapLoads),
      mapLoadsBillable: billableMapLoads,
      mapLoadsCost: mapLoadsCost.toFixed(2),
      directionsApiCalls: currentMonthDirectionsCalls,
      directionsFreeRemaining: Math.max(0, MAPBOX_DIRECTIONS_FREE_TIER - currentMonthDirectionsCalls),
      directionsBillable: billableDirectionsCalls,
      directionsCost: directionsCost.toFixed(2)
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
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5 text-green-500" />
            Geocode Cache Performance
          </CardTitle>
          <CardDescription>Cache reduces Mapbox API calls</CardDescription>
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
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Mapbox Usage & Billing - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </CardTitle>
          <CardDescription>Current month geocoding and map rendering costs (resets monthly)</CardDescription>
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

      {/* Email Usage (Resend) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Usage (Resend)
          </CardTitle>
          <CardDescription>Email delivery costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Emails Sent (30 days)</p>
            <p className="text-2xl font-semibold">{estimatedCosts.resend.emailsSent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              Est. Cost: ${estimatedCosts.resend.estimatedCost}
            </p>
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
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total Records</p>
            <p className="text-2xl font-semibold">{estimatedCosts.storage.totalRecords.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              Estimated Size: ~{estimatedCosts.storage.estimatedSize} MB
            </p>
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Load Emails</p>
              <p className="text-2xl font-semibold">{recentActivity?.emails || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Loads Created</p>
              <p className="text-2xl font-semibold">{recentActivity?.loads || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Hunt Matches</p>
              <p className="text-2xl font-semibold">{recentActivity?.matches || 0}</p>
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
